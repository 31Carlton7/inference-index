import { googleAccessToken } from "./google-auth.mjs";

export const METHOD_VERSION = 1;
export const PROMPT = "Explain in about 100 words how a sailboat can sail against the wind.";
export const MAX_TOKENS = 128;
export const TIMEOUT_MS = 30_000;

const MAX_ERROR_LENGTH = 200;

// Error text is committed to a public branch, so it is scrubbed twice: the
// exact credential values this run used, then anything shaped like a header
// or token in case a provider echoes one back in a different form.
export function sanitizeError(text, secrets = []) {
  let clean = String(text);
  for (const secret of secrets) {
    if (secret) clean = clean.replaceAll(secret, "[redacted]");
  }
  return clean
    .replace(/(authorization|api-key|x-api-key)["']?\s*[:=]\s*["']?[^"',}\n]*/gi, "$1: [redacted]")
    .replace(/bearer\s+[^\s"',}]+/gi, "Bearer [redacted]")
    .replace(/\b(sk|pk|gsk|csk|fw|hf|nvapi)[-_][A-Za-z0-9_\-.]{12,}/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_\-]{8,}(\.[A-Za-z0-9_\-]+)*/g, "[redacted]")
    .replace(/[A-Za-z0-9_\-+=]{32,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ERROR_LENGTH);
}

// Returns null when the provider's key is not set, which is how a provider
// without a key is skipped. Throws when the key is there but something it
// needs beside it is not.
export async function resolveAccess(endpoint, env, fetchImpl = fetch) {
  const key = env[endpoint.key_env];
  if (!key) return null;

  const urlValues = {};
  const secrets = [key];
  let token = key;
  if (endpoint.auth === "google-service-account") {
    const { accessToken, projectId } = await googleAccessToken(key, fetchImpl);
    token = accessToken;
    urlValues.project_id = projectId;
    secrets.push(accessToken, ...Object.values(JSON.parse(key)).filter((value) => typeof value === "string" && value.length >= 20));
  }

  const url = endpoint.url.replace(/\{(\w+)\}/g, (_, name) => {
    const value = urlValues[name] ?? env[name];
    if (!value) throw new Error(`${name} is not set`);
    secrets.push(value);
    return value;
  });

  const headers = endpoint.auth === "api-key-header" ? { "api-key": token } : { Authorization: `Bearer ${token}` };
  return { url, headers, secrets };
}

function requestBody(apiModel, endpoint) {
  const body = {
    model: apiModel,
    messages: [{ role: "user", content: PROMPT }],
    max_tokens: MAX_TOKENS,
    temperature: 0,
    stream: true,
  };
  if (endpoint.include_usage !== false) body.stream_options = { include_usage: true };
  return body;
}

function reportedOutputTokens(chunk) {
  const usage = chunk.usage ?? chunk.x_groq?.usage ?? chunk.choices?.[0]?.usage;
  return Number.isInteger(usage?.completion_tokens) ? usage.completion_tokens : null;
}

function textKind(delta) {
  if (typeof delta?.content === "string" && delta.content !== "") return "content";
  const reasoning = delta?.reasoning ?? delta?.reasoning_content;
  if (typeof reasoning === "string" && reasoning !== "") return "reasoning";
  return null;
}

async function readStream(body, sentAt) {
  const stream = { ttftMs: null, ttftKind: null, outputTokens: null, finished: false, streamError: null };
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffered = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const arrivedMs = performance.now() - sentAt;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const event = line.slice(5).trim();
      if (event === "[DONE]") {
        stream.finished = true;
        continue;
      }
      let chunk;
      try {
        chunk = JSON.parse(event);
      } catch {
        continue;
      }
      if (chunk.error) {
        stream.streamError = typeof chunk.error === "string" ? chunk.error : JSON.stringify(chunk.error);
        continue;
      }
      const choice = chunk.choices?.[0];
      const kind = textKind(choice?.delta);
      if (kind && stream.ttftMs === null) {
        stream.ttftMs = arrivedMs;
        stream.ttftKind = kind;
      }
      if (choice?.finish_reason) stream.finished = true;
      stream.outputTokens = reportedOutputTokens(chunk) ?? stream.outputTokens;
    }
  }
  return stream;
}

// One streamed request, no retry. Always resolves to a run row.
export async function probeOnce({ provider, model, apiModel, endpoint, access, region, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const run = {
    id: `${ts}-${provider}-${model}-${region}`,
    ts,
    provider,
    model,
    region,
    status: "error",
    http_status: null,
    ttft_ms: null,
    ttft_kind: null,
    total_ms: null,
    output_tokens: null,
    tokens_source: "none",
    tps: null,
    error: null,
  };

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const sentAt = performance.now();
  let stream = null;
  try {
    const response = await fetchImpl(access.url, {
      method: "POST",
      // A fresh connection per request, so every time to first token includes
      // the same connection setup instead of only the first model's.
      headers: { ...access.headers, "Content-Type": "application/json", Accept: "text/event-stream", Connection: "close" },
      body: JSON.stringify(requestBody(apiModel, endpoint)),
      signal: abort.signal,
    });
    run.http_status = response.status;
    if (!response.ok) {
      run.error = sanitizeError(`HTTP ${response.status}: ${await response.text()}`, access.secrets);
      return run;
    }
    stream = await readStream(response.body, sentAt);
    run.total_ms = Math.round(performance.now() - sentAt);
  } catch (error) {
    if (abort.signal.aborted) {
      run.status = "timeout";
      run.error = `no stream end within ${timeoutMs} ms`;
    } else {
      run.error = sanitizeError(error.cause?.code ?? error.cause?.message ?? error.message, access.secrets);
    }
    return run;
  } finally {
    clearTimeout(timer);
  }

  if (stream.ttftMs !== null) {
    run.ttft_ms = Math.round(stream.ttftMs);
    run.ttft_kind = stream.ttftKind;
  }
  if (stream.outputTokens !== null) {
    run.output_tokens = stream.outputTokens;
    run.tokens_source = "usage";
  }
  if (stream.streamError) {
    run.error = sanitizeError(`error in stream: ${stream.streamError}`, access.secrets);
  } else if (stream.ttftMs === null) {
    run.error = "stream ended with no text";
  } else if (!stream.finished) {
    run.error = "stream ended before the model finished";
  } else {
    run.status = "ok";
    const generatingMs = run.total_ms - run.ttft_ms;
    if (run.output_tokens !== null && generatingMs > 0) {
      run.tps = Number((run.output_tokens / (generatingMs / 1000)).toFixed(1));
    }
  }
  return run;
}
