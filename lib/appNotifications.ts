import type { Href } from "expo-router";
import { ENV } from "@/lib/env";
import { supabase } from "@/lib/supabase";

export type AppNotificationType =
  | "system"
  | "payment_success"
  | "payment_failed"
  | "order_created"
  | "vendor_order_created"
  | "order_completed"
  | "order_status_changed"
  | "delivery_assigned"
  | "delivery_status_changed"
  | "wallet_transfer_received"
  | "wallet_request"
  | "vendor_message"
  | "support_ticket_created"
  | "support_ticket_updated"
  | "trust_report_created"
  | "trust_report_updated"
  | "role_application_submitted"
  | "role_application_approved"
  | "role_application_declined";

export type AppNotificationRole = "student" | "vendor" | "agent" | "landlord" | "admin";

export type AppNotificationRow = {
  id: string;
  user_id: string;
  title: string | null;
  message: string | null;
  type: AppNotificationType | string | null;
  priority?: "normal" | "important" | string | null;
  data?: Record<string, unknown> | null;
  is_read: boolean | null;
  read_at?: string | null;
  pushed_at?: string | null;
  created_at: string | null;
};

type CreateNotificationInput = {
  userId: string;
  title: string;
  message: string;
  type: AppNotificationType | string;
  priority?: "normal" | "important";
  data?: Record<string, unknown>;
};

function uniq(values: (string | null | undefined)[]) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function readNotificationValue(data: Record<string, unknown> | null | undefined, key: string) {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function listNotificationsForUser(userId: string, limit = 100) {
  if (ENV.DEV_AUTH_MODE) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("id,user_id,title,message,type,priority,data,is_read,read_at,pushed_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as AppNotificationRow[];
}

export async function getUnreadNotificationCount(userId: string) {
  if (ENV.DEV_AUTH_MODE) return 0;

  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) throw error;
  return Number(count ?? 0);
}

export async function markAllNotificationsRead(userId: string) {
  if (ENV.DEV_AUTH_MODE) return;

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
}

export async function markNotificationsRead(notificationIds: string[]) {
  if (ENV.DEV_AUTH_MODE) return;

  const ids = uniq(notificationIds);
  if (!ids.length) return;
  const { error } = await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).in("id", ids);
  if (error) throw error;
}

export async function createInAppNotifications(inputs: CreateNotificationInput[]) {
  if (ENV.DEV_AUTH_MODE) return;

  const rows = inputs
    .filter((input) => input.userId && input.title.trim() && input.message.trim())
    .map((input) => ({
      user_id: input.userId,
      title: input.title,
      message: input.message,
      type: input.type,
      priority: input.priority ?? "normal",
      data: input.data ?? {},
      is_read: false,
    }));

  if (!rows.length) return;
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) throw error;
}

export async function createInAppNotification(input: CreateNotificationInput) {
  await createInAppNotifications([input]);
}

export async function listAdminUserIds() {
  if (ENV.DEV_AUTH_MODE) return [];

  const { data, error } = await supabase.from("profiles").select("id").eq("role", "admin");
  if (error) throw error;
  return uniq((data ?? []).map((row) => (row as { id?: string | null }).id));
}

export async function createAdminNotification(input: Omit<CreateNotificationInput, "userId">) {
  const adminIds = await listAdminUserIds();
  if (!adminIds.length) return;
  await createInAppNotifications(
    adminIds.map((userId) => ({
      userId,
      title: input.title,
      message: input.message,
      type: input.type,
      priority: input.priority,
      data: input.data,
    })),
  );
}

export function notificationHrefForRole(role: AppNotificationRole, type?: string | null): Href {
  const normalized = String(type ?? "").toLowerCase();

  if (role === "student") {
    if (normalized.includes("role_application")) return "/onboarding";
    if (normalized.startsWith("payment") || normalized.startsWith("wallet")) return "/(student)/(tabs)/wallet";
    if (normalized.includes("message") || normalized.includes("enquiry")) return "/(student)/(tabs)/messages";
    if (normalized.includes("support")) return "/support";
    return "/(student)/(tabs)/orders";
  }

  if (role === "vendor") {
    if (normalized.includes("message")) return "/(market)/messages";
    if (normalized.includes("payment") || normalized.includes("wallet")) return "/(market)/(tabs)/account";
    return "/(market)/(tabs)/orders";
  }

  if (role === "agent") {
    if (normalized.includes("payment") || normalized.includes("wallet")) return "/(agent)/(tabs)/earnings";
    return "/(agent)/(tabs)/deliveries";
  }

  if (role === "landlord") {
    if (normalized.includes("message") || normalized.includes("enquiry")) return "/(landlord)/(tabs)/enquiries";
    if (normalized.includes("payment") || normalized.includes("wallet")) return "/(landlord)/subscription";
    if (normalized.includes("support")) return "/support";
    return "/(landlord)/(tabs)/dashboard";
  }

  if (normalized.includes("trust")) return "/admin/reports";
  if (normalized.includes("role_application")) return "/admin";
  return "/admin";
}

export function notificationTargetForRole(role: AppNotificationRole, type?: string | null, data?: Record<string, unknown> | null): Href {
  const normalized = String(type ?? "").toLowerCase();
  const orderId = readNotificationValue(data, "orderId") ?? readNotificationValue(data, "relatedOrderId");
  const enquiryId = readNotificationValue(data, "enquiryId");
  const listingId = readNotificationValue(data, "listingId");

  if (role === "agent" && orderId && (normalized.includes("delivery") || normalized.includes("order"))) {
    return {
      pathname: "/delivery/[orderId]",
      params: { orderId },
    };
  }

  if (role === "student" && enquiryId && (normalized.includes("message") || normalized.includes("enquiry"))) {
    return {
      pathname: "/(student)/chat/[enquiryId]",
      params: { enquiryId },
    };
  }

  if (role === "landlord") {
    if (enquiryId && (normalized.includes("message") || normalized.includes("enquiry"))) {
      return {
        pathname: "/(landlord)/chat/[enquiryId]",
        params: { enquiryId },
      };
    }

    if (listingId) {
      return {
        pathname: "/(landlord)/listing/[id]",
        params: { id: listingId },
      };
    }
  }

  return notificationHrefForRole(role, type);
}
