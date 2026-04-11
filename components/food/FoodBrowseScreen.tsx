import React from "react";
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import {
  Bell,
  Bike,
  ChevronRight,
  Clock3,
  Flame,
  MapPin,
  MessageCircle,
  Search,
  Soup,
  Star,
  Store,
  UtensilsCrossed,
} from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { listFoodCards, type FoodCard } from "@/lib/newApp/browse";
import { formatPreferredLocation, locationMatchScore, usePreferredLocationOptional } from "@/providers/PreferredLocationProvider";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type Props = {
  detailRoute: "/(food)/item/[id]" | "/(student)/food/[id]";
  showModeSwitch?: boolean;
};

type CuisineCard = {
  id: string;
  label: string;
  icon: React.ReactNode;
  bg: string;
};

const cuisineCards: CuisineCard[] = [
  { id: "fast-food", label: "Fast food", icon: <UtensilsCrossed size={24} color="#16315f" />, bg: "#ffe3bf" },
  { id: "local", label: "Local meals", icon: <Soup size={24} color="#16315f" />, bg: "#d8eef8" },
  { id: "grill", label: "Grill picks", icon: <Flame size={24} color="#16315f" />, bg: "#ffd2cc" },
  { id: "vendors", label: "Campus vendors", icon: <Store size={24} color="#16315f" />, bg: "#dfe7ff" },
];
const FOOD_CACHE_KEY = "student_food_cards_v1";
const HERO_WIDTH = 306;
const heroSlides = [
  { id: "near-campus", title: "Food Near\nCampus", sub: "Fresh meals, faster ETAs, and delivery choices close to campus.", tone: "#cfe8f1", accent: "#16315f" },
  { id: "quick-runs", title: "Quick Food\nRuns", sub: "Reliable kitchens for lunch breaks, study nights, and group orders.", tone: "#f5ead1", accent: "#16315f" },
  { id: "trusted", title: "Trusted\nVendors", sub: "Clear delivery fees, live ETAs, and verified campus-friendly restaurants.", tone: "#dde8ff", accent: "#16315f" },
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

function etaBadge(eta: number) {
  if (eta <= 20) return "Fast";
  if (eta <= 30) return "Hot pick";
  return "Worth the wait";
}

function vendorMood(item: FoodCard) {
  if (item.rating >= 4.7) return "Top rated";
  if (item.deliveryFee <= 2200) return "Budget delivery";
  return "Popular tonight";
}

function initials(fullName?: string | null, email?: string | null) {
  const source = (fullName || "").trim() || (email || "").trim();
  if (!source) return "ST";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? "S"}${parts[1]?.[0] ?? "T"}`.toUpperCase();
}

export default function FoodBrowseScreen({ detailRoute, showModeSwitch = false }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const locationContext = usePreferredLocationOptional();
  const preferredLocation = locationContext?.location ?? null;
  const heroRef = React.useRef<ScrollView | null>(null);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<FoodCard[]>([]);
  const [selectedDelivery, setSelectedDelivery] = React.useState<Record<string, boolean>>({});
  const [campusFilter, setCampusFilter] = React.useState("All");
  const [cuisineFilter, setCuisineFilter] = React.useState("All");
  const [openNowOnly, setOpenNowOnly] = React.useState(false);
  const [heroIndex, setHeroIndex] = React.useState(0);
  const [profileAvatarUrl, setProfileAvatarUrl] = React.useState<string | null>(null);
  const [profileFullName, setProfileFullName] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      const cached = await getCachedJson<FoodCard[]>(FOOD_CACHE_KEY);
      if (cached?.data?.length && active) {
        setItems(cached.data);
        setLoading(false);
      } else if (active) {
        setLoading(true);
      }
      setError(null);
      try {
        const rows = await listFoodCards();
        if (active) setItems(rows);
        await setCachedJson(FOOD_CACHE_KEY, rows);
      } catch (e: any) {
        if (active) setError(e?.message ?? "Could not load food listings.");
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
        await locationContext.saveLocation({
          label: label || `${area}, ${city}`,
          area,
          city,
          campus: guessCampus(label),
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      } catch {}
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, [locationContext, preferredLocation]);

  React.useEffect(() => {
    if (!user?.id) {
      setProfileAvatarUrl(null);
      setProfileFullName(null);
      return;
    }

    let active = true;
    const loadProfile = async () => {
      try {
        const { data } = await supabase.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle();
        if (!active) return;
        const profile = (data as { full_name?: string | null; avatar_url?: string | null } | null) ?? null;
        setProfileAvatarUrl(profile?.avatar_url ?? null);
        setProfileFullName(profile?.full_name ?? null);
      } catch {
        if (!active) return;
        setProfileAvatarUrl(null);
        setProfileFullName(null);
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [user?.id]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setHeroIndex((current) => {
        const next = (current + 1) % heroSlides.length;
        heroRef.current?.scrollTo({ x: next * HERO_WIDTH, animated: true });
        return next;
      });
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (!preferredLocation?.campus || !items.length) return;
    if (campusFilter !== "All") return;
    if (items.some((item) => item.campus === preferredLocation.campus)) {
      setCampusFilter(preferredLocation.campus);
    }
  }, [campusFilter, items, preferredLocation]);

  const campuses = React.useMemo(() => ["All", ...Array.from(new Set(items.map((item) => item.campus))).sort()], [items]);
  const cuisines = React.useMemo(() => ["All", ...Array.from(new Set(items.map((item) => item.cuisine))).sort()], [items]);

  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return items
      .filter((item) => {
      if (campusFilter !== "All" && item.campus !== campusFilter) return false;
      if (cuisineFilter !== "All" && item.cuisine !== cuisineFilter) return false;
      if (openNowOnly && !item.isOpen) return false;
      if (!term) return true;
      return [item.name, item.cuisine, item.area, item.campus, item.meal, item.description].some((value) =>
        value.toLowerCase().includes(term),
      );
    })
      .sort(
        (a, b) =>
          locationMatchScore(preferredLocation, { area: b.area, campus: b.campus }) -
          locationMatchScore(preferredLocation, { area: a.area, campus: a.campus }),
      );
  }, [campusFilter, cuisineFilter, items, openNowOnly, preferredLocation, query]);

  const featured = React.useMemo(() => filtered.slice(0, 3), [filtered]);
  const selectedItems = React.useMemo(() => filtered.filter((item) => selectedDelivery[item.id]), [filtered, selectedDelivery]);
  const firstSelected = selectedItems[0] ?? null;
  const locationTitle = preferredLocation?.city || preferredLocation?.campus || "Blantyre";
  const locationSub = preferredLocation ? formatPreferredLocation(preferredLocation) : "Auto-detecting your area";

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.skeletonWrap}>
          <View style={styles.skeletonHero} />
          <View style={styles.skeletonSearch} />
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topSection}>
          <Text style={styles.brandTag}>EYA food</Text>
          <View style={styles.topRow}>
            <Pressable style={styles.locationRow} onPress={() => router.push("/(student)/address")}>
              {profileAvatarUrl ? (
                <Image source={{ uri: profileAvatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarFallbackText}>{initials(profileFullName, user?.email ?? null)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.locationTitle}>{locationTitle}</Text>
                <View style={styles.locationMeta}>
                  <MapPin size={13} color="#0f8a8f" />
                  <Text style={styles.locationSub} numberOfLines={1}>{locationSub}</Text>
                </View>
              </View>
            </Pressable>
            <View style={styles.headerActions}>
              <HeaderButton icon={<Bell size={20} color="#16315f" />} badge="2" onPress={() => router.push("/(student)/requests")} />
              <HeaderButton icon={<Bike size={20} color="#0f6d80" />} badge="2" accent onPress={() => router.push("/(student)/(tabs)/orders")} />
            </View>
          </View>

          <View style={styles.searchWrap}>
            <Search size={20} color="#58717f" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              placeholder="Search meals, restaurant, cuisines..."
              placeholderTextColor="#7c92a0"
            />
            <MessageCircle size={20} color="#58717f" />
          </View>

          <ScrollView
            ref={heroRef}
            horizontal
            pagingEnabled
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.heroRail}
            onMomentumScrollEnd={(e) => setHeroIndex(Math.round(e.nativeEvent.contentOffset.x / HERO_WIDTH))}
          >
            {heroSlides.map((slide) => (
              <View key={slide.id} style={[styles.heroCard, { backgroundColor: slide.tone }]}>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroTitle}>{slide.title}</Text>
                  <Text style={styles.heroSub}>{slide.sub}</Text>
                  <View style={styles.heroPills}>
                    <HeroPill label="Live ETAs" />
                    <HeroPill label="Trusted vendors" />
                    <HeroPill label="Door delivery" />
                  </View>
                </View>
                <View style={styles.heroArt}>
                  <View style={styles.heroBlobLarge} />
                  <View style={styles.heroBlobSmall} />
                  <UtensilsCrossed size={54} color={slide.accent} />
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.heroDots}>
            {heroSlides.map((slide, index) => <View key={slide.id} style={[styles.heroDot, index === heroIndex && styles.heroDotActive]} />)}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.campusFilterRow}>
          {campuses.map((campus) => (
            <FilterChip key={campus} label={campus} active={campusFilter === campus} onPress={() => setCampusFilter(campus)} />
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {cuisines.map((cuisine) => (
            <FilterChip key={cuisine} label={cuisine} active={cuisineFilter === cuisine} onPress={() => setCuisineFilter(cuisine)} soft />
          ))}
          <FilterChip label="Open now" active={openNowOnly} onPress={() => setOpenNowOnly((current) => !current)} soft />
        </ScrollView>

        <View>
          <Text style={styles.sectionTitle}>Browse cuisines</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cuisineRow}>
            {cuisineCards.map((card) => (
              <View key={card.id} style={styles.cuisineCard}>
                <View style={[styles.cuisineIconWrap, { backgroundColor: card.bg }]}>{card.icon}</View>
                <Text style={styles.cuisineLabel}>{card.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {error ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Could not load food section</Text>
            <Text style={styles.noticeSub}>{error}</Text>
          </View>
        ) : null}

        {featured.length ? (
          <View>
            <Text style={styles.sectionTitle}>Explore by craving</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
              {featured.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.featuredCard}
                  onPress={() => router.push({ pathname: detailRoute, params: { id: item.id } })}
                >
                  <Image source={{ uri: item.image }} style={styles.featuredImage} />
                  <View style={styles.featuredOverlay} />
                  <View style={styles.featuredTop}>
                    <Text style={styles.featuredBadge}>{etaBadge(item.etaMins)}</Text>
                    <Text style={[styles.statusChip, !item.isOpen && styles.statusChipClosed]}>{item.isOpen ? "Open" : "Closed"}</Text>
                  </View>
                  <View style={styles.featuredBottom}>
                    <Text style={styles.featuredName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.featuredMeal} numberOfLines={1}>{item.meal}</Text>
                    <View style={styles.featuredMeta}>
                      <MetaTag icon={<Star size={12} color="#f1b634" fill="#f1b634" />} label={item.rating.toFixed(1)} />
                      <MetaTag icon={<Clock3 size={12} color="#ffffff" />} label={`${item.etaMins} mins`} />
                      <MetaTag icon={<MapPin size={12} color="#ffffff" />} label={item.area} />
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Restaurants near you</Text>
            <Text style={styles.sectionCount}>{filtered.length} results</Text>
          </View>

          {filtered.length === 0 ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>No food results</Text>
              <Text style={styles.noticeSub}>Try a different cuisine, campus, or search term.</Text>
            </View>
          ) : (
            <View style={styles.listColumn}>
              {filtered.map((item) => {
                const selected = !!selectedDelivery[item.id];
                const total = item.mealPrice + (selected ? item.deliveryFee : 0);
                return (
                  <Pressable
                    key={item.id}
                    style={styles.listCard}
                    onPress={() => router.push({ pathname: detailRoute, params: { id: item.id } })}
                  >
                    <Image source={{ uri: item.image }} style={styles.listImage} />
                    <View style={styles.listBody}>
                      <View style={styles.listTopRow}>
                        <View style={styles.listTitleWrap}>
                          <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.listSub} numberOfLines={1}>{item.meal}</Text>
                        </View>
                        <Text style={styles.listPrice}>{kwacha(item.mealPrice)}</Text>
                      </View>

                      <View style={styles.metaWrap}>
                        <MetaTag icon={<Star size={12} color="#f1b634" fill="#f1b634" />} label={item.rating.toFixed(1)} dark />
                        <MetaTag icon={<Clock3 size={12} color="#17315d" />} label={`${item.etaMins} mins`} dark />
                        <MetaTag icon={<MapPin size={12} color="#17315d" />} label={`${item.area}, ${item.campus}`} dark />
                      </View>

                      <Text style={styles.vendorMood}>{vendorMood(item)}</Text>

                      <View style={styles.cardFooter}>
                        <View>
                          <Text style={styles.deliveryFee}>Delivery {kwacha(item.deliveryFee)}</Text>
                          <Text style={styles.totalFee}>Total {kwacha(total)}</Text>
                        </View>
                        <Pressable
                          style={[styles.deliveryBtn, selected && styles.deliveryBtnActive]}
                          onPress={(event) => {
                            event.stopPropagation();
                            setSelectedDelivery((current) => ({ ...current, [item.id]: !selected }));
                          }}
                        >
                          <Bike size={14} color={selected ? "#ffffff" : "#0f6d80"} />
                          <Text style={[styles.deliveryBtnText, selected && styles.deliveryBtnTextActive]}>
                            {selected ? "Selected" : "Deliver"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {firstSelected ? (
        <View style={styles.floatBar}>
          <View style={styles.floatCopy}>
            <Text style={styles.floatTitle}>{selectedItems.length} meal{selectedItems.length > 1 ? "s" : ""} selected</Text>
            <Text style={styles.floatSub}>{firstSelected.name} ready for checkout</Text>
          </View>
          <Pressable
            style={styles.floatBtn}
            onPress={() =>
              router.push({
                pathname: "/(student)/checkout",
                params: {
                  mode: "food",
                  title: firstSelected.name,
                  base: String(firstSelected.mealPrice),
                  delivery: String(firstSelected.deliveryFee),
                  item_id: firstSelected.id,
                  vendor_id: firstSelected.vendorId,
                  channel: "food",
                  delivery_mode: "doorstep",
                },
              })
            }
          >
            <Text style={styles.floatBtnText}>Checkout</Text>
            <ChevronRight size={18} color="#ffffff" />
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function HeroPill({ label }: { label: string }) {
  return (
    <View style={styles.heroPill}>
      <Text style={styles.heroPillText}>{label}</Text>
    </View>
  );
}

function HeaderButton({
  icon,
  badge,
  onPress,
  accent = false,
}: {
  icon: React.ReactNode;
  badge: string;
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Pressable style={styles.headerButton} onPress={onPress}>
      {icon}
      <View style={[styles.headerBadge, accent && styles.headerBadgeAccent]}>
        <Text style={styles.headerBadgeText}>{badge}</Text>
      </View>
    </Pressable>
  );
}

function FilterChip({
  active,
  label,
  onPress,
  soft = false,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  soft?: boolean;
}) {
  return (
    <Pressable style={[styles.filterChip, soft && styles.filterChipSoft, active && styles.filterChipActive]} onPress={onPress}>
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MetaTag({ icon, label, dark = false }: { icon: React.ReactNode; label: string; dark?: boolean }) {
  return (
    <View style={[styles.metaTag, dark && styles.metaTagDark]}>
      {icon}
      <Text style={[styles.metaTagText, dark && styles.metaTagTextDark]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef6f8" },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 128, gap: 16 },
  skeletonWrap: { padding: 16, gap: 12 },
  skeletonHero: { height: 190, borderRadius: 28, backgroundColor: "#d8e8ef" },
  skeletonSearch: { height: 58, borderRadius: 20, backgroundColor: "#d8e8ef" },
  skeletonCard: { height: 120, borderRadius: 24, backgroundColor: "#d8e8ef" },
  topSection: { gap: 14 },
  brandTag: { color: "#16315f", fontSize: 16, fontWeight: "900", paddingHorizontal: 2 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 2 },
  locationRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#dcebef" },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#16315f" },
  avatarFallbackText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  locationTitle: { color: "#16315f", fontSize: 20, fontWeight: "900" },
  locationMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  locationSub: { color: "#58707e", fontWeight: "700", fontSize: 12, flex: 1 },
  headerActions: { flexDirection: "row", gap: 10 },
  headerButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6d8795",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  headerBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#f14561",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  headerBadgeAccent: { backgroundColor: "#0f8a8f" },
  headerBadgeText: { color: "#ffffff", fontWeight: "900", fontSize: 11 },
  heroCard: {
    width: 296,
    borderRadius: 30,
    minHeight: 198,
    padding: 20,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#355766",
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  heroCopy: { flex: 1, zIndex: 2, justifyContent: "space-between", gap: 10 },
  heroTitle: { color: "#16315f", fontSize: 34, fontWeight: "900", lineHeight: 38 },
  heroSub: { color: "#264b67", fontSize: 15, fontWeight: "700", maxWidth: 280, lineHeight: 22 },
  heroPills: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  heroPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  heroPillText: { color: "#16315f", fontWeight: "800", fontSize: 12 },
  heroArt: { width: 112, alignItems: "center", justifyContent: "center", position: "relative" },
  heroBlobLarge: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 999,
    backgroundColor: "#ffe4c7",
    top: -16,
    right: -28,
  },
  heroBlobSmall: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 999,
    backgroundColor: "#ffeef2",
    bottom: 6,
    right: 12,
  },
  searchWrap: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d7e3e9",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 15,
    shadowColor: "#6d8795",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  searchInput: { flex: 1, color: "#16315f", fontSize: 15, fontWeight: "700" },
  heroRail: { gap: 10, paddingRight: 18 },
  heroDots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  heroDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#c7d6de" },
  heroDotActive: { width: 18, backgroundColor: "#16315f" },
  campusFilterRow: { gap: 8, paddingRight: 18 },
  filterRow: { gap: 8, paddingRight: 18 },
  filterChip: {
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d6e3e9",
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  filterChipSoft: { backgroundColor: "#ffffff", borderColor: "#d6e3e9" },
  filterChipActive: { backgroundColor: "#0f6d80", borderColor: "#0f6d80" },
  filterChipText: { color: "#16315f", fontWeight: "800", fontSize: 12 },
  filterChipTextActive: { color: "#ffffff" },
  sectionTitle: { color: "#16315f", fontWeight: "900", fontSize: 22, marginBottom: 10 },
  cuisineRow: { gap: 12 },
  cuisineCard: {
    width: 122,
    borderRadius: 24,
    padding: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    gap: 12,
    shadowColor: "#6d8795",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cuisineIconWrap: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  cuisineLabel: { color: "#16315f", fontWeight: "800", fontSize: 14 },
  noticeCard: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    padding: 18,
    gap: 4,
  },
  noticeTitle: { color: "#16315f", fontWeight: "900", fontSize: 18 },
  noticeSub: { color: "#58707e", fontWeight: "600", fontSize: 13, lineHeight: 19 },
  featuredRow: { gap: 14 },
  featuredCard: {
    width: 286,
    height: 236,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#bcd8e0",
  },
  featuredImage: { width: "100%", height: "100%", position: "absolute" },
  featuredOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(13,25,49,0.34)" },
  featuredTop: { flexDirection: "row", justifyContent: "space-between", padding: 14 },
  featuredBadge: {
    backgroundColor: "rgba(255,255,255,0.88)",
    color: "#16315f",
    fontWeight: "900",
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  statusChip: {
    backgroundColor: "#e9fbef",
    color: "#0d7a37",
    fontWeight: "900",
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  statusChipClosed: { backgroundColor: "#ffe5ec", color: "#b9375a" },
  featuredBottom: { marginTop: "auto", padding: 14, gap: 6 },
  featuredName: { color: "#ffffff", fontWeight: "900", fontSize: 24 },
  featuredMeal: { color: "#edf5ff", fontWeight: "700", fontSize: 14 },
  featuredMeta: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaTag: {
    maxWidth: 120,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaTagDark: { backgroundColor: "#eef5f7" },
  metaTagText: { color: "#ffffff", fontWeight: "800", fontSize: 11, flexShrink: 1 },
  metaTagTextDark: { color: "#17315d" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionCount: { color: "#5a7180", fontWeight: "700", fontSize: 12 },
  listColumn: { gap: 12 },
  listCard: {
    borderRadius: 26,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    padding: 12,
    flexDirection: "row",
    gap: 12,
    shadowColor: "#6d8795",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  listImage: { width: 104, height: 116, borderRadius: 20, backgroundColor: "#dcebef" },
  listBody: { flex: 1, gap: 10 },
  listTopRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  listTitleWrap: { flex: 1 },
  listName: { color: "#16315f", fontWeight: "900", fontSize: 18 },
  listSub: { color: "#57707d", fontWeight: "700", fontSize: 13, marginTop: 2 },
  listPrice: { color: "#16315f", fontWeight: "900", fontSize: 16 },
  metaWrap: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  vendorMood: { color: "#0f6d80", fontWeight: "800", fontSize: 12 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: "auto" },
  deliveryFee: { color: "#58707e", fontWeight: "700", fontSize: 12 },
  totalFee: { color: "#16315f", fontWeight: "900", fontSize: 15, marginTop: 2 },
  deliveryBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cfe0e7",
    backgroundColor: "#f8fcfd",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  deliveryBtnActive: { backgroundColor: "#0f6d80", borderColor: "#0f6d80" },
  deliveryBtnText: { color: "#0f6d80", fontWeight: "900", fontSize: 12 },
  deliveryBtnTextActive: { color: "#ffffff" },
  floatBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 104,
    borderRadius: 24,
    backgroundColor: "#16315f",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    shadowColor: "#16315f",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  floatCopy: { flex: 1 },
  floatTitle: { color: "#ffffff", fontWeight: "900", fontSize: 15 },
  floatSub: { color: "#dbe8ff", fontWeight: "700", fontSize: 12, marginTop: 2 },
  floatBtn: {
    borderRadius: 999,
    backgroundColor: "#0f6d80",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  floatBtnText: { color: "#ffffff", fontWeight: "900", fontSize: 13 },
});


