import assert from "node:assert/strict";
import { test } from "node:test";

import { monthlyTokens, project, tokenCost } from "./model.mjs";

const schedule = {
  cap_usd_per_month: 50,
  days_per_month: 30,
  template_overhead_tokens: 20,
  chars_per_token: 4,
  probe: { runs_per_day: 96 },
  fidelity: { runs_per_day: 1, prompts: 20, prompt_tokens: 25, max_output_tokens: 48, reference_runs: 3 },
  reference_prices: { outside: { input: 1, output: 1 } },
  fixed_charges: { beta: { monthly_fee: 5, free_usd_per_day: 0.1 }, alpha: { one_time: 15 } },
};

const models = [
  { id: "small", providers: { alpha: "a/small", beta: "b/small", gamma: "g/small" } },
  { id: "large", providers: { alpha: "a/large" } },
];

const prices = {
  date: "2026-11-19",
  rows: [
    { provider: "alpha", model: "small", input: 1, output: 2 },
    { provider: "beta", model: "small", input: 1, output: 2 },
    { provider: "alpha", model: "large", input: 10, output: 20 },
  ],
};

const probeShape = { prompt_tokens: 30, max_output_tokens: 100 };

const references = { small: { source: "alpha", provider: "alpha" }, large: { source: "outside", api_model: "large" } };

test("monthly tokens follow from the schedule", () => {
  const tokens = monthlyTokens(schedule, probeShape);
  assert.deepEqual(tokens.probe, { requests: 2880, input: 144000, output: 288000 });
  assert.deepEqual(tokens.fidelity, { requests: 600, input: 27000, output: 28800 });
});

test("token cost is tokens times the price per million", () => {
  assert.equal(tokenCost({ input: 1_000_000, output: 500_000 }, { input: 0.5, output: 2 }), 1.5);
});

test("a pair with no price row is listed, not priced", () => {
  const projection = project(models, prices, schedule, references, probeShape);
  assert.deepEqual(projection.unpriced, [{ provider: "gamma", model: "small" }]);
  assert.equal(projection.pairs.length, 3);
});

test("the reference adds two fidelity runs for a listed provider and three for an outside one", () => {
  const projection = project(models, prices, schedule, references, probeShape);
  const fidelityRunAtAlphaSmall = (27000 * 1 + 28800 * 2) / 1e6;
  const fidelityRunAtOutside = (27000 + 28800) / 1e6;
  assert.ok(Math.abs(projection.references[0].cost - 2 * fidelityRunAtAlphaSmall) < 1e-12);
  assert.ok(Math.abs(projection.references[1].cost - 3 * fidelityRunAtOutside) < 1e-12);
});

test("a monthly fee is added after the free allowance, and one-time charges stay out of the monthly total", () => {
  const projection = project(models, prices, schedule, references, probeShape);
  const beta = projection.providers.find((row) => row.provider === "beta");
  assert.ok(beta.usage < 3);
  assert.equal(beta.monthly, 5);
  const alpha = projection.providers.find((row) => row.provider === "alpha");
  assert.equal(alpha.one_time, 15);
  assert.ok(Math.abs(alpha.monthly - alpha.usage) < 1e-12);
  assert.equal(projection.total.one_time, 15);
});
