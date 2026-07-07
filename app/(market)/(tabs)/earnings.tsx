import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Bell, ChartLine, Search } from "lucide-react-native";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import { getSuggestedRestaurantSession, listRestaurantSessionOrders } from "@/lib/restaurantSessions";

type WindowMode = "today" | "week" | "month";

function money(value: number) {
  return `MWK ${Math.round(value).toLocaleString()}`;
}

function withinRange(iso: string, mode: WindowMode) {
  const now = new Date();
  const date = new Date(iso);
  if (mode === "today") return date.toDateString() === now.toDateString();
  if (mode === "week") {
    const min = new Date(now);
    min.setDate(now.getDate() - 6);
    min.setHours(0, 0, 0, 0);
    return date >= min;
  }
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return date >= monthStart;
}

export default function RestaurantEarningsPage() {
  const router = useRouter();
  const { workspace, metrics, setOrderStatus } = useSellerWorkspace("food");
  const [mode, setMode] = useState<WindowMode>("today");

  const rows = useMemo(() => workspace.orders.filter((row) => withinRange(row.created_at, mode) && row.status !== "cancelled"), [mode, workspace.orders]);
  const revenue = rows.reduce((sum, row) => sum + Number(row.total_mwk), 0);
  const deliveredRows = rows.filter((row) => row.status === "delivered");
  const pendingOrder = workspace.orders.find((row) => row.status === "pending");
  const lunchRevenue = listRestaurantSessionOrders(rows, "lunch").reduce((sum, row) => sum + Number(row.total_mwk), 0);
  const dinnerRevenue = listRestaurantSessionOrders(rows, "dinner").reduce((sum, row) => sum + Number(row.total_mwk), 0);

  const acceptPending = async () => {
    if (!pendingOrder) return;
    try {
      await setOrderStatus(pendingOrder.id, "preparing");
    } catch (err: any) {
      Alert.alert("Update failed", err?.message ?? "Could not accept this order.");
    }
  };

  const declinePending = () => {
    if (!pendingOrder) return;
    Alert.alert("Decline order", "Decline latest pending order?", [
      { text: "Cancel", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: () => void setOrderStatus(pendingOrder.id, "cancelled") },
    ]);
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Earnings</Text>
          <View style={styles.headerActions}>
            <Pressable style={styles.iconBtn} onPress={() => router.push("/(market)/analytics")}>
              <Search size={18} color="#232c54" />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => router.push("/(market)/notifications")}>
              <Bell size={18} color="#232c54" />
            </Pressable>
          </View>
        </View>

        <View style={styles.modeRow}>
          {(["today", "week", "month"] as WindowMode[]).map((value) => {
            const active = value === mode;
            return (
              <Pressable key={value} style={[styles.modeBtn, active && styles.modeBtnActive]} onPress={() => setMode(value)}>
                <Text style={[styles.modeText, active && styles.modeTextActive]}>{value === "today" ? "Today" : value === "week" ? "Week" : "Month"}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>{mode === "today" ? "Today total" : mode === "week" ? "This week" : "This month"}</Text>
          <Text style={styles.heroValue}>{money(revenue)}</Text>
          <Text style={styles.heroSub}>{rows.length} orders in selected range</Text>
        </View>

        <View style={styles.summaryRow}>
          <StatCard label="Lunch" value={money(lunchRevenue)} />
          <StatCard label="Dinner" value={money(dinnerRevenue)} />
        </View>

        {pendingOrder ? (
          <View style={styles.requestCard}>
            <Text style={styles.requestTitle}>New delivery request</Text>
            <Text style={styles.requestSub}>Order #{pendingOrder.id.slice(0, 6)} - {money(Number(pendingOrder.total_mwk))}</Text>
            <View style={styles.requestActions}>
              <Pressable style={styles.acceptBtn} onPress={() => void acceptPending()}>
                <Text style={styles.acceptText}>Accept</Text>
              </Pressable>
              <Pressable style={styles.declineBtn} onPress={declinePending}>
                <Text style={styles.declineText}>Decline</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.requestCard}>
            <Text style={styles.requestTitle}>No pending requests</Text>
            <Text style={styles.requestSub}>New incoming orders will appear here.</Text>
          </View>
        )}

        <View style={styles.recentCard}>
          <Text style={styles.recentTitle}>Recent jobs</Text>
          {deliveredRows.length ? (
            deliveredRows.slice(0, 6).map((row) => (
              <Pressable key={row.id} style={styles.recentRow} onPress={() => router.push({ pathname: "/(market)/order/[id]", params: { id: row.id } })}>
                <Text style={styles.recentRoute}>Order #{row.id.slice(0, 6)}</Text>
                <Text style={styles.recentPrice}>{money(Number(row.total_mwk))}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.emptyText}>Delivered orders will show in recent jobs.</Text>
          )}
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={styles.actionBtn} onPress={() => router.push("/(market)/analytics")}>
            <ChartLine size={17} color="#23356a" />
            <Text style={styles.actionText}>Analytics</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => router.push({ pathname: "/(market)/(tabs)/orders", params: { session: getSuggestedRestaurantSession() } })}>
            <Text style={styles.actionText}>Open Session</Text>
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => router.push("/(market)/messages")}>
            <Text style={styles.actionText}>Messages</Text>
          </Pressable>
        </View>

        <View style={styles.summaryRow}>
          <StatCard label="Delivered" value={String(metrics.deliveredCount)} />
          <StatCard label="This Week" value={money(metrics.thisWeekRevenue)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1eff9" },
  content: { padding: 18, paddingBottom: 126, gap: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#232c54", fontSize: 38, fontWeight: "900" },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#dde0f2",
  },
  modeRow: { flexDirection: "row", gap: 8 },
  modeBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d9deef",
    backgroundColor: "#f8f9ff",
    alignItems: "center",
    paddingVertical: 10,
  },
  modeBtnActive: { backgroundColor: "#2a3d70", borderColor: "#2a3d70" },
  modeText: { color: "#63709a", fontWeight: "800", fontSize: 14 },
  modeTextActive: { color: "#fff" },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.97)",
    padding: 16,
    gap: 6,
  },
  heroLabel: { color: "#7180a7", fontSize: 14, fontWeight: "700" },
  heroValue: { color: "#232c54", fontSize: 34, fontWeight: "900" },
  heroSub: { color: "#7180a7", fontSize: 13, fontWeight: "700" },
  requestCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.97)",
    padding: 16,
    gap: 10,
  },
  requestTitle: { color: "#232c54", fontSize: 22, fontWeight: "900" },
  requestSub: { color: "#6d79a1", fontSize: 14, fontWeight: "700" },
  requestActions: { flexDirection: "row", gap: 10 },
  acceptBtn: { flex: 1, borderRadius: 12, backgroundColor: "#2a3d70", alignItems: "center", paddingVertical: 11 },
  acceptText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  declineBtn: { flex: 1, borderRadius: 12, backgroundColor: "#f8f9ff", borderWidth: 1, borderColor: "#d9deef", alignItems: "center", paddingVertical: 11 },
  declineText: { color: "#5d6a96", fontWeight: "900", fontSize: 15 },
  recentCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.97)",
    padding: 16,
    gap: 10,
  },
  recentTitle: { color: "#232c54", fontSize: 20, fontWeight: "900" },
  recentRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e4e8f6",
    backgroundColor: "#f8f9ff",
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  recentRoute: { color: "#23356a", fontSize: 14, fontWeight: "800", flex: 1 },
  recentPrice: { color: "#23356a", fontSize: 15, fontWeight: "900" },
  emptyText: { color: "#7381a8", fontSize: 14, fontWeight: "700" },
  actionsRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
    flexDirection: "row",
  },
  actionText: { color: "#23356a", fontWeight: "800", fontSize: 13 },
  summaryRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    paddingVertical: 13,
    gap: 2,
  },
  statValue: { color: "#232c54", fontWeight: "900", fontSize: 16 },
  statLabel: { color: "#7480a3", fontWeight: "700", fontSize: 12 },
});
