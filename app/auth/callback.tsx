import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { consumePendingGoogleAuthContext, persistAuthFeedback } from "@/lib/authFeedback";
import { completeGoogleAuthFromUrl } from "@/lib/googleAuth";

/**
 * Handles auth redirects such as:
 *  - eya://auth/callback?code=...&type=recovery
 *  - https://<host>/auth/callback?code=...&type=recovery
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; type?: string; error?: string; error_description?: string }>();
  const currentUrl = Linking.useURL();

  useEffect(() => {
    const run = async () => {
      const type = typeof params.type === "string" ? params.type : null;
      const authError =
        typeof params.error_description === "string"
          ? params.error_description
          : typeof params.error === "string"
            ? params.error
            : null;
      const context = await consumePendingGoogleAuthContext();
      const fallbackRoute = context?.screen === "signup" ? "/(auth)/signup" : "/(auth)/login";
      const fallbackParams = { role: context?.role ?? "student" };

      if (authError) {
        await persistAuthFeedback({
          screen: context?.screen ?? "login",
          role: context?.role ?? "student",
          error: authError,
        });
        router.replace({ pathname: fallbackRoute, params: fallbackParams });
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
      } catch (err: any) {
        await persistAuthFeedback({
          screen: context?.screen ?? "login",
          role: context?.role ?? "student",
          error: err?.message ?? "Google authentication could not be completed.",
        });
        router.replace({ pathname: fallbackRoute, params: fallbackParams });
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
