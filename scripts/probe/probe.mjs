#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { probeOnce, resolveAccess, sanitizeError } from "./request.mjs";
import { appendRun, probesDir, readJson, repoRoot } from "./runs.mjs";

// Requests go out one at a time per provider, so a provider never sees two of
// ours at once. Different providers run side by side.
export async function probeAll({ endpoints, probeModels, env, region, dir, fetchImpl = fetch, timeoutMs }) {
  const written = [];
  await Promise.all(
    Object.entries(endpoints).map(async ([provider, endpoint]) => {
      const served = probeModels.filter((model) => model.providers[provider]);
      if (served.length === 0) return;
      let access;
      try {
        access = await resolveAccess(endpoint, env, fetchImpl);
      } catch (error) {
        console.error(`${provider}: not probed, ${sanitizeError(error.message, [env[endpoint.key_env]])}`);
        return;
      }
      if (!access) return;
      for (const model of served) {
        const run = await probeOnce({ provider, model: model.id, apiModel: model.providers[provider], endpoint, access, region, fetchImpl, timeoutMs });
        await appendRun(dir, run);
        written.push(run);
      }
    }),
  );
  return written;
}

async function main() {
  const endpoints = await readJson(path.join(repoRoot, "scripts/probe/endpoints.json"));
  const { probe_models: probeModels } = await readJson(path.join(repoRoot, "data/models.json"));
  const region = process.env.PROBE_REGION;
  if (!region) {
    const keyed = Object.values(endpoints).filter((endpoint) => process.env[endpoint.key_env]);
    if (keyed.length === 0) return;
    throw new Error("PROBE_REGION is not set");
  }

  const written = await probeAll({ endpoints, probeModels, env: process.env, region, dir: probesDir() });
  for (const run of written) {
    console.log(`${run.provider} ${run.model} ${run.status}${run.error ? ` (${run.error})` : ""}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
