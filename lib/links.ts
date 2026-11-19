export const REPO = "31Carlton7/inference-index";
export const REPO_URL = `https://github.com/${REPO}`;
export const RAW_DATA_BRANCH = `https://raw.githubusercontent.com/${REPO}/data`;

export function mainFileUrl(repoPath: string): string {
  return `${REPO_URL}/blob/main/${repoPath}`;
}

export function dataBranchFileUrl(repoPath: string): string {
  return `${REPO_URL}/blob/data/${repoPath}`;
}

export const RUNS_DIR_URL = `${REPO_URL}/tree/data/data/probes/runs`;

// One file holds a provider's raw runs for one UTC day.
export function runsFileUrl(provider: string, timestamp: string): string {
  return dataBranchFileUrl(`data/probes/runs/${timestamp.slice(0, 10)}/${provider}.jsonl`);
}

// A run id starts with the run's timestamp: 2026-11-18T12:00:03Z-example-...
export function runUrl(provider: string, runId: string): string {
  return runsFileUrl(provider, runId);
}

export function siteUrl(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}
