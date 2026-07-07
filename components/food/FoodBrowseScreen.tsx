import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import {
  ArrowLeft,
  Bell,
  Bike,
  Clock3,
  Flame,
  Home,
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
import { locationMatchScore, usePreferredLocationOptional } from "@/providers/PreferredLocationProvider";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

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

type FoodRestaurantPreview = {
  vendorId: string;
  name: string;
  cuisine: string;
  area: string;
  campus: string;
  etaMins: number;
  deliveryFee: number;
  startingPrice: number;
  rating: number;
  isOpen: boolean;
  image: string;
  menuCount: number;
  menuPreview: string[];
  summary: string;
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

function toRestaurantPreviews(items: FoodCard[]): FoodRestaurantPreview[] {
  const grouped = new Map<string, FoodCard[]>();
  for (const item of items) {
    const current = grouped.get(item.vendorId) ?? [];
    current.push(item);
    grouped.set(item.vendorId, current);
  }

  return Array.from(grouped.entries()).map(([vendorId, vendorItems]) => {
    const lead = vendorItems[0];
    const previews = vendorItems.slice(0, 3).map((item) => item.meal);
    return {
      vendorId,
      name: lead.name,
      cuisine: lead.cuisine,
      area: lead.area,
      campus: lead.campus,
      etaMins: Math.min(...vendorItems.map((item) => item.etaMins)),
      deliveryFee: Math.min(...vendorItems.map((item) => item.deliveryFee)),
      startingPrice: Math.min(...vendorItems.map((item) => item.mealPrice)),
      rating: lead.rating,
      isOpen: vendorItems.some((item) => item.isOpen),
      image: lead.image,
      menuCount: vendorItems.length,
      menuPreview: previews,
      summary: previews.join(" - "),
    };
  });
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
  const { theme } = useStudentTheme();
  const restaurantRoute = detailRoute === "/(student)/food/[id]" ? "/(student)/food/restaurant/[vendorId]" : "/(food)/restaurant/[vendorId]";
  const ordersRoute = detailRoute === "/(student)/food/[id]" ? "/(student)/(tabs)/orders" : "/(food)/(tabs)/orders";
  const homeRoute = "/(student)/(tabs)/home";
  const { user } = useAuth();
  const locationContext = usePreferredLocationOptional();
  const preferredLocation = locationContext?.location ?? null;
  const heroRef = React.useRef<ScrollView | null>(null);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<FoodCard[]>([]);
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
    const filteredItems = items
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
    return toRestaurantPreviews(filteredItems).sort(
      (a, b) =>
        locationMatchScore(preferredLocation, { area: b.area, campus: b.campus }) -
        locationMatchScore(preferredLocation, { area: a.area, campus: a.campus }),
    );
  }, [campusFilter, cuisineFilter, items, openNowOnly, preferredLocation, query]);

  const featured = React.useMemo(() => filtered.slice(0, 3), [filtered]);
  const foodHeaderName =
    (profileFullName ?? "").trim() ||
    String(user?.user_metadata?.full_name ?? "").trim() ||
    user?.email?.split("@")[0] ||
    "Food";

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={styles.skeletonWrap}>
          <View style={[styles.skeletonHero, { backgroundColor: theme.surfaceMuted }]} />
          <View style={[styles.skeletonSearch, { backgroundColor: theme.surfaceMuted }]} />
          <View style={[styles.skeletonCard, { backgroundColor: theme.surfaceMuted }]} />
          <View style={[styles.skeletonCard, { backgroundColor: theme.surfaceMuted }]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topSection}>
          <View style={styles.brandRow}>
            <BackHomeButton onPress={() => router.replace(homeRoute as any)} />
            <Text style={[styles.brandTag, { color: theme.heading }]}>EYA food</Text>
          </View>
          <View style={styles.topRow}>
            <View style={styles.locationRow}>
              {profileAvatarUrl ? (
                <Image source={{ uri: profileAvatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarFallbackText}>{initials(profileFullName, user?.email ?? null)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.locationTitle, { color: theme.text }]} numberOfLines={1}>{foodHeaderName}</Text>
                <View style={styles.locationMeta}>
                  <UtensilsCrossed size={13} color={theme.accent} />
                  <Text style={[styles.locationSub, { color: theme.textMuted }]} numberOfLines={1}>Browse food and restaurants</Text>
                </View>
              </View>
            </View>
            <View style={styles.headerActions}>
              <HeaderButton icon={<Bell size={20} color={theme.text} />} badge="2" onPress={() => router.push("/(student)/requests")} />
              <HeaderButton icon={<Bike size={20} color={theme.accent} />} badge="2" accent onPress={() => router.push(ordersRoute as any)} />
            </View>
          </View>

          <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Search size={20} color={theme.textSoft} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search meals, restaurant, cuisines..."
              placeholderTextColor={theme.textSoft}
            />
            <MessageCircle size={20} color={theme.textSoft} />
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
              <View key={slide.id} style={[styles.heroCard, { backgroundColor: theme.isDark ? theme.surface : slide.tone, borderColor: theme.isDark ? theme.border : "transparent" }]}>
                <View style={styles.heroCopy}>
                  <Text style={[styles.heroTitle, { color: theme.isDark ? theme.text : "#16315f" }]}>{slide.title}</Text>
                  <Text style={[styles.heroSub, { color: theme.isDark ? theme.textMuted : "#264b67" }]}>{slide.sub}</Text>
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
          <Text style={[styles.sectionTitle, { color: theme.heading }]}>Browse cuisines</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cuisineRow}>
            {cuisineCards.map((card) => (
              <View key={card.id} style={[styles.cuisineCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.cuisineIconWrap, { backgroundColor: card.bg }]}>{card.icon}</View>
                <Text style={[styles.cuisineLabel, { color: theme.text }]}>{card.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {error ? (
          <View style={[styles.noticeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.noticeTitle, { color: theme.text }]}>Could not load food section</Text>
            <Text style={[styles.noticeSub, { color: theme.textMuted }]}>{error}</Text>
          </View>
        ) : null}

        {featured.length ? (
          <View>
            <Text style={[styles.sectionTitle, { color: theme.heading }]}>Explore by craving</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow}>
              {featured.map((item) => (
                <Pressable
                  key={item.vendorId}
                  style={styles.featuredCard}
                  onPress={() => router.push({ pathname: restaurantRoute, params: { vendorId: item.vendorId } })}
                >
                  <Image source={{ uri: item.image }} style={styles.featuredImage} />
                  <View style={styles.featuredOverlay} />
                  <View style={styles.featuredTop}>
                    <Text style={styles.featuredBadge}>{etaBadge(item.etaMins)}</Text>
                    <Text style={[styles.statusChip, !item.isOpen && styles.statusChipClosed]}>{item.isOpen ? "Open" : "Closed"}</Text>
                  </View>
                  <View style={styles.featuredBottom}>
                    <Text style={styles.featuredName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.featuredMeal} numberOfLines={1}>{item.menuCount} menu items - {item.summary}</Text>
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
            <Text style={[styles.sectionTitle, { color: theme.heading }]}>Restaurants</Text>
            <Text style={[styles.sectionCount, { color: theme.textMuted }]}>{filtered.length} results</Text>
          </View>

          {filtered.length === 0 ? (
            <View style={[styles.noticeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.noticeTitle, { color: theme.text }]}>No food results</Text>
              <Text style={[styles.noticeSub, { color: theme.textMuted }]}>Try a different cuisine, campus, or search term.</Text>
            </View>
          ) : (
            <View style={styles.listColumn}>
              {filtered.map((item) => {
                return (
                  <Pressable
                    key={item.vendorId}
                    style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => router.push({ pathname: restaurantRoute, params: { vendorId: item.vendorId } })}
                  >
                    <Image source={{ uri: item.image }} style={styles.listImage} />
                    <View style={styles.listBody}>
                      <View style={styles.listTopRow}>
                        <View style={styles.listTitleWrap}>
                          <Text style={[styles.listName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                          <Text style={[styles.listSub, { color: theme.textMuted }]} numberOfLines={1}>{item.menuCount} meals inside</Text>
                        </View>
                        <Text style={[styles.listPrice, { color: theme.text }]}>From {kwacha(item.startingPrice)}</Text>
                      </View>

                      <View style={styles.metaWrap}>
                        <MetaTag icon={<Star size={12} color="#f1b634" fill="#f1b634" />} label={item.rating.toFixed(1)} dark />
                        <MetaTag icon={<Clock3 size={12} color="#17315d" />} label={`${item.etaMins} mins`} dark />
                        <MetaTag icon={<MapPin size={12} color="#17315d" />} label={`${item.area}, ${item.campus}`} dark />
                      </View>

                      <Text style={[styles.vendorMood, { color: theme.accent }]}>{item.summary || item.cuisine}</Text>

                      <View style={styles.cardFooter}>
                        <View>
                          <Text style={[styles.deliveryFee, { color: theme.textMuted }]}>Delivery from {kwacha(item.deliveryFee)}</Text>
                          <Text style={[styles.totalFee, { color: theme.text }]}>{item.menuPreview.join(" - ")}</Text>
                        </View>
                        <Pressable
                          style={[styles.deliveryBtn, styles.deliveryBtnActive]}
                          onPress={(event) => {
                            event.stopPropagation();
                            router.push({ pathname: restaurantRoute, params: { vendorId: item.vendorId } });
                          }}
                        >
                          <Bike size={14} color="#ffffff" />
                          <Text style={[styles.deliveryBtnText, styles.deliveryBtnTextActive]}>View menu</Text>
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
  const { theme } = useStudentTheme();
  return (
    <Pressable style={[styles.headerButton, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.accent }]} onPress={onPress}>
      {icon}
      <View style={[styles.headerBadge, accent && { backgroundColor: theme.accent }]}>
        <Text style={styles.headerBadgeText}>{badge}</Text>
      </View>
    </Pressable>
  );
}

function BackHomeButton({ onPress }: { onPress: () => void }) {
  const { theme } = useStudentTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back to home" hitSlop={10} style={styles.backHomeBtn} onPress={onPress}>
      <View style={[styles.backHomeTrail, { backgroundColor: theme.isDark ? "rgba(255,208,120,0.22)" : "#ffd8c6" }]} />
      <View style={[styles.backHomeCore, { backgroundColor: theme.accent, borderColor: theme.surface, shadowColor: theme.accent }]}>
        <ArrowLeft size={19} color="#ffffff" strokeWidth={3} />
      </View>
      <View style={[styles.backHomeBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Home size={12} color={theme.accent} strokeWidth={3} />
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
  const { theme } = useStudentTheme();
  return (
    <Pressable
      style={[
        styles.filterChip,
        { backgroundColor: theme.surface, borderColor: theme.border },
        soft && { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
        active && { backgroundColor: theme.accent, borderColor: theme.accent },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.filterChipText, { color: theme.text }, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MetaTag({ icon, label, dark = false }: { icon: React.ReactNode; label: string; dark?: boolean }) {
  const { theme } = useStudentTheme();
  return (
    <View style={[styles.metaTag, dark && styles.metaTagDark, dark && theme.isDark && { backgroundColor: theme.surfaceAlt }]}>
      {icon}
      <Text style={[styles.metaTagText, dark && styles.metaTagTextDark, dark && theme.isDark && { color: theme.text }]} numberOfLines={1}>
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
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 2 },
  brandTag: { color: "#16315f", fontSize: 16, fontWeight: "900" },
  backHomeBtn: { width: 54, height: 38, justifyContent: "center" },
  backHomeTrail: { position: "absolute", left: 19, width: 30, height: 8, borderRadius: 999, backgroundColor: "#ffd8c6" },
  backHomeCore: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#16315f",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
    shadowColor: "#16315f",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  backHomeBadge: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    alignItems: "center",
    justifyContent: "center",
  },
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
    borderWidth: 1,
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


