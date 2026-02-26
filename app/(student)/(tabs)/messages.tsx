/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Building2,
  ChevronRight,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
} from "lucide-react-native";
import TopNav from "@/components/TopNav";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";

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
  if (s === "new") return { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", label: "New" };
  if (s === "replied") return { bg: "#ecfdf5", border: "#bbf7d0", text: "#15803d", label: "Replied" };
  if (s === "read") return { bg: "#ecfdf5", border: "#bbf7d0", text: "#15803d", label: "Read" };
  if (s === "closed") return { bg: "#f3f4f6", border: "#e5e7eb", text: "#6b7280", label: "Closed" };
  return { bg: "#f6f7fb", border: "#e7eaf6", text: "#0e2756", label: status || "-" };
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
        <TopNav title="Messages" />
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
      <TopNav title="Messages" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff0f64" />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.h1}>Messages</Text>
            <Text style={styles.sub}>Chats you started with hostels/landlords.</Text>
          </View>

          <View style={styles.headerActions}>
            <View style={styles.searchWrap}>
              <Search size={16} color="#5f6b85" />
              <TextInput
                style={styles.searchInput}
                value={q}
                onChangeText={setQ}
                placeholder="Search hostel name, location, message..."
                placeholderTextColor="#9aa3bd"
              />
            </View>

            <Pressable style={styles.dashboardBtn} onPress={() => router.push("/student/dashboard")}>
              <Text style={styles.dashboardBtnText}>Dashboard</Text>
            </Pressable>
          </View>
        </View>

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
            {filtered.map((r, index) => {
              const listing = (Array.isArray(r.listings) ? r.listings[0] : r.listings) ?? null;
              const title = displayName(listing);
              const location = [listing?.area, listing?.city, listing?.campus].filter(Boolean).join(" • ");
              const pill = statusPill(String(r.status ?? "new"));
              const Icon = listing?.listing_type === "hostel" ? Building2 : ShieldCheck;

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
                  style={({ pressed }) => [
                    styles.tile,
                    index === filtered.length - 1 && styles.tileLast,
                    pressed && { backgroundColor: "#f6f7fb" },
                  ]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(title)}</Text>
                  </View>

                  <View style={styles.tileMain}>
                    <View style={styles.titleRow}>
                      <Text numberOfLines={1} style={styles.tileTitle}>{title}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: pill.bg, borderColor: pill.border }]}>
                        <Text style={[styles.statusBadgeText, { color: pill.text }]}>{pill.label}</Text>
                      </View>
                    </View>

                    <View style={styles.locRow}>
                      <MapPin size={14} color="#5f6b85" />
                      <Text numberOfLines={1} style={styles.locText}>{location || "Location not provided"}</Text>
                    </View>

                    <Text numberOfLines={1} style={styles.preview}>{r.message || "Open chat"}</Text>
                  </View>

                  <View style={styles.tileRight}>
                    <Text style={styles.timeText}>{fmtTime(r.created_at)}</Text>
                    <View style={styles.tileRightIcons}>
                      <Icon size={14} color="#5f6b85" />
                      <ChevronRight size={16} color="#9aa3bd" />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  skeletonWrap: { padding: 16, gap: 10 },
  skeletonRow: { height: 82, borderRadius: 16, backgroundColor: "#dde6ff" },
  headerRow: { gap: 10 },
  h1: { color: "#0e2756", fontSize: 24, fontWeight: "900" },
  sub: { color: "#5f6b85", fontSize: 13, fontWeight: "600", marginTop: 2 },
  headerActions: { gap: 8 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e7eaf6",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  searchInput: { flex: 1, color: "#0e2756", fontSize: 14, fontWeight: "600" },
  dashboardBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#e7eaf6",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dashboardBtnText: { color: "#0e2756", fontWeight: "700", fontSize: 13 },
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
    marginTop: 2,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
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
  tilesWrap: {
    marginTop: 2,
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eef1fb",
    backgroundColor: "#fff",
  },
  tileLast: { borderBottomWidth: 0 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#0e2756",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "900" },
  tileMain: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tileTitle: { flex: 1, color: "#0e2756", fontSize: 15, fontWeight: "900" },
  statusBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 10, fontWeight: "700" },
  locRow: { marginTop: 4, flexDirection: "row", alignItems: "center", gap: 6 },
  locText: { flex: 1, color: "#5f6b85", fontSize: 12, fontWeight: "600" },
  preview: { marginTop: 6, color: "#5f6b85", fontSize: 13 },
  tileRight: { alignItems: "flex-end", gap: 8 },
  timeText: { color: "#9aa3bd", fontSize: 11, fontWeight: "700" },
  tileRightIcons: { flexDirection: "row", alignItems: "center", gap: 6 },
});
