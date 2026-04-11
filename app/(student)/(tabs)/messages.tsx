/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Filter, MapPin, MessageCircle, Search } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import RoomsBottomNav from "@/components/rooms/RoomsBottomNav";

type EnquiryStatus = "new" | "replied" | "closed" | "read" | string;

type ListingMini = {
  id: string;
  title: string;
  listing_type: "hostel" | "bedsitter";
  campus: string | null;
  area: string | null;
  city: string | null;
};

type EnquiryRow = {
  id: string;
  student_id: string | null;
  landlord_id: string | null;
  listing_id: string | null;
  message: string | null;
  status: EnquiryStatus;
  created_at: string | null;
  listings: ListingMini[] | ListingMini | null;
};

function initials(name?: string | null) {
  const s = (name || "").trim();
  if (!s) return "PL";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "P";
  const b = parts[1]?.[0] ?? "L";
  return (a + b).toUpperCase();
}

function fmtTime(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function displayName(listing: ListingMini | null) {
  return listing?.title?.trim() || "Hostel";
}

function statusPill(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "new") return { bg: "#eaf3ff", border: "#b6d2ff", text: "#1d5fc7", label: "New", show: true };
  if (s === "replied") return { bg: "#eefaf1", border: "#b8ebc4", text: "#1a7f43", label: "Replied", show: true };
  if (s === "read") return { bg: "#f3f4f6", border: "#e5e7eb", text: "#6b7280", label: "Read", show: false };
  if (s === "closed") return { bg: "#f3f4f6", border: "#e5e7eb", text: "#6b7280", label: "Closed", show: false };
  return { bg: "#f6f7fb", border: "#e7eaf6", text: "#0e2756", label: status || "-", show: false };
}

export default function StudentMessagesScreen() {
  const { user, loading: authLoading } = useAuth();
  const { isOnline } = useNetwork();
  const router = useRouter();

  const [rows, setRows] = useState<EnquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const screenWidth = Dimensions.get("window").width;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  const load = async (opts?: { silent?: boolean }) => {
    if (!user) return;

    try {
      if (!opts?.silent) setLoading(true);
      setError(null);

      if (!isOnline) {
        const cached = await getCachedJson<EnquiryRow[]>(`messages:${user.id}`);
        setRows(cached?.data ?? []);
        setError(cached?.data ? null : "No messages available yet.");
        return;
      }

      const { data, error } = await supabase
        .from("enquiries")
        .select(
          `
          id,
          student_id,
          landlord_id,
          listing_id,
          message,
          status,
          created_at,
          listings:listing_id (
            id,
            title,
            listing_type,
            campus,
            area,
            city
          )
        `,
        )
        .eq("student_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const nextRows = (data ?? []) as EnquiryRow[];
      setRows(nextRows);
      await setCachedJson(`messages:${user.id}`, nextRows);
    } catch {
      const cached = await getCachedJson<EnquiryRow[]>(`messages:${user.id}`);
      if (cached?.data) {
        setRows(cached.data);
        setError(null);
      } else {
        setRows([]);
        setError("Failed to load messages.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user?.id, isOnline]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ silent: true });
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;

    return rows.filter((r) => {
      const listing = (Array.isArray(r.listings) ? r.listings[0] : r.listings) ?? null;
      const name = displayName(listing).toLowerCase();
      const msg = (r.message ?? "").toLowerCase();
      const loc = [listing?.area, listing?.city, listing?.campus].filter(Boolean).join(" ").toLowerCase();
      return name.includes(term) || msg.includes(term) || loc.includes(term);
    });
  }, [rows, q]);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.skeletonWrap}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff0f64" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroCloud} />
          <View style={styles.heroSun} />
          <View style={styles.heroHorizon} />
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>Messages</Text>
            <Text style={styles.heroSub}>Chats with landlords or hostel owners</Text>
          </View>
          <View style={styles.heroHouse}>
            <View style={styles.houseRoof} />
            <View style={styles.houseBody}>
              <View style={styles.houseWindow} />
              <View style={styles.houseDoor} />
              <View style={styles.houseWindow} />
            </View>
            <View style={styles.houseBushLeft} />
            <View style={styles.houseBushRight} />
          </View>
        </View>

        <View style={styles.searchBar}>
          <Search size={18} color="#67738f" />
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Search hostel or messages..."
            placeholderTextColor="#9aa3bd"
          />
          <View style={styles.searchDivider} />
          <Pressable style={styles.filtersBtn} onPress={() => {}}>
            <Filter size={18} color="#476f8b" />
            <Text style={styles.filtersText}>Filters</Text>
          </Pressable>
        </View>

        <View style={[styles.sectionCard, { width: screenWidth - 32 }]}>
          <Text style={styles.sectionTitle}>Recent chats</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {filtered.length === 0 && !error ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <MessageCircle size={26} color="#ff0f64" />
              </View>
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptySub}>When you message a hostel, it will appear here.</Text>
            </View>
          ) : null}

          {filtered.length > 0 ? (
            <View style={styles.tilesWrap}>
              {filtered.map((r) => {
                const listing = (Array.isArray(r.listings) ? r.listings[0] : r.listings) ?? null;
                const title = displayName(listing);
                const location = [listing?.area, listing?.city, listing?.campus].filter(Boolean).join(" • ");
                const pill = statusPill(String(r.status ?? "new"));

                return (
                  <Pressable
                    key={r.id}
                    onPress={() => {
                      if (!isOnline) {
                        Alert.alert("Internet required", "Open chat requires internet connection.");
                        return;
                      }
                      router.push({ pathname: "/(student)/chat/[enquiryId]", params: { enquiryId: r.id } });
                    }}
                    style={({ pressed }) => [styles.chatCard, pressed && { backgroundColor: "#f6f9ff" }]}
                  >
                    <View style={styles.chatRow}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials(title)}</Text>
                      </View>

                      <View style={styles.chatMain}>
                        <View style={styles.chatTopRow}>
                          <Text numberOfLines={1} style={styles.chatTitle}>
                            {title}
                          </Text>
                          {pill.show ? (
                            <View style={[styles.statusBadge, { backgroundColor: pill.bg, borderColor: pill.border }]}>
                              <Text style={[styles.statusBadgeText, { color: pill.text }]}>{pill.label}</Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={styles.locRow}>
                          <MapPin size={14} color="#5f6b85" />
                          <Text numberOfLines={1} style={styles.locText}>
                            {location || "Location not provided"}
                          </Text>
                        </View>

                        <Text numberOfLines={2} style={styles.preview}>
                          {r.message || "Open chat"}
                        </Text>

                        <View style={styles.metaRow}>
                          <View style={styles.compareChip}>
                            <Text style={styles.compareChipText}>Compare</Text>
                          </View>
                          <Text style={styles.timeText}>{fmtTime(r.created_at)}</Text>
                        </View>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <RoomsBottomNav active="messages" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  content: { padding: 16, paddingBottom: 120, gap: 14 },

  skeletonWrap: { padding: 16, gap: 10 },
  skeletonRow: { height: 86, borderRadius: 24, backgroundColor: "#dde6ff" },

  heroCard: {
    position: "relative",
    overflow: "hidden",
    minHeight: 170,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#edf0f8",
    backgroundColor: "#edf8ff",
    padding: 22,
    justifyContent: "space-between",
  },
  heroTextWrap: { zIndex: 2, maxWidth: "62%" },
  heroCloud: {
    position: "absolute",
    top: 26,
    right: 132,
    width: 66,
    height: 18,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  heroSun: {
    position: "absolute",
    right: 18,
    top: 18,
    width: 126,
    height: 126,
    borderRadius: 999,
    backgroundColor: "rgba(255,234,176,0.72)",
  },
  heroHorizon: {
    position: "absolute",
    left: -20,
    right: -20,
    bottom: -28,
    height: 72,
    borderRadius: 72,
    backgroundColor: "rgba(202,234,218,0.65)",
  },
  heroTitle: { color: "#102968", fontSize: 36, fontWeight: "900" },
  heroSub: { marginTop: 6, color: "#4d658f", fontSize: 15, fontWeight: "500" },
  heroHouse: {
    position: "absolute",
    right: 18,
    bottom: 14,
    width: 128,
    height: 92,
    alignItems: "center",
    justifyContent: "flex-end",
    zIndex: 2,
  },
  houseRoof: {
    position: "absolute",
    top: 10,
    width: 86,
    height: 30,
    backgroundColor: "#6cb8c6",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 12,
    transform: [{ skewX: "-26deg" }],
  },
  houseBody: {
    width: 78,
    height: 54,
    borderRadius: 8,
    backgroundColor: "#fffaf0",
    borderWidth: 1,
    borderColor: "#d8e7ea",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-evenly",
    paddingBottom: 8,
  },
  houseWindow: { width: 12, height: 12, borderRadius: 3, backgroundColor: "#9ed3dd" },
  houseDoor: { width: 14, height: 24, borderRadius: 4, backgroundColor: "#7fb6c8" },
  houseBushLeft: {
    position: "absolute",
    left: 12,
    bottom: 0,
    width: 30,
    height: 16,
    borderRadius: 16,
    backgroundColor: "#9fd0b1",
  },
  houseBushRight: {
    position: "absolute",
    right: 8,
    bottom: 2,
    width: 34,
    height: 18,
    borderRadius: 16,
    backgroundColor: "#8dc4a1",
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e6eaf5",
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  searchInput: { flex: 1, color: "#66708e", fontSize: 16, fontWeight: "500" },
  searchDivider: { width: 1, height: 28, backgroundColor: "#e7eaf6" },
  filtersBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 6, paddingVertical: 2 },
  filtersText: { color: "#0e2756", fontSize: 14, fontWeight: "800" },

  sectionCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#edf0f8",
    backgroundColor: "#fbfcff",
    padding: 18,
    gap: 12,
  },
  sectionTitle: { color: "#102968", fontSize: 18, fontWeight: "900" },

  errorBox: {
    borderWidth: 1,
    borderColor: "#fecdd3",
    backgroundColor: "#fff1f2",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: { color: "#be123c", fontWeight: "700", fontSize: 13 },

  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#edf0f8",
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "#fff0f6",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { marginTop: 12, color: "#0e2756", fontSize: 18, fontWeight: "900" },
  emptySub: { marginTop: 6, color: "#5f6b85", fontSize: 13, fontWeight: "600", textAlign: "center" },

  tilesWrap: { gap: 14 },
  chatCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e9edf7",
    shadowColor: "#0e2756",
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  chatRow: { flexDirection: "row", alignItems: "flex-start" },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "#0e2756",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  chatMain: { flex: 1, minWidth: 0, marginLeft: 12 },
  chatTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  chatTitle: { flex: 1, color: "#0e2756", fontSize: 17, fontWeight: "900" },

  statusBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  statusBadgeText: { fontSize: 11, fontWeight: "800" },

  locRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  locText: { flex: 1, color: "#5f6b85", fontSize: 12, fontWeight: "700" },

  preview: { marginTop: 10, color: "#4f5875", fontSize: 14, lineHeight: 20, fontWeight: "500" },
  metaRow: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  compareChip: {
    borderWidth: 1,
    borderColor: "#e2e7f3",
    backgroundColor: "#fbfcff",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  compareChipText: { color: "#102968", fontSize: 12, fontWeight: "800" },
  timeText: { color: "#6d7694", fontSize: 12, fontWeight: "700" },
});
