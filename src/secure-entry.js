import http from "node:http";

const externalPort = Number(process.env.PORT || 4000);
const internalPort = Number(
  process.env.EYA_INTERNAL_PORT || (externalPort === 4000 ? 4001 : 4000),
);
const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const AUTH_TIMEOUT_MS = 8000;
const MAX_JSON_BODY_BYTES = 128 * 1024;

if (!Number.isFinite(externalPort) || externalPort <= 0 || externalPort > 65535) {
  throw new Error("Invalid external PORT.");
}
if (!Number.isFinite(internalPort) || internalPort <= 0 || internalPort > 65535 || internalPort === externalPort) {
  throw new Error("Invalid EYA internal backend port.");
}
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required by the security gateway.");
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sendJson(res, status, message) {
  const body = JSON.stringify({ status: "error", message });
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

function pathnameOf(req) {
  return new URL(req.url || "/", "http://eya.internal").pathname;
}

function isPaymentVerifyPath(pathname) {
  return pathname.startsWith("/api/paychangu/verify/");
}

function isPrivilegedPath(pathname) {
  return (
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/deliveries/") ||
    pathname === "/api/paychangu/initiate" ||
    pathname === "/api/paychangu/reconcile" ||
    isPaymentVerifyPath(pathname) ||
    pathname === "/api/checkout/cash"
  );
}

function isSuspendedWalletPath(pathname) {
  return pathname === "/api/wallet" || pathname.startsWith("/api/wallet/") || pathname === "/api/checkout/wallet";
}

function bearerToken(req) {
  const value = String(req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function verifySupabaseUser(req) {
  const token = bearerToken(req);
  if (!token) throw httpError(401, "Authentication required.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw httpError(401, "Invalid or expired session.");
    const user = await response.json().catch(() => null);
    const userId = typeof user?.id === "string" ? user.id.trim() : "";
    if (!userId) throw httpError(401, "Invalid or expired session.");
    return {
      id: userId,
      email: typeof user?.email === "string" && user.email.trim() ? user.email.trim().toLowerCase() : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizedProxyHeaders(req, verifiedUserId, privileged, bodyText = null) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["x-user-id"];
  delete headers["x-actor-user-id"];
  delete headers["x-admin-user-id"];

  if (bodyText != null) {
    delete headers["transfer-encoding"];
    headers["content-length"] = String(Buffer.byteLength(bodyText));
    headers["content-type"] = "application/json";
  }

  if (privileged && verifiedUserId) {
    headers["x-user-id"] = verifiedUserId;
    headers["x-actor-user-id"] = verifiedUserId;
    if (pathnameOf(req).startsWith("/api/admin/")) {
      headers["x-admin-user-id"] = verifiedUserId;
    }
  }

  return headers;
}

function proxyRequest(req, res, verifiedUserId, privileged) {
  const proxy = http.request(
    {
      hostname: "127.0.0.1",
      port: internalPort,
      path: req.url,
      method: req.method,
      headers: sanitizedProxyHeaders(req, verifiedUserId, privileged),
    },
    (innerRes) => {
      res.writeHead(innerRes.statusCode || 502, innerRes.headers);
      innerRes.pipe(res);
    },
  );

  proxy.on("error", () => {
    if (!res.headersSent) sendJson(res, 502, "Backend temporarily unavailable.");
    else res.destroy();
  });

  req.pipe(proxy);
}

function proxyBufferedJsonRequest(req, res, verifiedUserId, privileged, bodyText) {
  const proxy = http.request(
    {
      hostname: "127.0.0.1",
      port: internalPort,
      path: req.url,
      method: req.method,
      headers: sanitizedProxyHeaders(req, verifiedUserId, privileged, bodyText),
    },
    (innerRes) => {
      res.writeHead(innerRes.statusCode || 502, innerRes.headers);
      innerRes.pipe(res);
    },
  );

  proxy.on("error", () => {
    if (!res.headersSent) sendJson(res, 502, "Backend temporarily unavailable.");
    else res.destroy();
  });
  proxy.end(bodyText);
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_JSON_BODY_BYTES) throw httpError(413, "Request body is too large.");
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return { raw: "{}", value: {} };
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw httpError(400, "Request body must contain valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "Request body must be a JSON object.");
  }
  return { raw, value };
}

async function serviceFetch(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    return await fetch(`${supabaseUrl}${path}`, {
      ...options,
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        accept: "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function callServiceRpc(name, payload) {
  const response = await serviceFetch(`/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof data?.message === "string" && data.message.trim()
      ? data.message.trim()
      : "Server checkout validation failed.";
    throw httpError(400, message);
  }
  return data;
}

async function serviceSelectRows(table, query) {
  const response = await serviceFetch(`/rest/v1/${encodeURIComponent(table)}?${query}`, { method: "GET" });
  const data = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(data)) {
    throw httpError(502, "Could not validate server-side ownership.");
  }
  return data;
}

async function isAdminUser(userId) {
  const rows = await serviceSelectRows(
    "profiles",
    `select=id,role&id=eq.${encodeURIComponent(userId)}&limit=1`,
  );
  return rows[0]?.id === userId && rows[0]?.role === "admin";
}

function paymentReferenceFromVerifyPath(pathname) {
  const prefix = "/api/paychangu/verify/";
  if (!pathname.startsWith(prefix)) return "";
  try {
    return decodeURIComponent(pathname.slice(prefix.length)).trim();
  } catch {
    throw httpError(400, "Transaction reference is invalid.");
  }
}

async function assertPaymentOwnerForVerification(pathname, verifiedUser) {
  const reference = paymentReferenceFromVerifyPath(pathname);
  if (!reference || reference.length > 300) throw httpError(400, "Transaction reference is invalid.");

  const rows = await serviceSelectRows(
    "payments",
    `select=id,user_id,customer_email,reference&reference=eq.${encodeURIComponent(reference)}&limit=1`,
  );
  const payment = rows[0];
  if (!payment) throw httpError(404, "Payment not found.");

  const ownsByUserId = typeof payment.user_id === "string" && payment.user_id === verifiedUser.id;
  const ownsByEmail = !payment.user_id
    && verifiedUser.email
    && typeof payment.customer_email === "string"
    && payment.customer_email.trim().toLowerCase() === verifiedUser.email;

  if (!ownsByUserId && !ownsByEmail && !(await isAdminUser(verifiedUser.id))) {
    throw httpError(403, "Not allowed to verify this payment.");
  }
}

async function securePayChanguInitiation(req, verifiedUser) {
  const { value } = await readJsonBody(req);
  const meta = value.meta && typeof value.meta === "object" && !Array.isArray(value.meta) ? { ...value.meta } : {};
  const purpose = typeof meta.purpose === "string" ? meta.purpose.trim() : "";

  if (purpose === "wallet_topup" || meta.payment_source === "wallet") {
    throw httpError(410, "Wallet payments are suspended.");
  }

  if (typeof meta.user_id === "string" && meta.user_id.trim() && meta.user_id.trim() !== verifiedUser.id) {
    throw httpError(403, "Payment identity does not match the authenticated account.");
  }

  meta.user_id = verifiedUser.id;
  if (verifiedUser.email) value.email = verifiedUser.email;

  if (purpose === "campus_market_order") {
    if (!meta.order || typeof meta.order !== "object" || Array.isArray(meta.order)) {
      throw httpError(400, "Commerce checkout is missing order details.");
    }
    const quote = await callServiceRpc("quote_campus_market_checkout", { p_order: meta.order });
    const totalMwk = Number(quote?.total_mwk);
    if (!Number.isSafeInteger(totalMwk) || totalMwk <= 0) {
      throw httpError(409, "Server checkout total is invalid.");
    }
    value.amount = totalMwk;
    value.currency = "MWK";
    meta.order = quote.order;
    meta.server_quote = {
      subtotal_mwk: Number(quote.subtotal_mwk || 0),
      delivery_fee_mwk: Number(quote.delivery_fee_mwk || 0),
      service_fee_mwk: Number(quote.service_fee_mwk || 0),
      total_mwk: totalMwk,
      quoted_at: new Date().toISOString(),
    };
  }

  value.meta = meta;
  return JSON.stringify(value);
}

async function secureReconcileBody(req) {
  const { value } = await readJsonBody(req);
  const purpose = typeof value.purpose === "string" ? value.purpose.trim() : "";
  if (purpose === "wallet_topup") {
    throw httpError(410, "Wallet payments are suspended.");
  }
  return JSON.stringify(value);
}

// The legacy application reads PORT at module import time. Run it on a loopback-only
// internal port from the platform's perspective, while this gateway owns Render's
// externally routed PORT and sanitizes all actor identity headers.
process.env.PORT = String(internalPort);
await import("./server.js");
process.env.PORT = String(externalPort);

const gateway = http.createServer(async (req, res) => {
  try {
    const pathname = pathnameOf(req);

    if (isSuspendedWalletPath(pathname)) {
      sendJson(res, 410, "Wallet is currently suspended.");
      return;
    }

    const privileged = isPrivilegedPath(pathname);

    // Let the inner CORS middleware answer preflight without treating OPTIONS as
    // an authenticated business action.
    if (req.method === "OPTIONS") {
      proxyRequest(req, res, null, false);
      return;
    }

    if (!privileged) {
      proxyRequest(req, res, null, false);
      return;
    }

    const verifiedUser = await verifySupabaseUser(req);

    if (pathname === "/api/paychangu/initiate" && req.method === "POST") {
      const bodyText = await securePayChanguInitiation(req, verifiedUser);
      proxyBufferedJsonRequest(req, res, verifiedUser.id, true, bodyText);
      return;
    }

    if (pathname === "/api/paychangu/reconcile" && req.method === "POST") {
      const bodyText = await secureReconcileBody(req);
      proxyBufferedJsonRequest(req, res, verifiedUser.id, true, bodyText);
      return;
    }

    if (isPaymentVerifyPath(pathname) && req.method === "GET") {
      await assertPaymentOwnerForVerification(pathname, verifiedUser);
      proxyRequest(req, res, verifiedUser.id, true);
      return;
    }

    proxyRequest(req, res, verifiedUser.id, true);
  } catch (error) {
    const statusCode = Number(error?.statusCode);
    const status = Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
    const rawMessage = error instanceof Error ? error.message : "Request failed.";
    const safeMessage = status === 401 && rawMessage !== "Authentication required."
      ? "Invalid or expired session."
      : status >= 500
        ? "Backend security validation temporarily unavailable."
        : rawMessage;
    sendJson(res, status, safeMessage);
  }
});

gateway.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

gateway.listen(externalPort, "0.0.0.0", () => {
  console.log(`EYA security gateway listening on port ${externalPort}; legacy backend isolated on ${internalPort}.`);
});
