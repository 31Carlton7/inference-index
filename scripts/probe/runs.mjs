import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function probesDir(env = process.env) {
  return path.join(env.PROBE_DATA_DIR ?? path.join(repoRoot, "data"), "probes");
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function appendRun(dir, run) {
  const dayDir = path.join(dir, "runs", run.ts.slice(0, 10));
  await mkdir(dayDir, { recursive: true });
  await appendFile(path.join(dayDir, `${run.provider}.jsonl`), `${JSON.stringify(run)}\n`);
}

// Every run on or after sinceDate (YYYY-MM-DD), oldest first.
export async function readRuns(dir, sinceDate) {
  const runsDir = path.join(dir, "runs");
  let days;
  try {
    days = await readdir(runsDir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const runs = [];
  for (const day of days.filter((name) => name >= sinceDate).sort()) {
    for (const file of (await readdir(path.join(runsDir, day))).filter((name) => name.endsWith(".jsonl"))) {
      const lines = (await readFile(path.join(runsDir, day, file), "utf8")).split("\n");
      for (const line of lines) {
        if (line.trim() !== "") runs.push(JSON.parse(line));
      }
    }
  }
  return runs.sort((a, b) => a.ts.localeCompare(b.ts));
}
