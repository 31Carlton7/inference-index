import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { replyFromStored, sendPrompt } from "./request.mjs";
import { collect, loadConfig, plannedRuns, score } from "./run.mjs";
import { agreementState, againstNoiseFloor, compareRuns, noiseFloor, prefixAgreement, scoreProviderRun } from "./score.mjs";

const promptIds = ["p1", "p2"];

function run(id, texts, extra = {}) {
  const replies = {};
  promptIds.forEach((promptId, index) => {
    replies[promptId] = { content: texts[index], reasoning: null, tokens: null, ...extra };
  });
  return { id, replies };
}

test("prefix agreement is the share of the longer text before the first difference", () => {
  assert.equal(prefixAgreement("abcd", "abcd"), 1);
  assert.equal(prefixAgreement("abcd", "abXd"), 0.5);
  assert.equal(prefixAgreement("ab", "abcd"), 0.5);
  assert.equal(prefixAgreement("abcd", "Xbcd"), 0);
  assert.equal(prefixAgreement("", ""), 1);
});

test("prefix agreement counts characters, not UTF-16 units", () => {
  assert.equal(prefixAgreement("😀a", "😀b"), 0.5);
});

test("a run's score is the mean agreement over its prompts", () => {
  const comparison = compareRuns(run("ref", ["abcd", "wxyz"]), run("prov", ["abcd", "wxQQ"]), promptIds);
  assert.equal(comparison.score, 0.75);
  assert.equal(comparison.prompts_scored, 2);
  assert.equal(comparison.exact_matches, 1);
  assert.equal(comparison.logprob_gap, null);
});

test("a prompt that failed on either side is left out, not counted as zero", () => {
  const provider = run("prov", ["abcd", "wxyz"]);
  provider.replies.p2 = { error: "HTTP 500" };
  const comparison = compareRuns(run("ref", ["abcd", "wxyz"]), provider, promptIds);
  assert.equal(comparison.score, 1);
  assert.equal(comparison.prompts_scored, 1);
});

test("a prompt is left out when only one side returned its reasoning", () => {
  const reference = run("ref", ["abcd", "wxyz"], { reasoning: "think" });
  assert.equal(compareRuns(reference, run("prov", ["abcd", "wxyz"]), promptIds), null);
});

test("reasoning is compared ahead of the answer", () => {
  const reference = run("ref", ["cd", "cd"], { reasoning: "ab" });
  const provider = run("prov", ["cd", "cd"], { reasoning: "aX" });
  assert.equal(compareRuns(reference, provider, promptIds).score, 0.25);
});

test("the logprob gap covers only the tokens before the first differing token", () => {
  const reference = run("ref", ["ab", "ab"], { tokens: [{ token: "a", logprob: -0.1 }, { token: "b", logprob: -0.5 }] });
  const provider = run("prov", ["ab", "ab"], { tokens: [{ token: "a", logprob: -0.3 }, { token: "c", logprob: -9 }] });
  assert.ok(Math.abs(compareRuns(reference, provider, promptIds).logprob_gap - 0.2) < 1e-9);
});

test("there is no noise floor with fewer than three reference runs", () => {
  const references = [run("r1", ["abcd", "wxyz"]), run("r2", ["abcd", "wxyz"])];
  assert.equal(noiseFloor(references, promptIds), null);
  assert.equal(againstNoiseFloor(0.2, null), "no noise floor");
});

test("the noise floor is the mean and the lowest score over pairs of reference runs", () => {
  const references = [run("r1", ["abcd", "wxyz"]), run("r2", ["abcd", "wxyz"]), run("r3", ["abcd", "wxQQ"])];
  // r1-r2: 1, r1-r3: 0.75, r2-r3: 0.75
  assert.deepEqual(noiseFloor(references, promptIds), { reference_runs: 3, pairs: 3, mean: 0.8333, min: 0.75 });
});

test("a provider is within the noise floor when it scores no lower than the reference does against itself", () => {
  const references = [run("r1", ["abcd", "wxyz"]), run("r2", ["abcd", "wxyz"]), run("r3", ["abcd", "wxQQ"])];
  const honest = scoreProviderRun(run("prov", ["abcd", "wxyz"]), references, promptIds);
  assert.equal(honest.score, 0.9167);
  assert.equal(honest.vs_noise_floor, "within");
  const different = scoreProviderRun(run("prov", ["aQQQ", "QQQQ"]), references, promptIds);
  assert.equal(different.score, 0.125);
  assert.equal(different.vs_noise_floor, "diverges");
});

test("a result is repeated only when the run before it landed on the same side of the noise floor", () => {
  assert.equal(agreementState({ vs_noise_floor: "diverges" }, null), "unconfirmed");
  assert.equal(agreementState({ vs_noise_floor: "diverges" }, { vs_noise_floor: "within" }), "unconfirmed");
  assert.equal(agreementState({ vs_noise_floor: "diverges" }, { vs_noise_floor: "diverges" }), "repeated");
  assert.equal(agreementState({ vs_noise_floor: "within" }, { vs_noise_floor: "within" }), "repeated");
  assert.equal(agreementState({ vs_noise_floor: "no noise floor" }, { vs_noise_floor: "no noise floor" }), "unconfirmed");
});

test("stored responses are read into reasoning, answer and token logprobs", () => {
  const reply = replyFromStored({
    error: null,
    response: { choices: [{ message: { content: "4", reasoning_content: "2+2" }, logprobs: { content: [{ token: "4", logprob: -0.01, top_logprobs: [] }] } }] },
  });
  assert.deepEqual(reply, { content: "4", reasoning: "2+2", tokens: [{ token: "4", logprob: -0.01 }] });
  assert.deepEqual(replyFromStored({ error: "HTTP 500", response: "oops" }), { error: "HTTP 500" });
});

function accessWith(key) {
  return { url: "https://api.example.test/v1/chat/completions", headers: { Authorization: `Bearer ${key}` }, secrets: [key] };
}

function jsonResponse(status, body, headers = {}) {
  return { status, headers: new Headers(headers), text: async () => JSON.stringify(body) };
}

test("a rejected request is retried without logprobs, then without the seed", async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    if ("logprobs" in body || "seed" in body) return jsonResponse(400, { error: "unsupported parameter" });
    return jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
  };
  const exchange = await sendPrompt({ fetchImpl, access: accessWith("k"), body: { model: "m", temperature: 0, seed: 1, logprobs: true, top_logprobs: 5 } });
  assert.equal(bodies.length, 3);
  assert.deepEqual(exchange.request, { model: "m", temperature: 0 });
  assert.equal(exchange.http_status, 200);
  assert.equal(exchange.error, null);
});

test("the key never reaches the stored exchange", async () => {
  const fetchImpl = async (url, init) => jsonResponse(401, { error: `bad key ${init.headers.Authorization}` });
  const exchange = await sendPrompt({ fetchImpl, access: accessWith("sk-test-123"), body: { model: "m" } });
  assert.equal(exchange.error, "HTTP 401");
  assert.ok(!JSON.stringify(exchange).includes("sk-test-123"));
});

test("a rate-limited request waits once and is sent again", async () => {
  let calls = 0;
  const waits = [];
  const fetchImpl = async () => {
    calls += 1;
    return calls === 1 ? jsonResponse(429, {}, { "retry-after": "2" }) : jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
  };
  const exchange = await sendPrompt({ fetchImpl, sleep: async (ms) => waits.push(ms), access: accessWith("k"), body: { model: "m" } });
  assert.deepEqual(waits, [2000]);
  assert.equal(exchange.http_status, 200);
});

const config = {
  promptSet: {
    version: 1,
    settings: { temperature: 0, seed: 1, max_tokens: 8 },
    model_settings: {},
    prompts: [{ id: "p1", kind: "fixed", text: "one" }, { id: "p2", kind: "open", text: "two" }],
  },
  models: [{ id: "small", providers: { alpha: "alpha/small", beta: "beta/small", gamma: "gamma/small" }, quantization: { beta: "fp4" } }],
  endpoints: {
    alpha: { url: "https://alpha.test/v1/chat/completions", key_env: "ALPHA_API_KEY" },
    beta: { url: "https://beta.test/v1/chat/completions", key_env: "BETA_API_KEY" },
    gamma: { url: "https://gamma.test/v1/chat/completions", key_env: "GAMMA_API_KEY" },
  },
  references: { small: { source: "alpha", provider: "alpha" } },
};

// alpha answers the same way every time, beta differs on the open prompt.
function mockProviders(url, init) {
  const { messages } = JSON.parse(init.body);
  const host = new URL(url).host;
  const answers = { one: "1 2 3 4", two: host === "beta.test" ? "a red fox" : "a red kite" };
  return jsonResponse(200, { choices: [{ message: { content: answers[messages[0].content] } }] });
}

function clock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 10, 18, 13, 0, tick++));
}

test("with no keys nothing is planned and nothing is written", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "fidelity-"));
  assert.deepEqual(plannedRuns(config, {}), []);
  const collected = await collect({ config, env: {}, outDir, date: "2026-11-18", fetchImpl: mockProviders, log: () => {} });
  assert.equal(collected, 0);
  assert.deepEqual(readdirSync(outDir), []);
});

test("a provider whose URL needs a setting that is missing is skipped", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "fidelity-"));
  const needsAccount = structuredClone(config);
  needsAccount.endpoints.beta.url = "https://beta.test/{BETA_ACCOUNT_ID}/chat/completions";
  const logged = [];
  await collect({ config: needsAccount, env: { BETA_API_KEY: "kb" }, outDir, date: "2026-11-18", fetchImpl: mockProviders, log: (line) => logged.push(line) });
  assert.deepEqual(logged, ["skipped beta small: BETA_ACCOUNT_ID is not set"]);
  assert.deepEqual(readdirSync(outDir), []);
});

test("provider keys without the reference key store raw runs and leave them unscored", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "fidelity-"));
  await collect({ config, env: { BETA_API_KEY: "kb" }, outDir, date: "2026-11-18", now: clock(), fetchImpl: mockProviders, log: () => {} });
  assert.ok(existsSync(path.join(outDir, "fidelity/runs/2026-11-18/beta.jsonl")));
  const fidelity = score({ config, outDir, date: "2026-11-18" });
  assert.deepEqual(fidelity.rows, []);
  assert.deepEqual(fidelity.unscored, [{ provider: "beta", model: "small", reason: "no reference run" }]);
});

test("a full run stores raw lines, then scores each provider against three reference runs", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "fidelity-"));
  const env = { ALPHA_API_KEY: "ka", BETA_API_KEY: "kb", GAMMA_API_KEY: "kg" };
  const collected = await collect({ config, env, outDir, date: "2026-11-18", now: clock(), fetchImpl: mockProviders, log: () => {} });
  assert.equal(collected, 5);

  const referenceLines = readFileSync(path.join(outDir, "fidelity/runs/2026-11-18/reference.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(referenceLines.length, 6);
  assert.equal(referenceLines[0].role, "reference");
  assert.deepEqual(referenceLines[0].request.messages, [{ role: "user", content: "one" }]);
  assert.equal(referenceLines[0].response.choices[0].message.content, "1 2 3 4");
  assert.ok(!readFileSync(path.join(outDir, "fidelity/runs/2026-11-18/beta.jsonl"), "utf8").includes("kb"));

  const fidelity = score({ config, outDir, date: "2026-11-18" });
  assert.equal(fidelity.experimental, true);
  assert.equal(fidelity.references[0].runs.length, 3);
  assert.deepEqual(fidelity.unscored, [{ provider: "alpha", model: "small", reason: "is the reference for this model" }]);

  const [beta, gamma] = fidelity.rows;
  assert.equal(beta.provider, "beta");
  // "a red fox" against "a red kite": 6 shared characters of 10, averaged with a full match.
  assert.equal(beta.score, 0.8);
  assert.equal(beta.vs_noise_floor, "diverges");
  assert.equal(beta.state, "unconfirmed");
  assert.equal(beta.stated_quantization, "fp4");
  assert.equal(beta.reference_run, "2026-11-18-reference-small");
  assert.equal(beta.runs_file, "data/fidelity/runs/2026-11-18/beta.jsonl");
  assert.equal(beta.runs.length, 1);
  assert.deepEqual(beta.noise_floor, { reference_runs: 3, pairs: 3, mean: 1, min: 1 });
  assert.equal(gamma.score, 1);
  assert.equal(gamma.vs_noise_floor, "within");
  assert.equal(gamma.stated_quantization, null);
});

test("the second day's result is repeated when it agrees with the first", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "fidelity-"));
  const env = { ALPHA_API_KEY: "ka", BETA_API_KEY: "kb" };
  await collect({ config, env, outDir, date: "2026-11-18", now: clock(), fetchImpl: mockProviders, log: () => {} });
  const firstDay = score({ config, outDir, date: "2026-11-18" });
  mkdirSync(path.join(outDir, "fidelity"), { recursive: true });
  writeFileSync(path.join(outDir, "fidelity/latest.json"), JSON.stringify(firstDay));

  await collect({ config, env, outDir, date: "2026-11-19", now: clock(), fetchImpl: mockProviders, log: () => {} });
  const secondDay = score({ config, outDir, date: "2026-11-19" });
  assert.equal(secondDay.rows[0].state, "repeated");
  assert.deepEqual(secondDay.rows[0].previous, { date: "2026-11-18", score: 0.8, vs_noise_floor: "diverges", reference_source: "alpha" });
});

test("the shipped config plans one provider run per pair that has an endpoint and a key", () => {
  const shipped = loadConfig();
  assert.equal(shipped.promptSet.version, 1);
  assert.equal(new Set(shipped.promptSet.prompts.map((prompt) => prompt.id)).size, shipped.promptSet.prompts.length);
  for (const model of shipped.models) assert.ok(shipped.references[model.id], `${model.id} has a reference`);
  const planned = plannedRuns(shipped, { GROQ_API_KEY: "k" });
  assert.deepEqual(planned.map((run) => `${run.role} ${run.provider} ${run.model.id}`), ["provider groq gpt-oss-120b"]);
});
