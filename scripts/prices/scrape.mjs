#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { previousDay, recordPriceChanges } from "./changelog.mjs";
import { rebuildIndex } from "./index.mjs";
import { isAllowed, parseRobots } from "./robots.mjs";
import { SOURCES } from "./sources.mjs";

const AGENT_TOKEN = "inference-index-price-check";
const USER_AGENT = `${AGENT_TOKEN}/1.0 (reads public pricing pages once a day)`;
const FETCH_TIMEOUT_MS = 45_000;
const MAX_PRICE_PER_MILLION = 200;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pricesDir = path.join(repoRoot, "data/prices");

async function get(url) {
  return fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

const robotsByOrigin = new Map();

function robotsRules(origin) {
  if (!robotsByOrigin.has(origin)) {
    robotsByOrigin.set(
      origin,
      get(`${origin}/robots.txt`).then(async (response) => {
        if (response.status >= 400 && response.status < 500) return [];
        if (!response.ok) throw new Error(`robots.txt returned ${response.status}`);
        return parseRobots(await response.text(), AGENT_TOKEN);
      }),
    );
  }
  return robotsByOrigin.get(origin);
}

async function fetchPage(url) {
  const { origin, pathname, search } = new URL(url);
  if (!isAllowed(await robotsRules(origin), pathname + search)) throw new Error(`robots.txt disallows ${url}`);
  const response = await get(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

export function checkedPrice({ input, output }) {
  for (const price of [input, output]) {
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || price > MAX_PRICE_PER_MILLION) {
      throw new Error(`price out of range: ${price}`);
    }
  }
  if (input > output) throw new Error(`input ${input} is above output ${output}`);
  return { input: Number(input.toFixed(6)), output: Number(output.toFixed(6)) };
}

// The first read of a provider and model on a UTC day stands. A later run that day only adds rows
// for pairs that have none, and `missing` is left with the pairs this run could not read either.
function mergeSameDay(earlierRows, rows, missing) {
  const isIn = (dayRows, { provider, model }) => dayRows.some((row) => row.provider === provider && row.model === model);
  const dayRows = [...earlierRows, ...rows.filter((row) => !isIn(earlierRows, row))];
  return { rows: dayRows, missing: missing.filter((gap) => !isIn(dayRows, gap)) };
}

export async function writeDaily(pricesDir, { date, basket_version, rows, missing }) {
  const dailyPath = path.join(pricesDir, "daily", `${date}.json`);
  let earlierRows = [];
  try {
    earlierRows = JSON.parse(await readFile(dailyPath, "utf8")).rows;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const daily = { date, basket_version, ...mergeSameDay(earlierRows, rows, missing) };
  await mkdir(path.dirname(dailyPath), { recursive: true });
  await writeFile(dailyPath, JSON.stringify(daily, null, 2) + "\n");
  return daily;
}

async function main() {
  const { probe_models: probeModels, basket } = JSON.parse(await readFile(path.join(repoRoot, "data/models.json"), "utf8"));
  const { providers } = JSON.parse(await readFile(path.join(repoRoot, "data/providers.json"), "utf8"));
  const basketModels = probeModels.filter((model) => basket.models.includes(model.id));
  const date = new Date().toISOString().slice(0, 10);

  const rows = [];
  const missing = [];
  const summary = [];
  for (const { id: provider } of providers) {
    const served = basketModels.filter((model) => model.providers[provider]);
    if (served.length === 0) continue;
    const source = SOURCES[provider];
    let bodies = null;
    let pageError = source ? null : "no price reader for this provider";
    if (source) {
      try {
        bodies = await Promise.all(source.pages.map(fetchPage));
      } catch (error) {
        pageError = error.message;
      }
    }
    const readAt = new Date().toISOString();
    let read = 0;
    for (const model of served) {
      try {
        if (pageError) throw new Error(pageError);
        const price = checkedPrice(source.price(bodies, model.providers[provider], model.id));
        rows.push({ provider, model: model.id, ...price, source: source.pages[0], checked: date, read_at: readAt });
        read += 1;
      } catch (error) {
        missing.push({ provider, model: model.id, reason: error.message });
        console.error(`FAILED ${provider} ${model.id}: ${error.message}`);
      }
    }
    summary.push(`${read === served.length ? "read  " : "FAILED"} ${provider}: ${read}/${served.length}`);
  }

  console.log(summary.join("\n"));
  console.log(`${rows.length} rows read, ${missing.length} missing`);
  if (rows.length === 0) {
    console.error("no prices read; nothing written");
    process.exit(1);
  }

  const daily = await writeDaily(pricesDir, { date, basket_version: basket.version, rows, missing });
  console.log(`${date}: ${daily.rows.length} rows and ${daily.missing.length} missing after this run`);

  const index = await rebuildIndex(pricesDir, basket);
  const today = index.series.find((day) => day.date === date);
  console.log(today ? `index ${date}: ${today.value} over ${today.providers} providers` : `index ${date}: not computed, a basket model has too few providers`);

  const changes = await recordPriceChanges(path.join(repoRoot, "data"), date);
  if (changes === null) {
    console.log(`changelog: no daily file for ${previousDay(date)}, nothing compared`);
  } else {
    for (const { provider, model, before, after } of changes) {
      console.log(`changelog: ${provider} ${model} ${before.input}/${before.output} -> ${after.input}/${after.output}`);
    }
    console.log(`changelog: price changes since ${previousDay(date)}: ${changes.length}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
