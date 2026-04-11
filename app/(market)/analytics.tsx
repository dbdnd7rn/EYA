import React, { useMemo, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";

function money(value: number) {
  return `MWK ${Math.round(value).toLocaleString()}`;
}

type Mode = "weekly" | "monthly";

export default function SellerAnalyticsPage() {
  const router = useRouter();
  const { workspace, metrics } = useSellerWorkspace();
  const [mode, setMode] = useState<Mode>("weekly");

  const chart = useMemo(() => {
    if (mode === "weekly") return metrics.weeklyBars;
    return [
      { label: "W1", value: metrics.thisWeekRevenue * 0.62 },
      { label: "W2", value: metrics.thisWeekRevenue * 0.78 },
      { label: "W3", value: metrics.thisWeekRevenue * 0.88 },
      { label: "W4", value: metrics.thisWeekRevenue },
    ];
  }, [metrics.thisWeekRevenue, metrics.weeklyBars, mode]);

  const max = Math.max(...chart.map((item) => item.value), 1);

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="orders" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ChevronLeft size={22} color="#102a54" />
          </Pressable>
          <Text style={styles.title}>Analytics</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.segmented}>
          {(["weekly", "monthly"] as Mode[]).map((value) => {
            const active = value === mode;
            return (
              <Pressable key={value} style={[styles.segmentBtn, active && styles.segmentBtnActive]} onPress={() => setMode(value)}>
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{value === "weekly" ? "Weekly" : "Monthly"}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>{mode === "weekly" ? "This Week" : "Monthly Projection"}</Text>
          <Text style={styles.heroValue}>{money(metrics.thisWeekRevenue)}</Text>
          <Text style={styles.heroSub}>{workspace.vendor?.name ?? "Seller"}</Text>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartBars}>
            {chart.map((item) => (
              <View key={item.label} style={styles.barWrap}>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { height: `${Math.max(16, (item.value / max) * 100)}%` }]} />
                </View>
                <Text style={styles.barLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.metricsRow}>
          <Metric label="Orders" value={String(workspace.orders.length)} />
          <Metric label="Earnings" value={money(metrics.thisWeekRevenue)} />
          <Metric label="Items Sold" value={String(metrics.deliveredCount)} />
        </View>

        <View style={styles.historyCard}>
          <Text style={styles.historyTitle}>Payout history</Text>
          {metrics.payoutHistory.length ? (
            <View style={styles.historyList}>
              {metrics.payoutHistory.slice(0, 8).map((row) => (
                <View key={row.id} style={styles.historyRow}>
                  <View style={styles.historyMeta}>
                    <Text style={styles.historyLabel}>{row.label}</Text>
                    <Text style={styles.historySub}>
                      {row.customerName} | {new Date(row.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyAmount}>{money(row.amountMwk)}</Text>
                    <Text
                      style={[
                        styles.historyStatus,
                        row.status === "paid" ? styles.historyStatusPaid : row.status === "processing" ? styles.historyStatusProcessing : styles.historyStatusPending,
                      ]}
                    >
                      {row.status}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyHistory}>Delivered orders will show up here as payout history.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f1fb" },
  content: { padding: 18, paddingBottom: 42, gap: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  title: { color: "#102a54", fontSize: 26, fontWeight: "900" },
  headerSpacer: { width: 42, height: 42 },
  segmented: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    borderRadius: 20,
    padding: 6,
  },
  segmentBtn: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 16 },
  segmentBtnActive: { backgroundColor: "#102a54" },
  segmentText: { color: "#6d7a99", fontWeight: "900" },
  segmentTextActive: { color: "#fff" },
  heroCard: {
    borderRadius: 28,
    backgroundColor: "#dceafe",
    borderWidth: 1,
    borderColor: "#cfe2ff",
    padding: 22,
    gap: 6,
  },
  heroLabel: { color: "#5f78a9", fontWeight: "800", fontSize: 13 },
  heroValue: { color: "#102a54", fontWeight: "900", fontSize: 38 },
  heroSub: { color: "#5f78a9", fontWeight: "700" },
  chartCard: {
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 18,
  },
  chartBars: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 220, gap: 10 },
  barWrap: { flex: 1, alignItems: "center", gap: 10 },
  barTrack: { width: "100%", flex: 1, justifyContent: "flex-end", borderRadius: 999, backgroundColor: "#eef3ff", overflow: "hidden" },
  barFill: { width: "100%", borderRadius: 999, backgroundColor: "#7cb6ff", minHeight: 22 },
  barLabel: { color: "#7c88a8", fontWeight: "800", fontSize: 11 },
  metricsRow: { flexDirection: "row", gap: 10 },
  metricCard: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 14,
    gap: 4,
  },
  metricLabel: { color: "#7c88a8", fontWeight: "800", fontSize: 12 },
  metricValue: { color: "#102a54", fontWeight: "900", fontSize: 20 },
  historyCard: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 16,
    gap: 12,
  },
  historyTitle: { color: "#102a54", fontWeight: "900", fontSize: 20 },
  historyList: { gap: 12 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 18,
    backgroundColor: "#f7f8fe",
    borderWidth: 1,
    borderColor: "#e8ecf8",
    padding: 12,
  },
  historyMeta: { flex: 1, gap: 4 },
  historyLabel: { color: "#102a54", fontWeight: "800", fontSize: 14 },
  historySub: { color: "#7c88a8", fontWeight: "700", fontSize: 12 },
  historyRight: { alignItems: "flex-end", gap: 4 },
  historyAmount: { color: "#102a54", fontWeight: "900", fontSize: 15 },
  historyStatus: { fontWeight: "900", fontSize: 11, textTransform: "capitalize" },
  historyStatusPaid: { color: "#0d7b45" },
  historyStatusProcessing: { color: "#4869a1" },
  historyStatusPending: { color: "#c67a00" },
  emptyHistory: { color: "#7c88a8", fontWeight: "700", fontSize: 13 },
});
