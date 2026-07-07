import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { ENV } from "@/lib/env";
import { captureRuntimeError, captureRuntimeEvent } from "@/lib/monitoring";
import { supabase } from "@/lib/supabase";

type ExpoNotificationsModule = typeof import("expo-notifications");
type NotificationCleanup = { remove: () => void };

let notificationsModulePromise: Promise<ExpoNotificationsModule | null> | null = null;
let notificationHandlerConfigured = false;

function isExpoGo() {
  return Constants.appOwnership === "expo";
}

function canUseExpoNotifications() {
  return Platform.OS !== "web" && !isExpoGo();
}

async function getNotificationsModule() {
  if (!canUseExpoNotifications()) return null;

  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications")
      .then((mod) => {
        if (!notificationHandlerConfigured) {
          mod.setNotificationHandler({
            handleNotification: async (notification) => {
              const data = (notification.request.content.data ?? {}) as { playSound?: boolean; pushPriority?: string };
              const shouldPlaySound = data.playSound === true || String(data.pushPriority ?? "").toLowerCase() === "important";

              return {
                shouldShowBanner: true,
                shouldShowList: true,
                shouldPlaySound,
                shouldSetBadge: false,
              };
            },
          });
          notificationHandlerConfigured = true;
        }

        return mod;
      })
      .catch(async (error) => {
        await captureRuntimeError(error, { scope: "load_expo_notifications" });
        return null;
      });
  }

  return notificationsModulePromise;
}

function getProjectId() {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export async function registerForPushNotificationsAsync() {
  if (!ENV.ENABLE_PUSH_NOTIFICATIONS) return null;
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;
  if (!Device.isDevice) return null;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    if (finalStatus !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }

    if (finalStatus !== "granted") {
      await captureRuntimeEvent({
        type: "push_permission_denied",
        level: "warn",
        message: "Push notification permission was not granted.",
      });
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: undefined,
      });

      await Notifications.setNotificationChannelAsync("important", {
        name: "important",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default",
        vibrationPattern: [0, 250, 150, 250],
      });
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: getProjectId(),
    });
    return token.data;
  } catch (error) {
    await captureRuntimeError(error, { scope: "register_push_notifications" });
    return null;
  }
}

export async function syncPushToken(userId: string, pushToken: string) {
  const deviceId = `${Device.brand ?? "unknown"}-${Device.modelName ?? "device"}-${Platform.OS}`;
  const payload = {
    user_id: userId,
    push_token: pushToken,
    device_id: deviceId,
    platform: Platform.OS,
    is_active: true,
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("push_notification_tokens")
    .upsert(payload, { onConflict: "user_id,device_id" });

  if (error) {
    await captureRuntimeError(error, { scope: "sync_push_token" });
    throw error;
  }
}

export async function scheduleLocalNotification(input: { title: string; body: string; data?: Record<string, unknown>; playSound?: boolean }) {
  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return null;

    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      if (requested.status !== "granted") return null;
    }

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        data: {
          ...(input.data ?? {}),
          playSound: input.playSound === true,
          pushPriority: input.playSound ? "important" : "normal",
        },
        sound: input.playSound ? "default" : undefined,
        ...(Platform.OS === "android" ? { channelId: input.playSound ? "important" : "default" } : {}),
      },
      trigger: null,
    });
  } catch (error) {
    await captureRuntimeError(error, { scope: "schedule_local_notification" });
    return null;
  }
}

export async function subscribeToNotificationEvents(input: {
  onReceived: (notification: unknown) => void;
  onResponse: (response: unknown) => void;
}): Promise<NotificationCleanup | null> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  const receivedSub = Notifications.addNotificationReceivedListener(input.onReceived);
  const responseSub = Notifications.addNotificationResponseReceivedListener(input.onResponse);

  return {
    remove: () => {
      receivedSub.remove();
      responseSub.remove();
    },
  };
}
