import React from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { Bell, ChevronRight, Heart, MapPin, MessageCircle, PackageCheck, PencilLine, Search, ShoppingBag, Star, Trash2, Zap } from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { listMarketCards, type MarketCard } from "@/lib/newApp/browse";
import { supabase } from "@/lib/supabase";
import { formatPreferredLocation, locationMatchScore, usePreferredLocationOptional } from "@/providers/PreferredLocationProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";

type Props = { detailRoute: "/(market)/item/[id]" | "/(student)/market/[id]"; showModeSwitch?: boolean };
type CategoryCard = { id: string; label: string; aliases: string[]; image: string };
type SellerCard = { id: string; vendorId: string; name: string; rating: number; items: number; image: string };

const MARKET_CACHE_KEY = "student_market_cards_v1";
const PROMO_WIDTH = 286;
const categories: CategoryCard[] = [
  { id: "essentials", label: "Essentials", aliases: ["essentials", "room"], image: "https://images.unsplash.com/photo-1583947582886-f40ec95dd752?auto=format&fit=crop&w=700&q=80" },
  { id: "study", label: "Study", aliases: ["study", "books"], image: "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=700&q=80" },
  { id: "electronics", label: "Electronics", aliases: ["electronics"], image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=700&q=80" },
  { id: "fashion", label: "Apparel", aliases: ["fashion", "clothes"], image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=700&q=80" },
];
const DEFAULT_SELLERS: SellerCard[] = [
  { id: "seller-1", vendorId: "dev-market-vendor-1", name: "Mike's Electronics", rating: 4.8, items: 123, image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80" },
  { id: "seller-2", vendorId: "dev-market-vendor-2", name: "Sarah's Store", rating: 4.6, items: 85, image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80" },
];
const promos = [
  { id: "must", title: "Deals near MUST", sub: "Campus picks at student-friendly prices.", cta: "Shop now", tone: "#d4edf4", accent: "#0f6d80", kind: "bag" },
  { id: "delivery", title: "Free delivery", sub: "Selected sellers can bring items closer today.", cta: "See offers", tone: "#f6ebcb", accent: "#102a54", kind: "delivery" },
  { id: "budget", title: "Budget finds", sub: "Good value items under MWK 5,000.", cta: "Browse", tone: "#e4ecff", accent: "#0f6d80", kind: "star" },
];

function guessCampus(input: string) {
  const text = input.toLowerCase();
  if (text.includes("mubas")) return "MUBAS";
  if (text.includes("must") || text.includes("poly")) return "MUST";
  if (text.includes("unima")) return "UNIMA";
  if (text.includes("luanar")) return "LUANAR";
  if (text.includes("kuhes")) return "KUHeS";
  return "MUST";
}

function initials(label?: string | null) {
  const value = (label ?? "").trim();
  if (!value) return "U";
  const parts = value.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "U";
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return `${first}${second}`.toUpperCase();
}

function deriveTopSellers(cards: MarketCard[]): SellerCard[] {
  const map = new Map<string, { vendorId: string; name: string; totalRating: number; count: number; image: string }>();
  for (const card of cards) {
    const current = map.get(card.vendorId);
    if (current) {
      current.count += 1;
      current.totalRating += Number(card.rating) || 0;
      if (!current.image) current.image = card.image;
      continue;
    }
    map.set(card.vendorId, {
      vendorId: card.vendorId,
      name: card.vendor,
      totalRating: Number(card.rating) || 0,
      count: 1,
      image: card.image,
    });
  }

  return Array.from(map.values())
    .sort((a, b) => (b.count - a.count) || (b.totalRating / Math.max(1, b.count) - a.totalRating / Math.max(1, a.count)) || a.name.localeCompare(b.name))
    .slice(0, 2)
    .map((row) => ({
      id: `seller-${row.vendorId}`,
      vendorId: row.vendorId,
      name: row.name,
      items: row.count,
      rating: row.totalRating / Math.max(1, row.count),
      image: row.image,
    }));
}

export default function MarketplaceBrowseScreen({ detailRoute }: Props) {
  const router = useRouter();
  const isStudentBrowse = detailRoute === "/(student)/market/[id]";
  const { user } = useAuth();
  const { workspace: sellerWorkspace, setProductActive, archiveProduct } = useSellerWorkspace();
  const locationContext = usePreferredLocationOptional();
  const preferredLocation = locationContext?.location ?? null;
  const promoRef = React.useRef<ScrollView | null>(null);
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<MarketCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = React.useState("all");
  const [favourites, setFavourites] = React.useState<Record<string, boolean>>({});
  const [promoIndex, setPromoIndex] = React.useState(0);
  const [profileAvatarUrl, setProfileAvatarUrl] = React.useState<string | null>(null);

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
        if (active) setError(e?.message ?? "Could not load marketplace listings.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    if (!locationContext?.saveLocation || preferredLocation) return;
    let active = true;
    const hydrate = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || !active) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const reverse = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        const place = reverse[0];
        const area = place?.district || place?.subregion || place?.street || "Soche";
        const city = place?.city || place?.region || "Blantyre";
        const label = [place?.name, area, city].filter(Boolean).join(", ");
        await locationContext.saveLocation({ label: label || `${area}, ${city}`, area, city, campus: guessCampus(label), latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {}
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, [locationContext, preferredLocation]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setPromoIndex((current) => {
        const next = (current + 1) % promos.length;
        promoRef.current?.scrollTo({ x: next * PROMO_WIDTH, animated: true });
        return next;
      });
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      if (!user?.id) {
        if (active) setProfileAvatarUrl(null);
        return;
      }
      try {
        const { data, error } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
        if (error) return;
        if (active) setProfileAvatarUrl((data as { avatar_url?: string | null } | null)?.avatar_url ?? null);
      } catch {
        // Ignore profile avatar fetch errors - UI falls back to initials.
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return items
      .filter((item) => {
        const matchesTerm = !term || [item.name, item.vendor, item.area, item.campus, item.description, item.category].some((value) => value.toLowerCase().includes(term));
        const matchesCategory = selectedCategory === "all" || categories.find((c) => c.id === selectedCategory)?.aliases.some((alias) => item.category.toLowerCase().includes(alias));
        return matchesTerm && !!matchesCategory;
      })
      .sort((a, b) => locationMatchScore(preferredLocation, { area: b.area, campus: b.campus }) - locationMatchScore(preferredLocation, { area: a.area, campus: a.campus }))
      .slice(0, 8);
  }, [items, preferredLocation, query, selectedCategory]);

  const featured = filtered.slice(0, 3);
  const topSellers = React.useMemo(() => {
    const derived = deriveTopSellers(filtered);
    return derived.length ? derived : DEFAULT_SELLERS;
  }, [filtered]);
  const ownListings = React.useMemo(
    () =>
      sellerWorkspace.hasVendor
        ? sellerWorkspace.products
            .slice()
            .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
            .slice(0, 3)
        : [],
    [sellerWorkspace.hasVendor, sellerWorkspace.products],
  );
  const locationTitle = preferredLocation?.city || preferredLocation?.campus || "Blantyre";
  const locationSub = preferredLocation ? formatPreferredLocation(preferredLocation) : "Auto-detecting your area";
  const noticeRoute = isStudentBrowse ? "/(student)/requests" : "/(market)/(tabs)/orders";
  const messageRoute = isStudentBrowse ? "/(student)/(tabs)/messages" : "/(market)/buyers";
  const locationRoute = isStudentBrowse ? "/(student)/address" : "/(market)/shop-settings";
  const exploreAllRoute = isStudentBrowse ? "/(student)/market/all-products" : "/(market)/all-products";

  const openSellerSetup = () => router.push("/sell/setup");
  const openSellerEditor = (itemId: string) => router.push({ pathname: "/sell/add-product", params: { itemId } });
  const toggleOwnListing = async (itemId: string, isActive: boolean) => {
    try {
      await setProductActive(itemId, !isActive);
    } catch (err: any) {
      Alert.alert("Update failed", err?.message ?? "Could not update listing visibility.");
    }
  };
  const deleteOwnListing = (itemId: string, name: string) =>
    Alert.alert("Delete listing", `Remove ${name} from your listings? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await archiveProduct(itemId);
          } catch (err: any) {
            Alert.alert("Delete failed", err?.message ?? "Could not remove this listing.");
          }
        },
      },
    ]);

  if (loading) return <SafeAreaView style={styles.root}><View style={styles.skeleton} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topSection}>
          <Text style={styles.brandTag}>EYA market</Text>
          <View style={styles.headerRow}>
            <Pressable style={styles.locationChip} onPress={() => router.push(locationRoute as any)}>
              {profileAvatarUrl ? (
                <Image source={{ uri: profileAvatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarFallbackText}>{initials((user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? null)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.city}>{locationTitle}</Text>
                <View style={styles.inline}>
                  <MapPin size={13} color="#0f8a8f" />
                  <Text style={styles.citySub} numberOfLines={1}>{locationSub}</Text>
                </View>
              </View>
            </Pressable>
            <View style={styles.inline}>
              <IconBtn icon={<Bell size={20} color="#102a54" />} badge="4" onPress={() => router.push(noticeRoute as any)} />
              <IconBtn icon={<MessageCircle size={20} color="#0f6d80" />} badge="3" accent onPress={() => router.push(messageRoute as any)} />
            </View>
          </View>

          <View style={styles.search}>
            <Search size={20} color="#5c7d88" />
            <TextInput value={query} onChangeText={setQuery} style={styles.searchInput} placeholder="Search products, food, rooms..." placeholderTextColor="#7e9aa4" />
          </View>

          <ScrollView
            ref={promoRef}
            horizontal
            pagingEnabled
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.promoRow}
            onMomentumScrollEnd={(e) => setPromoIndex(Math.round(e.nativeEvent.contentOffset.x / PROMO_WIDTH))}
          >
            {promos.map((promo) => (
              <View key={promo.id} style={[styles.promo, { backgroundColor: promo.tone }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.promoKicker, { color: promo.accent }]}>{promo.id === "delivery" ? "Today only" : "Near you"}</Text>
                  <Text style={styles.promoTitle}>{promo.title}</Text>
                  <Text style={styles.promoSub}>{promo.sub}</Text>
                  <Pressable style={styles.promoBtn}><Text style={[styles.promoBtnText, { color: promo.accent }]}>{promo.cta}</Text></Pressable>
                </View>
                <View style={[styles.promoBubble, { backgroundColor: `${promo.accent}18` }]}>
                  {promo.kind === "delivery" ? <PackageCheck size={42} color={promo.accent} /> : promo.kind === "star" ? <Star size={42} color={promo.accent} fill={promo.accent} /> : <ShoppingBag size={42} color={promo.accent} />}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.dots}>{promos.map((promo, index) => <View key={promo.id} style={[styles.dot, index === promoIndex && styles.dotActive]} />)}</View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <InfoPill icon={<MapPin size={15} color="#0b3d4f" />} label={preferredLocation?.campus || "MUST"} />
          <InfoPill icon={<Zap size={15} color="#d08a00" />} label="Fast delivery" />
          <InfoPill icon={<PackageCheck size={15} color="#3d8d4a" />} label="Free delivery" />
          <InfoPill icon={<Star size={15} color="#f0ae28" fill="#f0ae28" />} label="4.5+" />
        </ScrollView>

        <Text style={styles.sectionTitle}>Categories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          <CategoryTile label="All" active={selectedCategory === "all"} image="" onPress={() => setSelectedCategory("all")} />
          {categories.map((category) => <CategoryTile key={category.id} label={category.label} image={category.image} active={selectedCategory === category.id} onPress={() => setSelectedCategory(category.id)} />)}
        </ScrollView>

        <Pressable style={styles.sellCard} onPress={openSellerSetup}>
          <View style={styles.sellIcon}><ShoppingBag size={20} color="#102a54" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sellTitle}>{sellerWorkspace.hasVendor ? "Manage your shop" : "Sell your products"}</Text>
            <Text style={styles.sellSub}>
              {sellerWorkspace.hasVendor ? "Edit listings, add new items, and keep your shop active." : "Create your shop and start earning."}
            </Text>
          </View>
          <ChevronRight size={18} color="#102a54" />
        </Pressable>

        {isStudentBrowse && sellerWorkspace.hasVendor ? (
          <View style={styles.manageSection}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Your listings</Text>
              <Pressable style={styles.sectionLink} onPress={() => router.push("/sell/add-product")}>
                <Text style={styles.sectionLinkText}>Add new</Text>
              </Pressable>
            </View>
            {ownListings.length ? (
              ownListings.map((item) => (
                <View key={item.id} style={styles.manageCard}>
                  <View style={styles.manageHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.manageName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.manageMeta}>{kwacha(Number(item.price_mwk))} • {item.channel === "food" ? "Food" : "Market"}</Text>
                    </View>
                    <View style={[styles.manageBadge, item.is_active ? styles.manageBadgeLive : styles.manageBadgeHidden]}>
                      <Text style={[styles.manageBadgeText, item.is_active ? styles.manageBadgeTextLive : styles.manageBadgeTextHidden]}>
                        {item.is_active ? "Live" : "Hidden"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.manageActions}>
                    <Pressable style={styles.manageActionBtn} onPress={() => openSellerEditor(item.id)}>
                      <PencilLine size={14} color="#102a54" />
                      <Text style={styles.manageActionText}>Edit</Text>
                    </Pressable>
                    <Pressable style={styles.manageActionBtn} onPress={() => void toggleOwnListing(item.id, item.is_active)}>
                      <Text style={styles.manageActionText}>{item.is_active ? "Hide" : "Restore"}</Text>
                    </Pressable>
                    <Pressable style={[styles.manageActionBtn, styles.manageDeleteBtn]} onPress={() => deleteOwnListing(item.id, item.name)}>
                      <Trash2 size={14} color="#c73a70" />
                      <Text style={styles.manageDeleteText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.manageEmpty}>
                <Text style={styles.manageEmptyTitle}>No listings yet</Text>
                <Text style={styles.manageEmptySub}>Your shop is ready. Add your first product from here.</Text>
              </View>
            )}
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>New products</Text>
          <Pressable style={styles.sectionLink} onPress={() => router.push(exploreAllRoute as any)}>
            <Text style={styles.sectionLinkText}>Explore all</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productRow}>
          {featured.map((item, index) => {
            const liked = !!favourites[item.id];
            return (
              <Pressable key={item.id} style={styles.card} onPress={() => router.push({ pathname: detailRoute, params: { id: item.id } })}>
                <View>
                  <Image source={{ uri: item.image }} style={styles.cardImage} />
                  <View style={styles.badge}><Text style={styles.badgeText}>{index === 0 ? "Hot Deal!" : "New"}</Text></View>
                  <Pressable style={styles.heart} onPress={(event) => { event.stopPropagation(); setFavourites((current) => ({ ...current, [item.id]: !liked })); }}>
                    <Heart size={15} color="#f05e84" fill={liked ? "#f05e84" : "transparent"} />
                  </Pressable>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.cardPrice}>{kwacha(item.price)}</Text>
                  <Text style={styles.cardMeta}>{item.rating.toFixed(1)} • {estimate(item, index)}</Text>
                  <Text style={styles.softPill}>{item.vendor}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionTitle}>Top sellers</Text>
        {topSellers.slice(0, 2).map((seller) => (
          <View key={seller.id} style={styles.sellerCard}>
            <Image source={{ uri: seller.image }} style={styles.sellerImage} />
            <View style={{ flex: 1 }}>
              <Text style={styles.sellerName}>{seller.name}</Text>
              <Text style={styles.cardMeta}>{seller.rating.toFixed(1)} • {seller.items} items</Text>
              <Pressable
                style={styles.viewBtn}
                onPress={() => router.push({ pathname: detailRoute === "/(market)/item/[id]" ? "/(market)/shop/[vendorId]" : "/(student)/market/shop/[vendorId]", params: { vendorId: seller.vendorId } })}
              >
                <Text style={styles.viewBtnText}>View shop</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function estimate(item: MarketCard, index: number) {
  const base = ((item.price / 1000 + index * 0.8) % 2.1) + 0.9;
  return `${base.toFixed(1)}km away`;
}

function IconBtn({ icon, badge, onPress, accent = false }: { icon: React.ReactNode; badge: string; onPress: () => void; accent?: boolean }) {
  return <Pressable style={styles.iconBtn} onPress={onPress}>{icon}<View style={[styles.iconBadge, accent && { backgroundColor: "#0f8a8f" }]}><Text style={styles.iconBadgeText}>{badge}</Text></View></Pressable>;
}

function InfoPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <View style={styles.infoPill}>{icon}<Text style={styles.infoPillText}>{label}</Text></View>;
}

function CategoryTile({ label, image, active, onPress }: { label: string; image: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.categoryTile} onPress={onPress}>
      <View style={[styles.categoryImageWrap, active && styles.categoryImageWrapActive]}>
        {image ? <Image source={{ uri: image }} style={styles.categoryImage} /> : <ShoppingBag size={26} color="#102a54" />}
      </View>
      <Text style={styles.categoryText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#edf7f8" },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 110, gap: 18 },
  skeleton: { margin: 16, height: 280, borderRadius: 28, backgroundColor: "#d8edf2" },
  topSection: { gap: 16 },
  brandTag: { color: "#102a54", fontSize: 16, fontWeight: "900", paddingHorizontal: 2 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, paddingHorizontal: 2 },
  locationChip: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#dcecf1" },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#0f6d80" },
  avatarFallbackText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  city: { color: "#102a54", fontSize: 20, fontWeight: "900" },
  citySub: { color: "#577381", fontSize: 12, fontWeight: "700", flex: 1 },
  inline: { flexDirection: "row", alignItems: "center", gap: 5 },
  iconBtn: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dcecf1", alignItems: "center", justifyContent: "center", shadowColor: "#0b3d4f", shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  iconBadge: { position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#ff5777", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  iconBadgeText: { color: "#fff", fontWeight: "900", fontSize: 11 },
  search: { borderRadius: 999, borderWidth: 1, borderColor: "#d0e7ec", backgroundColor: "#fff", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingVertical: 16, shadowColor: "#0b3d4f", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  searchInput: { flex: 1, color: "#0b3d4f", fontSize: 16, fontWeight: "700" },
  promoRow: { gap: 10, paddingRight: 18 },
  promo: { width: 300, minHeight: 170, borderRadius: 24, paddingVertical: 20, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", shadowColor: "#0b3d4f", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  promoKicker: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  promoTitle: { color: "#102a54", fontSize: 26, lineHeight: 30, fontWeight: "900", marginTop: 4, maxWidth: 168 },
  promoSub: { color: "#355968", fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 6, maxWidth: 168 },
  promoBtn: { marginTop: 12, alignSelf: "flex-start", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 16, paddingVertical: 10 },
  promoBtnText: { fontWeight: "900" },
  promoBubble: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#c1d7dd" },
  dotActive: { width: 18, backgroundColor: "#0f6d80" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionLink: { borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dcecf1", paddingHorizontal: 14, paddingVertical: 10 },
  sectionLinkText: { color: "#0f6d80", fontWeight: "900", fontSize: 13 },
  filterRow: { gap: 10, paddingRight: 18, paddingTop: 2 },
  infoPill: { borderRadius: 18, borderWidth: 1, borderColor: "#d7e6ea", backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8, shadowColor: "#0b3d4f", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  infoPillText: { color: "#0b3d4f", fontWeight: "900", fontSize: 14 },
  sectionTitle: { color: "#0b3d4f", fontSize: 19, fontWeight: "900" },
  categoryRow: { gap: 12, paddingRight: 8 },
  categoryTile: { width: 106, gap: 8, alignItems: "center" },
  categoryImageWrap: { width: 106, height: 106, borderRadius: 22, overflow: "hidden", backgroundColor: "#f8fdff", borderWidth: 1, borderColor: "#c8dfe6", alignItems: "center", justifyContent: "center" },
  categoryImageWrapActive: { borderColor: "#0f6d80", borderWidth: 2 },
  categoryImage: { width: "100%", height: "100%" },
  categoryText: { color: "#0b3d4f", fontWeight: "800", fontSize: 13, textAlign: "center" },
  sellCard: { borderRadius: 24, borderWidth: 1, borderColor: "#d9e5fb", backgroundColor: "#f8fbff", padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  sellIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#e6f0ff", alignItems: "center", justifyContent: "center" },
  sellTitle: { color: "#102a54", fontSize: 20, fontWeight: "900" },
  sellSub: { color: "#60708f", fontSize: 13, fontWeight: "700" },
  manageSection: { gap: 12 },
  manageCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#d9e5fb",
    backgroundColor: "#ffffff",
    padding: 14,
    gap: 12,
  },
  manageHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  manageName: { color: "#102a54", fontSize: 17, fontWeight: "900" },
  manageMeta: { color: "#60708f", fontSize: 13, fontWeight: "700", marginTop: 4 },
  manageBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  manageBadgeLive: { backgroundColor: "#e8f8ef" },
  manageBadgeHidden: { backgroundColor: "#eef1f7" },
  manageBadgeText: { fontSize: 12, fontWeight: "900" },
  manageBadgeTextLive: { color: "#1f7a46" },
  manageBadgeTextHidden: { color: "#60708f" },
  manageActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  manageActionBtn: {
    minWidth: 96,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dcecf1",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  manageActionText: { color: "#102a54", fontWeight: "800", fontSize: 13 },
  manageDeleteBtn: { backgroundColor: "#fff5f8", borderColor: "#ffd4e3" },
  manageDeleteText: { color: "#c73a70", fontWeight: "800", fontSize: 13 },
  manageEmpty: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#d9e5fb",
    backgroundColor: "#f8fbff",
    padding: 16,
    gap: 6,
  },
  manageEmptyTitle: { color: "#102a54", fontSize: 16, fontWeight: "900" },
  manageEmptySub: { color: "#60708f", fontSize: 13, fontWeight: "700" },
  errorText: { color: "#8d3d4d", fontWeight: "700" },
  productRow: { gap: 12, paddingRight: 8 },
  card: { width: 190, borderRadius: 24, borderWidth: 1, borderColor: "#cfe3e9", backgroundColor: "#fcfeff", overflow: "hidden" },
  cardImage: { width: "100%", height: 160, backgroundColor: "#dcecf1" },
  badge: { position: "absolute", top: 10, left: 10, borderRadius: 10, backgroundColor: "#0f6d80", paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { color: "#fff", fontWeight: "900", fontSize: 11 },
  heart: { position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center" },
  cardBody: { padding: 12, gap: 5 },
  cardTitle: { color: "#0b3d4f", fontWeight: "900", fontSize: 16, minHeight: 42 },
  cardPrice: { color: "#0b3d4f", fontWeight: "900", fontSize: 18 },
  cardMeta: { color: "#4e7480", fontWeight: "800", fontSize: 12 },
  softPill: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#edf3ff", color: "#102a54", fontWeight: "800", fontSize: 11, paddingHorizontal: 10, paddingVertical: 6, overflow: "hidden" },
  sellerCard: { borderRadius: 22, borderWidth: 1, borderColor: "#cfe3e9", backgroundColor: "#fcfeff", padding: 12, flexDirection: "row", gap: 12, alignItems: "center" },
  sellerImage: { width: 86, height: 86, borderRadius: 18, backgroundColor: "#dcecf1" },
  sellerName: { color: "#0b3d4f", fontWeight: "900", fontSize: 16 },
  viewBtn: { marginTop: 8, alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#0f6d80", paddingHorizontal: 16, paddingVertical: 10 },
  viewBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
});
