import { z } from "zod";

// The shapes in docs/SCHEMA.md. Change both in the same commit.

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const timestamp = z.iso.datetime({ message: "expected an ISO 8601 UTC timestamp" });
const url = z.url({ protocol: /^https?$/ });
const providerId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "expected lowercase kebab-case");
const repoPath = z.string().regex(/^data\//, "expected a path under data/");

export const statedField = z.object({
  value: z.union([z.string().min(1), z.boolean(), z.array(z.string().min(1))]),
  source: url,
  checked: date,
  quote: z.string().min(1),
  note: z.string().min(1).optional(),
});

export const notStatedField = z.object({
  value: z.null(),
  not_stated: z.literal(true),
  checked: date,
  searched: z.array(url).min(1),
  note: z.string().min(1).optional(),
});

export const field = z.union([statedField, notStatedField]);

export const provider = z.object({
  id: providerId,
  name: z.string().min(1),
  homepage: url,
  urls: z.record(z.string(), url.nullable()),
  added: date,
});

export const providersFile = z.object({ providers: z.array(provider) });

export const registryRecord = z.object({
  id: providerId,
  updated: date,
  fields: z.record(z.string(), field),
});

const pricePair = z.object({ input: z.number().nonnegative(), output: z.number().nonnegative() });

export const changelogEntry = z.object({
  date,
  provider: providerId,
  kind: z.enum(["policy", "price", "provider added", "provider removed", "status"]),
  field: z.string().min(1).nullable().optional(),
  model: z.string().min(1).optional(),
  before: z.union([z.string(), z.number(), pricePair]).nullable(),
  after: z.union([z.string(), z.number(), pricePair]).nullable(),
  source: url,
  snapshot_before: repoPath.nullable().optional(),
  snapshot_after: repoPath.nullable().optional(),
});

export const changelogFile = z.object({ entries: z.array(changelogEntry) });

export const probeModel = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weights: url,
  providers: z.record(providerId, z.string().min(1)),
  quantization: z.record(providerId, z.string().min(1)).optional(),
});

export const modelsFile = z.object({
  probe_models: z.array(probeModel),
  basket: z.object({
    version: z.number().int().positive(),
    models: z.array(z.string().min(1)),
    weights: z.object({ input: z.number().min(0).max(1), output: z.number().min(0).max(1) }),
    note: z.string(),
  }),
});

export const priceRow = z.object({
  provider: providerId,
  model: z.string().min(1),
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  source: url,
  checked: date,
});

export const missingPrice = z.object({
  provider: providerId,
  model: z.string().min(1),
  reason: z.string().min(1),
});

export const dailyPricesFile = z.object({
  date,
  basket_version: z.number().int().positive(),
  rows: z.array(priceRow),
  missing: z.array(missingPrice),
});

export const priceIndexPoint = z.object({
  date,
  value: z.number().nonnegative(),
  providers: z.number().int().nonnegative(),
  models: z.record(z.string(), z.object({ median: z.number().nonnegative(), providers: z.number().int().nonnegative() })),
  rows: repoPath,
});

export const priceIndexFile = z.object({
  basket_version: z.number().int().positive(),
  series: z.array(priceIndexPoint),
});

const runStatus = z.enum(["ok", "error", "timeout"]);

export const probeRun = z.object({
  id: z.string().min(1),
  ts: timestamp,
  provider: providerId,
  model: z.string().min(1),
  region: z.string().min(1),
  status: runStatus,
  http_status: z.number().int().nullable(),
  ttft_ms: z.number().nullable(),
  ttft_kind: z.enum(["content", "reasoning"]).nullable(),
  total_ms: z.number().nullable(),
  output_tokens: z.number().int().nullable(),
  tokens_source: z.enum(["usage", "none"]),
  tps: z.number().nullable(),
  error: z.string().nullable(),
  confirms: z.string().min(1).optional(),
});

export const probeSummaryRow = z.object({
  provider: providerId,
  model: z.string().min(1),
  runs: z.number().int().nonnegative(),
  ok: z.number().int().nonnegative(),
  uptime: z.number().min(0).max(1).nullable(),
  ttft_ms_p50: z.number().nullable(),
  ttft_ms_p95: z.number().nullable(),
  tps_p50: z.number().nullable(),
  first_run: timestamp,
  last_run: timestamp,
  last_status: runStatus,
});

export const probeSummaryFile = z.object({
  generated: timestamp,
  window_days: z.number().positive(),
  rows: z.array(probeSummaryRow),
});

export const incident = z.object({
  start: timestamp,
  end: timestamp.nullable(),
  kind: z.enum(["error", "timeout"]),
  run: z.string().min(1),
  confirmed_by: z.string().min(1),
});

export const probeStatusRow = z.object({
  provider: providerId,
  model: z.string().min(1),
  runs: z.array(z.tuple([timestamp, runStatus])),
  incidents: z.array(incident),
});

export const probeStatusFile = z.object({
  generated: timestamp,
  interval_minutes: z.number().positive(),
  rows: z.array(probeStatusRow),
});

const score = z.number().min(0).max(1);
const vsNoiseFloor = z.enum(["within", "diverges", "no noise floor"]);

export const fidelityReference = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  source: z.string().min(1),
  runs: z.array(z.string().min(1)).min(1),
  runs_file: repoPath,
});

export const fidelityRow = z.object({
  provider: providerId,
  model: z.string().min(1),
  score,
  reference_run: z.string().min(1),
  runs: z.array(z.string().min(1)).min(1),
  runs_file: repoPath,
  experimental: z.literal(true),
  state: z.enum(["unconfirmed", "repeated"]),
  vs_noise_floor: vsNoiseFloor,
  noise_floor: z
    .object({
      reference_runs: z.number().int().positive(),
      pairs: z.number().int().positive(),
      mean: score,
      min: score,
    })
    .nullable(),
  prompts_scored: z.number().int().positive(),
  exact_matches: z.number().int().nonnegative(),
  logprob_gap: z.number().nonnegative().nullable(),
  stated_quantization: z.string().min(1).nullable(),
  reference_source: z.string().min(1),
  previous: z.object({ date, score, vs_noise_floor: vsNoiseFloor, reference_source: z.string().min(1) }).nullable(),
});

export const fidelityFile = z.object({
  date,
  prompts_version: z.number().int().positive(),
  scoring_version: z.number().int().positive(),
  experimental: z.literal(true),
  references: z.array(fidelityReference),
  rows: z.array(fidelityRow),
  unscored: z.array(z.object({ provider: providerId, model: z.string().min(1), reason: z.string().min(1) })),
});

export const fidelityExchange = z.object({
  run: z.string().min(1),
  role: z.enum(["provider", "reference"]),
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  ts: timestamp,
  request: z.record(z.string(), z.unknown()),
  http_status: z.number().int().nullable(),
  response: z.unknown(),
  error: z.string().nullable(),
});

export type StatedField = z.infer<typeof statedField>;
export type NotStatedField = z.infer<typeof notStatedField>;
export type Field = z.infer<typeof field>;
export type Provider = z.infer<typeof provider>;
export type RegistryRecord = z.infer<typeof registryRecord>;
export type ChangelogEntry = z.infer<typeof changelogEntry>;
export type ProbeModel = z.infer<typeof probeModel>;
export type ModelsFile = z.infer<typeof modelsFile>;
export type PriceRow = z.infer<typeof priceRow>;
export type MissingPrice = z.infer<typeof missingPrice>;
export type DailyPricesFile = z.infer<typeof dailyPricesFile>;
export type PriceIndexPoint = z.infer<typeof priceIndexPoint>;
export type PriceIndexFile = z.infer<typeof priceIndexFile>;
export type RunStatus = z.infer<typeof runStatus>;
export type ProbeRun = z.infer<typeof probeRun>;
export type ProbeSummaryRow = z.infer<typeof probeSummaryRow>;
export type ProbeSummaryFile = z.infer<typeof probeSummaryFile>;
export type Incident = z.infer<typeof incident>;
export type ProbeStatusRow = z.infer<typeof probeStatusRow>;
export type ProbeStatusFile = z.infer<typeof probeStatusFile>;
export type FidelityRow = z.infer<typeof fidelityRow>;
export type FidelityFile = z.infer<typeof fidelityFile>;

export const PROVIDER_URL_KEYS = ["docs", "pricing", "privacy", "terms", "trust", "status", "subprocessors"] as const;

export const REGISTRY_FIELDS = [
  { key: "status", label: "Status", question: "Is the provider operating?", values: ["live", "acquired", "shut down"] },
  { key: "retention", label: "Retention", question: "How long are prompts and outputs kept by default?" },
  { key: "zdr", label: "Zero data retention", question: "Is zero data retention available?", values: ["default", "self-serve", "on request", "enterprise only", "no"] },
  { key: "zdr_how", label: "How ZDR is enabled", question: "How is zero data retention turned on?" },
  { key: "training", label: "Training on customer data", question: "Are customer prompts or outputs used to train models?", values: ["no", "opt-out", "opt-in", "yes"] },
  { key: "soc2", label: "SOC 2", question: "Does the provider hold a SOC 2 report?", values: ["Type II", "Type I", "type not stated", "in progress", "no"] },
  { key: "attestations", label: "Other attestations", question: "Which other attestations does it hold?" },
  { key: "subprocessors", label: "Subprocessors", question: "Who processes customer data on the provider's behalf?" },
  { key: "regions", label: "Regions", question: "Where does inference run?" },
  { key: "funding", label: "Funding", question: "What is the latest disclosed round or total raised?" },
] as const satisfies readonly { key: string; label: string; question: string; values?: readonly string[] }[];
