import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeRedirectUri } from "expo-auth-session";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { ensureProfileRole } from "@/lib/authProfile";
import { consumePendingGoogleAuthContext, rememberPendingGoogleAuthContext, type AuthScreen } from "@/lib/authFeedback";
import { ENV, isConfiguredAdminEmail } from "@/lib/env";
import { createVendor, listMyVendors } from "@/lib/newApp/vendors";

WebBrowser.maybeCompleteAuthSession();

type RoleChoice = "student" | "vendor" | "landlord" | "agent" | "admin";

type GoogleAuthResult =
  | { redirected: true; cancelled?: false }
  | { redirected: false; cancelled: boolean };

const PENDING_ROLE_KEY = "auth.pending_google_role";
const PROCESSED_REDIRECTS_KEY = "auth.processed_google_redirects";
const MAX_PROCESSED_REDIRECTS = 12;
const NATIVE_AUTH_REDIRECT_URL = "eya://auth/callback";
const GOOGLE_AUTH_COMPLETION_ERROR = "Google sign-in could not be completed. Check Supabase redirect URLs.";

const inFlightCompletions = new Map<string, Promise<void>>();
const processedRedirectMarkers = new Set<string>();

function redirectTo() {
  if (ENV.AUTH_REDIRECT_URL) return ENV.AUTH_REDIRECT_URL;

  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin.replace(/\/+$/, "")}/auth/callback`;
    }
    const webBaseUrl = ENV.WEB_BASE_URL || "https://eya.vercel.app";
    return `${webBaseUrl.replace(/\/+$/, "")}/auth/callback`;
  }

  const isExpoGo = Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";
  if (isExpoGo) {
    return Linking.createURL("auth/callback");
  }

  const generated = makeRedirectUri({
    scheme: "eya",
    path: "auth/callback",
    native: NATIVE_AUTH_REDIRECT_URL,
    preferLocalhost: false,
  });

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?/i.test(generated)) {
    return NATIVE_AUTH_REDIRECT_URL;
  }

  return generated;
}

function getSearchAndHash(url: string) {
  try {
    const parsed = new URL(url);
    return {
      search: parsed.search,
      hash: parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash,
    };
  } catch {
    const [beforeHash, hash = ""] = url.split("#");
    const queryIndex = beforeHash.indexOf("?");
    return {
      search: queryIndex >= 0 ? beforeHash.slice(queryIndex) : "",
      hash,
    };
  }
}

export function getAuthRedirectParams(url: string) {
  const { search, hash } = getSearchAndHash(url);
  const params = new URLSearchParams(search);

  if (hash) {
    const hashParams = new URLSearchParams(hash);
    hashParams.forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
  }

  return params;
}

function hashMarker(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16)}:${value.length}`;
}

function getRedirectMarker(params: URLSearchParams) {
  const code = params.get("code");
  if (code) return `code:${hashMarker(code)}`;

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    return `tokens:${hashMarker(`${accessToken}.${refreshToken}`)}`;
  }

  return null;
}

async function readProcessedRedirectMarkers() {
  const raw = await AsyncStorage.getItem(PROCESSED_REDIRECTS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    return [];
  }
}

async function hasProcessedRedirect(marker: string) {
  if (processedRedirectMarkers.has(marker)) return true;

  const persisted = await readProcessedRedirectMarkers();
  persisted.forEach((value) => processedRedirectMarkers.add(value));
  return processedRedirectMarkers.has(marker);
}

async function rememberProcessedRedirect(marker: string) {
  processedRedirectMarkers.add(marker);
  const current = await readProcessedRedirectMarkers();
  const next = [...current.filter((value) => value !== marker), marker].slice(-MAX_PROCESSED_REDIRECTS);
  await AsyncStorage.setItem(PROCESSED_REDIRECTS_KEY, JSON.stringify(next));
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

function toNullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function firstDefinedString(...values: unknown[]) {
  for (const value of values) {
    const text = toNullableString(value);
    if (text) return text;
  }
  return null;
}

function buildStudentProfilePayload(user: User) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const firstName = firstDefinedString(meta.first_name, meta.firstName);
  const lastName = firstDefinedString(meta.last_name, meta.lastName, meta.surname);
  const fullName =
    firstDefinedString(meta.full_name, [firstName, lastName].filter(Boolean).join(" ")) ??
    firstDefinedString(user.email?.split("@")[0]);

  return {
    id: user.id,
    email: toNullableString(user.email)?.toLowerCase() ?? null,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    surname: firstDefinedString(meta.surname, lastName),
    phone: firstDefinedString(meta.phone, meta.phone_number),
    role: "student",
    onboarded: true,
    updated_at: new Date().toISOString(),
  };
}

async function ensureStudentProfile(user: User) {
  const payload = buildStudentProfilePayload(user);
  const upsertRes = await supabase.from("profiles").upsert(payload as never, { onConflict: "id" });
  if (!upsertRes.error) return;

  const updateRes = await supabase.from("profiles").update(payload as never).eq("id", user.id);
  if (updateRes.error) {
    throw new Error("Google sign-up completed, but the student profile could not be created. Please retry.");
  }
}

async function readPendingRole() {
  const value = await AsyncStorage.getItem(PENDING_ROLE_KEY);
  if (value === "student" || value === "vendor" || value === "landlord" || value === "agent") return value;
  return null;
}

async function clearPendingRole() {
  await AsyncStorage.removeItem(PENDING_ROLE_KEY);
}

async function rememberPendingRole(role: RoleChoice) {
  await AsyncStorage.setItem(PENDING_ROLE_KEY, role);
}

export async function clearPendingGoogleAuthState() {
  await Promise.all([
    clearPendingRole(),
    consumePendingGoogleAuthContext()
      .then(() => undefined)
      .catch(() => undefined),
  ]);
}

async function finalizeRoleSetup(role: RoleChoice | null) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("Google sign-in did not return a valid session.");
  if (role === "admin" && !isConfiguredAdminEmail(user.email)) return;

  if (role === "student") {
    await ensureStudentProfile(user);
    return;
  }

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

async function finalizePendingRoleSetup() {
  const pendingRole = await readPendingRole();
  await finalizeRoleSetup(pendingRole);
  await clearPendingGoogleAuthState();
}

function getReadableOAuthError(message: string | null) {
  const raw = String(message ?? "").trim();
  const lower = raw.toLowerCase();

  if (lower.includes("access_denied") || lower.includes("cancel")) {
    return "Google sign-in was cancelled.";
  }

  if (
    lower.includes("redirect") ||
    lower.includes("invalid request") ||
    lower.includes("invalid_grant") ||
    lower.includes("code verifier") ||
    lower.includes("auth code") ||
    lower.includes("pkce")
  ) {
    return GOOGLE_AUTH_COMPLETION_ERROR;
  }

  return raw || GOOGLE_AUTH_COMPLETION_ERROR;
}

async function hasCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  return !error && Boolean(data.session);
}

function isLikelyRepeatedCodeError(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? "").toLowerCase();
  return (
    message.includes("invalid_grant") ||
    message.includes("already") ||
    message.includes("used") ||
    message.includes("code verifier") ||
    message.includes("auth code")
  );
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForSession(timeoutMs = 1800) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await hasCurrentSession()) return true;
    await delay(150);
  }
  return false;
}

export async function completeGoogleAuthFromUrl(url: string, options: { finalizeRole?: boolean } = {}) {
  const params = getAuthRedirectParams(url);
  const authError = params.get("error_description") || params.get("error");
  if (authError) throw new Error(getReadableOAuthError(authError));

  const code = params.get("code");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const marker = getRedirectMarker(params);

  if (!marker) {
    if (await hasCurrentSession()) {
      if (options.finalizeRole !== false) await finalizePendingRoleSetup();
      return { alreadyCompleted: true as const };
    }
    throw new Error(GOOGLE_AUTH_COMPLETION_ERROR);
  }

  if (await hasProcessedRedirect(marker)) {
    if (options.finalizeRole !== false) await finalizePendingRoleSetup();
    return { alreadyCompleted: true as const };
  }

  const existingCompletion = inFlightCompletions.get(marker);
  if (existingCompletion) {
    await existingCompletion;
    return { alreadyCompleted: true as const };
  }

  const completion = (async () => {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        if (isLikelyRepeatedCodeError(error) && (await hasCurrentSession())) {
          await rememberProcessedRedirect(marker);
        } else {
          throw new Error(getReadableOAuthError(String(error.message ?? error)));
        }
      }
    } else if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw new Error(getReadableOAuthError(String(error.message ?? error)));
    } else {
      throw new Error(GOOGLE_AUTH_COMPLETION_ERROR);
    }

    await rememberProcessedRedirect(marker);
    if (options.finalizeRole !== false) await finalizePendingRoleSetup();
  })();

  inFlightCompletions.set(marker, completion);

  try {
    await completion;
  } finally {
    inFlightCompletions.delete(marker);
  }

  return { alreadyCompleted: false as const };
}

export async function signInWithGoogle(
  role: RoleChoice | null = null,
  screen: AuthScreen = "login",
): Promise<GoogleAuthResult> {
  if (role === "admin") {
    throw new Error("Admin accounts are provisioned manually. Use the approved admin email and password.");
  }

  await rememberPendingGoogleAuthContext({ role: role ?? "student", screen });
  if (role) {
    await rememberPendingRole(role);
  } else {
    await clearPendingRole();
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
      await clearPendingGoogleAuthState();
      throw error;
    }

    return { redirected: true as const, cancelled: false as const };
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
    await clearPendingGoogleAuthState();
    throw error;
  }

  if (!data?.url) {
    await clearPendingGoogleAuthState();
    throw new Error("Google sign-in could not be started.");
  }
  if (__DEV__) {
    console.log("[google-auth] authorizeUrl:", data.url);
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri).catch(async (err) => {
    await clearPendingGoogleAuthState();
    throw err;
  });
  if (result.type !== "success") {
    // Some native environments still complete session asynchronously even when
    // openAuthSession reports cancellation. Confirm before treating as cancelled.
    if (!(await waitForSession())) {
      await clearPendingGoogleAuthState();
      return { redirected: false as const, cancelled: true as const };
    }
    await finalizePendingRoleSetup();
    return { redirected: false as const, cancelled: false as const };
  }

  await completeGoogleAuthFromUrl(result.url).catch(async (err) => {
    await clearPendingGoogleAuthState();
    throw err;
  });
  return { redirected: false as const, cancelled: false as const };
}
