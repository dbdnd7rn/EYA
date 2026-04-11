import { ENV, getOptionalServiceWarnings } from "@/lib/env";
import { supabase } from "@/lib/supabase";

export type RuntimeEventLevel = "info" | "warn" | "error";

export type RuntimeEventInput = {
  type: string;
  level?: RuntimeEventLevel;
  message: string;
  context?: Record<string, unknown>;
  userId?: string | null;
};

let currentUserId: string | null = null;

export function setMonitoringUserContext(userId?: string | null) {
  currentUserId = userId ?? null;
}

export async function captureRuntimeEvent(input: RuntimeEventInput) {
  const payload = {
    event_type: input.type,
    level: input.level ?? "info",
    message: input.message,
    context: input.context ?? {},
    user_id: input.userId ?? currentUserId,
    app_env: ENV.APP_ENV,
  };

  try {
    await supabase.from("app_runtime_events").insert(payload);
  } catch {}
}

export async function captureRuntimeError(error: unknown, context?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  await captureRuntimeEvent({
    type: "runtime_error",
    level: "error",
    message,
    context,
  });
}

export async function reportStartupWarnings() {
  const warnings = getOptionalServiceWarnings();
  if (!warnings.length) return;

  await Promise.all(
    warnings.map((message) =>
      captureRuntimeEvent({
        type: "env_warning",
        level: "warn",
        message,
      }),
    ),
  );
}
