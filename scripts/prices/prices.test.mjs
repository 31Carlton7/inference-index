import assert from "node:assert/strict";
import { test } from "node:test";

import { indexForDay } from "./index.mjs";
import { isAllowed, parseRobots } from "./robots.mjs";
import { checkedPrice } from "./scrape.mjs";
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
