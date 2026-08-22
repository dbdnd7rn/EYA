import http from "node:http";

const externalPort = Number(process.env.PORT || 4000);
const internalPort = Number(
  process.env.EYA_INTERNAL_PORT || (externalPort === 4000 ? 4001 : 4000),
);
const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const AUTH_TIMEOUT_MS = 8000;

if (!Number.isFinite(externalPort) || externalPort <= 0 || externalPort > 65535) {
  throw new Error("Invalid external PORT.");
}
if (!Number.isFinite(internalPort) || internalPort <= 0 || internalPort > 65535 || internalPort === externalPort) {
  throw new Error("Invalid EYA internal backend port.");
}
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required by the security gateway.");
}

function sendJson(res, status, message) {
  const body = JSON.stringify({ status: "error", message });
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function isPrivilegedPath(pathname) {
  return pathname.startsWith("/api/admin/") || pathname.startsWith("/api/deliveries/");
}

function bearerToken(req) {
  const value = String(req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function verifySupabaseUser(req) {
  const token = bearerToken(req);
  if (!token) throw new Error("Authentication required.");

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
    if (!response.ok) throw new Error("Invalid or expired session.");
    const user = await response.json().catch(() => null);
    const userId = typeof user?.id === "string" ? user.id.trim() : "";
    if (!userId) throw new Error("Invalid or expired session.");
    return userId;
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizedProxyHeaders(req, verifiedUserId, privileged) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["x-user-id"];
  delete headers["x-actor-user-id"];
  delete headers["x-admin-user-id"];

  if (privileged && verifiedUserId) {
    headers["x-user-id"] = verifiedUserId;
    headers["x-actor-user-id"] = verifiedUserId;
    if (String(req.url || "").startsWith("/api/admin/")) {
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

// The legacy application reads PORT at module import time. Run it on a loopback-only
// internal port from the platform's perspective, while this gateway owns Render's
// externally routed PORT and sanitizes all actor identity headers.
process.env.PORT = String(internalPort);
await import("./server.js");
process.env.PORT = String(externalPort);

const gateway = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || "/", "http://eya.internal").pathname;
    const privileged = isPrivilegedPath(pathname);

    // Let the inner CORS middleware answer preflight without treating OPTIONS as
    // an authenticated business action.
    if (!privileged || req.method === "OPTIONS") {
      proxyRequest(req, res, null, false);
      return;
    }

    const verifiedUserId = await verifySupabaseUser(req);
    proxyRequest(req, res, verifiedUserId, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed.";
    sendJson(res, 401, message === "Authentication required." ? message : "Invalid or expired session.");
  }
});

gateway.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});

gateway.listen(externalPort, "0.0.0.0", () => {
  console.log(`EYA security gateway listening on port ${externalPort}; legacy backend isolated on ${internalPort}.`);
});
