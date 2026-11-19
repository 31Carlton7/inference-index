#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { sanitizeError } from "./request.mjs";
import { CONFIRM_WINDOW_MS } from "./rollup.mjs";
import { appendRun, probesDir, readRuns } from "./runs.mjs";

const CONFIRM_REQUEST_TIMEOUT_MS = 45_000;

// Failed scheduled runs that are recent enough to confirm and have no confirm run yet.
export function unconfirmedFailures(runs, now) {
  const confirmedIds = new Set(runs.filter((run) => run.confirms).map((run) => run.confirms));
  return runs.filter((run) => !run.confirms && run.status !== "ok" && !confirmedIds.has(run.id) && now.getTime() - Date.parse(run.ts) <= CONFIRM_WINDOW_MS);
}

const RUN_FIELDS = ["id", "ts", "provider", "model", "region", "status", "http_status", "ttft_ms", "ttft_kind", "total_ms", "output_tokens", "tokens_source", "tps", "error", "confirms"];

// Keeps only the fields of a run row, so a reply can add nothing else to the public runs file.
function runRow(reply, confirmToken) {
  const row = Object.fromEntries(RUN_FIELDS.map((name) => [name, reply[name] ?? null]));
  if (row.error !== null) row.error = sanitizeError(row.error, [confirmToken]);
  return row;
}

// Asks the second region to probe each failed pair once and appends what it
// measured. When the second region cannot be reached nothing is written, so
// the failure stays unconfirmed and no incident is recorded.
export async function confirmFailures({ dir, confirmUrl, confirmToken, now = new Date(), fetchImpl = fetch }) {
  const sinceDate = new Date(now.getTime() - CONFIRM_WINDOW_MS).toISOString().slice(0, 10);
  const written = [];
  for (const failed of unconfirmedFailures(await readRuns(dir, sinceDate), now)) {
    try {
      const response = await fetchImpl(confirmUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${confirmToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider: failed.provider, model: failed.model, confirms: failed.id }),
        signal: AbortSignal.timeout(CONFIRM_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`second region returned ${response.status}`);
      const confirmRun = runRow(await response.json(), confirmToken);
      if (confirmRun.provider !== failed.provider || confirmRun.model !== failed.model || confirmRun.confirms !== failed.id || !confirmRun.id || !confirmRun.ts) {
        throw new Error("second region returned a run for something else");
      }
      await appendRun(dir, confirmRun);
      written.push(confirmRun);
    } catch (error) {
      console.error(`${failed.id}: not confirmed, ${sanitizeError(error.message, [confirmToken, confirmUrl])}`);
    }
  }
  return written;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { PROBE_CONFIRM_URL: confirmUrl, PROBE_CONFIRM_TOKEN: confirmToken } = process.env;
  if (confirmUrl && confirmToken) {
    for (const confirmRun of await confirmFailures({ dir: probesDir(), confirmUrl, confirmToken })) {
      console.log(`${confirmRun.provider} ${confirmRun.model} ${confirmRun.status} from ${confirmRun.region}`);
    }
  }
}
