// Projects monthly spend for the probe and fidelity schedules from
// data/models.json, the latest daily price file and schedule.json.
// Prints the tables docs/spend.md quotes:
//
//   node scripts/spend/model.mjs

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_TOKENS as PROBE_MAX_TOKENS, PROMPT as PROBE_PROMPT } from "../probe/request.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function latestDailyPrices() {
  const dir = "data/prices/daily";
  const newest = readdirSync(path.join(repoRoot, dir)).filter((name) => name.endsWith(".json")).sort().at(-1);
  return readJson(path.join(dir, newest));
}

// The probe's prompt and output cap are read from the probe itself. Its
// prompt length in tokens is estimated from its length in characters.
export function probeRequest(schedule) {
  return {
    prompt_tokens: Math.ceil(PROBE_PROMPT.length / schedule.chars_per_token),
    max_output_tokens: PROBE_MAX_TOKENS,
  };
}

export function monthlyTokens(schedule, probeShape = probeRequest(schedule)) {
  const { days_per_month: days, template_overhead_tokens: overhead, fidelity } = schedule;
  const probe = { ...schedule.probe, ...probeShape };
  const fidelityRequests = fidelity.runs_per_day * fidelity.prompts * days;
  return {
    probe: {
      requests: probe.runs_per_day * days,
      input: probe.runs_per_day * days * (probe.prompt_tokens + overhead),
      output: probe.runs_per_day * days * probe.max_output_tokens,
    },
    fidelity: {
      requests: fidelityRequests,
      input: fidelityRequests * (fidelity.prompt_tokens + overhead),
      output: fidelityRequests * fidelity.max_output_tokens,
    },
  };
}

export function tokenCost(tokens, price) {
  return (tokens.input * price.input + tokens.output * price.output) / 1e6;
}

export function project(models, prices, schedule, references, probeShape) {
  const tokens = monthlyTokens(schedule, probeShape);
  const priceOf = new Map(prices.rows.map((row) => [`${row.provider} ${row.model}`, row]));
  const pairs = [];
  const unpriced = [];
  const referenceRows = [];

  for (const model of models) {
    for (const provider of Object.keys(model.providers)) {
      const price = priceOf.get(`${provider} ${model.id}`);
      if (!price) {
        unpriced.push({ provider, model: model.id });
        continue;
      }
      pairs.push({
        provider,
        model: model.id,
        input: price.input,
        output: price.output,
        probe: tokenCost(tokens.probe, price),
        fidelity: tokenCost(tokens.fidelity, price),
      });
    }
    const reference = references[model.id];
    const price = reference.provider
      ? priceOf.get(`${reference.provider} ${model.id}`)
      : schedule.reference_prices[reference.source];
    // A listed provider that is the reference is run three times instead of
    // once, so it costs two extra fidelity runs. An outside reference costs three.
    const extraRuns = schedule.fidelity.reference_runs - (reference.provider ? 1 : 0);
    referenceRows.push({
      model: model.id,
      source: reference.source,
      cost: price ? tokenCost(tokens.fidelity, price) * extraRuns : null,
    });
  }

  const byProvider = new Map();
  for (const pair of pairs) {
    const row = byProvider.get(pair.provider) ?? { provider: pair.provider, pairs: 0, probe: 0, fidelity: 0 };
    row.pairs += 1;
    row.probe += pair.probe;
    row.fidelity += pair.fidelity;
    byProvider.set(pair.provider, row);
  }
  for (const reference of referenceRows) {
    const row = byProvider.get(reference.source) ?? { provider: reference.source, pairs: 0, probe: 0, fidelity: 0 };
    row.fidelity += reference.cost ?? 0;
    byProvider.set(reference.source, row);
  }

  const providers = [...byProvider.values()].map((row) => {
    const fixed = schedule.fixed_charges[row.provider] ?? {};
    const usage = row.probe + row.fidelity;
    const freeUsage = Math.min(usage, (fixed.free_usd_per_day ?? 0) * schedule.days_per_month);
    return {
      ...row,
      usage,
      free_usage: freeUsage,
      monthly_fee: fixed.monthly_fee ?? 0,
      one_time: fixed.one_time ?? 0,
      monthly: usage - freeUsage + (fixed.monthly_fee ?? 0),
    };
  });

  return {
    date: prices.date,
    tokens,
    pairs,
    unpriced,
    references: referenceRows,
    providers,
    total: {
      probe: sum(providers.map((row) => row.probe)),
      fidelity: sum(providers.map((row) => row.fidelity)),
      monthly: sum(providers.map((row) => row.monthly)),
      one_time: sum(providers.map((row) => row.one_time)),
    },
  };
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function usd(value) {
  return `$${value.toFixed(2)}`;
}

function report(projection, schedule) {
  const { tokens, providers, total } = projection;
  const lines = [];
  lines.push(`Prices from data/prices/daily/${projection.date}.json. ${schedule.days_per_month}-day month.`);
  lines.push("");
  const probeShape = probeRequest(schedule);
  lines.push(`Probe request: about ${probeShape.prompt_tokens} prompt tokens plus ${schedule.template_overhead_tokens} for the chat template, up to ${probeShape.max_output_tokens} output tokens, ${schedule.probe.runs_per_day} times a day.`);
  lines.push(`Probe tokens per pair per month: ${tokens.probe.requests} requests, ${tokens.probe.input} input, ${tokens.probe.output} output.`);
  lines.push(`Fidelity tokens per run-set per month: ${tokens.fidelity.requests} requests, ${tokens.fidelity.input} input, ${tokens.fidelity.output} output.`);
  lines.push(`Pairs with a price: ${projection.pairs.length}. Without: ${projection.unpriced.map((pair) => `${pair.provider} ${pair.model}`).join(", ") || "none"}.`);
  lines.push("");
  lines.push("| provider | pairs | probes | fidelity | free allowance | monthly fee | per month | one-time |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of [...providers].sort((left, right) => right.monthly - left.monthly)) {
    lines.push(`| ${row.provider} | ${row.pairs} | ${usd(row.probe)} | ${usd(row.fidelity)} | ${row.free_usage ? `-${usd(row.free_usage)}` : ""} | ${row.monthly_fee ? usd(row.monthly_fee) : ""} | ${usd(row.monthly)} | ${row.one_time ? usd(row.one_time) : ""} |`);
  }
  lines.push(`| **total** | ${projection.pairs.length} | ${usd(total.probe)} | ${usd(total.fidelity)} | | | **${usd(total.monthly)}** | ${usd(total.one_time)} |`);
  lines.push("");
  lines.push("| model | pairs | probes per month |");
  lines.push("|---|---:|---:|");
  for (const model of new Set(projection.pairs.map((pair) => pair.model))) {
    const modelPairs = projection.pairs.filter((pair) => pair.model === model);
    lines.push(`| ${model} | ${modelPairs.length} | ${usd(sum(modelPairs.map((pair) => pair.probe)))} |`);
  }
  lines.push("");
  lines.push(`Cap: ${usd(schedule.cap_usd_per_month)}. Projected: ${usd(total.monthly)} (${Math.round((total.monthly / schedule.cap_usd_per_month) * 100)}% of the cap), plus ${usd(total.one_time)} one-time.`);
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const schedule = readJson("scripts/spend/schedule.json");
  const projection = project(
    readJson("data/models.json").probe_models,
    latestDailyPrices(),
    schedule,
    readJson("scripts/fidelity/reference.json"),
  );
  console.log(report(projection, schedule));
}
