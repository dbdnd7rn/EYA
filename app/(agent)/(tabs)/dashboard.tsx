import React, { useEffect } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Clock3, Truck, WalletCards } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useAgentWorkspace } from "@/components/agent/useAgentWorkspace";
import { useAuth } from "@/providers/AuthProvider";

function kwacha(value: number) {
  return `MWK ${Math.round(value || 0).toLocaleString("en-MW")}`;
}

export default function AgentDashboardScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { workspace, metrics, loading, error, setOnlineStatus } = useAgentWorkspace();
  const currentJob = workspace.currentJob;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, router, user]);

  const toggleOnline = async () => {
    try {
      await setOnlineStatus(!workspace.profile.isOnline);
    } catch (err: any) {
      Alert.alert("Status update failed", err?.message ?? "Could not update rider status.");
    }
  };

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <SoftPageGlow variant="home" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2c3068" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="home" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Online</Text>

        <Pressable style={[styles.heroCard, !workspace.profile.isOnline && styles.heroCardOff]} onPress={() => void toggleOnline()}>
          <View style={[styles.heroDot, !workspace.profile.isOnline && styles.heroDotOff]} />
          <Text style={styles.heroText}>{workspace.profile.isOnline ? "You are online" : "You are offline"}</Text>
        </Pressable>

        {error ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <Tile icon={<Truck size={18} color="#5562b4" />} label="Active jobs" value={`${metrics.activeCount}`} />
          <Tile icon={<WalletCards size={18} color="#5562b4" />} label="Today" value={kwacha(metrics.todayEarnings)} />
        </View>

        {currentJob ? (
          <Pressable
            style={styles.currentCard}
            onPress={() => router.push({ pathname: "/delivery/[orderId]", params: { orderId: currentJob.orderId } })}
          >
            <Text style={styles.currentEyebrow}>Current job</Text>
            <Text style={styles.currentTitle}>{currentJob.title}</Text>
            <Text style={styles.currentSub}>{currentJob.dropoffLabel}</Text>
            <Text style={styles.currentMeta}>
              {currentJob.etaMinutes ? `${currentJob.etaMinutes} min` : "ETA pending"} | {kwacha(currentJob.payoutMwk)}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.currentCard}>
            <Text style={styles.currentEyebrow}>Queue status</Text>
            <Text style={styles.currentTitle}>{workspace.profile.isOnline ? "Waiting for jobs" : "Offline"}</Text>
            <Text style={styles.currentSub}>
              {workspace.profile.isOnline ? `${workspace.openRequests.length} open requests in queue.` : "Turn online when you are ready to ride."}
            </Text>
          </View>
        )}

        <Pressable style={styles.linkBtn} onPress={() => router.push("/(agent)/(tabs)/deliveries")}>
          <Clock3 size={18} color="#4d58ad" />
          <Text style={styles.linkBtnText}>Open deliveries</Text>
        </Pressable>

        <Pressable style={styles.linkBtn} onPress={() => router.push("/(agent)/(tabs)/earnings")}>
          <WalletCards size={18} color="#4d58ad" />
          <Text style={styles.linkBtnText}>Open earnings</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.tile}>
      {icon}
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3eefb" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 130, gap: 16 },
  title: { color: "#262a63", fontSize: 25, fontWeight: "900" },
  heroCard: {
    borderRadius: 28,
    backgroundColor: "#2d4f6f",
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroCardOff: { backgroundColor: "#9099b0" },
  heroDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#82f274",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
  },
  heroDotOff: { backgroundColor: "#d9deea" },
  heroText: { color: "#fff", fontSize: 17, fontWeight: "800" },
  noticeCard: { borderRadius: 18, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd7e5", padding: 12 },
  noticeText: { color: "#b0003a", fontSize: 13, fontWeight: "800" },
  statsRow: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.84)",
    borderWidth: 1,
    borderColor: "#ece7f8",
    padding: 16,
    gap: 8,
  },
  tileLabel: { color: "#7b80a5", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  tileValue: { color: "#2e3362", fontSize: 22, fontWeight: "900" },
  currentCard: {
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "#ece7f8",
    padding: 18,
    gap: 8,
  },
  currentEyebrow: { color: "#8589ad", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  currentTitle: { color: "#2e3362", fontSize: 22, fontWeight: "900" },
  currentSub: { color: "#676d91", fontSize: 15, fontWeight: "700", lineHeight: 22 },
  currentMeta: { color: "#74799c", fontSize: 13, fontWeight: "800" },
  linkBtn: {
    borderRadius: 22,
    backgroundColor: "#eef0fb",
    borderWidth: 1,
    borderColor: "#e2e5f4",
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  linkBtnText: { color: "#4d58ad", fontSize: 15, fontWeight: "900" },
});
