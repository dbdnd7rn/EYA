export const ENV = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  NEW_APP_SCHEMA: process.env.EXPO_PUBLIC_NEW_APP_SCHEMA ?? "",
  WEB_BASE_URL: process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://pamaketi.vercel.app",
  PAYCHANGU_BACKEND:
    process.env.EXPO_PUBLIC_PAYCHANGU_BACKEND ?? process.env.NEXT_PUBLIC_PAYCHANGU_BACKEND ?? "",
  CLOUDINARY_CLOUD_NAME: process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "",
  CLOUDINARY_UPLOAD_PRESET: process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "",
  ENABLE_PUSH_NOTIFICATIONS: (process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS ?? "true").toLowerCase() !== "false",
  APP_ENV: process.env.EXPO_PUBLIC_APP_ENV ?? "development",
  DEV_AUTH_MODE: (process.env.EXPO_PUBLIC_DEV_AUTH_MODE ?? "false").toLowerCase() === "true",
};

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
  if (!ENV.PAYCHANGU_BACKEND) warnings.push("PayChangu backend is missing. Checkout and payment verification will fail.");
  if (!/^https?:\/\//i.test(ENV.WEB_BASE_URL)) warnings.push("Web base URL is invalid. Payment redirects may fail.");
  return warnings;
}

