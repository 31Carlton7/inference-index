// Checks every file under data/ against docs/SCHEMA.md. Exits 1 on any problem.
// Usage: npm run validate -- [data-dir]

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import {
  PROVIDER_URL_KEYS,
  REGISTRY_FIELDS,
  changelogFile,
  dailyPricesFile,
  fidelityExchange,
  fidelityFile,
  modelsFile,
  notStatedField,
  priceIndexFile,
  probeRun,
  probeStatusFile,
  probeSummaryFile,
  providersFile,
  registryRecord,
  statedField,
} from "./lib/schema";

const dataDir = path.resolve(process.argv[2] ?? "data");
const repoRoot = path.dirname(dataDir);
const problems: string[] = [];
const warnings: string[] = [];

function report(file: string, message: string) {
  problems.push(`${file}: ${message}`);
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => path.relative(dataDir, path.join(entry.parentPath, entry.name)))
    .sort();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueAt(root: unknown, issuePath: PropertyKey[]): unknown {
  let current = root;
  for (const key of issuePath) {
    if (!isObject(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

// A field that fails the union is re-checked against the branch it was meant
// to be, so the message names the missing key instead of "invalid input".
function describeIssue(issue: z.core.$ZodIssue, root: unknown): string[] {
  const where = issue.path.join(".");
  const prefix = where ? `${where}: ` : "";
  if (issue.code !== "invalid_union") return [`${prefix}${issue.message}`];

  const raw = valueAt(root, issue.path);
  if (!isObject(raw) || !("value" in raw)) return [`${prefix}${issue.message}`];
  const isNotStated = raw.not_stated === true || raw.value === null;
  const branch = isNotStated ? notStatedField : statedField;
  const kind = isNotStated ? "not-stated field" : "stated field";
  const parsed = branch.safeParse(raw);
  if (parsed.success) return [`${prefix}${issue.message}`];
  return parsed.error.issues.map((inner) => `${[where, ...inner.path].join(".")}: ${kind}: ${inner.message}`);
}

function parseJson(file: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    report(file, `not valid JSON (${(error as Error).message})`);
    return undefined;
  }
}

function check<T extends z.ZodType>(file: string, shape: T, raw: unknown): z.infer<T> | undefined {
  if (raw === undefined) return undefined;
  const parsed = shape.safeParse(raw);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues) {
    for (const line of describeIssue(issue, raw)) report(file, line);
  }
  return undefined;
}

function checkFile<T extends z.ZodType>(file: string, shape: T): z.infer<T> | undefined {
  return check(file, shape, parseJson(file, readFileSync(path.join(dataDir, file), "utf8")));
}

const files = listFiles(dataDir);
const checkedFiles = new Set<string>();
const providerIds = new Set<string>();
const providerUrlKeys = new Map<string, Set<string>>();

function requireKnownProvider(file: string, id: string, where: string) {
  if (providerIds.size > 0 && !providerIds.has(id)) {
    report(file, `${where}: "${id}" is not in providers.json`);
  }
}

function requireRepoFile(file: string, repoPath: string | null | undefined, where: string) {
  if (repoPath && !existsSync(path.join(repoRoot, repoPath))) {
    report(file, `${where}: ${repoPath} does not exist`);
  }
}

if (files.includes("providers.json")) {
  checkedFiles.add("providers.json");
  const providers = checkFile("providers.json", providersFile)?.providers ?? [];
  for (const provider of providers) {
    if (providerIds.has(provider.id)) report("providers.json", `duplicate id "${provider.id}"`);
    providerIds.add(provider.id);
    providerUrlKeys.set(provider.id, new Set(Object.keys(provider.urls)));
    for (const key of PROVIDER_URL_KEYS) {
      if (!(key in provider.urls)) report("providers.json", `${provider.id}: urls.${key} is missing (use null if the provider has no such page)`);
    }
  }
}

for (const file of files) {
  const parts = file.split(path.sep);
  const name = path.basename(file);

  if (parts[0] === "registry" && parts.length === 2 && name.endsWith(".json")) {
    checkedFiles.add(file);
    const record = checkFile(file, registryRecord);
    if (!record) continue;
    if (`${record.id}.json` !== name) report(file, `id "${record.id}" does not match the file name`);
    requireKnownProvider(file, record.id, "id");
    for (const known of REGISTRY_FIELDS) {
      const entry = record.fields[known.key];
      if (!entry) {
        report(file, `fields.${known.key} is missing (mark it not stated if the provider's pages do not say)`);
        continue;
      }
      if ("values" in known && typeof entry.value === "string" && !(known.values as readonly string[]).includes(entry.value)) {
        warnings.push(`${file}: fields.${known.key}.value: "${entry.value}" is not one of ${known.values.join(", ")}`);
      }
    }
  }

  if (file === "changelog.json") {
    checkedFiles.add(file);
    const entries = checkFile(file, changelogFile)?.entries ?? [];
    entries.forEach((entry, index) => {
      requireKnownProvider(file, entry.provider, `entries.${index}.provider`);
      requireRepoFile(file, entry.snapshot_before, `entries.${index}.snapshot_before`);
      requireRepoFile(file, entry.snapshot_after, `entries.${index}.snapshot_after`);
      const hasPricePair = [entry.before, entry.after].some((side) => typeof side === "object" && side !== null);
      if (hasPricePair && (entry.kind !== "price" || !entry.model)) {
        report(file, `entries.${index}: an input and output price pair belongs to a "price" entry with a model`);
      }
      if (index > 0 && entry.date > entries[index - 1].date) {
        report(file, `entries.${index}: entries must be newest first`);
      }
    });
  }

  if (file === path.join("snapshots", "last-run.json")) {
    checkedFiles.add(file);
    parseJson(file, readFileSync(path.join(dataDir, file), "utf8"));
    continue;
  }

  if (parts[0] === "snapshots") {
    checkedFiles.add(file);
    const [, provider, page] = parts;
    if (parts.length !== 4 || !/^\d{4}-\d{2}-\d{2}\.txt$/.test(name)) {
      report(file, "expected snapshots/<provider-id>/<page>/<date>.txt");
      continue;
    }
    requireKnownProvider(file, provider, "provider");
    const urlKeys = providerUrlKeys.get(provider);
    if (urlKeys && !urlKeys.has(page)) report(file, `"${page}" is not a key of ${provider}'s urls`);
  }

  if (file === "models.json") {
    checkedFiles.add(file);
    const models = checkFile(file, modelsFile);
    if (!models) continue;
    for (const model of models.probe_models) {
      for (const id of Object.keys(model.providers)) requireKnownProvider(file, id, `${model.id}.providers`);
      for (const id of Object.keys(model.quantization ?? {})) {
        if (!(id in model.providers)) report(file, `${model.id}.quantization: "${id}" is not in ${model.id}.providers`);
      }
    }
    const { input, output } = models.basket.weights;
    if (Math.abs(input + output - 1) > 1e-9) report(file, "basket.weights must sum to 1");
  }

  if (parts[0] === "prices" && parts[1] === "daily" && name.endsWith(".json")) {
    checkedFiles.add(file);
    const daily = checkFile(file, dailyPricesFile);
    if (!daily) continue;
    if (`${daily.date}.json` !== name) report(file, `date "${daily.date}" does not match the file name`);
    daily.rows.forEach((row, index) => requireKnownProvider(file, row.provider, `rows.${index}.provider`));
    daily.missing.forEach((gap, index) => {
      requireKnownProvider(file, gap.provider, `missing.${index}.provider`);
      if (daily.rows.some((row) => row.provider === gap.provider && row.model === gap.model)) {
        report(file, `missing.${index}: ${gap.provider} ${gap.model} also has a row`);
      }
    });
  }

  if (file === path.join("prices", "index.json")) {
    checkedFiles.add(file);
    const index = checkFile(file, priceIndexFile);
    index?.series.forEach((point, i) => requireRepoFile(file, point.rows, `series.${i}.rows`));
  }

  if (parts[0] === "probes" && parts[1] === "runs" && name.endsWith(".jsonl")) {
    checkedFiles.add(file);
    const lines = readFileSync(path.join(dataDir, file), "utf8").split("\n");
    lines.forEach((line, index) => {
      if (line.trim() === "") return;
      const run = check(`${file}:${index + 1}`, probeRun, parseJson(`${file}:${index + 1}`, line));
      if (run && `${run.provider}.jsonl` !== name) report(`${file}:${index + 1}`, `provider "${run.provider}" does not match the file name`);
      if (run && run.ts.slice(0, 10) !== parts[2]) report(`${file}:${index + 1}`, `ts is not on ${parts[2]}`);
    });
  }

  if (file === path.join("probes", "summary.json")) {
    checkedFiles.add(file);
    checkFile(file, probeSummaryFile);
  }

  if (file === path.join("probes", "status.json")) {
    checkedFiles.add(file);
    checkFile(file, probeStatusFile);
  }

  if (parts[0] === "fidelity" && parts.length === 2 && name.endsWith(".json")) {
    checkedFiles.add(file);
    const fidelity = checkFile(file, fidelityFile);
    if (!fidelity) continue;
    if (name !== "latest.json" && `${fidelity.date}.json` !== name) {
      report(file, `date "${fidelity.date}" does not match the file name`);
    }
    const referenceIds = new Set(fidelity.references.map((reference) => reference.id));
    fidelity.rows.forEach((row, index) => {
      requireKnownProvider(file, row.provider, `rows.${index}.provider`);
      if (!referenceIds.has(row.reference_run)) report(file, `rows.${index}.reference_run: "${row.reference_run}" is not in references`);
      if ((row.noise_floor === null) !== (row.vs_noise_floor === "no noise floor")) {
        report(file, `rows.${index}.vs_noise_floor: "${row.vs_noise_floor}" does not fit noise_floor`);
      }
    });
  }

  if (parts[0] === "fidelity" && parts[1] === "runs" && parts.length === 4 && name.endsWith(".jsonl")) {
    checkedFiles.add(file);
    const lines = readFileSync(path.join(dataDir, file), "utf8").split("\n");
    lines.forEach((line, index) => {
      if (line.trim() === "") return;
      const exchange = check(`${file}:${index + 1}`, fidelityExchange, parseJson(`${file}:${index + 1}`, line));
      if (!exchange) return;
      const expectedName = exchange.role === "reference" ? "reference.jsonl" : `${exchange.provider}.jsonl`;
      if (expectedName !== name) report(`${file}:${index + 1}`, `a ${exchange.role} line for "${exchange.provider}" belongs in ${expectedName}`);
    });
  }
}

for (const file of files) {
  if (!checkedFiles.has(file)) report(file, "not described in docs/SCHEMA.md");
}

if (warnings.length > 0) {
  console.warn(`Values outside the standard vocabulary (allowed when the page's own wording fits none of it):\n${warnings.join("\n")}\n`);
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} in ${checkedFiles.size} files`);
  process.exit(1);
}
console.log(`${files.length} files under ${path.relative(process.cwd(), dataDir) || "."} match docs/SCHEMA.md`);
