import cors from "cors";
import express from "express";
import { registerAdminCatalogRoutes } from "./adminCatalogRoutes.js";
import { registerAdminCommerceRoutes } from "./adminCommerceRoutes.js";
import { registerAdminUserRoutes } from "./adminUserRoutes.js";
import { registerCheckoutHandoffRoutes } from "./checkoutHandoffRoutes.js";
import { config, requireCoreConfig } from "./config.js";
import { registerDeliveryRoutes } from "./deliveryRoutes.js";
import { registerTicketFinanceRoutes } from "./ticketFinanceRoutes.js";
import { registerTicketReadRoutes } from "./ticketReadRoutes.js";

export function createCanonicalApp() {
  const app = express();

  // CORS remains compatibility-permissive during source reconciliation. Restrict
  // it only after browser-origin inventory so native delivery/Admin callers are
  // not accidentally broken by this source-of-truth cleanup.
  app.use(cors());
  app.use(
    express.json({
      limit: "128kb",
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString("utf8");
      },
    }),
  );

  app.get("/", (_req, res) => {
    res.json({
      status: "ok",
      service: "eya-backend",
      architecture: "canonical-v2",
      hosting_target: "vercel",
      payments: "vac-payments-cloudflare",
      health: "/health",
    });
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "eya-backend",
      architecture: "canonical-v2",
      hosting_target: "vercel",
      payments: "vac-payments-cloudflare",
    });
  });

  // EYA application authority. Provider-facing payment creation, PayChangu
  // verification, webhooks and browser return handling intentionally do NOT live
  // in this Vercel app. Those belong to VAC Payments on Cloudflare.
  registerTicketReadRoutes(app);
  registerTicketFinanceRoutes(app);
  registerCheckoutHandoffRoutes(app);
  registerDeliveryRoutes(app);
  registerAdminCommerceRoutes(app);
  registerAdminCatalogRoutes(app);
  registerAdminUserRoutes(app);

  // Defense in depth: even if this inner app is exposed without any outer
  // gateway, suspended/retired authorities remain terminal.
  app.all(["/api/wallet", "/api/wallet/*splat", "/api/checkout/wallet"], (_req, res) => {
    res.status(410).json({
      status: "error",
      error: "Wallet services are suspended.",
      message: "Wallet services are suspended.",
    });
  });

  app.post("/api/admin/tickets/check-in", (_req, res) => {
    res.status(410).json({
      status: "error",
      error: "Legacy ticket-code check-in is disabled. Use a live ticket credential.",
      message: "Legacy ticket-code check-in is disabled. Use a live ticket credential.",
    });
  });

  // Terminal guards for the old Node/Render payment surface. Existing clients
  // remain on the legacy host until their payment caller is moved to the trusted
  // EYA -> VAC Payments Cloudflare flow; Vercel must never become PayChangu
  // authority merely because these historical paths once existed.
  app.all(["/api/paychangu", "/api/paychangu/*splat", "/pay/success", "/pay/cancel"], (_req, res) => {
    res.status(410).json({
      status: "error",
      error: "Provider payment routes are retired from the EYA backend.",
      message: "Payments are handled by VAC Payments on Cloudflare.",
    });
  });

  return app;
}

export function startCanonicalServer() {
  requireCoreConfig();
  const app = createCanonicalApp();
  return app.listen(config.port, "127.0.0.1", () => {
    console.log(`Canonical EYA backend listening on loopback port ${config.port}`);
  });
}
