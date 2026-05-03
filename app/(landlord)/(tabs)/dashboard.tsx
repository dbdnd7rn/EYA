/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Animated, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Building2, CircleDollarSign, MessageCircle, Plus } from "lucide-react-native";
import TopNav from "@/components/TopNav";
import { computeListingQualityScore } from "@/lib/productSignals";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useNotificationInbox } from "@/providers/NotificationInboxProvider";

export default function LandlordDashboardScreen() {
  const { user, loading: authLoading } = useAuth();
  const { unreadCount } = useNotificationInbox();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [listingCount, setListingCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [enquiryCount, setEnquiryCount] = useState(0);
  const [recentEnquiryCount, setRecentEnquiryCount] = useState(0);
  const [avgQualityScore, setAvgQualityScore] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(Date.now());
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const livePulse = useMemo(() => new Animated.Value(0.55), []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(livePulse, { toValue: 0.45, duration: 850, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [livePulse]);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    const run = async () => {
      setLoading(true);
      setErr(null);

      try {
        const [allListings, activeListings, enquiries, listingsData, recentEnquiries] = await Promise.all([
          supabase.from("listings").select("id", { count: "exact", head: true }).eq("landlord_id", user.id),
          supabase.from("listings").select("id", { count: "exact", head: true }).eq("landlord_id", user.id).eq("is_active", true),
          supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("landlord_id", user.id),
          supabase
            .from("listings")
            .select("id,title,description,image_urls,amenities,latitude,longitude,contact_phone,room_types")
            .eq("landlord_id", user.id),
          supabase
            .from("enquiries")
            .select("id,created_at")
            .eq("landlord_id", user.id)
            .gte("created_at", new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()),
        ]);

        if (allListings.error) throw allListings.error;
        if (activeListings.error) throw activeListings.error;
        if (enquiries.error) throw enquiries.error;
        if (listingsData.error) throw listingsData.error;
        if (recentEnquiries.error) throw recentEnquiries.error;

        setListingCount(allListings.count ?? 0);
        setActiveCount(activeListings.count ?? 0);
        setEnquiryCount(enquiries.count ?? 0);
        setRecentEnquiryCount((recentEnquiries.data ?? []).length);

        const qualityRows = (listingsData.data ?? []) as any[];
        const qualityScores = qualityRows.map((l) =>
          computeListingQualityScore({
            title: l.title,
            description: l.description,
            imageUrls: l.image_urls,
            amenities: l.amenities,
            latitude: l.latitude,
            longitude: l.longitude,
            contactPhone: l.contact_phone,
            roomTypes: l.room_types,
          }),
        );
        const avg = qualityScores.length
          ? Math.round(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length)
          : 0;
        setAvgQualityScore(avg);
        setLastUpdatedAt(Date.now());
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [user?.id]);

  const conversionHint = useMemo(() => {
    if (listingCount === 0) return "Create your first listing to start receiving enquiries.";
    if (avgQualityScore < 60) return "Improve listing quality: add photos, details and map pins to get more leads.";
    if (recentEnquiryCount === 0) return "No new enquiries in 30 days. Refresh pricing and cover photos.";
    return "Momentum is good. Keep replying quickly and updating availability.";
  }, [avgQualityScore, listingCount, recentEnquiryCount]);

  const qualityTier = useMemo(() => {
    if (avgQualityScore >= 80) return "Excellent";
    if (avgQualityScore >= 60) return "Good";
    if (avgQualityScore >= 40) return "Needs work";
    return "Low";
  }, [avgQualityScore]);

  const liveAge = useMemo(() => {
    const sec = Math.max(0, Math.floor((nowTick - lastUpdatedAt) / 1000));
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    return `${min}m ago`;
  }, [lastUpdatedAt, nowTick]);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <TopNav title="Dashboard" />
        <View style={styles.center}><ActivityIndicator size="large" color="#ff0f64" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <TopNav title="Dashboard" />
      <ScrollView contentContainerStyle={styles.content}>
        {err ? <View style={styles.errBox}><Text style={styles.errText}>{err}</Text></View> : null}

        <View style={styles.grid}>
          <StatCard label="Total listings" value={listingCount} icon={<Building2 size={18} color="#ff0f64" />} />
          <StatCard label="Active listings" value={activeCount} icon={<CircleDollarSign size={18} color="#ff0f64" />} />
          <StatCard label="Enquiries" value={enquiryCount} icon={<MessageCircle size={18} color="#ff0f64" />} />
        </View>

        <View style={styles.liveCard}>
          <View style={styles.liveTopRow}>
            <Text style={styles.liveTitle}>Performance Insights</Text>
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveDot, { opacity: livePulse, transform: [{ scale: livePulse }] }]} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          </View>

          <Text style={styles.liveSub}>Updated {liveAge}</Text>

          <View style={styles.liveMetricRow}>
            <Text style={styles.metricLabelStrong}>Listing quality</Text>
            <Text style={styles.metricValueStrong}>{avgQualityScore}/100 - {qualityTier}</Text>
          </View>

          <View style={styles.qualityTrack}>
            <View style={[styles.qualityFill, { width: `${Math.max(4, avgQualityScore)}%` }]} />
          </View>

          <View style={styles.liveGrid}>
            <View style={styles.liveMetricCard}>
              <Text style={styles.liveMetricLabel}>New enquiries (30d)</Text>
              <Text style={styles.liveMetricValue}>{recentEnquiryCount}</Text>
            </View>
            <View style={styles.liveMetricCard}>
              <Text style={styles.liveMetricLabel}>Active rate</Text>
              <Text style={styles.liveMetricValue}>{listingCount > 0 ? `${Math.round((activeCount / listingCount) * 100)}%` : "0%"}</Text>
            </View>
          </View>

          <Text style={styles.insightText}>{conversionHint}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Command center</Text>
          <Pressable style={styles.btn} onPress={() => router.push("/(landlord)/(tabs)/create")}>
            <Plus size={16} color="#fff" />
            <Text style={styles.btnText}>Create listing</Text>
          </Pressable>
          <Pressable style={styles.softBtn} onPress={() => router.push("/(landlord)/(tabs)/listings")}>
            <Text style={styles.softBtnText}>Manage listings</Text>
          </Pressable>
          <Pressable style={styles.softBtn} onPress={() => router.push("/(landlord)/(tabs)/enquiries")}>
            <Text style={styles.softBtnText}>Open enquiries</Text>
          </Pressable>
          <Pressable style={styles.softBtn} onPress={() => router.push("/(landlord)/notifications")}>
            <Text style={styles.softBtnText}>
              {unreadCount > 0 ? `Notifications (${unreadCount > 99 ? "99+" : unreadCount})` : "Notifications"}
            </Text>
          </Pressable>
          <Pressable style={styles.softBtn} onPress={() => router.push("/(landlord)/subscription")}>
            <Text style={styles.softBtnText}>Access and support</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.statLabel}>{label}</Text>
        {icon}
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12, paddingBottom: 30 },
  errBox: { borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", borderRadius: 16, padding: 12 },
  errText: { color: "#b0003a", fontWeight: "900" },
  grid: { gap: 10 },
  statCard: { backgroundColor: "#fff", borderRadius: 18, padding: 14 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statLabel: { color: "#5f6b85", fontSize: 12, fontWeight: "800" },
  statValue: { marginTop: 6, color: "#0e2756", fontSize: 30, fontWeight: "900" },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 14, gap: 10 },
  title: { color: "#0e2756", fontWeight: "900", fontSize: 16 },
  liveCard: {
    backgroundColor: "#0e2756",
    borderRadius: 22,
    padding: 14,
    gap: 10,
    shadowColor: "#0e2756",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 3,
  },
  liveTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  liveTitle: { color: "#fff", fontWeight: "900", fontSize: 17 },
  liveSub: { color: "rgba(255,255,255,0.75)", fontWeight: "700", fontSize: 12 },
  liveBadge: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#ff0f64" },
  liveBadgeText: { color: "#fff", fontWeight: "900", fontSize: 11, letterSpacing: 0.4 },
  liveMetricRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  metricLabelStrong: { color: "rgba(255,255,255,0.82)", fontWeight: "700", fontSize: 12 },
  metricValueStrong: { color: "#fff", fontWeight: "900", fontSize: 13 },
  qualityTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  qualityFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#ff0f64",
  },
  liveGrid: { flexDirection: "row", gap: 8 },
  liveMetricCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  liveMetricLabel: { color: "rgba(255,255,255,0.75)", fontWeight: "700", fontSize: 11 },
  liveMetricValue: { color: "#fff", fontWeight: "900", fontSize: 20 },
  metricRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metricLabel: { color: "#5f6b85", fontWeight: "700", fontSize: 12 },
  metricValue: { color: "#0e2756", fontWeight: "900", fontSize: 16 },
  insightText: {
    marginTop: 2,
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  btn: { backgroundColor: "#ff0f64", borderRadius: 14, paddingVertical: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  btnText: { color: "#fff", fontWeight: "900" },
  softBtn: { backgroundColor: "#f6f7fb", borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#e1e4ef" },
  softBtnText: { color: "#0e2756", fontWeight: "900" },
});
