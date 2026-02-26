export const ENV = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  WEB_BASE_URL: process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://palevel.vercel.app",
  CLOUDINARY_CLOUD_NAME: process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "",
  CLOUDINARY_UPLOAD_PRESET: process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "",
};

export function assertEnv() {
  const missing: string[] = [];
  if (!ENV.SUPABASE_URL) missing.push("EXPO_PUBLIC_SUPABASE_URL");
  if (!ENV.SUPABASE_ANON_KEY) missing.push("EXPO_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length) {
    throw new Error(
      `Missing env vars: ${missing.join(", ")}. Create .env from .env.example and restart with: npx expo start -c`
    );
  }
}
