import React, { useMemo, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, CalendarClock, ChefHat, Clock3, Search } from "lucide-react-native";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import { getRestaurantSessionStatus, getSuggestedRestaurantSession, listRestaurantSessionOrders, type RestaurantSession } from "@/lib/restaurantSessions";

type SessionType = RestaurantSession;

function fmtDate(now = new Date()) {
  return now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

function money(value: number) {
  return `MWK ${Math.round(value).toLocaleString()}`;
}

export default function RestaurantSessionsPage() {
  const router = useRouter();
  const { workspace, metrics, updateVendorProfile } = useSellerWorkspace("food");
  const [updatingOnline, setUpdatingOnline] = useState(false);

  const todayOrders = useMemo(
    () => workspace.orders.filter((row) => new Date(row.created_at).toDateString() === new Date().toDateString() && row.status !== "cancelled"),
    [workspace.orders],
  );

  const lunchRows = useMemo(() => listRestaurantSessionOrders(todayOrders, "lunch"), [todayOrders]);
  const dinnerRows = useMemo(() => listRestaurantSessionOrders(todayOrders, "dinner"), [todayOrders]);
  const lunchRevenue = lunchRows.reduce((sum, row) => sum + Number(row.total_mwk), 0);
  const dinnerRevenue = dinnerRows.reduce((sum, row) => sum + Number(row.total_mwk), 0);
  const activeOrders = workspace.orders.filter((row) => row.status !== "cancelled" && row.status !== "delivered").length;
  const online = workspace.vendor?.is_active ?? true;

  const openSession = (session: SessionType) => {
    router.push({ pathname: "/(market)/(tabs)/orders", params: { session } });
  };

  const toggleOnline = async () => {
    if (!workspace.vendor) {
      router.push("/(market)/setup");
      return;
    }
    try {
      setUpdatingOnline(true);
      await updateVendorProfile({ is_active: !online });
    } catch (err: any) {
      Alert.alert("Update failed", err?.message ?? "Could not update online status.");
    } finally {
      setUpdatingOnline(false);
    }
  };

  const handleSearch = () => {
    if (!workspace.hasVendor) {
      router.push("/(market)/setup");
      return;
    }
    router.push("/(market)/(tabs)/products");
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Today</Text>
            <Text style={styles.subtitle}>{fmtDate()}</Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={handleSearch}>
            <Search size={19} color="#27305a" />
          </Pressable>
        </View>

        <View style={styles.onlineCard}>
          <View style={styles.onlineLeft}>
            <View style={[styles.onlineDot, online ? styles.onlineDotOn : styles.onlineDotOff]} />
            <Text style={styles.onlineLabel}>{online ? "You are online" : "You are offline"}</Text>
          </View>
          <Pressable style={[styles.onlineToggle, online ? styles.onlineToggleOn : styles.onlineToggleOff]} onPress={() => void toggleOnline()} disabled={updatingOnline}>
            <Text style={styles.onlineToggleText}>{updatingOnline ? "..." : online ? "Online" : "Offline"}</Text>
          </Pressable>
        </View>

        {!workspace.hasVendor ? (
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>Finish restaurant setup</Text>
            <Text style={styles.setupSub}>Create your restaurant profile before opening sessions and receiving orders.</Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.push("/(market)/setup")}>
              <Text style={styles.primaryBtnText}>Open setup</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <SessionCard
              accent="pink"
              ctaLabel="Open Lunch Session"
              onPress={() => openSession("lunch")}
              orders={lunchRows.length}
              revenue={lunchRevenue}
              subtitle={getRestaurantSessionStatus("lunch").label}
              title="Lunch Session"
            />

            <SessionCard
              accent="blue"
              ctaLabel="Open Dinner Session"
              onPress={() => openSession("dinner")}
              orders={dinnerRows.length}
              revenue={dinnerRevenue}
              subtitle={getRestaurantSessionStatus("dinner").label}
              title="Dinner Session"
            />
          </>
        )}

        <View style={styles.metricsRow}>
          <MetricCard label="Active orders" value={String(activeOrders)} />
          <MetricCard label="Ready now" value={String(metrics.readyCount)} />
          <MetricCard label="Delivered" value={String(metrics.deliveredCount)} />
        </View>

        <View style={styles.quickRow}>
          <QuickAction label="Menu" icon={<ChefHat size={17} color="#27305a" />} onPress={() => router.push("/(market)/(tabs)/products")} />
          <QuickAction
            label="Orders"
            icon={<CalendarClock size={17} color="#27305a" />}
            onPress={() => router.push({ pathname: "/(market)/(tabs)/orders", params: { session: getSuggestedRestaurantSession() } })}
          />
          <QuickAction label="Alerts" icon={<Bell size={17} color="#27305a" />} onPress={() => router.push("/(market)/notifications")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SessionCard({
  accent,
  ctaLabel,
  onPress,
  orders,
  revenue,
  subtitle,
  title,
}: {
  accent: "pink" | "blue";
  ctaLabel: string;
  onPress: () => void;
  orders: number;
  revenue: number;
  subtitle: string;
  title: string;
}) {
  return (
    <Pressable style={[styles.sessionCard, accent === "pink" ? styles.sessionCardPink : styles.sessionCardBlue]} onPress={onPress}>
      <View style={styles.sessionTop}>
        <Text style={styles.sessionTitle}>{title}</Text>
        <Text style={styles.sessionSub}>{subtitle}</Text>
      </View>
      <View style={styles.sessionDivider} />
      <View style={styles.sessionBottom}>
        <View>
          <Text style={styles.sessionValue}>{orders} orders</Text>
          <Text style={styles.sessionRevenue}>{money(revenue)}</Text>
        </View>
        <View style={styles.sessionPill}>
          <Clock3 size={14} color="#27305a" />
          <Text style={styles.sessionPillText}>{ctaLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function QuickAction({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickCard} onPress={onPress}>
      <View style={styles.quickIconWrap}>{icon}</View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1eff9" },
  content: { padding: 18, paddingBottom: 120, gap: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerCopy: { gap: 4 },
  title: { color: "#232c54", fontSize: 38, fontWeight: "900" },
  subtitle: { color: "#697399", fontSize: 16, fontWeight: "700" },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#dde0f2",
  },
  onlineCard: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#dde0f2",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  onlineLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  onlineDot: { width: 12, height: 12, borderRadius: 6 },
  onlineDotOn: { backgroundColor: "#60d386" },
  onlineDotOff: { backgroundColor: "#b4b9cf" },
  onlineLabel: { color: "#232c54", fontSize: 17, fontWeight: "800" },
  onlineToggle: { borderRadius: 999, minWidth: 90, alignItems: "center", paddingVertical: 9, paddingHorizontal: 12 },
  onlineToggleOn: { backgroundColor: "#29456d" },
  onlineToggleOff: { backgroundColor: "#8a90ab" },
  onlineToggleText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  setupCard: {
    borderRadius: 28,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dde0f2",
    padding: 18,
    gap: 10,
  },
  setupTitle: { color: "#232c54", fontSize: 22, fontWeight: "900" },
  setupSub: { color: "#697399", fontSize: 14, fontWeight: "700", lineHeight: 20 },
  primaryBtn: { borderRadius: 16, backgroundColor: "#2f3b6c", alignItems: "center", paddingVertical: 14, marginTop: 4 },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  sessionCard: {
    borderRadius: 30,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    shadowColor: "#a8b0d6",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  sessionCardPink: { backgroundColor: "rgba(255,255,255,0.98)", borderColor: "#dfdff0" },
  sessionCardBlue: { backgroundColor: "rgba(255,255,255,0.98)", borderColor: "#d9e2f7" },
  sessionTop: { gap: 4 },
  sessionTitle: { color: "#232c54", fontSize: 30, fontWeight: "900" },
  sessionSub: { color: "#7480a3", fontSize: 15, fontWeight: "700" },
  sessionDivider: { borderTopWidth: 1, borderTopColor: "#edf0f8" },
  sessionBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sessionValue: { color: "#232c54", fontSize: 19, fontWeight: "900" },
  sessionRevenue: { color: "#56648e", fontSize: 14, fontWeight: "700", marginTop: 2 },
  sessionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dbe2f5",
    backgroundColor: "#f5f7ff",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  sessionPillText: { color: "#27305a", fontSize: 12, fontWeight: "900" },
  metricsRow: { flexDirection: "row", gap: 10 },
  metricCard: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#dde0f2",
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
  },
  metricValue: { color: "#232c54", fontSize: 20, fontWeight: "900" },
  metricLabel: { color: "#7480a3", fontSize: 12, fontWeight: "700" },
  quickRow: { flexDirection: "row", gap: 10 },
  quickCard: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#dde0f2",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  quickIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef1fb",
  },
  quickLabel: { color: "#27305a", fontSize: 13, fontWeight: "900" },
});
