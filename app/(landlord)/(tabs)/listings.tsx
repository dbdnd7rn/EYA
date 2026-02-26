/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Eye, Pencil, Power, Search, SlidersHorizontal, Trash2 } from "lucide-react-native";
import TopNav from "@/components/TopNav";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type ListingRow = {
  id: string;
  title: string;
  listing_type: "hostel" | "bedsitter";
  area: string | null;
  city: string | null;
  campus: string | null;
  price_from: number | null;
  is_active: boolean | null;
  image_urls: string[] | null;
  created_at: string | null;
};

type SortKey = "newest" | "oldest" | "price_low" | "price_high";

function formatPrice(amount?: number | null) {
  if (!amount) return "Ask landlord";
  return `K${Number(amount).toLocaleString("en-MW")}`;
}

function fmtDate(d?: string | null) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export default function LandlordListingsScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("listings")
      .select("id,title,listing_type,area,city,campus,price_from,is_active,image_urls,created_at")
      .eq("landlord_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as ListingRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    load();
  }, [user?.id]);

  const onToggleActive = async (id: string, current: boolean) => {
    setBusyId(id);
    setError(null);
    const { error } = await supabase.from("listings").update({ is_active: !current }).eq("id", id);
    if (error) {
      setError(error.message);
      setBusyId(null);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: !current } : r)));
    setBusyId(null);
  };

  const onDelete = async (id: string) => {
    Alert.alert("Delete listing", "Delete this listing? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusyId(id);
          setError(null);
          const { error } = await supabase.from("listings").delete().eq("id", id);
          if (error) {
            setError(error.message);
            setBusyId(null);
            return;
          }
          setRows((prev) => prev.filter((r) => r.id !== id));
          setBusyId(null);
        },
      },
    ]);
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => !!r.is_active).length;
    return { total, active, inactive: total - active };
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let next = rows.filter((r) => {
      if (!query) return true;
      const hay = [r.title, r.area, r.city, r.campus, r.listing_type].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(query);
    });

    next = next.slice().sort((a, b) => {
      if (sort === "newest") return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      if (sort === "oldest") return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
      if (sort === "price_low") return Number(a.price_from ?? 999999999) - Number(b.price_from ?? 999999999);
      return Number(b.price_from ?? -1) - Number(a.price_from ?? -1);
    });

    return next;
  }, [rows, q, sort]);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <TopNav title="Listings" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#ff0f64" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <TopNav title="Listings" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.h1}>My listings</Text>
            <Text style={styles.sub}>Manage your hostels and bedsitters.</Text>
          </View>
          <Pressable style={styles.createBtn} onPress={() => router.push("/(landlord)/(tabs)/create")}>
            <Text style={styles.createText}>+ Create</Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}><Text style={styles.statLabel}>Total</Text><Text style={styles.statValue}>{stats.total}</Text></View>
          <View style={styles.statCard}><Text style={styles.statLabel}>Active</Text><Text style={styles.statValue}>{stats.active}</Text></View>
          <View style={styles.statCard}><Text style={styles.statLabel}>Inactive</Text><Text style={styles.statValue}>{stats.inactive}</Text></View>
        </View>

        {error ? <View style={styles.errBox}><Text style={styles.errText}>{error}</Text></View> : null}

        <View style={styles.controlsWrap}>
          <View style={styles.searchWrap}>
            <Search size={16} color="#5f6b85" />
            <TextInput
              style={styles.searchInput}
              value={q}
              onChangeText={setQ}
              placeholder="Search title, area, city, campus..."
              placeholderTextColor="#9aa3bd"
            />
          </View>

          <View style={styles.sortWrap}>
            <SlidersHorizontal size={16} color="#5f6b85" />
            <Text style={styles.sortLabel}>Sort</Text>
            <Pressable onPress={() => setSort("newest")} style={[styles.sortChip, sort === "newest" && styles.sortChipActive]}><Text style={[styles.sortChipText, sort === "newest" && styles.sortChipTextActive]}>Newest</Text></Pressable>
            <Pressable onPress={() => setSort("oldest")} style={[styles.sortChip, sort === "oldest" && styles.sortChipActive]}><Text style={[styles.sortChipText, sort === "oldest" && styles.sortChipTextActive]}>Oldest</Text></Pressable>
            <Pressable onPress={() => setSort("price_low")} style={[styles.sortChip, sort === "price_low" && styles.sortChipActive]}><Text style={[styles.sortChipText, sort === "price_low" && styles.sortChipTextActive]}>Price Low</Text></Pressable>
            <Pressable onPress={() => setSort("price_high")} style={[styles.sortChip, sort === "price_high" && styles.sortChipActive]}><Text style={[styles.sortChipText, sort === "price_high" && styles.sortChipTextActive]}>Price High</Text></Pressable>
          </View>
        </View>

        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No listings yet</Text>
            <Text style={styles.emptyText}>Create your first hostel or bedsitter.</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No results</Text>
            <Text style={styles.emptyText}>Try a different search keyword.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map((r) => {
              const busy = busyId === r.id;
              return (
                <View key={r.id} style={styles.card}>
                  <Pressable onPress={() => router.push({ pathname: "/(landlord)/listing/[id]", params: { id: r.id } })}>
                    {r.image_urls?.[0] ? (
                      <Image source={{ uri: r.image_urls[0] }} style={styles.cover} resizeMode="cover" />
                    ) : (
                      <View style={[styles.cover, styles.coverEmpty]}><Text style={styles.coverEmptyText}>No photo</Text></View>
                    )}

                    <View style={styles.badgesOverlay}>
                      <Text style={styles.typeBadge}>{r.listing_type === "hostel" ? "HOSTEL" : "BEDSITTER"}</Text>
                      <Text style={[styles.statusBadge, r.is_active ? styles.statusBadgeActive : styles.statusBadgeInactive]}>
                        {r.is_active ? "ACTIVE" : "INACTIVE"}
                      </Text>
                    </View>

                    <Text style={styles.dateBadge}>{fmtDate(r.created_at)}</Text>
                  </Pressable>

                  <View style={styles.body}>
                    <Text style={styles.title} numberOfLines={1}>{r.title}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[r.area, r.city, r.campus].filter(Boolean).join(" - ") || "Location not set"}
                    </Text>

                    <View style={styles.priceCard}>
                      <Text style={styles.priceLabel}>PRICE FROM</Text>
                      <Text style={styles.price}>
                        {formatPrice(r.price_from)} <Text style={styles.priceSub}>/ month</Text>
                      </Text>
                    </View>

                    <View style={styles.actionGrid}>
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => router.push({ pathname: "/(landlord)/listing/[id]", params: { id: r.id } })}
                      >
                        <Eye size={14} color="#0e2756" />
                        <Text style={styles.actionBtnText}>View</Text>
                      </Pressable>

                      <Pressable
                        style={styles.actionBtnNavy}
                        onPress={() => onToggleActive(r.id, !!r.is_active)}
                        disabled={busy}
                      >
                        <Power size={14} color="#fff" />
                        <Text style={styles.actionBtnNavyText}>{busy ? "..." : r.is_active ? "Deactivate" : "Activate"}</Text>
                      </Pressable>

                      <Pressable
                        style={styles.actionBtnDelete}
                        onPress={() => onDelete(r.id)}
                        disabled={busy}
                      >
                        <Trash2 size={14} color="#b0003a" />
                        <Text style={styles.actionBtnDeleteText}>Delete</Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => router.push({ pathname: "/(landlord)/listing/[id]", params: { id: r.id } })}
                      style={styles.editLink}
                    >
                      <Pencil size={14} color="#ff0f64" />
                      <Text style={styles.editLinkText}>Edit listing</Text>
                    </Pressable>
                  </View>
                </View>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12, paddingBottom: 30 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 10 },
  h1: { color: "#0e2756", fontWeight: "900", fontSize: 24 },
  sub: { color: "#5f6b85", fontWeight: "700", fontSize: 12, marginTop: 4 },
  createBtn: { backgroundColor: "#ff0f64", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  createText: { color: "#fff", fontWeight: "900" },
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 10, borderWidth: 1, borderColor: "#e7eaf6" },
  statLabel: { color: "#5f6b85", fontSize: 10, fontWeight: "900" },
  statValue: { color: "#0e2756", fontSize: 18, fontWeight: "900", marginTop: 2 },
  errBox: { borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", borderRadius: 16, padding: 12 },
  errText: { color: "#b0003a", fontWeight: "900" },
  controlsWrap: { gap: 10 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e7eaf6",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  searchInput: { flex: 1, color: "#0e2756", fontWeight: "700" },
  sortWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e7eaf6",
    borderRadius: 14,
    padding: 10,
  },
  sortLabel: { color: "#5f6b85", fontWeight: "800", fontSize: 12, marginRight: 2 },
  sortChip: { borderRadius: 999, borderWidth: 1, borderColor: "#e1e4ef", paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#f6f7fb" },
  sortChipActive: { backgroundColor: "#0e2756", borderColor: "#0e2756" },
  sortChipText: { color: "#0e2756", fontSize: 11, fontWeight: "800" },
  sortChipTextActive: { color: "#fff" },
  empty: { backgroundColor: "#fff", borderRadius: 18, padding: 16, alignItems: "center" },
  emptyTitle: { color: "#0e2756", fontWeight: "900", fontSize: 16 },
  emptyText: { color: "#5f6b85", fontWeight: "700", marginTop: 4 },
  grid: { gap: 14 },
  card: { backgroundColor: "#fff", borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "#eef1fb" },
  cover: { width: "100%", height: 180, backgroundColor: "#eef1fb" },
  coverEmpty: { alignItems: "center", justifyContent: "center" },
  coverEmptyText: { color: "#5f6b85", fontWeight: "700" },
  badgesOverlay: { position: "absolute", top: 10, left: 10, flexDirection: "row", gap: 6 },
  typeBadge: { backgroundColor: "#ff0f64", color: "#fff", fontWeight: "900", fontSize: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: "hidden" },
  statusBadge: { color: "#fff", fontWeight: "900", fontSize: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, overflow: "hidden" },
  statusBadgeActive: { backgroundColor: "#0a6b3d" },
  statusBadgeInactive: { backgroundColor: "#0e2756" },
  dateBadge: {
    position: "absolute",
    bottom: 10,
    left: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    color: "#0e2756",
    fontWeight: "700",
    fontSize: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  body: { padding: 14, gap: 8 },
  title: { color: "#0e2756", fontWeight: "900", fontSize: 14 },
  meta: { color: "#5f6b85", fontWeight: "700", fontSize: 12 },
  priceCard: { marginTop: 2, backgroundColor: "#f6f7fb", borderRadius: 14, borderWidth: 1, borderColor: "#e1e4ef", padding: 12 },
  priceLabel: { color: "#5f6b85", fontSize: 10, fontWeight: "900" },
  price: { color: "#0e2756", fontWeight: "900", marginTop: 3 },
  priceSub: { color: "#5f6b85", fontWeight: "700", fontSize: 12 },
  actionGrid: { marginTop: 4, flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e1e4ef", paddingVertical: 10, alignItems: "center", justifyContent: "center", gap: 4, flexDirection: "row" },
  actionBtnText: { color: "#0e2756", fontWeight: "800", fontSize: 11 },
  actionBtnNavy: { flex: 1, borderRadius: 12, backgroundColor: "#0e2756", paddingVertical: 10, alignItems: "center", justifyContent: "center", gap: 4, flexDirection: "row" },
  actionBtnNavyText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  actionBtnDelete: { flex: 1, borderRadius: 12, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd4e3", paddingVertical: 10, alignItems: "center", justifyContent: "center", gap: 4, flexDirection: "row" },
  actionBtnDeleteText: { color: "#b0003a", fontWeight: "800", fontSize: 11 },
  editLink: { marginTop: 2, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  editLinkText: { color: "#ff0f64", fontWeight: "900", fontSize: 12, textDecorationLine: "underline" },
});

