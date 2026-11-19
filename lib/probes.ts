import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { dataRoot, usingFixtures } from "./data";
import { RAW_DATA_BRANCH } from "./links";
import { fidelityFile, probeStatusFile, probeSummaryFile } from "./schema";

export const PROBE_REVALIDATE_SECONDS = 600;

// "missing" is the normal state before a job has written its first file.
// "unreadable" means a file is there but is not what docs/SCHEMA.md describes;
// pages say so instead of drawing numbers from it.
export type ProbeFile<T> = { state: "ok"; file: T } | { state: "missing" } | { state: "unreadable" };

async function fetchDataBranchJson(repoPath: string): Promise<unknown | undefined> {
  if (usingFixtures) {
    const filePath = path.join(dataRoot, repoPath.replace(/^data\//, ""));
    return existsSync(filePath) ? JSON.parse(readFileSync(filePath, "utf8")) : undefined;
  }
  const response = await fetch(`${RAW_DATA_BRANCH}/${repoPath}`, {
    next: { revalidate: PROBE_REVALIDATE_SECONDS },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`${repoPath}: HTTP ${response.status}`);
  return response.json();
}

async function loadProbeFile<T extends z.ZodType>(repoPath: string, shape: T): Promise<ProbeFile<z.infer<T>>> {
  let body: unknown;
  try {
    body = await fetchDataBranchJson(repoPath);
  } catch {
    return { state: "unreadable" };
  }
  if (body === undefined) return { state: "missing" };
  const parsed = shape.safeParse(body);
  return parsed.success ? { state: "ok", file: parsed.data } : { state: "unreadable" };
}

export const getProbeSummary = () => loadProbeFile("data/probes/summary.json", probeSummaryFile);
export const getProbeStatus = () => loadProbeFile("data/probes/status.json", probeStatusFile);
export const getFidelity = () => loadProbeFile("data/fidelity/latest.json", fidelityFile);
