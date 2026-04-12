import dotenv from "dotenv";

dotenv.config();

function normalizeBaseUrl(value) {
  return (value || "").trim().replace(/\/+$/, "");
}

export const config = {
  port: Number(process.env.PORT || 4000),
  paychanguSecretKey: (process.env.PAYCHANGU_SECRET_KEY || "").trim(),
  paychanguWebhookSecret: (process.env.PAYCHANGU_WEBHOOK_SECRET || "").trim(),
  expoPushAccessToken: (process.env.EXPO_PUSH_ACCESS_TOKEN || "").trim(),
  publicBaseUrl: normalizeBaseUrl(process.env.PUBLIC_BASE_URL || "http://localhost:4000"),
  supabaseUrl: (process.env.SUPABASE_URL || "").trim(),
  supabaseServiceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  supabaseNewAppSchema: (process.env.SUPABASE_NEW_APP_SCHEMA || "public").trim(),
  checkoutSuccessUrl: (process.env.CHECKOUT_SUCCESS_URL || "").trim(),
  checkoutCancelUrl: (process.env.CHECKOUT_CANCEL_URL || "").trim(),
  appScheme: (process.env.APP_SCHEME || "").trim(),
};

export function requireCoreConfig() {
  const missing = [];
  if (!config.paychanguSecretKey) missing.push("PAYCHANGU_SECRET_KEY");
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
