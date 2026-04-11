import React from "react";
import { ActivityIndicator, FlatList, Image, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Home, Search } from "lucide-react-native";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { supabase } from "@/lib/supabase";
import { useNetwork } from "@/providers/NetworkProvider";

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
  created_at: string | null;
  visibility_rank?: number | null;
};

type FilterType = "all" | "hostel" | "bedsitter";

const CACHE_KEY = "student_rooms_all";

function formatPrice(amount?: number | null) {
  if (!amount) return "Ask landlord";
  return `K${Number(amount).toLocaleString("en-MW")}`;
}

function coverImage(row: Pick<ListingRow, "image_urls">) {
  const first = row.image_urls?.find(Boolean);
  return first || "https://placehold.co/900x600?text=No+Photo";
}

export default function AllRoomsScreen() {
  const router = useRouter();
  const { isOnline } = useNetwork();

  const [query, setQuery] = React.useState("");
  const [filterType, setFilterType] = React.useState<FilterType>("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<ListingRow[]>([]);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      setError(null);
      const cached = await getCachedJson<ListingRow[]>(CACHE_KEY);
      if (cached?.data?.length && active) setItems(cached.data);
      try {
        if (!isOnline) return;
        const { data, error } = await supabase
          .from("listings")
          .select("id, title, listing_type, campus, area, city, price_from, room_types, image_urls, created_at, visibility_rank")
          .eq("is_active", true);
        if (error) throw error;
        const rows = (data ?? []) as ListingRow[];
        if (active) setItems(rows);
        await setCachedJson(CACHE_KEY, rows);
      } catch (e: any) {
        if (active && !cached?.data?.length) setError(e?.message ?? "Could not load rooms.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [isOnline]);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((row) => {
      const matchesTerm = !term || [row.title, row.area, row.city, row.campus].some((v) => (v ?? "").toLowerCase().includes(term));
      const matchesType = filterType === "all" || row.listing_type === filterType;
      return matchesTerm && matchesType;
    });
  }, [filterType, items, query]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={18} color="#16315f" />
        </Pressable>
        <Text style={styles.title}>All rooms</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.search}>
        <Search size={18} color="#7892a0" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholder="Search all rooms..."
          placeholderTextColor="#9aa8b3"
        />
      </View>

      <FlatList
        data={[
          { id: "all", label: "All" },
          { id: "hostel", label: "Hostels" },
          { id: "bedsitter", label: "Bedsitters" },
        ]}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}
        renderItem={({ item }) => {
          const active = filterType === (item.id as FilterType);
          return (
            <Pressable style={[styles.categoryPill, active && styles.categoryPillActive]} onPress={() => setFilterType(item.id as FilterType)}>
              <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{item.label}</Text>
            </Pressable>
          );
        }}
      />

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>All listings</Text>
        <Text style={styles.infoSub}>Discover unique rooms around you</Text>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#0f7a3a" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push({ pathname: "/(palevel)/room/[id]", params: { id: item.id } })}>
            <Image source={{ uri: coverImage(item) }} style={styles.cardImage} />
            <Text numberOfLines={2} style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardPrice}>{formatPrice(item.price_from)}</Text>
            <View style={styles.cardMetaRow}>
              <View style={styles.vendorIcon}>
                <Home size={14} color="#0f2450" />
              </View>
              <Text numberOfLines={1} style={styles.cardMetaText}>
                {[item.area, item.city, item.campus].filter(Boolean).join(" • ") || "Near campus"}
              </Text>
            </View>
          </Pressable>
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
  root: { flex: 1, backgroundColor: "#f4f7fb", paddingHorizontal: 16, paddingTop: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e9f4",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#0f2450", fontSize: 22, fontWeight: "900" },
  headerSpacer: { width: 42 },
  search: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e3e9f4",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#12223d",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  searchInput: { flex: 1, color: "#20324a", fontSize: 15, fontWeight: "800" },
  categoryRow: { paddingTop: 14, paddingBottom: 12, gap: 10 },
  categoryPill: { borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e3e9f4", paddingHorizontal: 16, paddingVertical: 10 },
  categoryPillActive: { backgroundColor: "#102a54", borderColor: "#102a54" },
  categoryText: { color: "#0f2450", fontWeight: "900", fontSize: 13 },
  categoryTextActive: { color: "#fff" },
  infoCard: { borderRadius: 22, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e3e9f4", padding: 16, marginBottom: 14 },
  infoTitle: { color: "#0f2450", fontSize: 22, fontWeight: "900" },
  infoSub: { marginTop: 6, color: "#7b8aa6", fontSize: 13, fontWeight: "800" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  loadingText: { color: "#7b8aa6", fontWeight: "800" },
  errorText: { color: "#b0003a", fontWeight: "900", marginBottom: 10 },
  listContent: { paddingBottom: 22 },
  gridRow: { gap: 14, justifyContent: "space-between" },
  card: { flex: 1, borderRadius: 24, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e3e9f4", padding: 12, marginBottom: 14 },
  cardImage: { width: "100%", height: 140, borderRadius: 18, backgroundColor: "#e9eef6" },
  cardTitle: { marginTop: 12, color: "#0f2450", fontSize: 16, fontWeight: "900", minHeight: 44 },
  cardPrice: { marginTop: 6, color: "#0f7a3a", fontSize: 16, fontWeight: "900" },
  cardMetaRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  vendorIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#eef4ff", alignItems: "center", justifyContent: "center" },
  cardMetaText: { flex: 1, color: "#8b97ad", fontSize: 13, fontWeight: "900" },
  emptyCard: { borderRadius: 24, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e3e9f4", padding: 16, marginTop: 14 },
  emptyTitle: { color: "#0f2450", fontWeight: "900", fontSize: 16 },
  emptySub: { color: "#7b8aa6", fontWeight: "700", marginTop: 4 },
});
