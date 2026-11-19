import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { pickProbeRows, renderPriceSvg, segments, summarize } from "./weekly_chart.mjs";

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const day = (date, value, providers = 12) => ({ date, value, providers, rows: null });

test("7-day change compares the last day with the same weekday one week earlier", async () => {
  const numbers = summarize(await fixture("price-index-fixture.json"));
  assert.equal(numbers.date, "2026-11-18");
  assert.equal(numbers.last_value, 0.648);
  assert.equal(numbers.date_7d_earlier, "2026-11-11");
  assert.equal(numbers.value_7d_earlier, 0.667);
  assert.equal(numbers.change_abs, -0.019);
  assert.equal(numbers.change_pct, -2.85);
  assert.equal(numbers.providers, 12);
  assert.equal(numbers.providers_min, 11);
  assert.equal(numbers.providers_max, 12);
  assert.equal(numbers.days_of_data, 29);
  assert.equal(numbers.missing_days, 1);
  assert.equal(numbers.fixture, true);
});

test("one day of data has no change figure", async () => {
  const numbers = summarize(await fixture("price-index-one-day-fixture.json"));
  assert.equal(numbers.days_of_data, 1);
  assert.equal(numbers.value_7d_earlier, null);
  assert.equal(numbers.change_abs, null);
  assert.equal(numbers.change_pct, null);
});

test("a missing day 7 days earlier gives null, not the nearest day", () => {
  const numbers = summarize({
    basket_version: 1,
    series: [day("2026-11-10", 0.7), day("2026-11-12", 0.69), day("2026-11-18", 0.65)],
  });
  assert.equal(numbers.date_7d_earlier, "2026-11-11");
  assert.equal(numbers.value_7d_earlier, null);
  assert.equal(numbers.change_abs, null);
  assert.equal(numbers.change_pct, null);
  assert.equal(numbers.missing_days, 6);
});

test("a day with a null value counts as missing", () => {
  const numbers = summarize({
    basket_version: 1,
    series: [day("2026-11-11", null), day("2026-11-17", 0.66), day("2026-11-18", 0.65)],
  });
  assert.equal(numbers.days_of_data, 2);
  assert.equal(numbers.value_7d_earlier, null);
});

test("an empty series is an error", () => {
  assert.throws(() => summarize({ basket_version: 1, series: [] }), /no values/);
});

test("the line breaks at a missing day", async () => {
  const index = await fixture("price-index-fixture.json");
  const runs = segments(index.series);
  assert.deepEqual(runs.map((run) => [run[0].date, run.at(-1).date]), [
    ["2026-10-20", "2026-11-02"],
    ["2026-11-04", "2026-11-18"],
  ]);
  const paths = renderPriceSvg(index, null).match(/<path /g);
  assert.equal(paths.length, 2);
});

test("one day renders a dot, no line, and says so", async () => {
  const svg = renderPriceSvg(await fixture("price-index-one-day-fixture.json"), null);
  assert.equal(svg.includes("<path "), false);
  assert.equal(svg.match(/<circle /g).length, 1);
  assert.match(svg, /1 day of data/);
});

test("fixture input is marked on the image and real input is not", () => {
  const series = [day("2026-11-17", 0.66), day("2026-11-18", 0.65)];
  assert.match(renderPriceSvg({ fixture: true, basket_version: 1, series }, null), /FIXTURE DATA/);
  assert.equal(renderPriceSvg({ basket_version: 1, series }, null).includes("FIXTURE"), false);
});

test("the footer URL appears only when a site URL is given", () => {
  const index = { basket_version: 1, series: [day("2026-11-18", 0.65)] };
  assert.match(renderPriceSvg(index, "example.org"), /example\.org/);
  assert.equal(renderPriceSvg(index, null).includes("example.org"), false);
});

test("probe rows are one model, fastest first, without unmeasured providers", async () => {
  const picked = pickProbeRows(await fixture("probe-summary-fixture.json"));
  assert.equal(picked.model, "example-model-70b");
  assert.deepEqual(picked.rows.map((row) => row.provider), [
    "example-c", "example-a", "example-g", "example-e", "example-b", "example-f", "example-d",
  ]);
  assert.equal(picked.unmeasured, 1);
});
