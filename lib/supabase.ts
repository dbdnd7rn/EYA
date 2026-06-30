import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { ENV, assertEnv } from "./env";

assertEnv();

const projectRef = ENV.SUPABASE_URL ? new URL(ENV.SUPABASE_URL).hostname.split(".")[0] : "eya";
export const SUPABASE_AUTH_STORAGE_KEY = `sb-${projectRef}-auth-token`;

export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: {
    storageKey: SUPABASE_AUTH_STORAGE_KEY,
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

export function isInvalidRefreshTokenError(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? "").toLowerCase();
  return message.includes("invalid refresh token") || message.includes("refresh token not found");
}

export async function clearSupabaseAuthStorage() {
  await Promise.all([
    AsyncStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY),
    AsyncStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`),
    AsyncStorage.removeItem(`${SUPABASE_AUTH_STORAGE_KEY}-user`),
  ]);
}

export async function getSupabaseAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    if (isInvalidRefreshTokenError(error)) {
      await clearSupabaseAuthStorage();
    }
    return null;
  }
  return data.session?.access_token ?? null;
}
