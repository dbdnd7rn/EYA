import React from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, BellRing, ClipboardList, CreditCard, LifeBuoy, MessageCircle, ShieldAlert, Truck } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { AppNotificationRole, AppNotificationRow, listNotificationsForUser, markAllNotificationsRead, notificationTargetForRole } from "@/lib/appNotifications";
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
            <Pressable key={row.id} style={styles.card} onPress={() => router.push(notificationTargetForRole(role, row.type, row.data) as any)}>
              <View style={styles.iconWrap}>
                <Icon size={18} color="#0e2756" />
              </View>
              <View style={styles.copy}>
                <Text style={styles.cardTitle}>{row.title || "Update"}</Text>
                <Text style={styles.cardBody}>{row.message || "You have a new notification."}</Text>
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
  timeText: { color: "#9aa5bb", fontSize: 12, fontWeight: "700" },
  emptyCard: { borderRadius: 28, backgroundColor: "#fff", borderWidth: 1, borderColor: "#eef1fb", alignItems: "center", justifyContent: "center", gap: 8, padding: 26 },
  emptyTitle: { color: "#0e2756", fontSize: 18, fontWeight: "900" },
  emptySub: { color: "#74819c", fontSize: 13, fontWeight: "600", textAlign: "center" },
});
