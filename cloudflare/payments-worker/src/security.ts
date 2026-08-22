export type AppAuth = {
  appId: string;
  timestamp: number;
  nonce: string;
};

const MAX_CLOCK_SKEW_SECONDS = 300;
const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function readAppSecrets(raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    throw new Error("APP_SECRETS_JSON is not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("APP_SECRETS_JSON must be a JSON object.");
  }

  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([appId, secret]) => appId.trim().length > 0 && typeof secret === "string" && secret.length >= 32,
    ),
  );
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
}

export function buildCanonicalRequest(request: Request, timestamp: number, nonce: string, rawBody: string): string {
  const url = new URL(request.url);
  return [String(timestamp), nonce, request.method.toUpperCase(), url.pathname, rawBody].join(".");
}

export async function authenticateAppRequest(
  request: Request,
  rawBody: string,
  appSecretsJson: string,
  db: D1Database,
): Promise<AppAuth> {
  const appId = (request.headers.get("x-vac-app-id") || "").trim();
  const timestampRaw = (request.headers.get("x-vac-timestamp") || "").trim();
  const nonce = (request.headers.get("x-vac-nonce") || "").trim().toLowerCase();
  const suppliedSignature = (request.headers.get("x-vac-signature") || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, "");

  if (!appId || !timestampRaw || !nonce || !suppliedSignature) {
    throw new Error("Missing signed application headers.");
  }

  const timestamp = Number(timestampRaw);
  if (!Number.isInteger(timestamp)) {
    throw new Error("Invalid request timestamp.");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    throw new Error("Signed request has expired.");
  }

  if (!/^[0-9a-f-]{36}$/.test(nonce)) {
    throw new Error("Invalid request nonce format.");
  }

  if (!/^[0-9a-f]{64}$/.test(suppliedSignature)) {
    throw new Error("Invalid request signature format.");
  }

  const secrets = readAppSecrets(appSecretsJson);
  const secret = secrets[appId];
  if (!secret) {
    throw new Error("Unknown or inactive application.");
  }

  const canonical = buildCanonicalRequest(request, timestamp, nonce, rawBody);
  const expectedSignature = await hmacSha256Hex(secret, canonical);
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) {
    throw new Error("Invalid application signature.");
  }

  const expiresAt = new Date((nowSeconds + MAX_CLOCK_SKEW_SECONDS) * 1000).toISOString();
  try {
    await db.batch([
      db.prepare("delete from request_nonces where expires_at <= ?").bind(new Date(nowSeconds * 1000).toISOString()),
      db.prepare("insert into request_nonces (app_id, nonce, expires_at) values (?, ?, ?)").bind(appId, nonce, expiresAt),
    ]);
  } catch (error) {
    if (/unique|constraint/i.test(error instanceof Error ? error.message : String(error))) {
      throw new Error("Signed request nonce has already been used.");
    }
    throw error;
  }

  return { appId, timestamp, nonce };
}

export async function signApplicationEvent(
  appId: string,
  timestamp: number,
  path: string,
  rawBody: string,
  appSecretsJson: string,
): Promise<string> {
  const secrets = readAppSecrets(appSecretsJson);
  const secret = secrets[appId];
  if (!secret) throw new Error(`No callback secret configured for ${appId}.`);
  return hmacSha256Hex(secret, [String(timestamp), "POST", path, rawBody].join("."));
}
