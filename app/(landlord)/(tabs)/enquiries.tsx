/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import TopNav from "@/components/TopNav";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type EnquiryDbRow = {
  id: string;
  status: string | null;
  created_at: string;
  listings: { title: string | null }[] | { title: string | null } | null;
};

type EnquiryRow = {
  id: string;
  status: string;
  created_at: string;
  listingTitle: string;
};

function statusMeta(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "new") return { bg: "#ff0f64", text: "#fff", label: "new", outlined: false };
  if (s === "read") return { bg: "#0e2756", text: "#fff", label: "read", outlined: false };
  if (s === "closed") return { bg: "#5f6b85", text: "#fff", label: "closed", outlined: false };
  return { bg: "#f6f7fb", text: "#0e2756", label: status || "-", outlined: true };
}

export default function LandlordEnquiriesScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [enquiries, setEnquiries] = useState<EnquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;

    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("enquiries")
      .select(
        `
        id,
        status,
        created_at,
        listings:listing_id ( title )
      `,
      )
      .eq("landlord_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setEnquiries([]);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as EnquiryDbRow[];
    const normalized: EnquiryRow[] = rows.map((r) => {
      const title = Array.isArray(r.listings) ? r.listings[0]?.title ?? "" : (r.listings as any)?.title ?? "";
      return { id: r.id, status: r.status ?? "new", created_at: r.created_at, listingTitle: title };
    });
    setEnquiries(normalized);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    load();
  }, [user?.id]);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <TopNav title="Enquiries" />
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.h1}>Enquiries</Text>
              <Text style={styles.sub}>Messages students sent to your listings.</Text>
            </View>
          </View>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.skeleton} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <TopNav title="Enquiries" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.h1}>Enquiries</Text>
            <Text style={styles.sub}>Messages students sent to your listings.</Text>
          </View>
          <Pressable onPress={() => router.push("/(landlord)/(tabs)/profile")}>
            <Text style={styles.backLink}>Back to profile</Text>
          </Pressable>
        </View>

        {err ? (
          <View style={styles.errBox}>
            <Text style={styles.errText}>{err}</Text>
          </View>
        ) : null}

        {enquiries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No enquiries yet.</Text>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {enquiries.map((e) => {
              const badge = statusMeta(e.status);
              return (
                <Pressable
                  key={e.id}
                  style={({ pressed }) => [styles.card, pressed && { opacity: 0.92, backgroundColor: "#f6f7fb" }]}
                  onPress={() => router.push({ pathname: "/(landlord)/chat/[enquiryId]", params: { enquiryId: e.id } })}
                >
                  <Text style={styles.title}>{e.listingTitle || "No listing"}</Text>

                  <View style={styles.rowBetween}>
                    <Text style={styles.time}>{new Date(e.created_at).toLocaleString()}</Text>
                    <View style={[styles.badge, { backgroundColor: badge.bg }, badge.outlined && styles.badgeOutlined]}>
                      <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  content: { padding: 16, gap: 12, paddingBottom: 30 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12 },
  h1: { color: "#0e2756", fontSize: 22, fontWeight: "900" },
  sub: { color: "#5f6b85", marginTop: 4, fontSize: 12, fontWeight: "700" },
  backLink: { color: "#ff0f64", fontWeight: "800", textDecorationLine: "underline" },
  errBox: { borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", borderRadius: 16, padding: 12 },
  errText: { color: "#b0003a", fontWeight: "900" },
  skeleton: { height: 80, borderRadius: 20, backgroundColor: "#dde6ff" },
  emptyCard: { backgroundColor: "#fff", borderRadius: 20, padding: 16, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, elevation: 1 },
  emptyText: { color: "#5f6b85", fontWeight: "700" },
  listWrap: { gap: 10 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  title: { color: "#0e2756", fontWeight: "900", fontSize: 14 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, gap: 10 },
  time: { color: "#5f6b85", fontWeight: "700", fontSize: 12, flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeOutlined: { borderWidth: 1, borderColor: "#e1e4ef" },
  badgeText: { fontWeight: "900", fontSize: 11, textTransform: "uppercase" },
});

