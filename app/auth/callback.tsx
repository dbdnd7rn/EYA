import React, { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { consumePendingGoogleAuthContext, persistAuthFeedback } from "@/lib/authFeedback";
import { clearPendingGoogleAuthState, completeGoogleAuthFromUrl, getAuthRedirectParams } from "@/lib/googleAuth";

/**
 * Handles auth redirects such as:
 *  - eya://auth/callback?code=...&type=recovery
 *  - https://<host>/auth/callback?code=...&type=recovery
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; type?: string; error?: string; error_description?: string }>();
  const currentUrl = Linking.useURL();
  const handledUrlRef = useRef<string | null>(null);
  const paramKey = useMemo(
    () =>
      JSON.stringify(
        Object.entries(params)
          .flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : []))
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    [params],
  );

  useEffect(() => {
    const fallbackUrl =
      currentUrl ||
      Linking.createURL("auth/callback", {
        queryParams: Object.fromEntries(
          Object.entries(params).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
        ),
      });
    const redirectParams = getAuthRedirectParams(fallbackUrl);
    const hasAuthPayload = Boolean(
      redirectParams.get("code") ||
        redirectParams.get("access_token") ||
        redirectParams.get("refresh_token") ||
        redirectParams.get("error") ||
        redirectParams.get("error_description"),
    );

    if (!hasAuthPayload || handledUrlRef.current === fallbackUrl) return;
    handledUrlRef.current = fallbackUrl;

    const run = async () => {
      const type = redirectParams.get("type");
      const authError = redirectParams.get("error_description") || redirectParams.get("error");
      const context = await consumePendingGoogleAuthContext();
      const fallbackRoute = context?.screen === "signup" ? "/(auth)/signup" : "/(auth)/login";
      const fallbackParams = { role: context?.role ?? "student" };

      if (authError) {
        await clearPendingGoogleAuthState();
        await persistAuthFeedback({
          screen: context?.screen ?? "login",
          role: context?.role ?? "student",
          error: authError.toLowerCase().includes("access_denied")
            ? "Google sign-in was cancelled."
            : "Google sign-in could not be completed. Check Supabase redirect URLs.",
        });
        router.replace({ pathname: fallbackRoute, params: fallbackParams });
        return;
      }

      try {
        if (type === "recovery") {
          await completeGoogleAuthFromUrl(fallbackUrl, { finalizeRole: false });
          await clearPendingGoogleAuthState();
          router.replace("/(auth)/reset-password");
          return;
        }

        await completeGoogleAuthFromUrl(fallbackUrl);
        router.replace("/redirect");
      } catch (err: any) {
        await clearPendingGoogleAuthState();
        await persistAuthFeedback({
          screen: context?.screen ?? "login",
          role: context?.role ?? "student",
          error: err?.message ?? "Google authentication could not be completed.",
        });
        router.replace({ pathname: fallbackRoute, params: fallbackParams });
      }
    };

    void run();
  }, [currentUrl, paramKey, params]);

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <ActivityIndicator />
    </View>
  );
}
