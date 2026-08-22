import { Platform } from "react-native";

const configuredAuthRedirectUrl = (process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL ?? "").trim();

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function resolveAuthRedirectUrl() {
  if (!configuredAuthRedirectUrl) return "";

  // Web builds may intentionally use an HTTPS or localhost callback.
  if (Platform.OS === "web") return configuredAuthRedirectUrl;

  // Native OAuth must return to the app. Never let a web/localhost URL
  // override Expo Go or the installed EYA custom scheme.
  if (/^eya:\/\//i.test(configuredAuthRedirectUrl)) return configuredAuthRedirectUrl;
  if (/^exp:\/\//i.test(configuredAuthRedirectUrl) && !/^exp:\/\/(localhost|127\.0\.0\.1)(?::\d+)?/i.test(configuredAuthRedirectUrl)) {
    return configuredAuthRedirectUrl;
  }

  return "";
}

const requestedDevAuthMode = (process.env.EXPO_PUBLIC_DEV_AUTH_MODE ?? "false").toLowerCase() === "true";

// Canonical public EYA application backend URL. This is the Vercel target.
const configuredEyaApiUrl = firstNonEmpty(
  process.env.EXPO_PUBLIC_EYA_API_URL,
  process.env.NEXT_PUBLIC_EYA_API_URL,
  // Temporary compatibility fallback while old builds are being migrated.
  process.env.EXPO_PUBLIC_PAYCHANGU_BACKEND,
  process.env.NEXT_PUBLIC_PAYCHANGU_BACKEND,
);

// Temporary bridge for the existing generic commerce payment caller only. This
// must disappear once that caller has moved to the trusted EYA -> VAC Payments
// Cloudflare flow. Never point this at the new Vercel EYA backend because the
// Vercel backend intentionally does not host provider-facing PayChangu routes.
const configuredLegacyPaymentBackendUrl = firstNonEmpty(
  process.env.EXPO_PUBLIC_LEGACY_PAYMENT_BACKEND_URL,
  process.env.NEXT_PUBLIC_LEGACY_PAYMENT_BACKEND_URL,
  process.env.EXPO_PUBLIC_PAYCHANGU_BACKEND,
  process.env.NEXT_PUBLIC_PAYCHANGU_BACKEND,
);

export const ENV = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  NEW_APP_SCHEMA: process.env.EXPO_PUBLIC_NEW_APP_SCHEMA ?? "",
  WEB_BASE_URL: (process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://eya.vercel.app").trim(),
  EYA_API_URL: configuredEyaApiUrl,
  // Deprecated compatibility alias used by older non-payment backend callers.
  // It now resolves to the EYA application API, not to payment authority.
  PAYCHANGU_BACKEND: configuredEyaApiUrl,
  LEGACY_PAYMENT_BACKEND_URL: configuredLegacyPaymentBackendUrl,
  CLOUDINARY_CLOUD_NAME: process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "",
  CLOUDINARY_UPLOAD_PRESET: process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "",
  ENABLE_PUSH_NOTIFICATIONS: (process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS ?? "true").toLowerCase() !== "false",
  APP_ENV: process.env.EXPO_PUBLIC_APP_ENV ?? "development",
  // Never allow a public environment flag to turn local-only identities into a
  // production authentication mode. Expo/React Native replaces __DEV__ at build
  // time, so production bundles remain on real Supabase Auth even if the env flag
  // is accidentally left enabled.
  DEV_AUTH_MODE: __DEV__ && requestedDevAuthMode,
  ADMIN_EMAILS: (process.env.EXPO_PUBLIC_ADMIN_EMAILS ?? "").trim(),
  AUTH_REDIRECT_URL: resolveAuthRedirectUrl(),
};

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function getConfiguredAdminEmails() {
  return ENV.ADMIN_EMAILS.split(",").map((value) => normalizeEmail(value)).filter(Boolean);
}

export function isConfiguredAdminEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const allowed = getConfiguredAdminEmails();
  if (!allowed.length) return true;
  return allowed.includes(normalized);
}

export function assertEnv() {
  const missing = getRequiredEnvIssues();
  if (missing.length) {
    throw new Error(
      `Missing env vars: ${missing.join(", ")}. Create .env from .env.example and restart with: npx expo start -c`
    );
  }
}

export function getRequiredEnvIssues() {
  const missing: string[] = [];
  if (!ENV.SUPABASE_URL) missing.push("EXPO_PUBLIC_SUPABASE_URL");
  if (!ENV.SUPABASE_ANON_KEY) missing.push("EXPO_PUBLIC_SUPABASE_ANON_KEY");
  return missing;
}

export function getOptionalServiceWarnings() {
  const warnings: string[] = [];
  if (!ENV.CLOUDINARY_CLOUD_NAME) warnings.push("Cloudinary cloud name is missing. Image uploads will fail.");
  if (!ENV.CLOUDINARY_UPLOAD_PRESET) warnings.push("Cloudinary upload preset is missing. Image uploads will fail.");
  if (!ENV.EYA_API_URL) warnings.push("EYA API URL is missing. Vercel-backed Admin, delivery, COD and handoff APIs will fail.");
  if (!ENV.LEGACY_PAYMENT_BACKEND_URL) warnings.push("Legacy commerce payment bridge is missing. Keep it only until generic payments move to VAC Payments on Cloudflare.");
  if (!/^https?:\/\//i.test(ENV.WEB_BASE_URL)) warnings.push("Web base URL is invalid. Browser/deep-link redirects may fail.");
  return warnings;
}
