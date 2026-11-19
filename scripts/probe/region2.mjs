import { probeOnce, resolveAccess, sanitizeError } from "./request.mjs";

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// The second region's side of a confirmation: probe one provider and model
// once and hand the run row back. It writes nothing; the caller appends the
// row to the runs file.
export async function handleConfirm(request, env, { endpoints, probeModels, region, fetchImpl = fetch, timeoutMs }) {
  if (request.method !== "POST") return json(405, { error: "POST only" });
  if (!env.PROBE_CONFIRM_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.PROBE_CONFIRM_TOKEN}`) {
    return json(401, { error: "unauthorized" });
  }

  let asked;
  try {
    asked = await request.json();
  } catch {
    return json(400, { error: "body is not JSON" });
  }
  const endpoint = Object.hasOwn(endpoints, asked.provider) ? endpoints[asked.provider] : null;
  const model = probeModels.find((probeModel) => probeModel.id === asked.model);
  const apiModel = model?.providers[asked.provider];
  if (!endpoint || !apiModel || typeof asked.confirms !== "string") {
    return json(400, { error: "expected provider, model and confirms" });
  }

  let access;
  try {
    access = await resolveAccess(endpoint, env, fetchImpl);
  } catch (error) {
    return json(503, { error: sanitizeError(error.message, [env[endpoint.key_env]]) });
  }
  if (!access) return json(503, { error: `${endpoint.key_env} is not set in this region` });

  const run = await probeOnce({ provider: asked.provider, model: model.id, apiModel, endpoint, access, region, fetchImpl, timeoutMs });
  return json(200, { ...run, confirms: asked.confirms });
}
