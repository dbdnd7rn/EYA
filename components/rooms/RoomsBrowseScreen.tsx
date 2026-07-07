import React from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Bell, Heart, PiggyBank, Scale, Search, User2 } from "lucide-react-native";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import {
  applyPendingSavedOpsToRows,
  getSavedRoomsCache,
  queueOfflineSaveToggle,
  setSavedRoomsCache,
  syncSavedRoomsQueue,
  type SavedListingSnapshot,
  type SavedRowCache,
} from "@/lib/savedRoomsOffline";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useNotificationInbox } from "@/providers/NotificationInboxProvider";
import { useLiveProximity } from "@/lib/liveProximity";
import { rankRoomListing } from "@/lib/roomProximity";

type OccupancyMode = "single" | "shared";
type ListingType = "hostel" | "bedsitter";

type ListingRow = {
  id: string;
  title: string;
  listing_type: ListingType;
  campus: string | null;
  area: string | null;
  city: string | null;
  price_from: number | null;
  room_types: string[] | null;
  image_urls: string[] | null;
  occupancy_mode: OccupancyMode | null;
  students_per_room: number | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string | null;
  visibility_rank?: number | null;
};

type SortMode = "recommended" | "affordable";

const CACHE_KEY = "student_rooms_all";

function formatPrice(amount?: number | null) {
  if (!amount) return "Ask landlord";
  return `K${Number(amount).toLocaleString("en-MW")}`;
}

function coverImage(row: Pick<ListingRow, "image_urls">) {
  const first = row.image_urls?.find(Boolean);
  return first || "https://placehold.co/900x600?text=No+Photo";
}

function locationLine(row: Pick<ListingRow, "area" | "city" | "campus">) {
  return [row.area, row.city, row.campus].filter(Boolean).join(" • ") || "Near campus";
}

function etaFromIndex(index: number) {
  const base = 22 + (index % 6);
  return `${base} mins`;
}

function snapshotFromListing(row: ListingRow): SavedListingSnapshot {
  return {
    id: row.id,
    title: row.title,
    listing_type: row.listing_type,
    campus: row.campus,
    area: row.area,
    city: row.city,
    price_from: row.price_from,
    room_types: row.room_types,
    image_urls: row.image_urls,
    latitude: row.latitude,
    longitude: row.longitude,
    created_at: row.created_at ?? null,
  };
}

function QuickChip({
  active,
  icon,
  label,
  onPress,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.quickChip, active && styles.quickChipActive]} onPress={onPress}>
      <View style={[styles.quickChipIcon, active && styles.quickChipIconActive]}>{icon}</View>
      <Text style={[styles.quickChipText, active && styles.quickChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TopPickCard({
  index,
  item,
  saved,
  onPress,
  onToggleSaved,
}: {
  index: number;
  item: ListingRow;
  saved: boolean;
  onPress: () => void;
  onToggleSaved: () => void;
}) {
  const badge = item.listing_type === "hostel" ? "Hostel" : "Bedsitter";
  const priceLabel = item.price_from ? `${formatPrice(item.price_from)} / month` : "Ask landlord";
  const roomType = item.room_types?.[0] ?? "Room";
  const studentsLabel = item.students_per_room ? `${item.students_per_room} students / room` : "Shared options";

  return (
    <Pressable style={styles.topPickCard} onPress={onPress}>
      <View style={styles.topPickImageWrap}>
        <Image source={{ uri: coverImage(item) }} style={styles.topPickImage} />
        <Pressable
          style={[styles.heartBtn, saved && styles.heartBtnActive]}
          onPress={(e) => {
            e.stopPropagation();
            onToggleSaved();
          }}
        >
          <Heart size={18} color={saved ? "#ff0f64" : "#102a54"} fill={saved ? "#ff0f64" : "transparent"} />
        </Pressable>
      </View>

      <View style={styles.topPickBody}>
        <View style={styles.rowBetween}>
          <Text numberOfLines={1} style={styles.topPickTitle}>{item.title}</Text>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>

        <Text numberOfLines={1} style={styles.topPickLocation}>{locationLine(item)}</Text>

        <View style={styles.priceRow}>
          <Text style={styles.priceText}>{priceLabel}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>{etaFromIndex(index)}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>{roomType}</Text>
          </View>
          <View style={styles.metaPillSoft}>
            <Text style={styles.metaPillSoftText}>Compare</Text>
          </View>
        </View>

        <Text style={styles.studentsText}>{studentsLabel}</Text>
      </View>
    </Pressable>
  );
}

export default function RoomsBrowseScreen() {
  const router = useRouter();
  const { isOnline } = useNetwork();
  const { user } = useAuth();
  const { unreadCount } = useNotificationInbox();
  const { point: liveLocation } = useLiveProximity(true);

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [all, setAll] = React.useState<ListingRow[]>([]);
  const [query, setQuery] = React.useState("");
  const [sortMode, setSortMode] = React.useState<SortMode>("recommended");
  const [savedSet, setSavedSet] = React.useState<Set<string>>(() => new Set());

  const loadListings = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      if (isOnline) {
        const { data, error } = await supabase
          .from("listings")
          .select("id, title, listing_type, campus, area, city, price_from, room_types, image_urls, occupancy_mode, students_per_room, latitude, longitude, created_at")
          .eq("is_active", true);
        if (error) throw error;
        const rows = (data ?? []) as ListingRow[];
        setAll(rows);
        await setCachedJson(CACHE_KEY, rows);
      } else {
        const cached = await getCachedJson<ListingRow[]>(CACHE_KEY);
        if (!cached?.data?.length) {
          setAll([]);
          setError("No cached rooms available yet.");
        } else {
          setAll(cached.data);
        }
      }
    } catch (e: any) {
      const cached = await getCachedJson<ListingRow[]>(CACHE_KEY);
      if (cached?.data?.length) {
        setAll(cached.data);
      } else {
        setAll([]);
        setError(e?.message ?? "Failed to load rooms.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOnline]);

  const hydrateSaved = React.useCallback(async () => {
    if (!user?.id) {
      setSavedSet(new Set());
      return;
    }

    try {
      const cached = await getSavedRoomsCache(user.id);
      const projected = await applyPendingSavedOpsToRows(user.id, (cached?.data ?? []) as SavedRowCache[]);
      setSavedSet(new Set(projected.map((r) => r.listing_id)));

      if (!isOnline) return;

      await syncSavedRoomsQueue(user.id);
      const { data, error } = await supabase.from("saved_rooms").select("id, listing_id, created_at").eq("student_id", user.id);
      if (error) return;

      const normalized: SavedRowCache[] = (data ?? []).map((r: any) => ({
        id: r.id,
        listing_id: r.listing_id,
        created_at: r.created_at ?? null,
        listings: null,
      }));
      await setSavedRoomsCache(user.id, normalized);
      const reProjected = await applyPendingSavedOpsToRows(user.id, normalized);
      setSavedSet(new Set(reProjected.map((r) => r.listing_id)));
    } catch {
      // ignore saved hydration errors
    }
  }, [isOnline, user?.id]);

  React.useEffect(() => {
    void loadListings();
  }, [loadListings]);

  React.useEffect(() => {
    void hydrateSaved();
  }, [hydrateSaved]);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    let rows = all.filter((row) => {
      const matchesTerm = !term || [row.title, row.area, row.city, row.campus].some((v) => (v ?? "").toLowerCase().includes(term));
      return matchesTerm;
    });

    if (sortMode === "affordable") {
      rows = rows
        .slice()
        .sort((a, b) => {
          const priceDelta = (a.price_from ?? Number.MAX_SAFE_INTEGER) - (b.price_from ?? Number.MAX_SAFE_INTEGER);
          if (priceDelta !== 0) return priceDelta;
          const rankA = rankRoomListing({ item: a, liveLocation });
          const rankB = rankRoomListing({ item: b, liveLocation });
          return rankB.score - rankA.score || (rankA.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (rankB.distanceMeters ?? Number.MAX_SAFE_INTEGER);
        });
    } else {
      rows = rows
        .slice()
        .sort((a, b) => {
          const rankA = rankRoomListing({ item: a, liveLocation });
          const rankB = rankRoomListing({ item: b, liveLocation });
          return (
            rankB.score - rankA.score ||
            (rankA.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (rankB.distanceMeters ?? Number.MAX_SAFE_INTEGER) ||
            new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
          );
        });
    }
    return rows;
  }, [all, liveLocation, query, sortMode]);

  const topPicks = filtered.slice(0, 10);

  const toggleSaved = async (row: ListingRow) => {
    if (!user?.id) {
      Alert.alert("Login required", "Log in to save rooms.");
      return;
    }

    const currentlySaved = savedSet.has(row.id);
    const nextSaved = !currentlySaved;
    setSavedSet((current) => {
      const next = new Set(current);
      if (nextSaved) next.add(row.id);
      else next.delete(row.id);
      return next;
    });

    try {
      await queueOfflineSaveToggle({
        studentId: user.id,
        listingId: row.id,
        nextSaved,
        snapshot: snapshotFromListing(row),
      });
      if (isOnline) void syncSavedRoomsQueue(user.id);
    } catch {
      // ignore
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    void loadListings({ silent: true });
    void hydrateSaved();
  };

  return (
    <SafeAreaView style={styles.root}>
      <FlatList
        data={topPicks}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0f7a3a" />}
        ListHeaderComponent={
          <>
            <View style={styles.topBar}>
              <Pressable style={styles.circleBtn} onPress={() => router.back()}>
                <ArrowLeft size={18} color="#0f2450" />
              </Pressable>

              <View style={styles.topBarSpacer} />

              <View style={styles.topBarRight}>
                <Pressable style={styles.circleBtn} onPress={() => router.push("/(student)/notifications")}>
                  <Bell size={18} color="#0f2450" />
                  {unreadCount ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeCount}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable style={styles.circleBtn} onPress={() => router.push("/(student)/(tabs)/profile")}>
                  <User2 size={18} color="#0f2450" />
                </Pressable>
              </View>
            </View>

            <View style={styles.heroCard}>
              <View style={styles.heroBlobA} />
              <View style={styles.heroBlobB} />
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>Find your ideal room{"\n"}near campus</Text>
                <Text style={styles.heroSub}>Browse rooms and hostels tailored to your needs.</Text>
              </View>
              <Image
                source={{ uri: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=900&q=80" }}
                style={styles.heroImage}
              />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
              <QuickChip
                active={sortMode === "affordable"}
                icon={<PiggyBank size={16} color={sortMode === "affordable" ? "#0b4e3a" : "#0f2450"} />}
                label="Affordable"
                onPress={() => setSortMode((m) => (m === "affordable" ? "recommended" : "affordable"))}
              />
              <QuickChip
                icon={<Scale size={16} color="#0f2450" />}
                label="Compare"
                onPress={() => router.push("/(eya)/(tabs)/saved")}
              />
            </ScrollView>

            <View style={styles.search}>
              <Search size={18} color="#7b8aa6" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                style={styles.searchInput}
                placeholder="Search hostels, area, campus..."
                placeholderTextColor="#9aa8b3"
              />
            </View>

            <Text style={styles.sectionTitle}>Top picks</Text>

            {loading ? (
              <View style={styles.loadingRow}>
                <Text style={styles.loadingText}>Loading rooms...</Text>
              </View>
            ) : null}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </>
        }
        renderItem={({ item, index }) => (
          <TopPickCard
            index={index}
            item={item}
            saved={savedSet.has(item.id)}
            onPress={() => router.push({ pathname: "/(eya)/room/[id]", params: { id: item.id } })}
            onToggleSaved={() => void toggleSaved(item)}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No rooms found</Text>
              <Text style={styles.emptySub}>Try another search.</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f7fb" },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 14 },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10, paddingBottom: 10 },
  topBarSpacer: { flex: 1 },
  topBarRight: { flexDirection: "row", gap: 12 },
  circleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "#e3e9f4",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ff0f64",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeCount: { color: "#fff", fontWeight: "900", fontSize: 10 },

  heroCard: {
    borderRadius: 26,
    backgroundColor: "#dbe9f3",
    borderWidth: 1,
    borderColor: "#cfe0ee",
    overflow: "hidden",
    padding: 16,
    minHeight: 170,
  },
  heroBlobA: { position: "absolute", left: -60, top: -40, width: 170, height: 170, borderRadius: 85, backgroundColor: "rgba(255,255,255,0.45)" },
  heroBlobB: { position: "absolute", right: -40, bottom: -70, width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(255,220,150,0.58)" },
  heroCopy: { maxWidth: "62%", gap: 8 },
  heroTitle: { color: "#0f2450", fontSize: 26, lineHeight: 30, fontWeight: "900" },
  heroSub: { color: "#324a70", fontSize: 13, lineHeight: 18, fontWeight: "800" },
  heroImage: { position: "absolute", right: -18, bottom: -10, width: 190, height: 160, borderRadius: 28, opacity: 0.86 },

  quickRow: { paddingTop: 12, gap: 10 },
  quickChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "#e3e9f4",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  quickChipActive: { borderColor: "#102a54" },
  quickChipIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#f3f6fb", alignItems: "center", justifyContent: "center" },
  quickChipIconActive: { backgroundColor: "#fff3cf" },
  quickChipText: { color: "#0f2450", fontWeight: "900", fontSize: 14 },
  quickChipTextActive: { color: "#0f2450" },

  search: {
    marginTop: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e3e9f4",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  searchInput: { flex: 1, color: "#20324a", fontSize: 15, fontWeight: "800" },

  sectionTitle: { marginTop: 4, color: "#0f2450", fontSize: 22, fontWeight: "900" },
  loadingRow: { paddingVertical: 8 },
  loadingText: { color: "#7b8aa6", fontWeight: "800" },
  errorText: { color: "#b0003a", fontWeight: "900" },

  topPickCard: {
    borderRadius: 28,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e9f4",
    overflow: "hidden",
    shadowColor: "#12223d",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  topPickImageWrap: { height: 180, backgroundColor: "#e9eef6" },
  topPickImage: { width: "100%", height: "100%" },
  heartBtn: {
    position: "absolute",
    right: 14,
    top: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "#e3e9f4",
    alignItems: "center",
    justifyContent: "center",
  },
  heartBtnActive: { backgroundColor: "rgba(255,240,246,0.96)", borderColor: "#ffd4e3" },
  topPickBody: { padding: 14, gap: 6 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  topPickTitle: { flex: 1, color: "#0f2450", fontSize: 20, fontWeight: "900" },
  badgeText: { color: "#ff0f64", fontWeight: "900", fontSize: 14 },
  topPickLocation: { color: "#5b6a86", fontWeight: "800", fontSize: 13 },
  priceRow: { marginTop: 2 },
  priceText: { color: "#0f2450", fontWeight: "900", fontSize: 18 },
  metaRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  metaPill: { borderRadius: 999, backgroundColor: "#f3f6fb", borderWidth: 1, borderColor: "#e7edf7", paddingHorizontal: 12, paddingVertical: 8 },
  metaPillText: { color: "#0f2450", fontWeight: "900", fontSize: 12 },
  metaPillSoft: { borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e3e9f4", paddingHorizontal: 12, paddingVertical: 8 },
  metaPillSoftText: { color: "#0f2450", fontWeight: "900", fontSize: 12 },
  studentsText: { marginTop: 2, color: "#7b8aa6", fontWeight: "800" },

  emptyCard: { borderRadius: 24, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e3e9f4", padding: 16, marginTop: 14 },
  emptyTitle: { color: "#0f2450", fontWeight: "900", fontSize: 16 },
  emptySub: { color: "#7b8aa6", fontWeight: "700", marginTop: 4 },
});
