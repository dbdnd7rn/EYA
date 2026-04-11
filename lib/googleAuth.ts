import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { ensureProfileRole } from "@/lib/authProfile";
import { createVendor, listMyVendors } from "@/lib/newApp/vendors";

WebBrowser.maybeCompleteAuthSession();

type RoleChoice = "student" | "vendor" | "landlord" | "agent";

const PENDING_ROLE_KEY = "auth.pending_google_role";

function redirectTo() {
  return makeRedirectUri({
    scheme: "pamaketi",
    path: "auth/callback",
  });
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
  const current = existing.find((row) => row.supports_market) ?? existing[0] ?? null;
  if (current) return current;

  try {
    return await createVendor(ownerId, {
      name: fullName || "Seller Shop",
      description: "Campus seller storefront",
      supports_market: true,
      supports_food: false,
      campus: null,
      area: null,
      city: null,
    });
  } catch {
    const retry = await listMyVendors(ownerId);
    const resolved = retry.find((row) => row.supports_market) ?? retry[0] ?? null;
    if (resolved) return resolved;
    throw new Error("Could not create or load seller shop. Please retry.");
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

async function finalizeRoleSetup(role: RoleChoice | null) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

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

export async function completeGoogleAuthFromUrl(url: string) {
  const params = mergeUrlParams(url);
  const authError = params.get("error_description") || params.get("error");
  if (authError) throw new Error(authError);

  const code = params.get("code");
  if (!code) throw new Error("Google sign-in did not return an authorization code.");

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;

  const pendingRole = await consumePendingRole();
  await finalizeRoleSetup(pendingRole);
}

export async function signInWithGoogle(role: RoleChoice) {
  await rememberPendingRole(role);

  const redirectUri = redirectTo();

  if (Platform.OS === "web") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUri,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      await AsyncStorage.removeItem(PENDING_ROLE_KEY);
      throw error;
    }

    return { redirected: true as const };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectUri,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    await AsyncStorage.removeItem(PENDING_ROLE_KEY);
    throw error;
  }

  if (!data?.url) {
    await AsyncStorage.removeItem(PENDING_ROLE_KEY);
    throw new Error("Google sign-in could not be started.");
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
  if (result.type !== "success") {
    await AsyncStorage.removeItem(PENDING_ROLE_KEY);
    return { redirected: false as const, cancelled: true as const };
  }

  await completeGoogleAuthFromUrl(result.url);
  return { redirected: false as const, cancelled: false as const };
}

