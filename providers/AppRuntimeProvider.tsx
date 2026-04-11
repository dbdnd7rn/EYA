import React from "react";
import * as Notifications from "expo-notifications";
import { ENV } from "@/lib/env";
import { captureRuntimeError, captureRuntimeEvent, reportStartupWarnings, setMonitoringUserContext } from "@/lib/monitoring";
import { registerForPushNotificationsAsync, scheduleLocalNotification, syncPushToken } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

export default function AppRuntimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

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

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      void captureRuntimeEvent({
        type: "push_received",
        message: "Push notification received while app was open.",
        userId: user.id,
        context: {
          identifier: notification.request.identifier,
        },
      });
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      void captureRuntimeEvent({
        type: "push_opened",
        message: "User opened a push notification.",
        userId: user.id,
        context: {
          identifier: response.notification.request.identifier,
        },
      });
    });

    const notificationRowSub = supabase
      .channel(`local-notification-fallback-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        const next = payload.new as { id?: string; type?: string; title?: string; message?: string; priority?: string; data?: Record<string, unknown> } | null;
        if (!next?.id || seenLocalNotificationIds.has(next.id)) return;
        seenLocalNotificationIds.add(next.id);

        const type = String(next.type ?? "").toLowerCase();
        const isAudibleLocalFallback = type === "vendor_message";
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
      receivedSub.remove();
      responseSub.remove();
      supabase.removeChannel(notificationRowSub);
    };
  }, [user?.id]);

  return <>{children}</>;
}
