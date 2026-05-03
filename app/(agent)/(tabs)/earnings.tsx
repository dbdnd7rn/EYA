import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Clock3, Search, WalletCards } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useAgentWorkspace } from "@/components/agent/useAgentWorkspace";
import { useAuth } from "@/providers/AuthProvider";

type EarningsRange = "today" | "week" | "month";

function kwacha(value: number) {
  return `MWK ${Math.round(value || 0).toLocaleString("en-MW")}`;
}

function formatRoute(from: string, to: string) {
  return `${from} -> ${to}`;
}

export default function AgentEarningsScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { workspace, metrics, loading, error } = useAgentWorkspace();
  const currentJob = workspace.currentJob;
  const [range, setRange] = useState<EarningsRange>("today");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, router, user]);

  const summary = useMemo(() => {
    if (range === "today") {
      return {
        amount: metrics.todayEarnings,
        trips: metrics.todayCount,
        label: "Today",
      };
    }
    if (range === "week") {
      return {
        amount: metrics.weekEarnings,
        trips: metrics.weekCount,
        label: "This week",
      };
    }
    return {
      amount: metrics.monthEarnings,
      trips: metrics.monthCount,
      label: "This month",
    };
  }, [metrics.monthCount, metrics.monthEarnings, metrics.todayCount, metrics.todayEarnings, metrics.weekCount, metrics.weekEarnings, range]);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <SoftPageGlow variant="orders" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2c3068" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="orders" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Earnings</Text>
          <Pressable style={styles.circleAction} onPress={() => router.push("/(agent)/notifications")}>
            <Search size={18} color="#2c3068" />
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          {(["today", "week", "month"] as EarningsRange[]).map((item) => {
            const active = item === range;
            return (
              <Pressable key={item} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setRange(item)}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {item === "today" ? "Today" : item === "week" ? "Week" : "Month"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}
        {workspace.cacheLabel ? <Text style={styles.cacheText}>Last sync: {workspace.cacheLabel}</Text> : null}

        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <Text style={styles.heroLabel}>{summary.label}</Text>
          <Text style={styles.heroValue}>{kwacha(summary.amount)}</Text>
          <Text style={styles.heroSub}>{summary.trips} completed deliveries</Text>
        </View>

        <View style={styles.statsRow}>
          <StatCard label="All time" value={kwacha(metrics.totalEarnings)} />
          <StatCard label="Completed" value={`${metrics.completedCount}`} />
        </View>

        {currentJob ? (
          <Pressable
            style={styles.currentJobCard}
            onPress={() => router.push({ pathname: "/delivery/[orderId]", params: { orderId: currentJob.orderId } })}
          >
            <View style={styles.currentJobTop}>
              <WalletCards size={18} color="#5d66b5" />
              <Text style={styles.currentJobTitle}>Current job</Text>
            </View>
            <Text style={styles.currentJobRoute}>{formatRoute(currentJob.vendorName, currentJob.dropoffLabel)}</Text>
            <View style={styles.currentJobMeta}>
              <Text style={styles.currentJobMetaText}>{kwacha(currentJob.payoutMwk)}</Text>
              <Text style={styles.currentJobMetaText}>{currentJob.etaMinutes ? `${currentJob.etaMinutes} min` : "ETA pending"}</Text>
            </View>
          </Pressable>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Recent jobs</Text>
            <Clock3 size={16} color="#73779b" />
          </View>

          {workspace.completedJobs.length ? (
            workspace.completedJobs.slice(0, 6).map((job) => (
              <Pressable
                key={job.id}
                style={styles.jobRow}
                onPress={() => router.push({ pathname: "/delivery/[orderId]", params: { orderId: job.orderId } })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobRoute}>{formatRoute(job.vendorName, job.dropoffLabel)}</Text>
                  <Text style={styles.jobSub}>{new Date(job.deliveredAt ?? job.updatedAt).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.jobAmount}>{kwacha(job.payoutMwk)}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.emptyText}>Completed deliveries will appear here once you start riding.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3eefb" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 130, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#262a63", fontSize: 25, fontWeight: "900" },
  circleAction: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "#ebe6f8",
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: { flexDirection: "row", gap: 10 },
  filterChip: {
    minWidth: 86,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "#ebe7f8",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  filterChipActive: { backgroundColor: "#4b57ab", borderColor: "#4b57ab" },
  filterChipText: { color: "#6d7298", fontSize: 14, fontWeight: "800" },
  filterChipTextActive: { color: "#fff" },
  noticeCard: { borderRadius: 18, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd7e5", padding: 12 },
  noticeText: { color: "#b0003a", fontSize: 13, fontWeight: "800" },
  cacheText: { color: "#787393", fontSize: 12, fontWeight: "700" },
  heroCard: {
    overflow: "hidden",
    borderRadius: 30,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ece7f8",
    padding: 20,
    gap: 8,
  },
  heroGlow: {
    position: "absolute",
    left: -20,
    top: -20,
    width: 250,
    height: 170,
    borderBottomRightRadius: 130,
    backgroundColor: "rgba(126,125,210,0.34)",
  },
  heroLabel: { color: "#6f72a0", fontSize: 14, fontWeight: "800", textTransform: "uppercase" },
  heroValue: { color: "#2a2e63", fontSize: 30, fontWeight: "900" },
  heroSub: { color: "#6f7393", fontSize: 14, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "#ece7f8",
    padding: 16,
    gap: 6,
  },
  statLabel: { color: "#8a8fb1", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  statValue: { color: "#2a2e63", fontSize: 20, fontWeight: "900" },
  currentJobCard: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderColor: "#ece7f8",
    padding: 16,
    gap: 8,
  },
  currentJobTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  currentJobTitle: { color: "#2a2e63", fontSize: 16, fontWeight: "900" },
  currentJobRoute: { color: "#50557f", fontSize: 15, fontWeight: "700", lineHeight: 21 },
  currentJobMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  currentJobMetaText: { color: "#6e7397", fontSize: 13, fontWeight: "800" },
  sectionCard: {
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "#ece7f8",
    padding: 16,
    gap: 14,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: "#2a2e63", fontSize: 18, fontWeight: "900" },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0edf8",
  },
  jobRoute: { color: "#363b68", fontSize: 15, fontWeight: "800" },
  jobSub: { color: "#8b8ead", fontSize: 12, fontWeight: "700", marginTop: 4 },
  jobAmount: { color: "#343968", fontSize: 15, fontWeight: "900" },
  emptyText: { color: "#7a7e9d", fontSize: 14, fontWeight: "700", lineHeight: 20 },
});
