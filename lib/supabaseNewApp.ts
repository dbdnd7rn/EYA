import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { ENV, assertEnv } from "./env";
import { getSupabaseAccessToken } from "./supabase";

assertEnv();

const options = {
  accessToken: getSupabaseAccessToken,
  db: {
    schema: "public",
  },
} as const;

export const supabaseNewApp = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, options);
