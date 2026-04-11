/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Search, Plus, Bike } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { formatCacheTime, getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { supabaseNewApp } from "@/lib/supabaseNewApp";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useRouter } from "expo-router";

type DeliveryRow = {
  order_id: string;
  status: "searching" | "assigned" | "picked_up" | "arriving" | "delivered" | "failed" | "cancelled";
  created_at: string;
};

type OrderFeeRow = {
  id: string;
  delivery_fee_mwk: number;
};

function kwacha(v: number) {
  return `MWK ${Math.round(v).toLocaleString()}`;
}

export default function AgentEarningsScreen() {
  const { user, loading: authLoading } = useAuth();
  const { isOnline } = useNetwork();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [totalDelivered, setTotalDelivered] = useState(0);
  const [delivered30d, setDelivered30d] = useState(0);
  const [grossDeliveryFees, setGrossDeliveryFees] = useState(0);
  const [cacheTime, setCacheTime] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    const run = async () => {
      const cacheKey = `agent_earnings_${user.id}`;
      setLoading(true);
      setErr(null);
      try {
        if (!isOnline) {
          const cached = await getCachedJson<{ totalDelivered: number; delivered30d: number; grossDeliveryFees: number }>(cacheKey);
          if (cached?.data) {
            setTotalDelivered(cached.data.totalDelivered);
            setDelivered30d(cached.data.delivered30d);
            setGrossDeliveryFees(cached.data.grossDeliveryFees);
            setCacheTime(cached.ts ?? null);
            setErr("Offline mode: showing cached earnings.");
          } else {
            setErr("Offline with no cached earnings yet.");
          }
          return;
        }

        const monthAgoIso = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();

        const { data: deliveries, error: deliveriesError } = await supabaseNewApp
          .from("deliveries")
          .select("order_id,status,created_at")
          .eq("driver_id", user.id)
          .eq("status", "delivered")
          .order("created_at", { ascending: false });

        if (deliveriesError) throw deliveriesError;

        const deliveredRows = (deliveries ?? []) as DeliveryRow[];
        const orderIds = deliveredRows.map((r) => r.order_id);

        let totalFees = 0;
        if (orderIds.length > 0) {
          const { data: feeRows, error: feeError } = await supabaseNewApp.from("orders").select("id,delivery_fee_mwk").in("id", orderIds);
          if (feeError) throw feeError;
          totalFees = ((feeRows ?? []) as OrderFeeRow[]).reduce((sum, row) => sum + Number(row.delivery_fee_mwk || 0), 0);
        }

        const monthlyCount = deliveredRows.filter((d) => d.created_at >= monthAgoIso).length;

        setTotalDelivered(deliveredRows.length);
        setDelivered30d(monthlyCount);
        setGrossDeliveryFees(totalFees);
        await setCachedJson(cacheKey, { totalDelivered: deliveredRows.length, delivered30d: monthlyCount, grossDeliveryFees: totalFees });
        setCacheTime(Date.now());
      } catch (e: any) {
        const cached = await getCachedJson<{ totalDelivered: number; delivered30d: number; grossDeliveryFees: number }>(cacheKey);
        if (cached?.data) {
          setTotalDelivered(cached.data.totalDelivered);
          setDelivered30d(cached.data.delivered30d);
          setGrossDeliveryFees(cached.data.grossDeliveryFees);
          setCacheTime(cached.ts ?? null);
          setErr("Offline mode: showing cached earnings.");
        } else {
          setErr(e?.message ?? "Failed to load earnings.");
        }
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [isOnline, user?.id]);

  const averagePerDelivery = useMemo(() => (totalDelivered ? Math.round(grossDeliveryFees / totalDelivered) : 0), [grossDeliveryFees, totalDelivered]);
  const weeklyBars = useMemo(() => [0.24, 0.18, 0.42, 0.28, 0.58, 0.34, 0.92], []);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <SoftPageGlow variant="orders" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0e2756" />
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
          <View style={styles.headerButtons}>
            <CircleIcon icon={<Search size={18} color="#0e2756" />} />
            <CircleIcon icon={<Plus size={18} color="#0e2756" />} />
          </View>
        </View>

        {err ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{err}</Text>
          </View>
        ) : null}
        {cacheTime ? <Text style={styles.cacheMeta}>Earnings cache: {formatCacheTime(cacheTime)}</Text> : null}

        <View style={styles.heroCard}>
          <View style={styles.heroGlowOne} />
          <View style={styles.heroGlowTwo} />
          <Text style={styles.heroLabel}>This Week</Text>
          <Text style={styles.heroValue}>{kwacha(grossDeliveryFees)}</Text>
          <Text style={styles.heroSub}>This week</Text>

          <View style={styles.miniBars}>
            {weeklyBars.map((value, index) => (
              <View key={index} style={[styles.bar, { height: `${Math.max(16, value * 100)}%` }]} />
            ))}
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoLeft}>
            <Text style={styles.infoTitle}>Today</Text>
            <Text style={styles.infoValue}>{kwacha(averagePerDelivery)}</Text>
            <Text style={styles.infoSub}>ETA: 15 min</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRight}>
            <Text style={styles.infoMeta}>{delivered30d} trips in 30d</Text>
            <Text style={styles.infoMeta}>{totalDelivered} delivered total</Text>
          </View>
        </View>

        <View style={styles.noteCard}>
          <View style={styles.noteRow}>
            <Bike size={18} color="#7b68b0" />
            <Text style={styles.noteText}>Delivery activity updates your estimate automatically.</Text>
          </View>
        </View>

        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{totalDelivered ? "Keep going, more payouts ahead." : "No more deliveries yet"}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CircleIcon({ icon }: { icon: React.ReactNode }) {
  return <View style={styles.circleIcon}>{icon}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 120, gap: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#2a2d63", fontSize: 24, fontWeight: "500" },
  headerButtons: { flexDirection: "row", gap: 10 },
  circleIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.84)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#eeeaf8" },
  noticeCard: { borderRadius: 18, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd5e4", padding: 12 },
  noticeText: { color: "#b0003a", fontWeight: "800" },
  cacheMeta: { color: "#736f87", fontSize: 12, fontWeight: "700" },
  heroCard: { position: "relative", overflow: "hidden", borderRadius: 28, backgroundColor: "#fff", borderWidth: 1, borderColor: "#ece7f8", padding: 18, minHeight: 190 },
  heroGlowOne: { position: "absolute", left: 0, top: 0, width: 240, height: 130, borderBottomRightRadius: 110, backgroundColor: "rgba(194,165,255,0.45)" },
  heroGlowTwo: { position: "absolute", right: -20, bottom: -24, width: 220, height: 170, borderRadius: 90, backgroundColor: "rgba(255,206,184,0.46)" },
  heroLabel: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  heroValue: { color: "#ffffff", fontSize: 26, fontWeight: "900", marginTop: 10 },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600", marginTop: 6 },
  miniBars: { position: "absolute", right: 18, bottom: 18, flexDirection: "row", alignItems: "flex-end", gap: 6, height: 64 },
  bar: { width: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.75)" },
  infoCard: { borderRadius: 28, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: "#ece7f8", padding: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  infoLeft: { flex: 1, gap: 6 },
  infoRight: { flex: 1, gap: 8 },
  infoTitle: { color: "#2a2d63", fontSize: 18, fontWeight: "500" },
  infoValue: { color: "#202554", fontSize: 22, fontWeight: "900" },
  infoSub: { color: "#736f87", fontSize: 14, fontWeight: "500" },
  infoDivider: { width: 1, alignSelf: "stretch", backgroundColor: "#eadff2" },
  infoMeta: { color: "#736f87", fontSize: 16, fontWeight: "500" },
  noteCard: { borderRadius: 24, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: "#ece7f8", padding: 16 },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  noteText: { color: "#736f87", fontSize: 15, fontWeight: "500", flex: 1 },
  emptyCard: { borderRadius: 24, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: "#ece7f8", paddingVertical: 20, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "#5e5a78", fontSize: 16, fontWeight: "600" },
});
