/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Building2, CircleDollarSign, MessageCircle, Plus } from "lucide-react-native";
import TopNav from "@/components/TopNav";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

export default function LandlordDashboardScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [listingCount, setListingCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [enquiryCount, setEnquiryCount] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    const run = async () => {
      setLoading(true);
      setErr(null);

      try {
        const [allListings, activeListings, enquiries] = await Promise.all([
          supabase.from("listings").select("id", { count: "exact", head: true }).eq("landlord_id", user.id),
          supabase.from("listings").select("id", { count: "exact", head: true }).eq("landlord_id", user.id).eq("is_active", true),
          supabase.from("enquiries").select("id", { count: "exact", head: true }).eq("landlord_id", user.id),
        ]);

        if (allListings.error) throw allListings.error;
        if (activeListings.error) throw activeListings.error;
        if (enquiries.error) throw enquiries.error;

        setListingCount(allListings.count ?? 0);
        setActiveCount(activeListings.count ?? 0);
        setEnquiryCount(enquiries.count ?? 0);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [user?.id]);

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

        <View style={styles.card}>
          <Text style={styles.title}>Quick actions</Text>
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
  btn: { backgroundColor: "#ff0f64", borderRadius: 14, paddingVertical: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  btnText: { color: "#fff", fontWeight: "900" },
  softBtn: { backgroundColor: "#f6f7fb", borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#e1e4ef" },
  softBtnText: { color: "#0e2756", fontWeight: "900" },
});
