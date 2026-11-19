// Writes made-up data to test/fixtures/data for local development (npm run dev:fixtures).
// Timestamps are relative to now so the status strips have something to draw.
// The output is gitignored and the site ignores fixtures on Vercel.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "data");
rmSync(root, { recursive: true, force: true });

function write(file, body) {
  const filePath = path.join(root, file);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, typeof body === "string" ? body : JSON.stringify(body, null, 2) + "\n");
}

const DAY_MS = 86_400_000;
const INTERVAL_MS = 15 * 60_000;
const now = Date.now();
const day = (daysAgo) => new Date(now - daysAgo * DAY_MS).toISOString().slice(0, 10);
const today = day(0);

const providers = ["alpha", "beta", "gamma"].map((name) => ({
  id: `example-${name}`,
  name: `Example ${name[0].toUpperCase()}${name.slice(1)}`,
  homepage: `https://${name}.example.com/`,
  urls: {
    docs: `https://${name}.example.com/docs`,
    pricing: `https://${name}.example.com/pricing`,
    privacy: `https://${name}.example.com/privacy`,
    terms: `https://${name}.example.com/terms`,
    trust: name === "gamma" ? null : `https://${name}.example.com/trust`,
    status: `https://status.${name}.example.com/`,
    subprocessors: null,
  },
  added: day(9),
}));
write("providers.json", { providers });

const stated = (site, value, page, quote, note) => ({
  value,
  source: `https://${site}.example.com/${page}`,
  checked: today,
  quote,
  ...(note && { note }),
});
const notStated = (site, ...pages) => ({
  value: null,
  not_stated: true,
  checked: today,
  searched: pages.map((page) => `https://${site}.example.com/${page}`),
});

write("registry/example-alpha.json", {
  id: "example-alpha",
  updated: today,
  fields: {
    status: stated("alpha", "live", "status", "All systems operational."),
    retention: stated("alpha", "30 days", "privacy", "We retain inputs and outputs for 30 days."),
    zdr: stated("alpha", "on request", "privacy", "Customers may request zero data retention.", "Applies to the enterprise plan only."),
    zdr_how: stated("alpha", "Email the support team", "privacy", "To request zero data retention, email support."),
    training: stated("alpha", "no", "terms", "We do not train models on customer inputs or outputs."),
    soc2: stated("alpha", "Type II", "trust", "Example Alpha has completed a SOC 2 Type II examination."),
    attestations: stated("alpha", ["ISO 27001", "HIPAA BAA"], "trust", "We hold ISO 27001 certification and offer a BAA."),
    subprocessors: notStated("alpha", "privacy", "terms", "trust"),
    regions: stated("alpha", ["United States", "European Union"], "docs", "Inference runs in the United States and the European Union."),
    funding: notStated("alpha", "about"),
    data_residency: stated("alpha", true, "docs", "Customers can pin requests to a region."),
  },
});

write("registry/example-beta.json", {
  id: "example-beta",
  updated: day(1),
  fields: {
    status: stated("beta", "live", "status", "Operational."),
    retention: notStated("beta", "privacy", "terms"),
    zdr: stated("beta", "no", "privacy", "We do not offer zero data retention."),
    zdr_how: notStated("beta", "privacy"),
    training: stated("beta", "opt-out", "terms", "You may opt out of our use of your content for training."),
    soc2: stated("beta", "certified, type not stated", "trust", "Example Beta is SOC 2 certified."),
    attestations: notStated("beta", "trust"),
    subprocessors: notStated("beta", "privacy"),
    regions: notStated("beta", "docs"),
    funding: stated("beta", "$10M seed", "blog/seed", "We raised a $10M seed round."),
  },
});

write("snapshots/example-alpha/privacy/" + day(3) + ".txt", "We retain inputs and outputs for 60 days.\n");
write("snapshots/example-alpha/privacy/" + day(2) + ".txt", "We retain inputs and outputs for 30 days.\n");
write("changelog.json", {
  entries: [
    {
      date: day(1),
      provider: "example-beta",
      kind: "price",
      model: "example-model-large",
      before: { input: 0.2, output: 0.79 },
      after: { input: 0.18, output: 0.79 },
      source: "https://beta.example.com/pricing",
    },
    {
      date: day(2),
      provider: "example-alpha",
      kind: "policy",
      field: "retention",
      before: "We retain inputs and outputs for 60 days.",
      after: "We retain inputs and outputs for 30 days.",
      source: "https://alpha.example.com/privacy",
      snapshot_before: `data/snapshots/example-alpha/privacy/${day(3)}.txt`,
      snapshot_after: `data/snapshots/example-alpha/privacy/${day(2)}.txt`,
    },
    { date: day(9), provider: "example-gamma", kind: "provider added", before: null, after: "Example Gamma", source: "https://gamma.example.com/" },
  ],
});

const models = ["example-model-large", "example-model-small"];
write("models.json", {
  probe_models: models.map((id) => ({
    id,
    name: id.replace("example-model-", "Example Model ").replace(/\b[a-z]/, (letter) => letter.toUpperCase()),
    weights: `https://huggingface.co/example/${id}`,
    providers: { "example-alpha": id, "example-beta": `example/${id}`, "example-gamma": id },
    quantization: { "example-beta": "fp8" },
  })),
  basket: { version: 1, models, weights: { input: 0.75, output: 0.25 }, note: "Fixture basket." },
});

// Fourteen days of prices with day 5 missing, so the chart has a gap to draw.
const series = [];
for (let daysAgo = 13; daysAgo >= 0; daysAgo--) {
  if (daysAgo === 5) continue;
  const date = day(daysAgo);
  const drift = daysAgo * 0.004;
  write(`prices/daily/${date}.json`, {
    date,
    basket_version: 1,
    missing: models.map((model) => ({ provider: "example-gamma", model, reason: "https://gamma.example.com/pricing returned 403" })),
    rows: providers.slice(0, 2).flatMap((provider, p) =>
      models.map((model, m) => ({
        provider: provider.id,
        model,
        input: Number((0.15 + m * 0.4 + p * 0.03 + drift).toFixed(3)),
        output: Number((0.6 + m * 1.2 + p * 0.1 + drift).toFixed(3)),
        source: provider.urls.pricing,
        checked: date,
      })),
    ),
  });
  series.push({ date, value: Number((0.52 + drift + (daysAgo % 3) * 0.006).toFixed(3)), providers: 2,
    models: Object.fromEntries(models.map((model, m) => [model, { median: Number((0.3 + m * 0.6 + drift).toFixed(3)), providers: 2 }])),
    rows: `data/prices/daily/${date}.json`,
  });
}
write("prices/index.json", { basket_version: 1, series });

const stamp = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const lastSlot = Math.floor(now / INTERVAL_MS) * INTERVAL_MS;
const statusRows = [];
const summaryRows = [];
for (const provider of ["example-alpha", "example-beta"]) {
  for (const model of models) {
    const runs = [];
    for (let slot = 95; slot >= 0; slot--) {
      const isBeta = provider === "example-beta";
      if (isBeta && slot >= 40 && slot < 52) continue;
      let status = "ok";
      if (isBeta && model === models[0] && (slot === 20 || slot === 19)) status = "error";
      if (!isBeta && model === models[1] && slot === 70) status = "timeout";
      runs.push([stamp(lastSlot - slot * INTERVAL_MS + 3000), status]);
    }
    const failed = runs.find(([, status]) => status === "error");
    statusRows.push({
      provider,
      model,
      runs,
      incidents: failed
        ? [{ start: failed[0], end: stamp(Date.parse(failed[0]) + 2 * INTERVAL_MS), kind: "error", run: `${failed[0]}-${provider}-${model}-iad`, confirmed_by: `${stamp(Date.parse(failed[0]) + 40_000)}-${provider}-${model}-sfo` }]
        : [],
    });
    const ok = runs.filter(([, status]) => status === "ok").length;
    summaryRows.push({
      provider,
      model,
      runs: runs.length,
      ok,
      uptime: Number((ok / runs.length).toFixed(4)),
      ttft_ms_p50: provider === "example-alpha" ? 212 : 348,
      ttft_ms_p95: provider === "example-alpha" ? 480 : 1210,
      // Example Beta reports no token counts for the small model, so it has no tokens per second.
      tps_p50: provider === "example-alpha" ? 79.1 : model === models[1] ? null : 142.6,
      first_run: runs[0][0],
      last_run: runs.at(-1)[0],
      last_status: runs.at(-1)[1],
    });
  }
}
write("probes/status.json", { generated: stamp(now), interval_minutes: 15, rows: statusRows });
write("probes/summary.json", { generated: stamp(now), window_days: 7, rows: summaryRows });

const referenceRun = `${today}-reference-${models[0]}`;
const noiseFloor = { reference_runs: 3, pairs: 3, mean: 0.98, min: 0.96 };
const fidelityRow = (provider, fields) => ({
  provider,
  model: models[0],
  reference_run: referenceRun,
  runs: [`${today}T13:05:02Z-${provider}-${models[0]}-fidelity-01`],
  runs_file: `data/fidelity/runs/${today}/${provider}.jsonl`,
  experimental: true,
  noise_floor: noiseFloor,
  prompts_scored: 20,
  logprob_gap: null,
  reference_source: "reference-example",
  ...fields,
});
const fidelity = {
  date: today,
  prompts_version: 1,
  scoring_version: 1,
  experimental: true,
  references: [
    {
      id: referenceRun,
      model: models[0],
      source: "reference-example",
      runs: ["01", "02", "03"].map((pass) => `${today}T13:0${pass[1]}:02Z-reference-example-${models[0]}-fidelity-${pass}`),
      runs_file: `data/fidelity/runs/${today}/reference.jsonl`,
    },
  ],
  rows: [
    fidelityRow("example-alpha", {
      score: 0.97,
      state: "repeated",
      vs_noise_floor: "within",
      exact_matches: 17,
      stated_quantization: null,
      previous: { date: day(1), score: 0.975, vs_noise_floor: "within", reference_source: "reference-example" },
    }),
    fidelityRow("example-beta", {
      score: 0.912,
      state: "unconfirmed",
      vs_noise_floor: "diverges",
      exact_matches: 11,
      stated_quantization: "fp8",
      previous: null,
    }),
  ],
  unscored: [
    { provider: "example-alpha", model: models[1], reason: "no reference run" },
    { provider: "example-gamma", model: models[0], reason: "no prompt could be compared with the reference" },
  ],
};
write(`fidelity/${today}.json`, fidelity);
write("fidelity/latest.json", fidelity);

const exchange = (role, provider, run) => ({
  run,
  role,
  provider,
  model: models[0],
  prompt: "fixed-01",
  ts: `${today}T13:05:03.412Z`,
  request: { model: models[0], messages: [{ role: "user", content: "Say hello." }], stream: false, temperature: 0, max_tokens: 48 },
  http_status: 200,
  response: { choices: [{ message: { role: "assistant", content: "Hello." } }] },
  error: null,
});
for (const row of fidelity.rows) {
  write(`fidelity/runs/${today}/${row.provider}.jsonl`, JSON.stringify(exchange("provider", row.provider, row.runs[0])) + "\n");
}
write(
  `fidelity/runs/${today}/reference.jsonl`,
  fidelity.references[0].runs.map((run) => JSON.stringify(exchange("reference", "reference-example", run))).join("\n") + "\n",
);
