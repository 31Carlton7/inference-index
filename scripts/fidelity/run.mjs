// Experimental fidelity run. Collects raw responses first, then scores from
// the stored files, so a run can be re-scored without calling any provider:
//
//   node scripts/fidelity/run.mjs --out <data dir>            collect and score
//   node scripts/fidelity/run.mjs --out <data dir> --score-only --date 2026-11-18

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveAccess } from "../probe/request.mjs";
import { replyFromStored, requestBody, sendPrompt } from "./request.mjs";
import { MIN_REFERENCE_RUNS, SCORING_VERSION, agreementState, scoreProviderRun } from "./score.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function loadConfig() {
  return {
    promptSet: readJson(path.join(repoRoot, "scripts/fidelity/prompts.v1.json")),
    models: readJson(path.join(repoRoot, "data/models.json")).probe_models,
    endpoints: readJson(path.join(repoRoot, "scripts/probe/endpoints.json")),
    references: readJson(path.join(repoRoot, "scripts/fidelity/reference.json")),
  };
}

function referenceTarget(model, reference, endpoints) {
  if (!reference) return null;
  if (reference.provider) {
    const endpoint = endpoints[reference.provider];
    const apiModel = model.providers[reference.provider];
    if (!endpoint || !apiModel) return null;
    return { source: reference.source, endpoint, apiModel };
  }
  return { source: reference.source, endpoint: reference, apiModel: reference.api_model };
}

export function plannedRuns({ models, endpoints, references }, env) {
  const planned = [];
  for (const model of models) {
    const reference = referenceTarget(model, references[model.id], endpoints);
    if (reference && env[reference.endpoint.key_env]) {
      for (let pass = 1; pass <= MIN_REFERENCE_RUNS; pass += 1) {
        planned.push({ role: "reference", provider: reference.source, model, ...reference, pass });
      }
    }
    for (const [provider, apiModel] of Object.entries(model.providers)) {
      const endpoint = endpoints[provider];
      if (!endpoint || !env[endpoint.key_env]) continue;
      if (references[model.id]?.provider === provider) continue;
      planned.push({ role: "provider", provider, model, endpoint, apiModel, pass: 1 });
    }
  }
  return planned;
}

function runsFile(date, planned) {
  const name = planned.role === "reference" ? "reference" : planned.provider;
  return path.join("fidelity", "runs", date, `${name}.jsonl`);
}

export async function collect({ config, env, outDir, date, now = () => new Date(), fetchImpl, sleep, log = console.log }) {
  const planned = plannedRuns(config, env);
  const { promptSet } = config;
  for (const run of planned) {
    let access;
    try {
      access = await resolveAccess(run.endpoint, env, fetchImpl);
    } catch (error) {
      // The message names the setting that is missing, never its value.
      log(`skipped ${run.provider} ${run.model.id}: ${error.message}`);
      continue;
    }
    const startedAt = now().toISOString().replace(/\.\d+Z$/, "Z");
    const pass = String(run.pass).padStart(2, "0");
    const runId = `${startedAt}-${run.provider}-${run.model.id}-fidelity-${pass}`;
    const file = path.join(outDir, runsFile(date, run));
    mkdirSync(path.dirname(file), { recursive: true });
    for (const prompt of promptSet.prompts) {
      const body = requestBody(run.apiModel, prompt.text, promptSet.settings, promptSet.model_settings[run.model.id]);
      const exchange = await sendPrompt({ fetchImpl, sleep, access, body });
      appendFileSync(file, `${JSON.stringify({
        run: runId,
        role: run.role,
        provider: run.provider,
        model: run.model.id,
        prompt: prompt.id,
        ts: now().toISOString(),
        ...exchange,
      })}\n`);
    }
    log(`collected ${runId}`);
  }
  return planned.length;
}

function storedRuns(file) {
  if (!existsSync(file)) return [];
  const runsById = new Map();
  for (const text of readFileSync(file, "utf8").split("\n")) {
    if (text.trim() === "") continue;
    const line = JSON.parse(text);
    if (!runsById.has(line.run)) runsById.set(line.run, { id: line.run, model: line.model, provider: line.provider, replies: {} });
    runsById.get(line.run).replies[line.prompt] = replyFromStored(line);
  }
  return [...runsById.values()];
}

function previousRows(outDir, date, promptsVersion) {
  const latestFile = path.join(outDir, "fidelity", "latest.json");
  if (!existsSync(latestFile)) return new Map();
  const latest = readJson(latestFile);
  if (latest.prompts_version !== promptsVersion || latest.scoring_version !== SCORING_VERSION) return new Map();
  const rows = new Map();
  for (const row of latest.rows) {
    // A second run on the same date replaces the file, so the run it should be
    // checked against is the one that file was itself checked against.
    const earlier = latest.date === date ? row.previous : { date: latest.date, score: row.score, vs_noise_floor: row.vs_noise_floor, reference_source: row.reference_source };
    if (earlier) rows.set(`${row.provider} ${row.model}`, earlier);
  }
  return rows;
}

export function score({ config, outDir, date }) {
  const { promptSet, models, references } = config;
  const promptIds = promptSet.prompts.map((prompt) => prompt.id);
  const referenceRuns = storedRuns(path.join(outDir, "fidelity", "runs", date, "reference.jsonl"));
  const earlierRows = previousRows(outDir, date, promptSet.version);
  const rows = [];
  const unscored = [];
  const usedReferences = [];

  for (const model of models) {
    const modelReferenceRuns = referenceRuns.filter((run) => run.model === model.id);
    const referenceSource = references[model.id]?.source ?? null;
    const referenceRunId = `${date}-reference-${model.id}`;
    if (modelReferenceRuns.length > 0) {
      usedReferences.push({
        id: referenceRunId,
        model: model.id,
        source: referenceSource,
        runs: modelReferenceRuns.map((run) => run.id),
        runs_file: `data/fidelity/runs/${date}/reference.jsonl`,
      });
    }
    for (const provider of Object.keys(model.providers)) {
      const providerFile = `fidelity/runs/${date}/${provider}.jsonl`;
      const providerRun = storedRuns(path.join(outDir, providerFile)).filter((run) => run.model === model.id).at(-1);
      if (references[model.id]?.provider === provider && modelReferenceRuns.length > 0) {
        unscored.push({ provider, model: model.id, reason: "is the reference for this model" });
        continue;
      }
      if (!providerRun) continue;
      if (modelReferenceRuns.length === 0) {
        unscored.push({ provider, model: model.id, reason: "no reference run" });
        continue;
      }
      const scored = scoreProviderRun(providerRun, modelReferenceRuns, promptIds);
      if (!scored) {
        unscored.push({ provider, model: model.id, reason: "no prompt could be compared with the reference" });
        continue;
      }
      const earlier = earlierRows.get(`${provider} ${model.id}`);
      const previous = earlier && earlier.reference_source === referenceSource ? earlier : null;
      rows.push({
        provider,
        model: model.id,
        score: scored.score,
        reference_run: referenceRunId,
        runs: [providerRun.id],
        runs_file: `data/${providerFile}`,
        experimental: true,
        state: agreementState(scored, previous),
        vs_noise_floor: scored.vs_noise_floor,
        noise_floor: scored.noise_floor,
        prompts_scored: scored.prompts_scored,
        exact_matches: scored.exact_matches,
        logprob_gap: scored.logprob_gap,
        stated_quantization: model.quantization?.[provider] ?? null,
        reference_source: referenceSource,
        previous,
      });
    }
  }

  return {
    date,
    prompts_version: promptSet.version,
    scoring_version: SCORING_VERSION,
    experimental: true,
    references: usedReferences,
    rows,
    unscored,
  };
}

function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const outDir = path.resolve(argValue(args, "--out") ?? path.join(repoRoot, "data"));
  const date = argValue(args, "--date") ?? new Date().toISOString().slice(0, 10);
  const config = loadConfig();

  if (!args.includes("--score-only")) {
    const collected = await collect({ config, env: process.env, outDir, date });
    if (collected === 0) {
      console.log("no provider keys set, nothing to run");
      return;
    }
  }

  const fidelity = score({ config, outDir, date });
  if (fidelity.rows.length === 0 && fidelity.unscored.length === 0) {
    console.log(`no stored runs for ${date}, nothing to score`);
    return;
  }
  const body = `${JSON.stringify(fidelity, null, 2)}\n`;
  writeFileSync(path.join(outDir, "fidelity", `${date}.json`), body);
  writeFileSync(path.join(outDir, "fidelity", "latest.json"), body);
  console.log(`scored ${fidelity.rows.length} rows, ${fidelity.unscored.length} unscored`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
