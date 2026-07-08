import dotenv from "dotenv";

dotenv.config();

function normalizeBaseUrl(value) {
  return (value || "").trim().replace(/\/+$/, "");
}

function env(name) {
  return (process.env[name] || "").trim();
}

export const config = {
  port: Number(process.env.PORT || 4000),
  paychanguSecretKey: env("PAYCHANGU_SECRET_KEY"),
  paychanguPublicKey: env("PAYCHANGU_PUBLIC_KEY"),
  paychanguWebhookSecret: env("PAYCHANGU_WEBHOOK_SECRET"),
  expoPushAccessToken: env("EXPO_PUSH_ACCESS_TOKEN"),
  publicBaseUrl: normalizeBaseUrl(process.env.PUBLIC_BASE_URL || "http://localhost:4000"),
  supabaseUrl: env("SUPABASE_URL"),
  supabaseServiceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseNewAppSchema: env("SUPABASE_NEW_APP_SCHEMA") || "public",
  adminEmails: env("ADMIN_EMAILS"),
  checkoutSuccessUrl: env("PAYCHANGU_CALLBACK_URL") || env("CHECKOUT_SUCCESS_URL"),
  checkoutCancelUrl: env("PAYCHANGU_RETURN_URL") || env("CHECKOUT_CANCEL_URL"),
  appScheme: env("APP_SCHEME"),
};

export function getConfiguredAdminEmails() {
  return config.adminEmails
    .split(",")
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

export function isConfiguredAdminEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  const allowed = getConfiguredAdminEmails();
  if (!allowed.length) return true;
  return allowed.includes(normalized);
}

export function requireCoreConfig() {
  const missing = [];
  if (!config.publicBaseUrl) missing.push("PUBLIC_BASE_URL");
  if (!config.supabaseUrl) missing.push("SUPABASE_URL");
  if (!config.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export function getSuccessUrl() {
  return config.checkoutSuccessUrl || `${config.publicBaseUrl}/pay/success`;
}

export function getCancelUrl() {
  return config.checkoutCancelUrl || `${config.publicBaseUrl}/pay/cancel`;
}
