import AsyncStorage from "@react-native-async-storage/async-storage";

export type AuthScreen = "login" | "signup";
export type AuthRoleChoice = "student" | "vendor" | "landlord" | "agent" | "admin";

type PendingGoogleAuthContext = {
  role: AuthRoleChoice;
  screen: AuthScreen;
};

type AuthFeedback = {
  screen: AuthScreen;
  role: AuthRoleChoice;
  error?: string | null;
  info?: string | null;
};

const PENDING_GOOGLE_CONTEXT_KEY = "auth.pending_google_context";
const AUTH_FEEDBACK_KEY = "auth.pending_feedback";

function sanitizeRole(value: string | null | undefined): AuthRoleChoice {
  if (value === "student" || value === "vendor" || value === "landlord" || value === "agent" || value === "admin") return value;
  return "student";
}

function sanitizeScreen(value: string | null | undefined): AuthScreen {
  return value === "signup" ? "signup" : "login";
}

export async function rememberPendingGoogleAuthContext(input: PendingGoogleAuthContext) {
  await AsyncStorage.setItem(
    PENDING_GOOGLE_CONTEXT_KEY,
    JSON.stringify({
      role: sanitizeRole(input.role),
      screen: sanitizeScreen(input.screen),
    }),
  );
}

export async function consumePendingGoogleAuthContext(): Promise<PendingGoogleAuthContext | null> {
  const raw = await AsyncStorage.getItem(PENDING_GOOGLE_CONTEXT_KEY);
  await AsyncStorage.removeItem(PENDING_GOOGLE_CONTEXT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingGoogleAuthContext>;
    return {
      role: sanitizeRole(parsed.role),
      screen: sanitizeScreen(parsed.screen),
    };
  } catch {
    return null;
  }
}

export async function persistAuthFeedback(input: AuthFeedback) {
  await AsyncStorage.setItem(
    AUTH_FEEDBACK_KEY,
    JSON.stringify({
      screen: sanitizeScreen(input.screen),
      role: sanitizeRole(input.role),
      error: input.error?.trim() || null,
      info: input.info?.trim() || null,
    }),
  );
}

export async function consumeAuthFeedback(screen: AuthScreen): Promise<AuthFeedback | null> {
  const raw = await AsyncStorage.getItem(AUTH_FEEDBACK_KEY);
  await AsyncStorage.removeItem(AUTH_FEEDBACK_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthFeedback>;
    const resolvedScreen = sanitizeScreen(parsed.screen);
    if (resolvedScreen !== screen) return null;
    return {
      screen: resolvedScreen,
      role: sanitizeRole(parsed.role),
      error: parsed.error?.trim() || null,
      info: parsed.info?.trim() || null,
    };
  } catch {
    return null;
  }
}
