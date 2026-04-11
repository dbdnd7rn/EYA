/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Bike, CheckCircle2, Clock3, Search, Plus, Truck, WalletCards } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { formatCacheTime, getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { supabaseNewApp } from "@/lib/supabaseNewApp";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { getAgentRiderProfile } from "@/lib/agentRiderProfile";

type DeliveryRow = {
  id: string;
  status: "searching" | "assigned" | "picked_up" | "arriving" | "delivered" | "failed" | "cancelled";
  created_at: string;
};

function timeGreetingLabel(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function extractFirstName(fullName?: string | null, email?: string | null) {
  const cleanName = fullName?.trim();
  if (cleanName) return cleanName.split(/\s+/)[0] ?? "Rider";
  const cleanEmail = email?.split("@")[0]?.trim();
  return cleanEmail || "Rider";
}

function money(value: number) {
  return `MWK ${Math.round(value).toLocaleString()}`;
}

export default function AgentDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { isOnline: networkOnline } = useNetwork();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assignedCount, setAssignedCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [deliveredCount, setDeliveredCount] = useState(0);
  const [todayEstimate, setTodayEstimate] = useState(0);
  const [displayName, setDisplayName] = useState("Rider");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [cacheTime, setCacheTime] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    const run = async () => {
      const cacheKey = `agent_dashboard_${user.id}`;
      setLoading(true);
      setErr(null);
      try {
        if (!networkOnline) {
          const cached = await getCachedJson<{
            assignedCount: number;
            activeCount: number;
            deliveredCount: number;
            todayEstimate: number;
            displayName: string;
            avatarUrl: string | null;
            riderOnline: boolean;
          }>(cacheKey);
          if (cached?.data) {
            setAssignedCount(cached.data.assignedCount);
            setActiveCount(cached.data.activeCount);
            setDeliveredCount(cached.data.deliveredCount);
            setTodayEstimate(cached.data.todayEstimate);
            setDisplayName(cached.data.displayName);
            setAvatarUrl(cached.data.avatarUrl);
            setIsOnline(cached.data.riderOnline);
            setCacheTime(cached.ts ?? null);
            setErr(null);
          } else {
            setErr("Offline with no cached dashboard yet.");
          }
          return;
        }

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const [{ data: deliveries, error: deliveriesError }, { data: profile }, riderProfile] = await Promise.all([
          supabaseNewApp.from("deliveries").select("id,status,created_at").eq("driver_id", user.id).order("created_at", { ascending: false }),
          supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
          getAgentRiderProfile(user.id),
        ]);

        if (deliveriesError) throw deliveriesError;

        const rows = (deliveries ?? []) as DeliveryRow[];
        const active = rows.filter((d) => d.status === "assigned" || d.status === "picked_up" || d.status === "arriving").length;
        const delivered = rows.filter((d) => d.status === "delivered").length;
        const todayDelivered = rows.filter((d) => d.status === "delivered" && new Date(d.created_at) >= startOfDay).length;

        setAssignedCount(rows.length);
        setActiveCount(active);
        setDeliveredCount(delivered);
        setTodayEstimate(todayDelivered * 3500);
        setDisplayName(extractFirstName((profile as any)?.full_name ?? null, user.email));
        setAvatarUrl(riderProfile?.avatarUrl ?? null);
        setIsOnline(riderProfile?.isOnline ?? true);
        const cachedData = {
          assignedCount: rows.length,
          activeCount: active,
          deliveredCount: delivered,
          todayEstimate: todayDelivered * 3500,
          displayName: extractFirstName((profile as any)?.full_name ?? null, user.email),
          avatarUrl: riderProfile?.avatarUrl ?? null,
          riderOnline: riderProfile?.isOnline ?? true,
        };
        await setCachedJson(cacheKey, cachedData);
        setCacheTime(Date.now());
      } catch (e: any) {
        const cached = await getCachedJson<{
          assignedCount: number;
          activeCount: number;
          deliveredCount: number;
          todayEstimate: number;
          displayName: string;
          avatarUrl: string | null;
          riderOnline: boolean;
        }>(cacheKey);
        if (cached?.data) {
          setAssignedCount(cached.data.assignedCount);
          setActiveCount(cached.data.activeCount);
          setDeliveredCount(cached.data.deliveredCount);
          setTodayEstimate(cached.data.todayEstimate);
          setDisplayName(cached.data.displayName);
          setAvatarUrl(cached.data.avatarUrl);
          setIsOnline(cached.data.riderOnline);
          setCacheTime(cached.ts ?? null);
          setErr("Offline mode: showing cached dashboard.");
        } else {
          setErr(e?.message ?? "Failed to load dashboard.");
        }
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [networkOnline, user?.id]);

  const statusLabel = useMemo(() => (!isOnline ? "Offline" : activeCount > 0 ? "Online and delivering" : "Online"), [activeCount, isOnline]);
  const noMoreLabel = useMemo(() => (!isOnline ? "Go online to receive deliveries" : activeCount > 0 ? `${activeCount} active delivery${activeCount === 1 ? "" : "ies"}` : "No more deliveries"), [activeCount, isOnline]);
  const greeting = useMemo(() => timeGreetingLabel(new Date().getHours()), []);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <SoftPageGlow variant="home" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0e2756" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="home" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {err ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{err}</Text>
          </View>
        ) : null}
        {cacheTime ? <Text style={styles.cacheMeta}>Dashboard cache: {formatCacheTime(cacheTime)}</Text> : null}

        <View style={styles.headerRow}>
          <View style={styles.identityWrap}>
            <Pressable style={styles.avatar} onPress={() => router.push("/(agent)/(tabs)/profile")}>
              {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{displayName.slice(0, 2).toUpperCase()}</Text>}
            </Pressable>
            <View style={[styles.onlinePill, !isOnline && styles.onlinePillOffline]}>
              <View style={[styles.onlineDot, !isOnline && styles.onlineDotOffline]} />
              <Text style={styles.onlineText}>{statusLabel}</Text>
            </View>
          </View>

          <View style={styles.headerButtons}>
            <CircleIcon icon={<Search size={18} color="#0e2756" />} onPress={() => router.push("/(agent)/(tabs)/deliveries")} />
            <CircleIcon icon={<Plus size={18} color="#0e2756" />} onPress={() => router.push("/(agent)/(tabs)/profile")} />
          </View>
        </View>

        <View style={styles.greetingBlock}>
          <Text style={styles.greetingTop}>{greeting},</Text>
          <Text style={styles.greetingName}>{displayName}</Text>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroGlowOne} />
          <View style={styles.heroGlowTwo} />
          <Text style={styles.heroLabel}>Today</Text>
          <Text style={styles.heroValue}>{money(todayEstimate)}</Text>

          <View style={styles.heroStats}>
            <MiniStat label="Assigned" value={assignedCount} />
            <MiniStat label="Active now" value={activeCount} />
            <MiniStat label="Done" value={deliveredCount} />
          </View>
        </View>

        <View style={styles.quickTabs}>
          <QuickTab icon={<Bike size={18} color="#0e2756" />} label="Dashboard" active />
          <QuickTab icon={<Truck size={18} color="#7b68b0" />} label="Deliveries" onPress={() => router.push("/(agent)/(tabs)/deliveries")} />
          <QuickTab icon={<WalletCards size={18} color="#7b68b0" />} label="Earnings" onPress={() => router.push("/(agent)/(tabs)/earnings")} />
        </View>

        <Pressable style={styles.noMoreCard} onPress={() => router.push("/(agent)/(tabs)/deliveries")}>
          <Text style={styles.noMoreText}>{noMoreLabel}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function CircleIcon({ icon, onPress }: { icon: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable style={styles.circleIcon} onPress={onPress}>
      {icon}
    </Pressable>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={styles.miniStatValue}>{value}</Text>
    </View>
  );
}

function QuickTab({
  active,
  icon,
  label,
  onPress,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.quickTab} onPress={onPress}>
      {icon}
      <Text style={[styles.quickTabText, active && styles.quickTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 120, gap: 16 },
  noticeCard: { borderRadius: 20, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd5e4", padding: 12 },
  noticeText: { color: "#b0003a", fontWeight: "800" },
  cacheMeta: { color: "#6d7a99", fontSize: 12, fontWeight: "700" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  identityWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#ece8fa" },
  avatarImage: { width: "100%", height: "100%", borderRadius: 24 },
  avatarText: { color: "#0e2756", fontWeight: "900", fontSize: 16 },
  onlinePill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#e7f5e9", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  onlinePillOffline: { backgroundColor: "#f1f4fb" },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#3fbf54" },
  onlineDotOffline: { backgroundColor: "#9ca5ba" },
  onlineText: { color: "#3f4a5c", fontSize: 14, fontWeight: "700" },
  headerButtons: { flexDirection: "row", gap: 10 },
  circleIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.84)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#eeeaf8" },
  greetingBlock: { gap: 2 },
  greetingTop: { color: "#2f315f", fontSize: 18, fontWeight: "500" },
  greetingName: { color: "#202554", fontSize: 21, fontWeight: "900" },
  heroCard: { borderRadius: 30, overflow: "hidden", backgroundColor: "#fff", borderWidth: 1, borderColor: "#ece7f8", padding: 18, gap: 18 },
  heroGlowOne: { position: "absolute", left: 0, top: 0, width: 260, height: 140, borderBottomRightRadius: 120, backgroundColor: "rgba(194,165,255,0.45)" },
  heroGlowTwo: { position: "absolute", right: -20, bottom: -30, width: 220, height: 180, borderRadius: 90, backgroundColor: "rgba(255,204,178,0.48)" },
  heroLabel: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  heroValue: { color: "#ffffff", fontSize: 26, fontWeight: "900" },
  heroStats: { marginTop: 26, flexDirection: "row", gap: 10, flexWrap: "wrap" },
  miniStat: { flex: 1, minWidth: 92, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.72)", paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.68)" },
  miniStatLabel: { color: "#6a6785", fontSize: 12, fontWeight: "700" },
  miniStatValue: { color: "#202554", fontSize: 20, fontWeight: "900", marginTop: 4 },
  quickTabs: { borderRadius: 26, backgroundColor: "rgba(255,255,255,0.86)", borderWidth: 1, borderColor: "#ece7f8", padding: 8, flexDirection: "row", justifyContent: "space-between", gap: 8 },
  quickTab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 20 },
  quickTabText: { color: "#6e7892", fontSize: 13, fontWeight: "700" },
  quickTabTextActive: { color: "#202554" },
  noMoreCard: { borderRadius: 24, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: "#ece7f8", paddingVertical: 20, alignItems: "center", justifyContent: "center" },
  noMoreText: { color: "#5e5a78", fontSize: 16, fontWeight: "600" },
});
