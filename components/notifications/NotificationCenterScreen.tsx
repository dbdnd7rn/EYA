import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, BellRing, ClipboardList, CreditCard, LifeBuoy, MessageCircle, ShieldAlert, Truck } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { AppNotificationRole, AppNotificationRow, listNotificationsForUser, markAllNotificationsRead, markNotificationsRead, notificationTargetForRole } from "@/lib/appNotifications";
import { goBackOrFallback } from "@/lib/navigation";
import { formatCacheTime, getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { useAuth } from "@/providers/AuthProvider";
import { useNotificationInbox } from "@/providers/NotificationInboxProvider";

type NotificationCenterScreenProps = {
  role: AppNotificationRole;
  title?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
};

function iconForType(type?: string | null) {
  const normalized = String(type ?? "").toLowerCase();
  if (normalized.includes("message")) return MessageCircle;
  if (normalized.includes("support")) return LifeBuoy;
  if (normalized.includes("trust")) return ShieldAlert;
  if (normalized.includes("delivery")) return Truck;
  if (normalized.includes("payment") || normalized.includes("wallet")) return CreditCard;
  return ClipboardList;
}

function fallbackRouteForRole(role: AppNotificationRole) {
  if (role === "student") return "/(student)/(tabs)/orders";
  if (role === "vendor") return "/(market)/(tabs)/orders";
  if (role === "agent") return "/(agent)/(tabs)/deliveries";
  if (role === "landlord") return "/(landlord)/(tabs)/dashboard";
  return "/admin";
}

function formatNotificationDate(value?: string | null) {
  if (!value) return "Just now";
  try {
    return new Date(value).toLocaleString([], {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Just now";
  }
}

function readableType(type?: string | null) {
  const normalized = String(type ?? "update").replace(/_/g, " ").trim();
  return normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Update";
}

export default function NotificationCenterScreen({
  role,
  title = "Notifications",
  emptyTitle = "No notifications yet",
  emptySubtitle = "Important updates will appear here.",
}: NotificationCenterScreenProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { unreadCount, markAllRead } = useNotificationInbox();
  const [rows, setRows] = React.useState<AppNotificationRow[]>([]);
  const [selectedRow, setSelectedRow] = React.useState<AppNotificationRow | null>(null);
  const [cacheLabel, setCacheLabel] = React.useState<string | null>(null);

  const cacheKey = user?.id ? `notifications_center_${role}_${user.id}` : null;

  React.useEffect(() => {
    let active = true;

    const run = async () => {
      if (!user?.id) return;

      if (cacheKey) {
        const cached = await getCachedJson<AppNotificationRow[]>(cacheKey);
        if (!active) return;
        if (cached?.data?.length) {
          setRows(cached.data);
          setCacheLabel(formatCacheTime(cached.ts));
        }
      }

      try {
        const next = await listNotificationsForUser(user.id);
        if (!active) return;
        setRows(next);
        setCacheLabel("Live");
        if (cacheKey) await setCachedJson(cacheKey, next);
        await markAllNotificationsRead(user.id);
        await markAllRead();
        if (active) {
          setRows((current) => current.map((row) => ({ ...row, is_read: true })));
        }
      } catch {
        // Keep cached rows if the refresh fails.
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [cacheKey, user?.id]);

  const openNotification = React.useCallback((row: AppNotificationRow) => {
    setSelectedRow({ ...row, is_read: true });
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, is_read: true } : item)));
    void markNotificationsRead([row.id]).catch(() => undefined);
  }, []);

  const openRelatedPage = React.useCallback((row: AppNotificationRow) => {
    router.push(notificationTargetForRole(role, row.type, row.data) as any);
  }, [role, router]);

  if (selectedRow) {
    const Icon = iconForType(selectedRow.type);
    return (
      <SafeAreaView style={styles.root}>
        <SoftPageGlow variant="account" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable style={styles.circleBtn} onPress={() => setSelectedRow(null)}>
              <ArrowLeft size={20} color="#0e2756" />
            </Pressable>
            <Text style={styles.title}>Notification</Text>
            <View style={{ width: 50 }} />
          </View>

          <View style={styles.detailCard}>
            <View style={styles.detailIconWrap}>
              <Icon size={28} color="#0e2756" />
            </View>
            <Text style={styles.detailType}>{readableType(selectedRow.type)}</Text>
            <Text style={styles.detailTitle}>{selectedRow.title || "Update"}</Text>
            <Text style={styles.detailMessage}>{selectedRow.message || "You have a new notification."}</Text>
            <View style={styles.detailMetaBox}>
              <Text style={styles.detailMetaLabel}>Received</Text>
              <Text style={styles.detailMetaText}>{formatNotificationDate(selectedRow.created_at)}</Text>
            </View>
            {selectedRow.priority ? (
              <View style={styles.detailMetaBox}>
                <Text style={styles.detailMetaLabel}>Priority</Text>
                <Text style={styles.detailMetaText}>{readableType(selectedRow.priority)}</Text>
              </View>
            ) : null}
          </View>

          <Pressable style={styles.primaryAction} onPress={() => openRelatedPage(selectedRow)}>
            <Text style={styles.primaryActionText}>Open related page</Text>
          </Pressable>
          <Pressable style={styles.secondaryAction} onPress={() => setSelectedRow(null)}>
            <Text style={styles.secondaryActionText}>Back to notifications</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="account" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.circleBtn} onPress={() => goBackOrFallback(router, fallbackRouteForRole(role) as any)}>
            <ArrowLeft size={20} color="#0e2756" />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        </View>

        {cacheLabel ? <Text style={styles.cacheText}>{cacheLabel}</Text> : null}

        {rows.map((row) => {
          const Icon = iconForType(row.type);
          return (
            <Pressable key={row.id} style={styles.card} onPress={() => openNotification(row)}>
              <View style={styles.iconWrap}>
                <Icon size={18} color="#0e2756" />
              </View>
              <View style={styles.copy}>
                <Text style={styles.cardTitle}>{row.title || "Update"}</Text>
                <Text style={styles.cardBody} numberOfLines={2}>{row.message || "You have a new notification."}</Text>
                <Text style={styles.cardHint}>Tap to view details</Text>
              </View>
              <Text style={styles.timeText}>{row.created_at ? new Date(row.created_at).toLocaleDateString() : "-"}</Text>
            </Pressable>
          );
        })}

        {!rows.length ? (
          <View style={styles.emptyCard}>
            <BellRing size={28} color="#8390aa" />
            <Text style={styles.emptyTitle}>{emptyTitle}</Text>
            <Text style={styles.emptySub}>{emptySubtitle}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  circleBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#eef1fb", alignItems: "center", justifyContent: "center" },
  title: { color: "#0e2756", fontSize: 24, fontWeight: "900" },
  badge: { minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 8, backgroundColor: "#ff0f64", alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontWeight: "900" },
  cacheText: { color: "#7b86a2", fontSize: 12, fontWeight: "700" },
  card: { borderRadius: 24, backgroundColor: "#fff", borderWidth: 1, borderColor: "#eef1fb", padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#eef1fb", alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 4 },
  cardTitle: { color: "#0e2756", fontSize: 15, fontWeight: "800" },
  cardBody: { color: "#74819c", fontSize: 13, fontWeight: "600" },
  cardHint: { color: "#5e73dd", fontSize: 12, fontWeight: "800" },
  timeText: { color: "#9aa5bb", fontSize: 12, fontWeight: "700" },
  emptyCard: { borderRadius: 28, backgroundColor: "#fff", borderWidth: 1, borderColor: "#eef1fb", alignItems: "center", justifyContent: "center", gap: 8, padding: 26 },
  emptyTitle: { color: "#0e2756", fontSize: 18, fontWeight: "900" },
  emptySub: { color: "#74819c", fontSize: 13, fontWeight: "600", textAlign: "center" },
  detailCard: { borderRadius: 30, backgroundColor: "#fff", borderWidth: 1, borderColor: "#eef1fb", alignItems: "center", padding: 22, gap: 12, shadowColor: "#8492c2", shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  detailIconWrap: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#eef1fb", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  detailType: { color: "#5e73dd", fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  detailTitle: { color: "#0e2756", fontSize: 24, lineHeight: 30, fontWeight: "900", textAlign: "center" },
  detailMessage: { color: "#5f6b84", fontSize: 15, lineHeight: 23, fontWeight: "700", textAlign: "center" },
  detailMetaBox: { alignSelf: "stretch", borderRadius: 18, backgroundColor: "#f7f8fe", borderWidth: 1, borderColor: "#eef1fb", padding: 14, gap: 4 },
  detailMetaLabel: { color: "#8a94af", fontSize: 11, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase" },
  detailMetaText: { color: "#0e2756", fontSize: 14, fontWeight: "800" },
  primaryAction: { minHeight: 56, borderRadius: 18, backgroundColor: "#5e73dd", alignItems: "center", justifyContent: "center" },
  primaryActionText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  secondaryAction: { minHeight: 54, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "#eef1fb", alignItems: "center", justifyContent: "center" },
  secondaryActionText: { color: "#0e2756", fontSize: 15, fontWeight: "900" },
});
