import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { BedDouble, Building2, MapPin, MessageCircle, Search, Star } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { supabase } from "@/lib/supabase";
import { useNetwork } from "@/providers/NetworkProvider";
import { locationMatchScore, usePreferredLocation } from "@/providers/PreferredLocationProvider";
import RoomsBottomNav from "@/components/rooms/RoomsBottomNav";
import RoomsSectionHeader from "@/components/rooms/RoomsSectionHeader";
import { useLiveProximity } from "@/lib/liveProximity";
import { rankRoomListing } from "@/lib/roomProximity";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

type ListingType = "hostel" | "bedsitter";
type SortKey = "newest" | "cheapest";

type ListingRow = {
  id: string;
  title: string;
  listing_type: ListingType;
  campus: string | null;
  area: string | null;
  city: string | null;
  price_from: number | null;
  image_urls: string[] | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string | null;
  visibility_rank?: number | null;
};

function formatPrice(amount?: number | null) {
  if (!amount) return "Ask landlord";
  return `K${Number(amount).toLocaleString("en-MW")}`;
}

export default function RoomsScreen() {
  const router = useRouter();
  const { theme } = useStudentTheme();
  const { isOnline } = useNetwork();
  const preferredLocation = usePreferredLocation().location;
  const { point: liveLocation } = useLiveProximity(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | ListingType>("");
  const [sort, setSort] = useState<SortKey>("newest");
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErr(null);

      try {
        if (isOnline) {
          const { data, error } = await supabase
            .from("listings")
            .select("id, title, listing_type, campus, area, city, price_from, image_urls, latitude, longitude, created_at")
            .eq("is_active", true);

          if (error) throw error;
          const nextRows = (data ?? []) as ListingRow[];
          setRows(nextRows);
          await setCachedJson("student_rooms_v2", nextRows);
        } else {
          const cached = await getCachedJson<ListingRow[]>("student_rooms_v2");
          setRows(cached?.data ?? []);
          if (!cached?.data?.length) setErr("No cached rooms available yet.");
        }
      } catch (e: any) {
        const cached = await getCachedJson<ListingRow[]>("student_rooms_v2");
        setRows(cached?.data ?? []);
        if (!cached?.data?.length) setErr(e?.message ?? "Failed to load rooms.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    void run();
  }, [isOnline, refreshing]);

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [reveal, q, type, sort]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let next = rows.filter((r) => {
      if (type && r.listing_type !== type) return false;
      if (!term) return true;
      return [r.title, r.area, r.city, r.campus].some((v) => (v ?? "").toLowerCase().includes(term));
    });

    next = next.sort((a, b) => {
      const savedA = locationMatchScore(preferredLocation, { area: a.area, campus: a.campus, city: a.city });
      const savedB = locationMatchScore(preferredLocation, { area: b.area, campus: b.campus, city: b.city });
      const rankA = rankRoomListing({ item: a, liveLocation, savedLocationScore: savedA });
      const rankB = rankRoomListing({ item: b, liveLocation, savedLocationScore: savedB });
      if (sort === "cheapest") {
        const priceDelta = (a.price_from ?? Number.MAX_SAFE_INTEGER) - (b.price_from ?? Number.MAX_SAFE_INTEGER);
        if (priceDelta !== 0) return priceDelta;
      }
      if (rankB.score !== rankA.score) return rankB.score - rankA.score;
      if (rankA.distanceMeters !== rankB.distanceMeters) {
        return (rankA.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (rankB.distanceMeters ?? Number.MAX_SAFE_INTEGER);
      }
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });

    return next;
  }, [liveLocation, preferredLocation, rows, q, type, sort]);

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} tintColor={theme.accent} />}
      >
        <RoomsSectionHeader />

        <View style={styles.hero}>
          <Text style={[styles.h1, { color: theme.heading }]}>EYA rooms</Text>
          <Text style={[styles.sub, { color: theme.textMuted }]}>Browse verified hostels and bedsitters with clearer details.</Text>
        </View>

        <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Search size={16} color={theme.textSoft} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            value={q}
            onChangeText={setQ}
            placeholder="Search room, area, campus..."
            placeholderTextColor={theme.textSoft}
          />
        </View>

        <View style={styles.filtersRow}>
          <Pressable style={[styles.filterChip, { backgroundColor: theme.surface, borderColor: theme.border }, type === "" && { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => setType("")}>
            <Text style={[styles.filterText, { color: theme.text }, type === "" && styles.filterTextActive]}>All</Text>
          </Pressable>
          <Pressable style={[styles.filterChip, { backgroundColor: theme.surface, borderColor: theme.border }, type === "hostel" && { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => setType("hostel")}>
            <Text style={[styles.filterText, { color: theme.text }, type === "hostel" && styles.filterTextActive]}>Hostel</Text>
          </Pressable>
          <Pressable style={[styles.filterChip, { backgroundColor: theme.surface, borderColor: theme.border }, type === "bedsitter" && { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => setType("bedsitter")}>
            <Text style={[styles.filterText, { color: theme.text }, type === "bedsitter" && styles.filterTextActive]}>Bedsitter</Text>
          </Pressable>
          <Pressable style={[styles.sortChip, { backgroundColor: theme.accentSoft, borderColor: theme.border }]} onPress={() => setSort((s) => (s === "newest" ? "cheapest" : "newest"))}>
            <Text style={[styles.sortText, { color: theme.accent }]}>{sort === "newest" ? "Newest" : "Cheapest"}</Text>
          </Pressable>
        </View>

        <Pressable style={[styles.enquiryBtn, { backgroundColor: theme.accent }]} onPress={() => router.push("/(student)/(tabs)/room-messages")}>
          <MessageCircle size={15} color="#fff" />
          <Text style={styles.enquiryBtnText}>Open enquiry chats</Text>
        </Pressable>

        {err ? (
          <View style={[styles.errCard, { backgroundColor: theme.isDark ? "#2a1e28" : "#fff0f6", borderColor: theme.isDark ? "#52313f" : "#ffd4e3" }]}>
            <Text style={[styles.errText, { color: theme.isDark ? "#ffb3c6" : "#b0003a" }]}>{err}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={theme.accent} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No rooms found</Text>
            <Text style={[styles.emptySub, { color: theme.textMuted }]}>Try another search or switch listing type.</Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {filtered.map((room, index) => {
              const photo = room.image_urls?.[0] ?? "https://placehold.co/1000x600?text=Room";
              const input = index * 0.14;
              return (
                <Animated.View
                  key={room.id}
                  style={{
                    opacity: reveal.interpolate({ inputRange: [input, input + 0.35], outputRange: [0, 1], extrapolate: "clamp" }),
                    transform: [
                      {
                        translateY: reveal.interpolate({
                          inputRange: [input, input + 0.35],
                          outputRange: [16, 0],
                          extrapolate: "clamp",
                        }),
                      },
                    ],
                  }}
                >
                  <Pressable style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.push({ pathname: "/(student)/room/[id]", params: { id: room.id } })}>
                    <ImageBackground source={{ uri: photo }} style={styles.cover} imageStyle={styles.coverImg}>
                      <View style={styles.overlay} />
                      <View style={styles.cardTop}>
                        <Text style={styles.typeChip}>{room.listing_type === "hostel" ? "Hostel" : "Bedsitter"}</Text>
                        <Text style={styles.priceChip}>{formatPrice(room.price_from)}</Text>
                      </View>
                      <View style={styles.cardBottom}>
                        <Text style={styles.cardTitle}>{room.title}</Text>
                        <View style={styles.metaRow}>
                          <View style={styles.metaItem}>
                            <Building2 size={13} color="#fff" />
                            <Text style={styles.metaText}>{room.campus || "Campus"}</Text>
                          </View>
                          <View style={styles.metaItem}>
                            <MapPin size={13} color="#fff" />
                            <Text style={styles.metaText}>{[room.area, room.city].filter(Boolean).join(", ") || "Location not set"}</Text>
                          </View>
                          <View style={styles.metaItem}>
                            <Star size={13} color="#ffd166" />
                            <Text style={styles.metaText}>Verified listings</Text>
                          </View>
                        </View>
                      </View>
                    </ImageBackground>
                    <View style={styles.footer}>
                      <Text style={[styles.footerText, { color: theme.text }]}>View details</Text>
                      <BedDouble size={15} color={theme.accent} />
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <RoomsBottomNav active="rooms" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f4f7" },
  scroller: { flex: 1 },
  content: { padding: 16, paddingBottom: 164, gap: 12 },
  hero: { gap: 4 },
  h1: { color: "#0e2756", fontSize: 27, fontWeight: "900" },
  sub: { color: "#6e7892", fontSize: 13, fontWeight: "600" },
  searchWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e4e8f4",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  searchInput: { flex: 1, color: "#0e2756", fontSize: 14, fontWeight: "600" },
  filtersRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dfe5f4",
    backgroundColor: "#fff",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  filterChipActive: { backgroundColor: "#0e2756", borderColor: "#0e2756" },
  filterText: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  filterTextActive: { color: "#fff" },
  sortChip: { borderRadius: 999, borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", paddingHorizontal: 11, paddingVertical: 7 },
  sortText: { color: "#b0003a", fontWeight: "800", fontSize: 12 },
  enquiryBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#0e2756",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  enquiryBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  errCard: { borderRadius: 15, borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", padding: 11 },
  errText: { color: "#b0003a", fontWeight: "700", fontSize: 12 },
  loadingWrap: { paddingVertical: 26 },
  emptyCard: { borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e7ebf5", padding: 16, alignItems: "center", gap: 5 },
  emptyTitle: { color: "#0e2756", fontWeight: "900", fontSize: 19 },
  emptySub: { color: "#6e7892", fontWeight: "600", fontSize: 12, textAlign: "center" },
  card: { borderRadius: 22, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e7ebf5", overflow: "hidden" },
  cover: { height: 200, justifyContent: "space-between", padding: 12 },
  coverImg: { borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,13,24,0.34)" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  typeChip: { backgroundColor: "rgba(255,255,255,0.9)", color: "#0e2756", fontWeight: "800", fontSize: 11, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, overflow: "hidden" },
  priceChip: { backgroundColor: "rgba(14,39,86,0.9)", color: "#fff", fontWeight: "900", fontSize: 11, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, overflow: "hidden" },
  cardBottom: { gap: 4 },
  cardTitle: { color: "#fff", fontWeight: "900", fontSize: 20 },
  metaRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  footer: { paddingHorizontal: 12, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerText: { color: "#0e2756", fontWeight: "900", fontSize: 13 },
});



