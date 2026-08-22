import cors from "cors";
import express from "express";
import { URLSearchParams } from "node:url";
import { registerAdminCatalogRoutes } from "./adminCatalogRoutes.js";
import { registerAdminCommerceRoutes } from "./adminCommerceRoutes.js";
import { registerAdminUserRoutes } from "./adminUserRoutes.js";
import { registerCheckoutHandoffRoutes } from "./checkoutHandoffRoutes.js";
import { config, getCancelUrl, getSuccessUrl, requireCoreConfig } from "./config.js";
import { registerDeliveryRoutes } from "./deliveryRoutes.js";
import { registerPayChanguRoutes } from "./paychanguRoutes.js";
import { registerTicketFinanceRoutes } from "./ticketFinanceRoutes.js";
import { registerTicketReadRoutes } from "./ticketReadRoutes.js";

function renderRedirectPage({ title, heading, copy, targetUrl, buttonLabel }) {
  const escapedTarget = targetUrl ? String(targetUrl).replace(/"/g, "&quot;") : "";
  const button = targetUrl ? `<a class="btn" href="${escapedTarget}">${buttonLabel}</a>` : "";
  const autoRedirectScript = targetUrl
    ? `<script>setTimeout(function(){ window.location.href = ${JSON.stringify(targetUrl)}; }, 1200);</script>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f6f7fb; color: #123; margin: 0; }
      .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .card { max-width: 420px; width: 100%; background: #fff; border: 1px solid #e6ebf5; border-radius: 18px; padding: 24px; text-align: center; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0 0 16px; color: #5f6b85; line-height: 1.5; }
      .btn { display: inline-block; background: #0e2756; color: #fff; text-decoration: none; padding: 12px 16px; border-radius: 999px; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>${heading}</h1>
        <p>${copy}</p>
        ${button}
      </div>
    </div>
    ${autoRedirectScript}
  </body>
</html>`;
}

function buildAppLink(pathname, query) {
  if (!config.appScheme) return "";
  const qs = new URLSearchParams(query).toString();
  return `${config.appScheme}://${pathname}${qs ? `?${qs}` : ""}`;
}

export function createCanonicalApp() {
  const app = express();

  // CORS remains compatibility-permissive during source reconciliation. Restrict
  // it only after browser-origin inventory so native payment/delivery callers are
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
    res.json({ status: "ok", service: "eya-backend", health: "/health" });
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "eya-backend",
      architecture: "canonical-v2",
      success_url: getSuccessUrl(),
      cancel_url: getCancelUrl(),
    });
  });

  registerTicketReadRoutes(app);
  registerTicketFinanceRoutes(app);
  registerCheckoutHandoffRoutes(app);
  registerDeliveryRoutes(app);
  registerAdminCommerceRoutes(app);
  registerAdminCatalogRoutes(app);
  registerAdminUserRoutes(app);
  registerPayChanguRoutes(app);

  app.get("/pay/success", (req, res) => {
    const targetUrl = buildAppLink("pay/success", req.query);
    res.type("html").send(
      renderRedirectPage({
        title: "Payment Success",
        heading: "Payment received",
        copy: "You can return to the app while the payment is being verified.",
        targetUrl,
        buttonLabel: "Open app",
      }),
    );
  });

  app.get("/pay/cancel", (req, res) => {
    const targetUrl = buildAppLink("pay/cancel", req.query);
    res.type("html").send(
      renderRedirectPage({
        title: "Payment Cancelled",
        heading: "Payment not completed",
        copy: "The checkout was cancelled or failed. You can return to the app and try again.",
        targetUrl,
        buttonLabel: "Return to app",
      }),
    );
  });

  // Defense in depth: even if this inner app is accidentally exposed without the
  // outer security gateway, suspended/retired authorities remain terminal.
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

  return app;
}

export function startCanonicalServer() {
  requireCoreConfig();
  const app = createCanonicalApp();
  return app.listen(config.port, "127.0.0.1", () => {
    console.log(`Canonical EYA backend listening on loopback port ${config.port}`);
  });
}
