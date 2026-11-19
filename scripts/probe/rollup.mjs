#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { probesDir, readRuns } from "./runs.mjs";

export const WINDOW_DAYS = 7;
export const INTERVAL_MINUTES = 15;
export const STRIP_RUNS = 96;
export const CONFIRM_WINDOW_MS = 10 * 60_000;

const DAY_MS = 24 * 60 * 60_000;

// Nearest rank: the smallest value with at least p percent of the values at or below it.
export function percentile(values, p) {
  if (values.length === 0) return null;
  const ascending = [...values].sort((a, b) => a - b);
  return ascending[Math.max(0, Math.ceil((p / 100) * ascending.length) - 1)];
}

function groupByPair(runs) {
  const pairs = new Map();
  for (const run of runs) {
    const pairKey = `${run.provider}\n${run.model}`;
    if (!pairs.has(pairKey)) pairs.set(pairKey, []);
    pairs.get(pairKey).push(run);
  }
  return [...pairs.values()].sort((a, b) => a[0].provider.localeCompare(b[0].provider) || a[0].model.localeCompare(b[0].model));
}

// Confirm runs only happen after a failure, so counting them would drag
// uptime down. They are kept out of every count and used for incidents alone.
const isScheduled = (run) => !run.confirms;

export function summarize(runs, now) {
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString();
  const inWindow = runs.filter((run) => isScheduled(run) && run.ts >= windowStart);
  const rows = groupByPair(inWindow).map((pairRuns) => {
    const okRuns = pairRuns.filter((run) => run.status === "ok");
    const ttfts = okRuns.map((run) => run.ttft_ms).filter((ms) => ms !== null);
    const speeds = okRuns.map((run) => run.tps).filter((tps) => tps !== null);
    const last = pairRuns.at(-1);
    return {
      provider: last.provider,
      model: last.model,
      runs: pairRuns.length,
      ok: okRuns.length,
      uptime: Number((okRuns.length / pairRuns.length).toFixed(4)),
      ttft_ms_p50: percentile(ttfts, 50),
      ttft_ms_p95: percentile(ttfts, 95),
      tps_p50: percentile(speeds, 50),
      first_run: pairRuns[0].ts,
      last_run: last.ts,
      last_status: last.status,
    };
  });
  return { generated: timestamp(now), window_days: WINDOW_DAYS, rows };
}

// pairRuns: every run of one provider and model, oldest first.
export function findIncidents(pairRuns) {
  const confirmRuns = pairRuns.filter((run) => run.confirms);
  const incidents = [];
  let open = null;
  for (const run of pairRuns.filter(isScheduled)) {
    if (run.status === "ok") {
      if (open) open.end = run.ts;
      open = null;
      continue;
    }
    if (open) continue;
    const confirmation = confirmRuns.find((confirmRun) => {
      const delayMs = Date.parse(confirmRun.ts) - Date.parse(run.ts);
      return confirmRun.confirms === run.id && confirmRun.status !== "ok" && confirmRun.region !== run.region && delayMs >= 0 && delayMs <= CONFIRM_WINDOW_MS;
    });
    if (!confirmation) continue;
    open = { start: run.ts, end: null, kind: run.status, run: run.id, confirmed_by: confirmation.id };
    incidents.push(open);
  }
  return incidents;
}

export function statusFile(runs, now) {
  const rows = groupByPair(runs)
    .filter((pairRuns) => pairRuns.some(isScheduled))
    .map((pairRuns) => ({
      provider: pairRuns[0].provider,
      model: pairRuns[0].model,
      runs: pairRuns.filter(isScheduled).slice(-STRIP_RUNS).map((run) => [run.ts, run.status]),
      incidents: findIncidents(pairRuns),
    }));
  return { generated: timestamp(now), interval_minutes: INTERVAL_MINUTES, rows };
}

function timestamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function rollup(dir, now = new Date()) {
  const sinceDate = new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  const runs = await readRuns(dir, sinceDate);
  await writeFile(path.join(dir, "summary.json"), `${JSON.stringify(summarize(runs, now), null, 2)}\n`);
  await writeFile(path.join(dir, "status.json"), `${JSON.stringify(statusFile(runs, now))}\n`);
  return runs.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`rolled up ${await rollup(probesDir())} runs`);
}
