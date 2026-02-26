import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";

/**
 * This replaces: app/auth/callback/route.ts (Next.js server route)
 * It handles URLs like:
 *  - palevel://auth/callback?code=...&type=recovery
 *  - https://palevel.vercel.app/auth/callback?code=...&type=recovery (if opened inside app)
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; type?: string; error?: string }>();

  useEffect(() => {
    const run = async () => {
      const code = typeof params.code === "string" ? params.code : null;
      const type = typeof params.type === "string" ? params.type : null;

      if (!code) {
        router.replace("/(auth)/login");
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        router.replace("/(auth)/login");
        return;
      }

      if (type === "recovery") {
        router.replace("/(auth)/reset-password");
        return;
      }

      router.replace("/");
    };

    run();
  }, [params.code, params.type]);

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator />
    </View>
  );
}
