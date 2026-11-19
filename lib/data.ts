import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import {
  changelogFile,
  dailyPricesFile,
  modelsFile,
  priceIndexFile,
  providersFile,
  registryRecord,
  type ChangelogEntry,
  type DailyPricesFile,
  type ModelsFile,
  type PriceIndexFile,
  type Provider,
  type RegistryRecord,
} from "./schema";

// Fixtures are for local development only. Vercel sets VERCEL on every build,
// so a stray env var there can never swap real data for fixtures.
export const usingFixtures = process.env.INFERENCE_INDEX_FIXTURES === "1" && !process.env.VERCEL;

export const dataRoot = usingFixtures
  ? path.join(process.cwd(), "test", "fixtures", "data")
  : path.join(process.cwd(), "data");

function readJson<T extends z.ZodType>(relativePath: string, shape: T): z.infer<T> | null {
  const filePath = path.join(dataRoot, relativePath);
  if (!existsSync(filePath)) return null;
  const parsed = shape.safeParse(JSON.parse(readFileSync(filePath, "utf8")));
  if (!parsed.success) {
    throw new Error(`data/${relativePath} does not match docs/SCHEMA.md. Run npm run validate.`);
  }
  return parsed.data;
}

export function getProviders(): Provider[] {
  return readJson("providers.json", providersFile)?.providers ?? [];
}

export function getProvider(id: string): Provider | undefined {
  return getProviders().find((provider) => provider.id === id);
}

export function getRegistryRecord(id: string): RegistryRecord | null {
  return readJson(path.join("registry", `${id}.json`), registryRecord);
}

export function getChangelog(): ChangelogEntry[] {
  const entries = readJson("changelog.json", changelogFile)?.entries ?? [];
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

export function getModels(): ModelsFile | null {
  return readJson("models.json", modelsFile);
}

export function getPriceIndex(): PriceIndexFile | null {
  return readJson(path.join("prices", "index.json"), priceIndexFile);
}

export function getLatestDailyPrices(): DailyPricesFile | null {
  const dailyDir = path.join(dataRoot, "prices", "daily");
  if (!existsSync(dailyDir)) return null;
  const newest = readdirSync(dailyDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .at(-1);
  if (!newest) return null;
  return readJson(path.join("prices", "daily", newest), dailyPricesFile);
}

export function getProviderNames(): Map<string, string> {
  return new Map(getProviders().map((provider) => [provider.id, provider.name]));
}

export function getModelNames(): Map<string, string> {
  return new Map((getModels()?.probe_models ?? []).map((model) => [model.id, model.name]));
}
