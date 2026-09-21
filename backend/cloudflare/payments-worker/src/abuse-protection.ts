import type { PaymentsEnv } from "./ledger";

const encoder = new TextEncoder();

export async function readBoundedBody(request: Request, maxBytes = 65_536): Promise<string> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("Request body is too large.");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error("Request body is too large.");
  return new TextDecoder().decode(bytes);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function enforceRateLimit(
  request: Request,
  env: PaymentsEnv,
  route: string,
  limit: number,
  windowSeconds = 60,
): Promise<void> {
  const client = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const subjectHash = await sha256Hex(client);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = nowSeconds - (nowSeconds % windowSeconds);
  const expiresBefore = windowStart - windowSeconds * 2;

  const result = await env.PAYMENTS_DB.prepare(
    `insert into request_rate_limits (route, subject_hash, window_start, request_count)
     values (?, ?, ?, 1)
     on conflict(route, subject_hash, window_start)
     do update set request_count = request_count + 1
     returning request_count`,
  ).bind(route, subjectHash, windowStart).first<{ request_count: number }>();

  if (Math.random() < 0.02) {
    await env.PAYMENTS_DB.prepare("delete from request_rate_limits where window_start < ?").bind(expiresBefore).run();
  }
  if (Number(result?.request_count || 0) > limit) throw new Error("Rate limit exceeded.");
}
