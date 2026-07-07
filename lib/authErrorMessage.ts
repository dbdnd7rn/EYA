export function authErrorMessage(error: unknown, fallback: string) {
  const raw = String((error as { message?: unknown } | null)?.message ?? error ?? "").trim();
  const lower = raw.toLowerCase();

  if (
    lower.includes("network request failed") ||
    lower.includes("network unavailable") ||
    lower.includes("failed to fetch") ||
    lower.includes("service unavailable") ||
    lower.includes("network_unavailable") ||
    raw.includes("/auth/v1/token")
  ) {
    return "Cannot reach the login server. Check your internet connection and try again.";
  }

  if (lower.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  if (lower.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }

  if (lower.startsWith("{") || raw.length > 180) {
    return fallback;
  }

  return raw || fallback;
}

