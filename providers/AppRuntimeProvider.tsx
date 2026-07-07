import React from "react";
import { useRouter } from "expo-router";
import { notificationTargetForRole } from "@/lib/appNotifications";
import { ENV } from "@/lib/env";
import { captureRuntimeError, captureRuntimeEvent, reportStartupWarnings, setMonitoringUserContext } from "@/lib/monitoring";
import { registerForPushNotificationsAsync, scheduleLocalNotification, subscribeToNotificationEvents, syncPushToken } from "@/lib/notifications";
import { normalizeAppRole, type AppRole } from "@/lib/roleRouting";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

function readPayloadString(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function routeFromNotificationPayload(data: Record<string, unknown>, currentRole: AppRole) {
  const event = readPayloadString(data, "event");
  const role = normalizeAppRole(readPayloadString(data, "role")) ?? currentRole;
  const type = readPayloadString(data, "notificationType") ?? readPayloadString(data, "type");

  if (role === "agent" && event === "delivery_request") {
    return "/(agent)/(tabs)/deliveries";
  }

  if (role === "student" || role === "vendor" || role === "agent" || role === "landlord" || role === "admin") {
    return notificationTargetForRole(role, type, data);
  }

  return null;
}

export default function AppRuntimeProvider({ children }: { children: React.ReactNode }) {
  const { role, activeRole, user } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    void reportStartupWarnings();
  }, []);

  React.useEffect(() => {
    setMonitoringUserContext(user?.id ?? null);
  }, [user?.id]);

  React.useEffect(() => {
    if (!user?.id || !ENV.ENABLE_PUSH_NOTIFICATIONS) return;

    let active = true;
    const seenLocalNotificationIds = new Set<string>();
    let notificationCleanup: { remove: () => void } | null = null;

    const init = async () => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (!active || !token) return;
        await syncPushToken(user.id, token);
        await captureRuntimeEvent({
          type: "push_token_synced",
          message: "Push token registered successfully.",
          userId: user.id,
        });
      } catch (error) {
        await captureRuntimeError(error, { scope: "app_runtime_provider_init_push", userId: user.id });
      }
    };

    void init();

    void subscribeToNotificationEvents({
      onReceived: (notification: any) => {
        void captureRuntimeEvent({
          type: "push_received",
          message: "Push notification received while app was open.",
          userId: user.id,
          context: {
            identifier: notification.request.identifier,
          },
        });
      },
      onResponse: (response: any) => {
        const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
        void captureRuntimeEvent({
          type: "push_opened",
          message: "User opened a push notification.",
          userId: user.id,
          context: {
            identifier: response.notification.request.identifier,
          },
        });

        const target = routeFromNotificationPayload(data, activeRole ?? role);
        if (target) {
          router.push(target as any);
        }
      },
    }).then((cleanup) => {
      if (!active) {
        cleanup?.remove();
        return;
      }
      notificationCleanup = cleanup;
    });

    const notificationRowSub = supabase
      .channel(`local-notification-fallback-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        const next = payload.new as { id?: string; type?: string; title?: string; message?: string; priority?: string; data?: Record<string, unknown> } | null;
        if (!next?.id || seenLocalNotificationIds.has(next.id)) return;
        seenLocalNotificationIds.add(next.id);

        const type = String(next.type ?? "").toLowerCase();
        const isAudibleLocalFallback = type.includes("message") || type.includes("enquiry");
        if (!isAudibleLocalFallback) return;

        void scheduleLocalNotification({
          title: next.title || "New message",
          body: next.message || "You received a new message.",
          data: {
            ...(next.data ?? {}),
            notificationId: next.id,
            fallback: true,
          },
          playSound: String(next.priority ?? "").toLowerCase() === "important",
        });
      })
      .subscribe();

    return () => {
      active = false;
      notificationCleanup?.remove();
      supabase.removeChannel(notificationRowSub);
    };
  }, [activeRole, role, router, user?.id]);

  return <>{children}</>;
}
