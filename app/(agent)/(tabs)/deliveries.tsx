import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Clock3, MapPin, Package2, Search, Truck, WalletCards } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useAgentWorkspace, type AgentJobCard, type AgentRequestCard } from "@/components/agent/useAgentWorkspace";
import { useAuth } from "@/providers/AuthProvider";

function kwacha(value: number) {
  return `MWK ${Math.round(value || 0).toLocaleString("en-MW")}`;
}

function deliveryStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function etaLabel(job: AgentJobCard) {
  if (job.status === "delivered") return "Delivered";
  if (job.status === "failed") return "Delivery failed";
  if (job.status === "cancelled") return "Cancelled";
  if (job.etaMinutes) return `${job.etaMinutes} min`;
  return "ETA pending";
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AgentDeliveriesScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { workspace, metrics, loading, error, setOnlineStatus, dismissRequest, acceptRequest } = useAgentWorkspace();
  const [requestIndex, setRequestIndex] = useState(0);
  const requestCards = workspace.openRequests;
  const activeCards = workspace.activeJobs;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (requestIndex >= requestCards.length) {
      setRequestIndex(0);
    }
  }, [requestCards.length, requestIndex]);

  const shownRequest = useMemo(() => requestCards[requestIndex] ?? null, [requestCards, requestIndex]);
  const nextRequest = useMemo(() => (requestCards.length > 1 ? requestCards[(requestIndex + 1) % requestCards.length] : null), [requestCards, requestIndex]);
  const topActiveJob = activeCards[0] ?? null;

  const toggleOnline = async () => {
    try {
      await setOnlineStatus(!workspace.profile.isOnline);
    } catch (err: any) {
      Alert.alert("Status update failed", err?.message ?? "Could not update rider status.");
    }
  };

  const handleAccept = async (orderId: string) => {
    try {
      await acceptRequest(orderId);
      router.push({ pathname: "/delivery/[orderId]", params: { orderId } });
    } catch (err: any) {
      Alert.alert("Accept failed", err?.message ?? "Could not accept this request.");
    }
  };

  const handleDecline = async (request: AgentRequestCard) => {
    try {
      await dismissRequest(request.orderId, request.updatedAt);
    } catch (err: any) {
      Alert.alert("Decline failed", err?.message ?? "Could not decline this request.");
    }
  };

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
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Deliveries</Text>
            <View style={styles.statusRow}>
              <View style={[styles.liveDot, !workspace.profile.isOnline && styles.liveDotOff]} />
              <Text style={styles.statusText}>{workspace.profile.isOnline ? "Online" : "Offline"}</Text>
            </View>
          </View>

          <Pressable style={styles.circleAction} onPress={() => router.push("/(agent)/notifications")}>
            <Search size={18} color="#2c3068" />
          </Pressable>
        </View>

        <Pressable style={[styles.onlineBar, !workspace.profile.isOnline && styles.onlineBarOff]} onPress={() => void toggleOnline()}>
          <View style={[styles.onlineBadge, !workspace.profile.isOnline && styles.onlineBadgeOff]} />
          <Text style={styles.onlineBarText}>
            {workspace.profile.isOnline ? "You are online" : "Go online to receive requests"}
          </Text>
        </Pressable>

        {error ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}
        {workspace.requestNotice ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{workspace.requestNotice}</Text>
          </View>
        ) : null}
        {workspace.cacheLabel ? <Text style={styles.cacheText}>Last sync: {workspace.cacheLabel}</Text> : null}

        {topActiveJob ? (
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIconWrap}>
                <Truck size={34} color="#5060d8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroEyebrow}>Current delivery</Text>
                <Text style={styles.heroTitle}>{topActiveJob.title}</Text>
                <Text style={styles.heroSub}>{topActiveJob.vendorName}</Text>
              </View>
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>{deliveryStatusLabel(topActiveJob.status)}</Text>
              </View>
            </View>

            <View style={styles.routeRow}>
              <MapPin size={16} color="#6570aa" />
              <Text style={styles.routeText}>{topActiveJob.dropoffLabel}</Text>
            </View>
            <Text style={styles.metaText}>{topActiveJob.itemSummary}</Text>

            <View style={styles.metaStrip}>
              <MetaChip label={etaLabel(topActiveJob)} />
              <MetaChip label={kwacha(topActiveJob.payoutMwk)} />
              {topActiveJob.orderReference ? <MetaChip label={topActiveJob.orderReference} /> : null}
            </View>

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={() => router.push({ pathname: "/delivery/[orderId]", params: { orderId: topActiveJob.orderId } })}
              >
                <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>Open Job</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => router.push("/(agent)/(tabs)/earnings")}>
                <Text style={styles.actionBtnText}>Earnings</Text>
              </Pressable>
            </View>
          </View>
        ) : shownRequest && workspace.profile.isOnline ? (
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIconWrap}>
                <Package2 size={34} color="#5060d8" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroEyebrow}>New delivery request</Text>
                <Text style={styles.heroTitle}>{shownRequest.title}</Text>
                <Text style={styles.heroSub}>{shownRequest.vendorName}</Text>
              </View>
            </View>

            <View style={styles.routeRow}>
              <MapPin size={16} color="#6570aa" />
              <Text style={styles.routeText}>{shownRequest.dropoffLabel}</Text>
            </View>
            <Text style={styles.metaText}>{shownRequest.itemSummary}</Text>

            <View style={styles.metaStrip}>
              <MetaChip label={kwacha(shownRequest.payoutMwk)} />
              <MetaChip label={shownRequest.channel === "food" ? "Food order" : "Market order"} />
              <MetaChip label={timeLabel(shownRequest.createdAt)} />
            </View>

            <View style={styles.actionRow}>
              <Pressable style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={() => void handleAccept(shownRequest.orderId)}>
                <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>Accept</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => void handleDecline(shownRequest)}>
                <Text style={styles.actionBtnText}>Decline</Text>
              </Pressable>
            </View>

            {nextRequest ? (
              <Pressable style={styles.peekCard} onPress={() => setRequestIndex((current) => (current + 1) % requestCards.length)}>
                <Text style={styles.peekLabel}>Next request</Text>
                <Text style={styles.peekTitle}>{nextRequest.title}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyGlow} />
            <View style={styles.emptyIconWrap}>
              <Truck size={42} color="#b0b6e2" />
            </View>
            <Text style={styles.emptyTitle}>{workspace.profile.isOnline ? "No active job" : "You are offline"}</Text>
            <Text style={styles.emptySub}>
              {workspace.profile.isOnline ? "Waiting for requests..." : "Switch online when you are ready to receive deliveries."}
            </Text>
          </View>
        )}

        {(requestCards.length > 1 || activeCards.length > 1) ? (
          <View style={styles.pagerDots}>
            {(topActiveJob ? activeCards : requestCards).slice(0, 4).map((row, index) => {
              const active = topActiveJob ? index === 0 : index === requestIndex;
              return <View key={row.id} style={[styles.dot, active && styles.dotActive]} />;
            })}
          </View>
        ) : null}

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <SummaryBox icon={<Clock3 size={18} color="#5c68b3" />} label="Today" value={`${metrics.todayCount} trips`} />
            <SummaryBox icon={<WalletCards size={18} color="#5c68b3" />} label="Today" value={kwacha(metrics.todayEarnings)} />
          </View>
          <Pressable style={styles.secondaryCardBtn} onPress={() => router.push("/(agent)/(tabs)/earnings")}>
            <Text style={styles.secondaryCardBtnText}>Open earnings and history</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.summaryBox}>
      {icon}
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function MetaChip({ label }: { label: string }) {
  return (
    <View style={styles.metaChip}>
      <Text style={styles.metaChipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3eefb" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 130, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerCopy: { flexDirection: "row", alignItems: "center", gap: 14 },
  title: { color: "#262a63", fontSize: 25, fontWeight: "900" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  liveDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#7cd36d" },
  liveDotOff: { backgroundColor: "#a0a9bf" },
  statusText: { color: "#555c84", fontSize: 14, fontWeight: "700" },
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
  onlineBar: {
    borderRadius: 999,
    backgroundColor: "#294a68",
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  onlineBarOff: { backgroundColor: "#8a93ab" },
  onlineBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#83f27d",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
  },
  onlineBadgeOff: { backgroundColor: "#d7dce8" },
  onlineBarText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  noticeCard: { borderRadius: 18, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd7e5", padding: 12 },
  noticeText: { color: "#b0003a", fontSize: 13, fontWeight: "800" },
  cacheText: { color: "#787393", fontSize: 12, fontWeight: "700" },
  heroCard: {
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "#ece7f8",
    padding: 18,
    gap: 14,
    shadowColor: "#9f9bc4",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: "#eef0ff",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEyebrow: { color: "#7f84ab", fontSize: 13, fontWeight: "800", textTransform: "uppercase" },
  heroTitle: { color: "#262a63", fontSize: 22, fontWeight: "900", marginTop: 3 },
  heroSub: { color: "#626889", fontSize: 14, fontWeight: "700", marginTop: 4 },
  heroPill: { borderRadius: 999, backgroundColor: "#ebefff", paddingHorizontal: 12, paddingVertical: 8 },
  heroPillText: { color: "#4a58b2", fontSize: 12, fontWeight: "800", textTransform: "capitalize" },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeText: { flex: 1, color: "#30345f", fontSize: 16, fontWeight: "700" },
  metaText: { color: "#7d7a97", fontSize: 14, fontWeight: "600", lineHeight: 20 },
  metaStrip: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaChip: {
    borderRadius: 999,
    backgroundColor: "#f4f5fd",
    borderWidth: 1,
    borderColor: "#e6e8f6",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metaChipText: { color: "#666f9c", fontSize: 12, fontWeight: "800" },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#f4f4fb",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e7e6f4",
  },
  actionBtnPrimary: { backgroundColor: "#4c58ad", borderColor: "#4c58ad" },
  actionBtnText: { color: "#71759b", fontSize: 16, fontWeight: "900" },
  actionBtnTextPrimary: { color: "#fff" },
  peekCard: {
    borderRadius: 18,
    backgroundColor: "#f5f6fe",
    borderWidth: 1,
    borderColor: "#e7e9f7",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  peekLabel: { color: "#8a8db0", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  peekTitle: { color: "#313661", fontSize: 14, fontWeight: "800", marginTop: 4 },
  emptyCard: {
    overflow: "hidden",
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderWidth: 1,
    borderColor: "#ece7f8",
    paddingHorizontal: 20,
    paddingVertical: 26,
    alignItems: "center",
    gap: 12,
  },
  emptyGlow: {
    position: "absolute",
    left: -20,
    top: -10,
    width: 210,
    height: 140,
    borderBottomRightRadius: 110,
    backgroundColor: "rgba(204,196,255,0.28)",
  },
  emptyIconWrap: {
    width: 92,
    height: 92,
    borderRadius: 28,
    backgroundColor: "#f2f3ff",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: "#262a63", fontSize: 20, fontWeight: "900" },
  emptySub: { color: "#73708c", fontSize: 16, fontWeight: "600", textAlign: "center", lineHeight: 22 },
  pagerDots: { flexDirection: "row", justifyContent: "center", gap: 8 },
  dot: { width: 18, height: 4, borderRadius: 999, backgroundColor: "#cdc9e3" },
  dotActive: { backgroundColor: "#6772c8", width: 34 },
  summaryCard: {
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "#ece7f8",
    padding: 16,
    gap: 14,
  },
  summaryRow: { flexDirection: "row", gap: 10 },
  summaryBox: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#f7f7fe",
    borderWidth: 1,
    borderColor: "#ebedf8",
    padding: 14,
    gap: 8,
  },
  summaryLabel: { color: "#8b8fb0", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  summaryValue: { color: "#2e3462", fontSize: 16, fontWeight: "900" },
  secondaryCardBtn: {
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: "#eef0fb",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryCardBtnText: { color: "#5662b4", fontSize: 15, fontWeight: "900" },
});
