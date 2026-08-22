import test from "node:test";
import assert from "node:assert/strict";
import {
  OMITTED_CANONICAL_ROUTES,
  REQUIRED_CANONICAL_ROUTES,
  TERMINAL_GUARD_ROUTES,
  routeKey,
} from "../src/routeSurface.js";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
process.env.PAYCHANGU_SECRET_KEY ||= "sec-test-placeholder";
process.env.PAYCHANGU_WEBHOOK_SECRET ||= "test-webhook-secret";
process.env.PUBLIC_BASE_URL ||= "http://localhost:4000";
process.env.SUPABASE_NEW_APP_SCHEMA ||= "public";

const { createCanonicalApp } = await import("../src/server-v2.js");

function pathsForRoute(routePath) {
  return Array.isArray(routePath) ? routePath.flatMap(pathsForRoute) : [String(routePath)];
}

function inspectRegisteredRoutes(app) {
  const stack = app.router?.stack || app._router?.stack || [];
  assert.ok(stack.length > 0, "Express router stack should be available for route inspection.");

  const keys = new Set();
  const paths = new Set();
  for (const layer of stack) {
    if (!layer?.route) continue;
    const routePaths = pathsForRoute(layer.route.path);
    const methods = Object.entries(layer.route.methods || {})
      .filter(([, enabled]) => Boolean(enabled))
      .map(([method]) => method.toUpperCase());
    for (const path of routePaths) {
      paths.add(path);
      for (const method of methods) keys.add(routeKey(method, path));
    }
  }
  return { keys, paths };
}

test("canonical-v2 registers every required caller route", () => {
  const app = createCanonicalApp();
  const { keys } = inspectRegisteredRoutes(app);
  for (const [method, path] of REQUIRED_CANONICAL_ROUTES) {
    assert.ok(keys.has(routeKey(method, path)), `missing canonical route: ${method} ${path}`);
  }
});

test("competing Node ticket-payment authorities are omitted", () => {
  const app = createCanonicalApp();
  const { keys } = inspectRegisteredRoutes(app);
  for (const [method, path] of OMITTED_CANONICAL_ROUTES) {
    assert.equal(keys.has(routeKey(method, path)), false, `forbidden authority registered: ${method} ${path}`);
  }
});

test("Wallet and legacy static ticket admission have terminal guards", () => {
  const app = createCanonicalApp();
  const { keys, paths } = inspectRegisteredRoutes(app);
  for (const [method, path] of TERMINAL_GUARD_ROUTES) {
    if (method === "ALL") {
      assert.ok(paths.has(path), `missing terminal guard path: ${path}`);
    } else {
      assert.ok(keys.has(routeKey(method, path)), `missing terminal guard: ${method} ${path}`);
    }
  }
});
