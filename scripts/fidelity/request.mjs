const REQUEST_TIMEOUT_MS = 90_000;
const LONGEST_RATE_LIMIT_WAIT_MS = 30_000;

// Providers differ in which of these they accept. A request that is rejected
// is retried without them, in this order, and the body that was accepted is
// what gets stored with the response.
const OPTIONAL_PARAMS = [["logprobs", "top_logprobs"], ["seed"], ["reasoning_effort"]];

export function requestBody(apiModel, promptText, settings, modelSettings = {}) {
  return {
    model: apiModel,
    messages: [{ role: "user", content: promptText }],
    stream: false,
    ...settings,
    ...modelSettings,
  };
}

async function post(fetchImpl, access, body) {
  const response = await fetchImpl(access.url, {
    method: "POST",
    headers: { ...access.headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return { status: response.status, retryAfter: response.headers.get("retry-after"), text: await response.text() };
}

function parsedOrText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Sends one prompt and returns the raw exchange. Nothing is interpreted here;
// the caller writes this to disk before anything reads the answer.
// `access` is what resolveAccess in scripts/probe/request.mjs returns.
export async function sendPrompt({ fetchImpl = fetch, sleep = defaultSleep, access, body }) {
  let sentBody = body;
  let droppedParams = 0;
  let hasWaitedForRateLimit = false;
  for (;;) {
    let reply;
    try {
      reply = await post(fetchImpl, access, sentBody);
    } catch (error) {
      return { request: sentBody, http_status: null, response: null, error: redact(String(error.message ?? error), access.secrets) };
    }
    if (reply.status === 429 && !hasWaitedForRateLimit) {
      hasWaitedForRateLimit = true;
      const seconds = Number(reply.retryAfter);
      await sleep(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5000, LONGEST_RATE_LIMIT_WAIT_MS));
      continue;
    }
    const isRejectedRequest = reply.status === 400 || reply.status === 422;
    if (isRejectedRequest && droppedParams < OPTIONAL_PARAMS.length) {
      sentBody = { ...sentBody };
      for (const param of OPTIONAL_PARAMS[droppedParams]) delete sentBody[param];
      droppedParams += 1;
      continue;
    }
    const stored = parsedOrText(redact(reply.text, access.secrets));
    return {
      request: sentBody,
      http_status: reply.status,
      response: stored,
      error: reply.status === 200 ? null : `HTTP ${reply.status}`,
    };
  }
}

function redact(text, secrets) {
  let clean = text;
  for (const secret of secrets) {
    if (secret) clean = clean.replaceAll(secret, "[redacted]");
  }
  return clean;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function replyFromStored(line) {
  if (line.error) return { error: line.error };
  const choice = line.response?.choices?.[0];
  if (!choice?.message) return { error: "no choices in response" };
  const { message } = choice;
  const tokenEntries = choice.logprobs?.content;
  return {
    content: typeof message.content === "string" ? message.content : "",
    reasoning: message.reasoning_content ?? message.reasoning ?? null,
    tokens: Array.isArray(tokenEntries) && tokenEntries.length > 0
      ? tokenEntries.map((entry) => ({ token: entry.token, logprob: entry.logprob }))
      : null,
  };
}
