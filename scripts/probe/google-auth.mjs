const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function encodeJson(value) {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

// Trades a service account key (the JSON file Google Cloud hands out) for a
// short-lived access token, the only credential the Vertex endpoint accepts.
export async function googleAccessToken(serviceAccountJson, fetchImpl = fetch) {
  const { client_email: clientEmail, private_key: privateKeyPem, project_id: projectId } = JSON.parse(serviceAccountJson);
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson({
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 600,
  })}`;

  const pkcs8 = Uint8Array.from(atob(privateKeyPem.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
  const signingKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signingKey, new TextEncoder().encode(unsigned));

  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google token exchange returned ${response.status}`);
  const { access_token: accessToken } = await response.json();
  return { accessToken, projectId };
}
