import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeRedirectUri } from "expo-auth-session";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { ensureProfileRole } from "@/lib/authProfile";
import { rememberPendingGoogleAuthContext, type AuthScreen } from "@/lib/authFeedback";
import { ENV, isConfiguredAdminEmail } from "@/lib/env";
import { createVendor, listMyVendors } from "@/lib/newApp/vendors";

WebBrowser.maybeCompleteAuthSession();

type RoleChoice = "student" | "vendor" | "landlord" | "agent" | "admin";

type GoogleAuthResult =
  | { redirected: true; cancelled?: false }
  | { redirected: false; cancelled: boolean };

const PENDING_ROLE_KEY = "auth.pending_google_role";

function redirectTo() {
  if (ENV.AUTH_REDIRECT_URL) return ENV.AUTH_REDIRECT_URL;

  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin.replace(/\/+$/, "")}/auth/callback`;
    }
    if (ENV.WEB_BASE_URL) {
      return `${ENV.WEB_BASE_URL.replace(/\/+$/, "")}/auth/callback`;
    }
  }

  const isExpoGo = Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";
  if (isExpoGo) {
    return Linking.createURL("auth/callback");
  }

  const nativeRedirect = "eya://auth/callback";
  const generated = makeRedirectUri({
    scheme: "eya",
    path: "auth/callback",
    native: nativeRedirect,
    preferLocalhost: false,
  });

  // Guard against localhost callbacks in native OAuth flows.
  if (Platform.OS !== "web" && /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?/i.test(generated)) {
    return nativeRedirect;
  }

  return generated;
}

function mergeUrlParams(url: string) {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;

  if (hash) {
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }

  return params;
}

async function ensureSellerVendor(ownerId: string, fullName: string) {
  const existing = await listMyVendors(ownerId);
  const current = existing.find((row) => row.supports_food) ?? null;
  if (current) return current;

  try {
    return await createVendor(ownerId, {
      name: fullName || "Restaurant",
      description: "Campus restaurant storefront",
      supports_market: false,
      supports_food: true,
      campus: null,
      area: null,
      city: null,
    });
  } catch {
    const retry = await listMyVendors(ownerId);
    const resolved = retry.find((row) => row.supports_food) ?? null;
    if (resolved) return resolved;
    throw new Error("Could not create or load restaurant profile. Please retry.");
  }
}

async function consumePendingRole() {
  const value = await AsyncStorage.getItem(PENDING_ROLE_KEY);
  await AsyncStorage.removeItem(PENDING_ROLE_KEY);
  if (value === "student" || value === "vendor" || value === "landlord" || value === "agent") return value;
  return null;
}

async function rememberPendingRole(role: RoleChoice) {
  await AsyncStorage.setItem(PENDING_ROLE_KEY, role);
}

async function forgetPendingRole() {
  await AsyncStorage.removeItem(PENDING_ROLE_KEY);
}

async function finalizeRoleSetup(role: RoleChoice | null) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;
  if (role === "admin" && !isConfiguredAdminEmail(user.email)) return;

  const resolvedRole = await ensureProfileRole(user, role);
  if (resolvedRole === "vendor") {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      String(meta.full_name ?? "").trim() ||
      [String(meta.first_name ?? "").trim(), String(meta.last_name ?? "").trim()].filter(Boolean).join(" ") ||
      user.email?.split("@")[0] ||
      "Seller Shop";

    await ensureSellerVendor(user.id, fullName);
  }
}

async function finalizeExistingSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw error;
  if (!session?.user) return false;

  const pendingRole = await consumePendingRole();
  await finalizeRoleSetup(pendingRole);
  return true;
}

export async function completeGoogleAuthFromUrl(url: string) {
  const params = mergeUrlParams(url);
  const authError = params.get("error_description") || params.get("error");
  if (authError) throw new Error(authError);

  const code = params.get("code");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // The deep-link callback can sometimes finish first on mobile. If that
      // already created a Supabase session, treat OAuth as successful instead
      // of showing a false failure to the user.
      const recovered = await finalizeExistingSession();
      if (!recovered) throw error;
      return;
    }
  } else if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
  } else {
    const recovered = await finalizeExistingSession();
    if (!recovered) throw new Error("Google sign-in did not return a valid session.");
    return;
  }

  const pendingRole = await consumePendingRole();
  await finalizeRoleSetup(pendingRole);
}

export async function signInWithGoogle(role: RoleChoice | null = null, screen: AuthScreen = "login"): Promise<GoogleAuthResult> {
  if (role === "admin") {
    throw new Error("Admin accounts are provisioned manually. Use the approved admin email and password.");
  }

  await rememberPendingGoogleAuthContext({ role: role ?? "student", screen });
  if (role) {
    await rememberPendingRole(role);
  } else {
    await forgetPendingRole();
  }

  const redirectUri = redirectTo();
  if (__DEV__) {
    console.log("[google-auth] redirectUri:", redirectUri);
  }

  if (Platform.OS === "web") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUri,
        queryParams: {
          access_type: "offline",
          prompt: "select_account consent",
        },
      },
    });

    if (error) {
      await forgetPendingRole();
      throw error;
    }

    return { redirected: true };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: "offline",
        prompt: "select_account consent",
      },
    },
  });

  if (error) {
    await forgetPendingRole();
    throw error;
  }

  if (!data?.url) {
    await forgetPendingRole();
    throw new Error("Google sign-in could not be started.");
  }
  if (__DEV__) {
    console.log("[google-auth] authorizeUrl:", data.url);
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
  if (result.type !== "success") {
    // Some native environments still complete the Supabase session through the
    // deep-link route even when the browser result says cancel/dismiss.
    const recovered = await finalizeExistingSession();
    if (recovered) return { redirected: false, cancelled: false };

    await forgetPendingRole();
    return { redirected: false, cancelled: true };
  }

  await completeGoogleAuthFromUrl(result.url);
  return { redirected: false, cancelled: false };
}
