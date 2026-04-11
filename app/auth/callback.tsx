import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { completeGoogleAuthFromUrl } from "@/lib/googleAuth";

/**
 * Handles auth redirects such as:
 *  - pamaketi://auth/callback?code=...&type=recovery
 *  - https://<host>/auth/callback?code=...&type=recovery
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; type?: string; error?: string }>();
  const currentUrl = Linking.useURL();

  useEffect(() => {
    const run = async () => {
      const type = typeof params.type === "string" ? params.type : null;
      const authError = typeof params.error === "string" ? params.error : null;

      if (authError) {
        router.replace("/(auth)/login");
        return;
      }

      const fallbackUrl =
        currentUrl ||
        Linking.createURL("auth/callback", {
          queryParams: Object.fromEntries(
            Object.entries(params).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
          ),
        });

      try {
        await completeGoogleAuthFromUrl(fallbackUrl);
        if (type === "recovery") {
          router.replace("/(auth)/reset-password");
          return;
        }
        router.replace("/redirect");
      } catch {
        router.replace("/(auth)/login");
      }
    };

    void run();
  }, [currentUrl, params, params.error, params.type]);

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator />
    </View>
  );
}
