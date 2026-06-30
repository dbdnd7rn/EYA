/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Bookmark, MapPin, Trash2, Search } from "lucide-react-native";
import RoomsBottomNav from "@/components/rooms/RoomsBottomNav";
import RoomsSectionHeader from "@/components/rooms/RoomsSectionHeader";
import {
  applyPendingSavedOpsToRows,
  getSavedRoomsCache,
  queueOfflineSaveToggle,
  setSavedRoomsCache,
  syncSavedRoomsQueue,
  type SavedRowCache,
} from "@/lib/savedRoomsOffline";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

type ListingRow = {
  id: string;
  title: string;
  listing_type: "hostel" | "bedsitter";
  campus: string | null;
  area: string | null;
  city: string | null;
  price_from: number | null;
  room_types: string[] | null;
  image_urls: string[] | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string | null;
};

type SavedRow = {
  id: string;
  listing_id: string;
  created_at: string | null;
  listings: ListingRow | null;
};

function formatPrice(amount?: number | null) {
  if (!amount) return "Ask landlord";
  return `K${Number(amount).toLocaleString("en-MW")}`;
}

export default function SavedRoomsScreen() {
  const { user, loading: authLoading } = useAuth();
  const { isOnline } = useNetwork();
  const { theme } = useStudentTheme();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc">("newest");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  const load = async (opts?: { silent?: boolean }) => {
    if (!user) return;

    try {
      if (!opts?.silent) setLoading(true);
      setErr(null);

      if (isOnline) {
        await syncSavedRoomsQueue(user.id);
      }

      if (!isOnline) {
        const cached = await getSavedRoomsCache(user.id);
        const rows = await applyPendingSavedOpsToRows(user.id, (cached?.data ?? []) as SavedRowCache[]);
        setSaved(rows as SavedRow[]);
        setErr(cached?.data ? null : "No saved rooms cache yet.");
        return;
      }

      const { data, error } = await supabase
        .from("saved_rooms")
        .select(
          `
          id,
          listing_id,
          created_at,
          listings:listing_id (
            id,
            title,
            listing_type,
            campus,
            area,
            city,
            price_from,
            room_types,
            image_urls,
            latitude,
            longitude,
            created_at
          )
        `,
        )
        .eq("student_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const normalized: SavedRow[] = (data ?? []).map((r: any) => ({
        id: r.id,
        listing_id: r.listing_id,
        created_at: r.created_at,
        listings: r.listings ?? null,
      }));

      setSaved(normalized);
      await setSavedRoomsCache(user.id, normalized as SavedRowCache[]);
    } catch {
      const cached = await getSavedRoomsCache(user.id);
      const rows = await applyPendingSavedOpsToRows(user.id, (cached?.data ?? []) as SavedRowCache[]);
      setSaved(rows as SavedRow[]);
      setErr(cached?.data?.length ? null : "Failed to load saved rooms.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user?.id, isOnline]);

  const sortedSaved = useMemo(() => {
    const arr = [...saved];
    const getPrice = (s: SavedRow) => s.listings?.price_from ?? null;

    if (sort === "newest") return arr;

    return arr.sort((a, b) => {
      const pa = getPrice(a);
      const pb = getPrice(b);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return sort === "price_asc" ? pa - pb : pb - pa;
    });
  }, [saved, sort]);

  const removeSaved = async (savedId: string) => {
    if (!user) return;

    Alert.alert("Remove saved room", "Remove this room from saved?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setRemovingId(savedId);

          const target = saved.find((x) => x.id === savedId);
          if (!target) {
            setRemovingId(null);
            return;
          }

          if (!isOnline) {
            await queueOfflineSaveToggle({
              studentId: user.id,
              listingId: target.listing_id,
              nextSaved: false,
            });
            setSaved((prev) => prev.filter((x) => x.id !== savedId));
            setErr(null);
            setRemovingId(null);
            return;
          }

          const { error } = await supabase
            .from("saved_rooms")
            .delete()
            .eq("id", savedId)
            .eq("student_id", user.id);

          if (error) {
            setErr(error.message);
            setRemovingId(null);
            return;
          }

          setSaved((prev) => {
            const next = prev.filter((x) => x.id !== savedId);
            void setSavedRoomsCache(user.id, next as SavedRowCache[]);
            return next;
          });
          setRemovingId(null);
        },
      },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ silent: true });
  };

  const cycleSort = () => {
    setSort((s) => (s === "newest" ? "price_asc" : s === "price_asc" ? "price_desc" : "newest"));
  };

  if (authLoading || loading) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={styles.headerWrap}>
          <RoomsSectionHeader />
        </View>
        <View style={styles.loadingWrap}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={[styles.skeletonCard, { backgroundColor: theme.surfaceMuted }]} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      >
        <RoomsSectionHeader />

        <View style={styles.headerBlock}>
          <View>
            <Text style={[styles.h1, { color: theme.heading }]}>Saved rooms</Text>
            <Text style={[styles.sub, { color: theme.textMuted }]}>Rooms you've bookmarked for later.</Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable style={[styles.sortBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={cycleSort}>
              <Text style={[styles.sortBtnText, { color: theme.text }]}>
                {sort === "newest" ? "Newest" : sort === "price_asc" ? "Price: Low -> High" : "Price: High -> Low"}
              </Text>
            </Pressable>

            <Pressable style={[styles.primaryBtn, { backgroundColor: theme.accent }]} onPress={() => router.push("/(student)/(tabs)/rooms")}>
              <Search size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Find rooms</Text>
            </Pressable>
          </View>
        </View>

        {err ? (
          <View style={[styles.errBox, { backgroundColor: theme.isDark ? "#2a1e28" : "#fff0f6", borderColor: theme.isDark ? "#52313f" : "#ffd4e3" }]}>
            <Text style={[styles.errText, { color: theme.isDark ? "#ffb3c6" : "#b0003a" }]}>{err}</Text>
          </View>
        ) : null}

        {sortedSaved.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.accentSoft }]}>
              <Bookmark size={24} color={theme.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No saved rooms yet</Text>
            <Text style={[styles.emptySub, { color: theme.textMuted }]}>When you save rooms, they'll appear here so you can compare later.</Text>
            <Pressable style={[styles.primaryWide, { backgroundColor: theme.accent }]} onPress={() => router.push("/(student)/(tabs)/rooms")}>
              <Search size={16} color="#fff" />
              <Text style={styles.primaryWideText}>Browse rooms</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.grid}>
            {sortedSaved.map((s) => {
              const r = s.listings;
              if (!r) return null;
              const photo = r.image_urls?.[0] ?? null;
              const loc = [r.area, r.city, r.campus].filter(Boolean).join(" • ");
              const isRemoving = removingId === s.id;

              return (
                <Pressable
                  key={s.id}
                  style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  onPress={() => router.push({ pathname: "/(student)/room/[id]", params: { id: r.id } })}
                >
                  <View style={[styles.imageWrap, { backgroundColor: theme.surfaceMuted }]}>
                    {photo ? (
                      <Image source={{ uri: photo }} style={styles.cover} resizeMode="cover" />
                    ) : (
                      <View style={[styles.cover, styles.coverEmpty]}>
                        <Text style={[styles.coverEmptyText, { color: theme.textMuted }]}>No photo</Text>
                      </View>
                    )}

                    <View style={styles.savedBadge}>
                      <Text style={styles.savedBadgeText}>Saved</Text>
                    </View>

                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        removeSaved(s.id);
                      }}
                      disabled={isRemoving}
                      style={[styles.removeBtnOverlay, isRemoving && { opacity: 0.7 }]}
                    >
                      <Trash2 size={14} color="#b0003a" />
                      <Text style={styles.removeBtnOverlayText}>{isRemoving ? "Removing..." : "Remove"}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.cardBody}>
                    <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>{r.title}</Text>

                    <View style={styles.locRow}>
                      <MapPin size={14} color={theme.textSoft} />
                      <Text numberOfLines={1} style={[styles.locText, { color: theme.textMuted }]}>{loc || "Location not provided"}</Text>
                    </View>

                    <View style={styles.rowBetween}>
                      <Text style={[styles.price, { color: theme.text }]}>{formatPrice(r.price_from)}</Text>
                      <Text style={[styles.viewLink, { color: theme.accent }]}>View {'>'}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <RoomsBottomNav active="saved" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  scroller: { flex: 1 },
  content: { padding: 16, paddingBottom: 164, gap: 12 },
  headerWrap: { padding: 16, paddingBottom: 0 },
  loadingWrap: { padding: 16, gap: 12 },
  skeletonCard: { height: 220, borderRadius: 24, backgroundColor: "#dde6ff" },
  headerBlock: { gap: 10 },
  h1: { color: "#0e2756", fontSize: 24, fontWeight: "900" },
  sub: { color: "#5f6b85", fontSize: 13, fontWeight: "700", marginTop: 3 },
  headerActions: { gap: 8 },
  sortBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e7eaf6",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sortBtnText: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  primaryBtn: {
    backgroundColor: "#ff0f64",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  errBox: { borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", borderRadius: 16, padding: 12 },
  errText: { color: "#b0003a", fontWeight: "900" },
  emptyCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: "#fff0f6", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#0e2756", fontWeight: "900", fontSize: 18 },
  emptySub: { color: "#5f6b85", fontWeight: "700", fontSize: 12, textAlign: "center" },
  primaryWide: {
    marginTop: 4,
    width: "100%",
    backgroundColor: "#ff0f64",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryWideText: { color: "#fff", fontWeight: "900" },
  grid: { gap: 14 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  imageWrap: { position: "relative", height: 176, backgroundColor: "#eef1fb" },
  cover: { width: "100%", height: "100%", backgroundColor: "#eef1fb" },
  coverEmpty: { alignItems: "center", justifyContent: "center" },
  coverEmptyText: { color: "#5f6b85", fontWeight: "700" },
  savedBadge: {
    position: "absolute",
    left: 10,
    top: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  savedBadgeText: { color: "#0e2756", fontWeight: "800", fontSize: 11 },
  removeBtnOverlay: {
    position: "absolute",
    right: 10,
    top: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fff0f6",
    borderWidth: 1,
    borderColor: "#ffd4e3",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  removeBtnOverlayText: { color: "#b0003a", fontWeight: "800", fontSize: 11 },
  cardBody: { padding: 14, gap: 8 },
  title: { color: "#0e2756", fontWeight: "900", fontSize: 15 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locText: { flex: 1, color: "#5f6b85", fontWeight: "700", fontSize: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginTop: 2 },
  price: { color: "#0e2756", fontWeight: "900", fontSize: 14 },
  viewLink: { color: "#ff0f64", fontWeight: "900", fontSize: 12 },
});
