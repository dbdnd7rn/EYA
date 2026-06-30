import React from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Search, Store } from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { listMarketCards, type MarketCard } from "@/lib/newApp/browse";
import MarketBottomNav from "@/components/market/MarketBottomNav";
import { useLiveProximity } from "@/lib/liveProximity";
import {
  diversifyMarketListings,
  rankMarketListing,
} from "@/lib/marketplaceRanking";

type Props = {
  detailRoute: "/(market)/item/[id]" | "/(student)/market/[id]";
};

type CategoryCard = { id: string; label: string; aliases: string[] };

const MARKET_CACHE_KEY = "student_market_cards_v1";

const categories: CategoryCard[] = [
  { id: "all", label: "All", aliases: [] },
  { id: "essentials", label: "Essentials", aliases: ["essentials", "room"] },
  { id: "study", label: "Study", aliases: ["study", "books"] },
  { id: "electronics", label: "Electronics", aliases: ["electronics"] },
  { id: "fashion", label: "Apparel", aliases: ["fashion", "clothes"] },
];

function matchesCategory(item: MarketCard, selected: string) {
  if (selected === "all") return true;
  const category = categories.find((row) => row.id === selected);
  if (!category) return true;
  const text = (item.category ?? "").toLowerCase();
  return category.aliases.some((alias) => text.includes(alias));
}

function formatListedOn(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "recently";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function listingAreaLabel(item: MarketCard) {
  return [item.area, item.campus].filter(Boolean).join(" - ") || "Campus pickup";
}

export default function AllProductsScreen({ detailRoute }: Props) {
  const router = useRouter();
  const isStudentBrowse = detailRoute === "/(student)/market/[id]";
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<MarketCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = React.useState("all");
  const { point: liveLocation } = useLiveProximity(isStudentBrowse);
  const safeAreaEdges: Edge[] = isStudentBrowse ? ["top", "left", "right"] : ["top", "left", "right", "bottom"];

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const cached = await getCachedJson<MarketCard[]>(MARKET_CACHE_KEY);
      if (cached?.data?.length && active) setItems(cached.data);
      try {
        const rows = await listMarketCards();
        if (active) setItems(rows);
        await setCachedJson(MARKET_CACHE_KEY, rows);
      } catch (e: any) {
        if (active) setError(e?.message ?? "Could not load products.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    const ranked = items
      .filter((item) => {
        const matchesTerm =
          !term || [item.name, item.vendor, item.area, item.campus, item.description, item.category].some((value) => value.toLowerCase().includes(term));
        return matchesTerm && matchesCategory(item, selectedCategory);
      })
      .map((item) => ({
        item,
        rank: rankMarketListing({ item, term, liveLocation, savedLocationScore: 0 }),
      }))
      .sort((a, b) =>
        b.rank.score - a.rank.score ||
        (a.rank.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.rank.distanceMeters ?? Number.MAX_SAFE_INTEGER) ||
        new Date(b.item.refreshedAt).getTime() - new Date(a.item.refreshedAt).getTime(),
      )
      .map((row) => row.item);
    return diversifyMarketListings(ranked);
  }, [items, liveLocation, query, selectedCategory]);

  const infoTitle = "All listings";
  const infoSub = "Browse products from campus sellers.";

  return (
    <SafeAreaView edges={safeAreaEdges} style={styles.root}>
      <FlatList
        style={styles.list}
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={[styles.listContent, isStudentBrowse && styles.listContentWithBottomNav]}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Pressable style={styles.backBtn} onPress={() => router.back()}>
                <ArrowLeft size={18} color="#16315f" />
              </Pressable>
              <Text style={styles.title}>All products</Text>
              <View style={styles.headerSpacer} />
            </View>

            <View style={styles.search}>
              <Search size={18} color="#7892a0" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                style={styles.searchInput}
                placeholder="Search all products..."
                placeholderTextColor="#9aa8b3"
              />
            </View>

            <FlatList
              data={categories}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
              renderItem={({ item }) => {
                const active = selectedCategory === item.id;
                return (
                  <Pressable style={[styles.categoryPill, active && styles.categoryPillActive]} onPress={() => setSelectedCategory(item.id)}>
                    <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              }}
            />

            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>{infoTitle}</Text>
              <Text style={styles.infoSub}>{infoSub}</Text>
            </View>

            {loading && items.length === 0 ? <View style={styles.skeleton} /> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push({ pathname: detailRoute, params: { id: item.id } })}>
            <Image source={{ uri: item.image }} style={styles.cardImage} />
            <Text numberOfLines={2} style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardPrice}>{kwacha(item.price)}</Text>
            <Text style={styles.cardListed}>{listingAreaLabel(item)}</Text>
            <Text style={styles.cardListed}>Listed {formatListedOn(item.listedAt)}</Text>
            <View style={styles.cardMetaRow}>
              <View style={styles.vendorIcon}>
                <Store size={14} color="#16315f" />
              </View>
              <Text numberOfLines={1} style={styles.cardMetaText}>{item.vendor}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptySub}>Try a different search or category.</Text>
            </View>
          ) : null
        }
      />
      {isStudentBrowse ? <MarketBottomNav active="market" /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f7fb", paddingHorizontal: 16, paddingTop: 10 },
  list: { flex: 1 },
  listContent: { paddingBottom: 22 },
  listContentWithBottomNav: { paddingBottom: 164 },
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
  infoCard: {
    borderRadius: 22,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e9f4",
    padding: 16,
    marginBottom: 14,
    shadowColor: "#12223d",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  infoTitle: { color: "#0f2450", fontSize: 22, fontWeight: "900" },
  infoSub: { marginTop: 6, color: "#7b8aa6", fontSize: 13, fontWeight: "800" },
  gridRow: { gap: 14, justifyContent: "space-between" },
  card: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e9f4",
    padding: 12,
    marginBottom: 14,
    shadowColor: "#12223d",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardImage: { width: "100%", height: 140, borderRadius: 18, backgroundColor: "#e9eef6" },
  cardTitle: { marginTop: 12, color: "#0f2450", fontSize: 16, fontWeight: "900", minHeight: 44 },
  cardPrice: { marginTop: 6, color: "#0f6d80", fontSize: 16, fontWeight: "900" },
  cardListed: { marginTop: 4, color: "#6e7f9a", fontSize: 12, fontWeight: "700" },
  cardMetaRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  vendorIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#eef4ff", alignItems: "center", justifyContent: "center" },
  cardMetaText: { flex: 1, color: "#8b97ad", fontSize: 13, fontWeight: "900" },
  skeleton: { height: 220, borderRadius: 24, backgroundColor: "#e9eef6", marginBottom: 14 },
  errorText: { color: "#b0003a", fontWeight: "800", marginTop: 10 },
  emptyCard: { borderRadius: 24, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e3e9f4", padding: 16, marginTop: 14 },
  emptyTitle: { color: "#0f2450", fontWeight: "900", fontSize: 16 },
  emptySub: { color: "#7b8aa6", fontWeight: "700", marginTop: 4 },
});
