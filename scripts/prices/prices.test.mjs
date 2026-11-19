import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { indexForDay } from "./index.mjs";
import { isAllowed, parseRobots } from "./robots.mjs";
import { checkedPrice, writeDaily } from "./scrape.mjs";
import { SOURCES } from "./sources.mjs";

const basket = { version: 1, models: ["small", "large"], weights: { input: 0.75, output: 0.25 } };

function row(provider, model, input, output) {
  return { provider, model, input, output };
}

test("index is the mean of per-model medians of the blended price", () => {
  const rows = [
    row("a", "small", 0.1, 0.5),
    row("b", "small", 0.2, 0.6),
    row("c", "small", 1.0, 3.0),
    row("a", "large", 1.0, 4.0),
    row("b", "large", 1.4, 4.4),
    row("d", "large", 1.4, 4.4),
    row("e", "large", 2.0, 8.0),
  ];
  const day = indexForDay(rows, basket);
  assert.equal(day.models.small.median, 0.3);
  assert.equal(day.models.large.median, 2.15);
  assert.equal(day.value, 1.225);
  assert.equal(day.providers, 5);
});

test("no index when a basket model has fewer than three providers", () => {
  const rows = [
    row("a", "small", 0.1, 0.5),
    row("b", "small", 0.2, 0.6),
    row("c", "small", 1.0, 3.0),
    row("a", "large", 1.0, 4.0),
    row("b", "large", 1.4, 4.4),
  ];
  assert.equal(indexForDay(rows, basket), null);
});

test("prices outside the plausible range are rejected", () => {
  assert.deepEqual(checkedPrice({ input: 0.16999999999999998, output: 0.6 }), { input: 0.17, output: 0.6 });
  assert.throws(() => checkedPrice({ input: 0, output: 0.6 }));
  assert.throws(() => checkedPrice({ input: 0.6, output: 0.15 }));
  assert.throws(() => checkedPrice({ input: 0.15, output: 600 }));
  assert.throws(() => checkedPrice({ input: undefined, output: 0.6 }));
  assert.throws(() => checkedPrice({ input: "0.15", output: 0.6 }));
});

test("robots rules: longest match wins and $ anchors the end", () => {
  const rules = parseRobots("User-agent: *\nAllow: /api/public/models_info$\nDisallow: /\n", "price-check/1.0");
  assert.equal(isAllowed(rules, "/api/public/models_info"), true);
  assert.equal(isAllowed(rules, "/api/public/models_info/extra"), false);
  assert.equal(isAllowed(rules, "/organization/prices"), false);
  assert.equal(isAllowed([], "/anything"), true);
});

test("robots rules: a group naming the agent replaces the * group", () => {
  const robots = "User-agent: *\nAllow: /\n\nUser-agent: price-check\nDisallow: /pricing\n";
  assert.equal(isAllowed(parseRobots(robots, "price-check/1.0"), "/pricing"), false);
  assert.equal(isAllowed(parseRobots(robots, "other-bot/1.0"), "/pricing"), true);
});

const fireworksPage = [
  "In each **Standard** or **Priority** cell, prices are **input / cached input / output** (USD per 1M tokens), in that order.",
  "",
  "| Model | Standard | Priority |",
  "| - | - | - |",
  "| [GLM 5.3](https://app.fireworks.ai/models/fireworks/glm-5p3) | \\$1.40 / \\$0.26 / \\$4.40 | \\$1.75 / \\$0.325 / \\$5.50 |",
  "| [GLM 5.3 (US)](https://app.fireworks.ai/models/fireworks/glm-5p3) | \\$2.10 / \\$0.39 / \\$6.60 | — |",
].join("\n");

test("fireworks: reads the plain row, not the US or Fast variant", () => {
  const price = SOURCES.fireworks.price([fireworksPage], "accounts/fireworks/models/glm-5p3", "glm-5.3");
  assert.deepEqual(price, { input: 1.4, output: 4.4 });
});

test("fireworks: a changed layout is an error, not a price", () => {
  const twoColumnCells = fireworksPage.replaceAll(" / \\$0.26", "").replaceAll(" / \\$0.39", "");
  assert.throws(() => SOURCES.fireworks.price([twoColumnCells], "accounts/fireworks/models/glm-5p3", "glm-5.3"));
  assert.throws(() => SOURCES.fireworks.price([fireworksPage], "accounts/fireworks/models/gpt-oss-120b", "gpt-oss-120b"));
});

test("cerebras: a model with no pricing is an error", () => {
  const body = JSON.stringify({ data: [{ id: "gpt-oss-120b" }] });
  assert.throws(() => SOURCES.cerebras.price([body], "gpt-oss-120b"));
});

const novitaModels = { "openai/gpt-oss-120b": [0.05, 0.25], "zai-org/glm-5.3": [1.4, 4.4], "deepseek/deepseek-v4.1-flash-1017": [0.3, 1.2] };

async function novitaPage(day) {
  return readFile(new URL(`fixtures/novita-${day}.html`, import.meta.url), "utf8");
}

for (const [day, layout] of [["2026-11-17", "five-column"], ["2026-11-19", "eight-column"]]) {
  test(`novita: reads input and output from the ${layout} table`, async () => {
    const page = await novitaPage(day);
    for (const [apiName, [input, output]] of Object.entries(novitaModels)) {
      assert.deepEqual(SOURCES.novita.price([page], apiName), { input, output });
    }
  });
}

test("novita: an unknown header row is an error that says what the header was", async () => {
  const page = await novitaPage("2026-11-19");
  const renamed = page.replaceAll(">Output(/Mt)<", ">Completion(/Mt)<");
  assert.throws(
    () => SOURCES.novita.price([renamed], "zai-org/glm-5.3"),
    /unknown table layout, header row is: Model \| Tier \| Context \| Input\(\/Mt\) \| Cache Write\(\/Mt\) \| Cache Read\(\/Mt\) \| Completion\(\/Mt\) \| Actions/,
  );
  const cacheReadLast = page.replaceAll(">Cache Read(/Mt)<", ">Swap<").replaceAll(">Output(/Mt)<", ">Cache Read(/Mt)<").replaceAll(">Swap<", ">Output(/Mt)<");
  assert.throws(() => SOURCES.novita.price([cacheReadLast], "zai-org/glm-5.3"), /unknown table layout, header row is: .* Output\(\/Mt\) \| Cache Read\(\/Mt\) \| Actions/);
});

test("novita: a tiered price, a changed cell or a model not on the page is an error", async () => {
  const page = await novitaPage("2026-11-19");
  assert.throws(() => SOURCES.novita.price([page], "qwen/qwen3-vl-plus"), /price depends on a tier/);
  assert.throws(() => SOURCES.novita.price([page.replaceAll(">$4.4<", ">$4.4 /Mt<")], "zai-org/glm-5.3"), /not a dollar amount/);
  assert.throws(() => SOURCES.novita.price([page], "zai-org/glm-9"), /expected one price/);
  const olderPage = await novitaPage("2026-11-17");
  assert.throws(() => SOURCES.novita.price([olderPage.replaceAll("$4.4 /Mt", "$4.4")], "zai-org/glm-5.3"), /not '\$x \/Mt'/);
});

function rowReadAt(provider, model, input, output, readAt) {
  return { ...row(provider, model, input, output), source: "https://example.com/pricing", checked: readAt.slice(0, 10), read_at: readAt };
}

function gap(provider, model, reason) {
  return { provider, model, reason };
}

async function writeRuns(...days) {
  const pricesDir = await mkdtemp(path.join(tmpdir(), "price-daily-"));
  let written;
  for (const day of days) written = await writeDaily(pricesDir, { basket_version: 1, ...day });
  return { pricesDir, written };
}

const firstRun = "2026-11-19T03:15:00.000Z";
const secondRun = "2026-11-19T15:46:00.000Z";

test("same day: a later run that reads fewer rows keeps the earlier rows", async () => {
  const earlier = [rowReadAt("a", "small", 0.1, 0.5, firstRun), rowReadAt("b", "small", 0.2, 0.6, firstRun)];
  const { pricesDir, written } = await writeRuns(
    { date: "2026-11-19", rows: earlier, missing: [] },
    { date: "2026-11-19", rows: [rowReadAt("a", "small", 0.1, 0.5, secondRun)], missing: [gap("b", "small", "layout changed")] },
  );
  assert.deepEqual(written, { date: "2026-11-19", basket_version: 1, rows: earlier, missing: [] });
  assert.deepEqual(JSON.parse(await readFile(path.join(pricesDir, "daily/2026-11-19.json"), "utf8")), written);
});

test("same day: a later run fills a missing pair and takes it out of missing", async () => {
  const { written } = await writeRuns(
    { date: "2026-11-19", rows: [rowReadAt("a", "small", 0.1, 0.5, firstRun)], missing: [gap("b", "small", "returned 503"), gap("c", "small", "returned 403")] },
    { date: "2026-11-19", rows: [rowReadAt("a", "small", 0.1, 0.5, secondRun), rowReadAt("b", "small", 0.2, 0.6, secondRun)], missing: [gap("c", "small", "returned 429")] },
  );
  assert.deepEqual(written.rows, [rowReadAt("a", "small", 0.1, 0.5, firstRun), rowReadAt("b", "small", 0.2, 0.6, secondRun)]);
  assert.deepEqual(written.missing, [gap("c", "small", "returned 429")]);
});

test("same day: a later run that reads a different price keeps the first price", async () => {
  const { written } = await writeRuns(
    { date: "2026-11-19", rows: [rowReadAt("a", "small", 0.1, 0.5, firstRun)], missing: [] },
    { date: "2026-11-19", rows: [rowReadAt("a", "small", 0.12, 0.5, secondRun)], missing: [] },
  );
  assert.deepEqual(written.rows, [rowReadAt("a", "small", 0.1, 0.5, firstRun)]);
});

test("a new UTC day starts with no rows from the day before", async () => {
  const nextDay = "2026-11-20T06:17:00.000Z";
  const dayBefore = { date: "2026-11-19", rows: [rowReadAt("a", "small", 0.1, 0.5, firstRun), rowReadAt("b", "small", 0.2, 0.6, firstRun)], missing: [] };
  const { pricesDir, written } = await writeRuns(dayBefore, {
    date: "2026-11-20",
    rows: [rowReadAt("a", "small", 0.1, 0.5, nextDay)],
    missing: [gap("b", "small", "returned 503")],
  });
  assert.deepEqual(written.rows, [rowReadAt("a", "small", 0.1, 0.5, nextDay)]);
  assert.deepEqual(written.missing, [gap("b", "small", "returned 503")]);
  assert.deepEqual(JSON.parse(await readFile(path.join(pricesDir, "daily/2026-11-19.json"), "utf8")), { basket_version: 1, ...dayBefore });
});
