import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { confirmFailures, unconfirmedFailures } from "./confirm.mjs";
import { googleAccessToken } from "./google-auth.mjs";
import { probeAll } from "./probe.mjs";
import { handleConfirm } from "./region2.mjs";
import { MAX_TOKENS, PROMPT, probeOnce, resolveAccess, sanitizeError } from "./request.mjs";
import { findIncidents, percentile, rollup, statusFile, summarize } from "./rollup.mjs";
import { readJson, readRuns, repoRoot } from "./runs.mjs";

const MOCK_KEY = "mock-key-0123456789abcdefghijklmnopqrstuvwxyz";

const contentChunk = (text) => ({ choices: [{ index: 0, delta: { content: text } }] });
const finishChunk = { choices: [{ index: 0, delta: {}, finish_reason: "length" }] };

// What the mock provider streams for each model name, as [delay ms, event] pairs.
const SCRIPTS = {
  "usage-in-final-chunk": [
    [20, { choices: [{ index: 0, delta: { role: "assistant", content: "" } }] }],
    [60, contentChunk("A sailboat")],
    [60, contentChunk(" tacks.")],
    [5, finishChunk],
    [5, { choices: [], usage: { prompt_tokens: 17, completion_tokens: 128 } }],
    [0, "[DONE]"],
  ],
  "no-usage": [[30, contentChunk("A sailboat")], [40, contentChunk(" tacks.")], [5, finishChunk], [0, "[DONE]"]],
  "reasoning-first": [
    [30, { choices: [{ index: 0, delta: { reasoning: "The user asks" } }] }],
    [80, contentChunk("A sailboat tacks.")],
    [5, { choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { completion_tokens: 40 } }],
    [0, "[DONE]"],
  ],
  "reasoning-content-field": [
    [30, { choices: [{ index: 0, delta: { reasoning_content: "The user asks" } }] }],
    [30, { ...finishChunk, x_groq: { usage: { completion_tokens: 128 } } }],
    [0, "[DONE]"],
  ],
  "cut-off": [[20, contentChunk("A sail")]],
  "error-in-stream": [[20, contentChunk("A sail")], [10, { error: { message: "worker died" } }]],
  "never-ends": [[20, contentChunk("A sail")], [60_000, "[DONE]"]],
};

const mock = { requests: [], sockets: new Set() };

const server = http.createServer(async (request, response) => {
  let received = "";
  for await (const piece of request) received += piece;
  const body = JSON.parse(received);
  mock.requests.push({ body, headers: request.headers });
  mock.sockets.add(request.socket);

  if (body.model === "bad-key") {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${request.headers.authorization}` } }));
    return;
  }
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const [delayMs, event] of SCRIPTS[body.model]) {
    const waited = await new Promise((resolve) => {
      const timer = setTimeout(resolve, delayMs, true);
      response.once("close", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    if (!waited) return;
    response.write(`data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`);
  }
  response.end();
});

let mockUrl;
before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  mockUrl = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

function probeMock(apiModel, overrides = {}) {
  return probeOnce({
    provider: "example",
    model: "gpt-oss-120b",
    apiModel,
    endpoint: {},
    access: { url: mockUrl, headers: { Authorization: `Bearer ${MOCK_KEY}` }, secrets: [MOCK_KEY] },
    region: "test",
    ...overrides,
  });
}

test("an ok run takes tokens from usage and speed from first text to stream end", async () => {
  const run = await probeMock("usage-in-final-chunk");
  assert.equal(run.status, "ok");
  assert.equal(run.http_status, 200);
  assert.equal(run.ttft_kind, "content");
  assert.ok(run.ttft_ms >= 75 && run.ttft_ms < 300, `ttft ${run.ttft_ms}`);
  assert.ok(run.total_ms >= run.ttft_ms + 65, `total ${run.total_ms}`);
  assert.equal(run.output_tokens, 128);
  assert.equal(run.tokens_source, "usage");
  assert.equal(run.tps, Number((128 / ((run.total_ms - run.ttft_ms) / 1000)).toFixed(1)));
  assert.equal(run.error, null);
  assert.match(run.id, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ-example-gpt-oss-120b-test$/);
  assert.equal(run.id, `${run.ts}-example-gpt-oss-120b-test`);
});

test("the request is the fixed prompt, streamed, at temperature 0", async () => {
  mock.requests.length = 0;
  await probeMock("no-usage");
  assert.deepEqual(mock.requests[0].body, {
    model: "no-usage",
    messages: [{ role: "user", content: PROMPT }],
    max_tokens: MAX_TOKENS,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true },
  });
  await probeMock("no-usage", { endpoint: { include_usage: false } });
  assert.equal("stream_options" in mock.requests[1].body, false);
});

test("each request opens its own connection", async () => {
  mock.sockets.clear();
  await probeMock("no-usage");
  await probeMock("no-usage");
  assert.equal(mock.sockets.size, 2);
});

test("a stream with no usage is ok with no token count and no speed", async () => {
  const run = await probeMock("no-usage");
  assert.equal(run.status, "ok");
  assert.equal(run.output_tokens, null);
  assert.equal(run.tokens_source, "none");
  assert.equal(run.tps, null);
  assert.ok(run.ttft_ms > 0);
});

test("reasoning text counts as the first token", async () => {
  const run = await probeMock("reasoning-first");
  assert.equal(run.status, "ok");
  assert.equal(run.ttft_kind, "reasoning");
  assert.ok(run.ttft_ms >= 25 && run.ttft_ms < 100, `ttft ${run.ttft_ms}`);
  assert.equal(run.output_tokens, 40);
});

test("reasoning_content and x_groq.usage are read the same way", async () => {
  const run = await probeMock("reasoning-content-field");
  assert.equal(run.status, "ok");
  assert.equal(run.ttft_kind, "reasoning");
  assert.equal(run.output_tokens, 128);
});

test("an HTTP error is recorded without the key", async () => {
  const run = await probeMock("bad-key");
  assert.equal(run.status, "error");
  assert.equal(run.http_status, 401);
  assert.equal(run.ttft_ms, null);
  assert.equal(run.tps, null);
  assert.match(run.error, /^HTTP 401: /);
  assert.equal(run.error.includes(MOCK_KEY), false);
  assert.equal(/bearer mock/i.test(run.error), false);
});

test("a stream that never ends is a timeout", async () => {
  const run = await probeMock("never-ends", { timeoutMs: 200 });
  assert.equal(run.status, "timeout");
  assert.equal(run.http_status, 200);
  assert.equal(run.total_ms, null);
  assert.equal(run.error, "no stream end within 200 ms");
});

test("a stream cut before the model finished is an error", async () => {
  const cutOff = await probeMock("cut-off");
  assert.equal(cutOff.status, "error");
  assert.equal(cutOff.error, "stream ended before the model finished");
  const failed = await probeMock("error-in-stream");
  assert.equal(failed.status, "error");
  assert.match(failed.error, /worker died/);
});

test("a refused connection is an error with no http status", async () => {
  const closed = http.createServer();
  await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
  const { port } = closed.address();
  await new Promise((resolve) => closed.close(resolve));
  const run = await probeMock("no-usage", { access: { url: `http://127.0.0.1:${port}/v1/chat/completions`, headers: {}, secrets: [] } });
  assert.equal(run.status, "error");
  assert.equal(run.http_status, null);
  assert.equal(run.error, "ECONNREFUSED");
});

test("sanitizeError strips keys and auth headers however they appear", () => {
  const secret = "s3cr3t-value-123";
  assert.equal(sanitizeError(`bad key ${secret}`, [secret]), "bad key [redacted]");
  for (const leaked of [
    "Authorization: Bearer abc.def-ghi",
    '{"authorization":"Bearer abc.def-ghi"}',
    "api-key: 0123456789abcdef",
    "invalid key sk-proj-AbCdEf0123456789",
    "token eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJ4In0.c2lnbmF0dXJl",
    "key 0123456789abcdef0123456789abcdef0123",
  ]) {
    const clean = sanitizeError(leaked);
    assert.match(clean, /\[redacted\]/, leaked);
    assert.equal(/abc\.def|0123456789abcdef|AbCdEf|eyJhbGci/.test(clean), false, clean);
  }
  assert.equal(sanitizeError("x".repeat(20) + " y".repeat(400)).length, 200);
  assert.equal(sanitizeError("model accounts/fireworks/models/gpt-oss-120b not found"), "model accounts/fireworks/models/gpt-oss-120b not found");
});

test("resolveAccess skips a provider with no key and fills the url from env", async () => {
  const bedrock = { url: "https://bedrock-runtime.{AMAZON_BEDROCK_REGION}.amazonaws.com/openai/v1/chat/completions", key_env: "AMAZON_BEDROCK_API_KEY" };
  assert.equal(await resolveAccess(bedrock, {}), null);
  await assert.rejects(resolveAccess(bedrock, { AMAZON_BEDROCK_API_KEY: "k" }), /AMAZON_BEDROCK_REGION is not set/);
  const access = await resolveAccess(bedrock, { AMAZON_BEDROCK_API_KEY: "k", AMAZON_BEDROCK_REGION: "us-west-2" });
  assert.equal(access.url, "https://bedrock-runtime.us-west-2.amazonaws.com/openai/v1/chat/completions");
  assert.deepEqual(access.headers, { Authorization: "Bearer k" });

  const azure = await resolveAccess({ url: "https://{R}.example/v1", key_env: "K", auth: "api-key-header" }, { K: "k", R: "res" });
  assert.deepEqual(azure.headers, { "api-key": "k" });
});

test("a Google service account key is traded for an access token with a signed JWT", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const serviceAccount = JSON.stringify({
    client_email: "probe@example-project.iam.gserviceaccount.com",
    project_id: "example-project",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  });
  const tokenEndpoint = async (url, init) => {
    assert.equal(url, "https://oauth2.googleapis.com/token");
    const [header, claims, signature] = init.body.get("assertion").split(".");
    assert.ok(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, signature, "base64url"));
    assert.equal(JSON.parse(Buffer.from(claims, "base64url")).iss, "probe@example-project.iam.gserviceaccount.com");
    return Response.json({ access_token: "ya29.mock-access-token" });
  };
  assert.deepEqual(await googleAccessToken(serviceAccount, tokenEndpoint), { accessToken: "ya29.mock-access-token", projectId: "example-project" });

  const vertex = (await readJson(path.join(repoRoot, "scripts/probe/endpoints.json")))["google-vertex-ai"];
  const access = await resolveAccess(vertex, { GOOGLE_VERTEX_AI_API_KEY: serviceAccount }, tokenEndpoint);
  assert.equal(access.url, "https://aiplatform.googleapis.com/v1/projects/example-project/locations/global/endpoints/openapi/chat/completions");
  assert.deepEqual(access.headers, { Authorization: "Bearer ya29.mock-access-token" });
});

test("endpoints.json covers every provider in models.json with the fixed secret name", async () => {
  const endpoints = await readJson(path.join(repoRoot, "scripts/probe/endpoints.json"));
  const { providers } = await readJson(path.join(repoRoot, "data/providers.json"));
  assert.deepEqual(Object.keys(endpoints).sort(), providers.map((provider) => provider.id).sort());
  for (const [provider, endpoint] of Object.entries(endpoints)) {
    assert.equal(endpoint.key_env, `${provider.toUpperCase().replaceAll("-", "_")}_API_KEY`);
    assert.equal(new URL(endpoint.url.replace(/\{\w+\}/g, "x")).protocol, "https:");
  }
});

const probeModels = [
  { id: "gpt-oss-120b", providers: { keyed: "usage-in-final-chunk", unkeyed: "no-usage", broken: "bad-key" } },
  { id: "glm-5.3", providers: { keyed: "reasoning-first" } },
];
const mockEndpoints = () => ({
  keyed: { url: mockUrl, key_env: "KEYED_API_KEY" },
  unkeyed: { url: mockUrl, key_env: "UNKEYED_API_KEY" },
  broken: { url: mockUrl, key_env: "BROKEN_API_KEY" },
});
const tempDir = () => mkdtemp(path.join(os.tmpdir(), "probe-test-"));

test("with no keys nothing is requested and nothing is written", async () => {
  const dir = await tempDir();
  mock.requests.length = 0;
  const written = await probeAll({ endpoints: mockEndpoints(), probeModels, env: {}, region: "test", dir });
  assert.deepEqual(written, []);
  assert.equal(mock.requests.length, 0);
  assert.deepEqual(await readdir(dir), []);
});

test("a run probes each keyed provider and model once and appends raw lines", async () => {
  const dir = await tempDir();
  mock.requests.length = 0;
  const env = { KEYED_API_KEY: MOCK_KEY, BROKEN_API_KEY: MOCK_KEY };
  const written = await probeAll({ endpoints: mockEndpoints(), probeModels, env, region: "test", dir });
  assert.equal(mock.requests.length, 3);
  assert.deepEqual(written.map((run) => `${run.provider} ${run.model} ${run.status}`).sort(), ["broken gpt-oss-120b error", "keyed glm-5.3 ok", "keyed gpt-oss-120b ok"]);

  const day = written[0].ts.slice(0, 10);
  assert.deepEqual((await readdir(path.join(dir, "runs", day))).sort(), ["broken.jsonl", "keyed.jsonl"]);
  const keyedFile = await readFile(path.join(dir, "runs", day, "keyed.jsonl"), "utf8");
  assert.equal(keyedFile.includes(MOCK_KEY), false);
  assert.deepEqual(keyedFile.trim().split("\n").map((line) => JSON.parse(line)), written.filter((run) => run.provider === "keyed"));

  await probeAll({ endpoints: mockEndpoints(), probeModels, env, region: "test", dir });
  assert.equal((await readRuns(dir, day)).length, 6);
});

function run(minute, status, extra = {}) {
  const ts = `2026-11-18T12:${String(minute).padStart(2, "0")}:00Z`;
  const region = extra.region ?? "iad";
  return { id: `${ts}-example-gpt-oss-120b-${region}`, ts, provider: "example", model: "gpt-oss-120b", region, status, ttft_ms: status === "ok" ? 200 : null, tps: status === "ok" ? 80 : null, ...extra };
}

test("percentile is nearest rank", () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5], 95), 5);
  assert.equal(percentile([4, 1, 3, 2], 50), 2);
  assert.equal(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95), 95);
});

test("summary counts scheduled runs in the window and takes percentiles over ok runs", () => {
  const now = new Date("2026-11-18T13:00:00Z");
  const runs = [
    { ...run(0, "ok"), ts: "2026-11-10T12:00:00Z" },
    run(0, "ok", { ttft_ms: 100, tps: 50 }),
    run(15, "error"),
    run(16, "error", { region: "fra", confirms: run(15, "error").id }),
    run(30, "ok", { ttft_ms: 300, tps: null }),
    run(45, "timeout"),
  ];
  assert.deepEqual(summarize(runs, now), {
    generated: "2026-11-18T13:00:00Z",
    window_days: 7,
    rows: [
      {
        provider: "example",
        model: "gpt-oss-120b",
        runs: 4,
        ok: 2,
        uptime: 0.5,
        ttft_ms_p50: 100,
        ttft_ms_p95: 300,
        tps_p50: 50,
        first_run: "2026-11-18T12:00:00Z",
        last_run: "2026-11-18T12:45:00Z",
        last_status: "timeout",
      },
    ],
  });
});

test("a pair with no ok runs has zero uptime and no percentiles", () => {
  const [row] = summarize([run(0, "error")], new Date("2026-11-18T13:00:00Z")).rows;
  assert.equal(row.uptime, 0);
  assert.equal(row.ttft_ms_p50, null);
  assert.equal(row.tps_p50, null);
});

test("status keeps the last 96 scheduled runs and never fills a gap", () => {
  const now = new Date("2026-11-18T13:00:00Z");
  const { rows, interval_minutes: intervalMinutes } = statusFile([run(0, "ok"), run(45, "ok")], now);
  assert.equal(intervalMinutes, 15);
  assert.deepEqual(rows[0].runs, [["2026-11-18T12:00:00Z", "ok"], ["2026-11-18T12:45:00Z", "ok"]]);
  assert.deepEqual(rows[0].incidents, []);

  const many = Array.from({ length: 100 }, (_, i) => ({ ...run(0, "ok"), ts: new Date(Date.UTC(2026, 10, 17, 0, i * 15)).toISOString().replace(".000Z", "Z") }));
  const strip = statusFile(many, now).rows[0].runs;
  assert.equal(strip.length, 96);
  assert.equal(strip.at(-1)[0], many.at(-1).ts);
});

test("failures seen from one region are never an incident", () => {
  assert.deepEqual(findIncidents([run(0, "error"), run(15, "timeout"), run(30, "error")]), []);
});

test("a failure confirmed from a second region is an incident that ends at the next ok run", () => {
  const failed = run(15, "timeout");
  const confirmation = run(16, "error", { region: "fra", confirms: failed.id });
  const open = findIncidents([run(0, "ok"), failed, confirmation, run(30, "error")]);
  assert.deepEqual(open, [{ start: failed.ts, end: null, kind: "timeout", run: failed.id, confirmed_by: confirmation.id }]);

  const recovered = findIncidents([failed, confirmation, run(30, "error"), run(45, "ok"), run(50, "error")]);
  assert.deepEqual(recovered, [{ start: failed.ts, end: "2026-11-18T12:45:00Z", kind: "timeout", run: failed.id, confirmed_by: confirmation.id }]);
});

test("a confirm run that succeeds, shares the region, or comes late confirms nothing", () => {
  const failed = run(15, "error");
  assert.deepEqual(findIncidents([failed, run(16, "ok", { region: "fra", confirms: failed.id })]), []);
  assert.deepEqual(findIncidents([failed, { ...run(16, "error", { confirms: failed.id }), id: "same-region" }]), []);
  assert.deepEqual(findIncidents([failed, run(16, "error", { region: "cf-iad", confirms: failed.id })]), []);
  assert.deepEqual(findIncidents([failed, run(40, "error", { region: "fra", confirms: failed.id })]), []);
  assert.deepEqual(findIncidents([failed, run(16, "error", { region: "fra", confirms: "another-run" })]), []);
});

test("only recent failures without a confirm run are sent for confirmation", () => {
  const now = new Date("2026-11-18T12:31:00Z");
  const confirmed = run(25, "error");
  const runs = [run(0, "error"), confirmed, run(26, "error", { region: "fra", confirms: confirmed.id }), run(30, "timeout"), { ...run(30, "ok"), provider: "other" }];
  assert.deepEqual(unconfirmedFailures(runs, now).map((failed) => failed.ts), ["2026-11-18T12:30:00Z"]);
});

test("a failed run is confirmed through the second region and becomes an incident", async () => {
  const dir = await tempDir();
  const endpoints = { broken: { url: mockUrl, key_env: "BROKEN_API_KEY" } };
  const [failed] = await probeAll({ endpoints, probeModels, env: { BROKEN_API_KEY: MOCK_KEY }, region: "iad", dir });
  assert.equal(failed.status, "error");

  const secondRegion = (url, init) =>
    handleConfirm(new Request(url, init), { BROKEN_API_KEY: MOCK_KEY, PROBE_CONFIRM_TOKEN: "confirm-token" }, { endpoints, probeModels, region: "fra" });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const refused = await confirmFailures({ dir, confirmUrl: "https://region2.example/", confirmToken: "wrong", fetchImpl: secondRegion });
  assert.deepEqual(refused, []);
  const [confirmRun] = await confirmFailures({ dir, confirmUrl: "https://region2.example/", confirmToken: "confirm-token", fetchImpl: secondRegion });
  assert.equal(confirmRun.confirms, failed.id);
  assert.equal(confirmRun.region, "fra");
  assert.equal(confirmRun.status, "error");
  assert.deepEqual(await confirmFailures({ dir, confirmUrl: "https://region2.example/", confirmToken: "confirm-token", fetchImpl: secondRegion }), []);

  await rollup(dir);
  const status = await readJson(path.join(dir, "status.json"));
  assert.deepEqual(status.rows[0].runs, [[failed.ts, "error"]]);
  assert.deepEqual(status.rows[0].incidents, [{ start: failed.ts, end: null, kind: "error", run: failed.id, confirmed_by: confirmRun.id }]);
  const summary = await readJson(path.join(dir, "summary.json"));
  assert.equal(summary.rows[0].runs, 1);
});

test("the second region refuses anything but an authorised, known provider and model", async () => {
  const options = { endpoints: { keyed: { url: mockUrl, key_env: "KEYED_API_KEY" } }, probeModels, region: "fra" };
  const env = { PROBE_CONFIRM_TOKEN: "confirm-token" };
  const ask = (body, token = "confirm-token") =>
    handleConfirm(new Request("https://region2.example/", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), env, options);
  assert.equal((await handleConfirm(new Request("https://region2.example/"), env, options)).status, 405);
  assert.equal((await ask({ provider: "keyed", model: "gpt-oss-120b", confirms: "x" }, "wrong")).status, 401);
  assert.equal((await ask({ provider: "constructor", model: "gpt-oss-120b", confirms: "x" })).status, 400);
  assert.equal((await ask({ provider: "keyed", model: "unknown", confirms: "x" })).status, 400);
  assert.equal((await ask({ provider: "keyed", model: "gpt-oss-120b", confirms: "x" })).status, 503);
});
