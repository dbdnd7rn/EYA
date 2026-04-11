import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { ENV, assertEnv } from "./env";

assertEnv();

const options = {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  db: {
    schema: "public",
  },
} as const;

export const supabaseNewApp = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, options);
