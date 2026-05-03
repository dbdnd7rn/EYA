import React, { useEffect, useMemo, useState } from "react";
import { Animated, Easing, ImageBackground, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { BedDouble, ChevronRight, Clock3, MapPin, Mic, Search, ShoppingBag, Sparkles, Star, UtensilsCrossed } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { supabase } from "@/lib/supabase";
import { listCatalogItems } from "@/lib/newApp/catalog";
import { supabaseNewApp } from "@/lib/supabaseNewApp";
import { useAuth } from "@/providers/AuthProvider";
import { locationMatchScore, usePreferredLocation } from "@/providers/PreferredLocationProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

type Mode = "stay" | "market" | "food";

type FeaturedCard = {
  id: string;
  mode: Mode;
  title: string;
  subtitle: string;
  rating: string;
  location: string;
  image: string;
  status?: "Open" | "Closed";
  cta: string;
  href: "/(eya)/(tabs)/rooms" | "/(student)/(tabs)/marketplace" | "/(food)/(tabs)/food";
};

type VendorMini = {
  id: string;
  name: string | null;
  area: string | null;
  campus: string | null;
  city: string | null;
  is_active: boolean;
};

type StayListing = {
  id: string;
  title: string | null;
  listing_type: "hostel" | "bedsitter" | string | null;
  area: string | null;
  city: string | null;
  campus: string | null;
  image_urls: string[] | null;
  is_active: boolean | null;
};

type ProfileMini = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  surname?: string | null;
};

type DiscoveryCard = {
  id: string;
  badge?: string;
  eyebrow: string;
  title: string;
  lineOne: string;
  lineTwo: string;
  image: string;
  href: FeaturedCard["href"];
  tone: string;
};

const FALLBACK_FEATURED_CARDS: FeaturedCard[] = [
  {
    id: "s1",
    mode: "stay",
    title: "MUST Prime Hostel",
    subtitle: "Bedsitter and single rooms",
    rating: "4.7",
    location: "Soche",
    image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
    status: "Open",
    cta: "Browse rooms",
    href: "/(eya)/(tabs)/rooms",
  },
  {
    id: "s2",
    mode: "stay",
    title: "Green Court Residences",
    subtitle: "Quiet study zones and fast Wi-Fi",
    rating: "4.6",
    location: "Naperi",
    image: "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80",
    status: "Open",
    cta: "View",
    href: "/(eya)/(tabs)/rooms",
  },
  {
    id: "m1",
    mode: "market",
    title: "Campus Essentials",
    subtitle: "Study gear and daily needs",
    rating: "4.5",
    location: "Namiwawa",
    image: "https://images.unsplash.com/photo-1604719312566-8912e9c8a213?auto=format&fit=crop&w=1200&q=80",
    status: "Open",
    cta: "Browse",
    href: "/(student)/(tabs)/marketplace",
  },
  {
    id: "f1",
    mode: "food",
    title: "BurgerZone",
    subtitle: "Fast campus meals",
    rating: "4.8",
    location: "Blantyre",
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
    status: "Open",
    cta: "Order",
    href: "/(food)/(tabs)/food",
  },
];
const FEATURED_CACHE_KEY = "student_home_featured_v1";

function ratingFromId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash += id.charCodeAt(i);
  const v = 4.2 + (hash % 7) * 0.1;
  return v.toFixed(1);
}

function safeLocation(...parts: (string | null | undefined)[]) {
  const location = parts.map((p) => (p ?? "").trim()).filter(Boolean);
  return location[0] || "Near campus";
}

async function loadFeaturedCards(): Promise<FeaturedCard[]> {
  const [{ data: stayRows, error: stayErr }, marketRows, foodRows] = await Promise.all([
    supabase.from("listings").select("id,title,listing_type,area,city,campus,image_urls,is_active").eq("is_active", true).limit(12),
    listCatalogItems({ channel: "market", isActiveOnly: true, limit: 12 }),
    listCatalogItems({ channel: "food", isActiveOnly: true, limit: 12 }),
  ]);

  if (stayErr) throw stayErr;

  const vendorIds = Array.from(new Set([...marketRows, ...foodRows].map((x) => x.vendor_id)));
  const vendorMap = new Map<string, VendorMini>();

  if (vendorIds.length) {
    const { data: vendors, error: vendorsErr } = await supabaseNewApp.from("vendors").select("id,name,area,campus,city,is_active").in("id", vendorIds);
    if (vendorsErr) throw vendorsErr;
    (vendors ?? []).forEach((v) => {
      const row = v as VendorMini;
      vendorMap.set(row.id, row);
    });
  }

  const stays: FeaturedCard[] = ((stayRows ?? []) as StayListing[]).map((r) => ({
    id: `stay-${r.id}`,
    mode: "stay",
    title: r.title?.trim() || "Campus stay",
    subtitle: `${r.listing_type === "bedsitter" ? "Bedsitter" : "Hostel"} near campus`,
    rating: ratingFromId(r.id),
    location: safeLocation(r.area, r.campus, r.city),
    image: r.image_urls?.[0] || "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
    status: "Open",
    cta: "Browse rooms",
    href: "/(eya)/(tabs)/rooms",
  }));

  const markets: FeaturedCard[] = marketRows.map((r) => {
    const v = vendorMap.get(r.vendor_id);
    return {
      id: `market-${r.id}`,
      mode: "market",
      title: r.name,
      subtitle: v?.name ? `${v.name} | ${Number(r.price_mwk).toLocaleString("en-MW")} MWK` : "Campus marketplace item",
      rating: ratingFromId(r.id),
      location: safeLocation(v?.area, v?.campus, v?.city),
      image: r.image_url || "https://images.unsplash.com/photo-1604719312566-8912e9c8a213?auto=format&fit=crop&w=1200&q=80",
      status: v?.is_active === false ? "Closed" : "Open",
      cta: "Browse",
      href: "/(student)/(tabs)/marketplace",
    };
  });

  const foods: FeaturedCard[] = foodRows.map((r) => {
    const v = vendorMap.get(r.vendor_id);
    return {
      id: `food-${r.id}`,
      mode: "food",
      title: r.name,
      subtitle: v?.name ? `${v.name} | ${Number(r.price_mwk).toLocaleString("en-MW")} MWK` : "Campus food item",
      rating: ratingFromId(r.id),
      location: safeLocation(v?.area, v?.campus, v?.city),
      image: r.image_url || "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80",
      status: v?.is_active === false ? "Closed" : "Open",
      cta: "Order",
      href: "/(food)/(tabs)/food",
    };
  });

  return [...stays, ...markets, ...foods];
}

function resolveDisplayName(profile: ProfileMini | null, email?: string | null) {
  const full = profile?.full_name?.trim();
  if (full) return full.split(/\s+/)[0] || full;

  const first = profile?.first_name?.trim();
  if (first) return first;

  const emailName = (email ?? "").split("@")[0]?.trim();
  if (emailName) return emailName;

  return "Student";
}

function resolveInitials(profile: ProfileMini | null, email?: string | null) {
  const full = profile?.full_name?.trim();
  if (full) {
    const parts = full.split(/\s+/).filter(Boolean);
    return `${parts[0]?.[0] ?? "S"}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }

  const first = profile?.first_name?.trim() || "";
  const last = profile?.last_name?.trim() || profile?.surname?.trim() || "";
  if (first || last) return `${first[0] ?? "S"}${last[0] ?? ""}`.toUpperCase();

  const emailName = (email ?? "").split("@")[0]?.trim();
  if (emailName) return emailName.slice(0, 2).toUpperCase();

  return "PP";
}

function timeGreetingLabel(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function etaFromId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash += id.charCodeAt(i);
  return `${12 + (hash % 15)} min`;
}

function compactPriceFromSubtitle(subtitle: string) {
  const match = subtitle.match(/(\d[\d,]*)\s*MWK/i);
  if (!match) return "K2,000";
  return `K${match[1]}`;
}

function discoveryCardFromFeatured(card: FeaturedCard, index: number): DiscoveryCard {
  if (card.mode === "stay") {
    return {
      id: `${card.id}-near`,
      badge: index === 1 ? "New" : undefined,
      eyebrow: "stay close",
      title: card.title,
      lineOne: card.subtitle,
      lineTwo: card.location,
      image: card.image,
      href: card.href,
      tone: "#79d58b",
    };
  }

  if (card.mode === "food") {
    return {
      id: `${card.id}-near`,
      eyebrow: "quick bite",
      title: card.title,
      lineOne: compactPriceFromSubtitle(card.subtitle),
      lineTwo: `${card.rating} stars • ${etaFromId(card.id)}`,
      image: card.image,
      href: card.href,
      tone: "#f4b458",
    };
  }

  return {
    id: `${card.id}-near`,
    badge: index === 0 ? "Fresh" : undefined,
    eyebrow: "market pick",
    title: card.title,
    lineOne: compactPriceFromSubtitle(card.subtitle),
    lineTwo: card.location,
    image: card.image,
    href: card.href,
    tone: "#8f88ff",
  };
}

export default function StudentHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useStudentTheme();
  const preferredLocation = usePreferredLocation().location;
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<FeaturedCard[]>(FALLBACK_FEATURED_CARDS);
  const [displayName, setDisplayName] = useState("Student");
  const [avatarInitials, setAvatarInitials] = useState("PP");
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  const waveAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;

    (async () => {
      const cached = await getCachedJson<FeaturedCard[]>(FEATURED_CACHE_KEY);
      if (cached?.data?.length && active) {
        setCards(cached.data);
        setLoading(false);
      } else if (active) {
        setLoading(true);
      }

      try {
        const remoteCards = await loadFeaturedCards();
        if (!active) return;
        const nextCards = remoteCards.length ? remoteCards : FALLBACK_FEATURED_CARDS;
        setCards(nextCards);
        await setCachedJson(FEATURED_CACHE_KEY, nextCards);
      } catch {
        if (!active) return;
        if (!cached?.data?.length) setCards(FALLBACK_FEATURED_CARDS);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadProfileMini = async () => {
      if (!user?.id) {
        setDisplayName("Student");
        setAvatarInitials("PP");
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("full_name,first_name,last_name,surname")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;
      const profile = (data ?? null) as ProfileMini | null;
      setDisplayName(resolveDisplayName(profile, user.email));
      setAvatarInitials(resolveInitials(profile, user.email));
    };

    void loadProfileMini();
    return () => {
      active = false;
    };
  }, [user?.email, user?.id]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentHour(new Date().getHours()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(waveAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(waveAnim, {
          toValue: -0.6,
          duration: 180,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(waveAnim, {
          toValue: 0.9,
          duration: 180,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(waveAnim, {
          toValue: 0,
          duration: 220,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(2600),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [waveAnim]);

  const term = q.trim().toLowerCase();
  const greetingLabel = useMemo(() => timeGreetingLabel(currentHour), [currentHour]);
  const waveRotation = waveAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-14deg", "18deg"],
  });
  const sortedCards = useMemo(
    () =>
      [...cards].sort((a, b) => {
        const scoreA = locationMatchScore(preferredLocation, { area: a.location, campus: a.location, city: a.location });
        const scoreB = locationMatchScore(preferredLocation, { area: b.location, campus: b.location, city: b.location });
        return scoreB - scoreA;
      }),
    [cards, preferredLocation],
  );
  const stayCards = useMemo(
    () => sortedCards.filter((card) => card.mode === "stay" && (!term || [card.title, card.subtitle, card.location].some((v) => v.toLowerCase().includes(term)))),
    [sortedCards, term],
  );
  const mixedCards = useMemo(
    () => sortedCards.filter((card) => card.mode !== "stay" && (!term || [card.title, card.subtitle, card.location].some((v) => v.toLowerCase().includes(term)))),
    [sortedCards, term],
  );
  const nearbyCards = useMemo(
    () => [...stayCards.slice(0, 2), ...mixedCards.slice(0, 4)].map((card, index) => discoveryCardFromFeatured(card, index)),
    [mixedCards, stayCards],
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={styles.skeletonWrap}>
          <View style={[styles.skeletonCard, { height: 120, backgroundColor: theme.surfaceMuted }]} />
          <View style={[styles.skeletonCard, { height: 72, backgroundColor: theme.surfaceMuted }]} />
          <View style={[styles.skeletonCard, { height: 120, backgroundColor: theme.surfaceMuted }]} />
          <View style={[styles.skeletonCard, { height: 240, backgroundColor: theme.surfaceMuted }]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={styles.greetingBlock}>
              <Text style={[styles.greeting, { color: theme.heading }]}>{greetingLabel},</Text>
              <View style={styles.greetingRow}>
                <Text style={[styles.greeting, { color: theme.heading }]}>{displayName}</Text>
                <Animated.Text style={[styles.waveEmoji, { transform: [{ rotate: waveRotation }] }]}>{"\u{1F44B}"}</Animated.Text>
              </View>
            </View>
            <Text style={[styles.sub, { color: theme.textMuted }]}>Search for rooms, food, products...</Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
            <Text style={styles.avatarText}>{avatarInitials}</Text>
          </View>
        </View>

        <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Search size={20} color={theme.textSoft} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            value={q}
            onChangeText={setQ}
            placeholder="Search for rooms, food, products..."
            placeholderTextColor={theme.textSoft}
          />
          <Mic size={20} color={theme.textSoft} />
        </View>

        <View style={styles.categoryRow}>
          <CategoryCard
            title="Rooms"
            text="Find rooms"
            icon={<BedDouble size={26} color="#688ac2" />}
            bg={["#dceeff", "#eff4ff"]}
            onPress={() => router.push("/(eya)/(tabs)/rooms")}
          />
          <CategoryCard
            title="Market"
            text="Buy anything"
            icon={<ShoppingBag size={26} color="#6f63cc" />}
            bg={["#ebe6ff", "#f4f1ff"]}
            onPress={() => router.push("/(student)/(tabs)/marketplace")}
          />
          <CategoryCard
            title="Food"
            text="Order meals"
            icon={<UtensilsCrossed size={26} color="#d78d3d" />}
            bg={["#ffe9d9", "#fff4ea"]}
            onPress={() => router.push("/(food)/(tabs)/food")}
          />
        </View>

        <SectionHeader title="Near you" subtitle="Fresh campus options matched to your area" accent="*" onPress={() => router.push("/(student)/(tabs)/marketplace")} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {nearbyCards.map((card) => (
            <Pressable key={card.id} style={styles.discoveryCard} onPress={() => router.push(card.href)}>
              <ImageBackground source={{ uri: card.image }} style={styles.discoveryMedia} imageStyle={styles.discoveryMediaImg}>
                <View style={styles.discoveryMediaShade} />
                <View style={styles.discoveryTopRow}>
                  <View style={styles.discoveryEyebrow}>
                    <Sparkles size={12} color="#13285f" />
                    <Text style={styles.discoveryEyebrowText}>{card.eyebrow}</Text>
                  </View>
                  {card.badge ? <Text style={styles.discoveryBadge}>{card.badge}</Text> : null}
                </View>
              </ImageBackground>
              <View style={styles.discoveryBody}>
                <Text numberOfLines={2} style={styles.discoveryTitle}>{card.title}</Text>
                <Text numberOfLines={1} style={styles.discoveryPrice}>{card.lineOne}</Text>
                <View style={styles.discoveryMetaRow}>
                  <MapPin size={14} color="#6c7595" />
                  <Text numberOfLines={1} style={styles.discoveryMetaText}>{card.lineTwo}</Text>
                  <View style={[styles.discoveryDot, { backgroundColor: card.tone }]} />
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        <SectionHeader title="Featured on EYA" subtitle="Top picks near you" accent="*" onPress={() => router.push("/(eya)/(tabs)/rooms")} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {stayCards.slice(0, 5).map((card, index) => (
            <Pressable key={card.id} onPress={() => router.push(card.href)}>
              <ImageBackground source={{ uri: card.image }} style={[styles.featureCard, index > 0 && styles.featureCardSmall]} imageStyle={styles.featureImage}>
                <View style={styles.overlay} />
                <Text style={styles.topPickChip}>{index === 0 ? "Top pick" : "Browse"}</Text>
                <View style={styles.featureBottom}>
                  <Text numberOfLines={2} style={styles.featureTitle}>{card.title}</Text>
                  <View style={styles.featureMetaRow}>
                    <Star size={14} color="#ffd166" fill="#ffd166" />
                    <Text style={styles.featureMetaText}>{card.rating}</Text>
                    <MapPin size={14} color="#ffffff" />
                    <Text style={styles.featureMetaText}>{card.location}</Text>
                  </View>
                  <View style={styles.primaryPill}>
                    <Text style={styles.primaryPillText}>{card.cta}</Text>
                  </View>
                </View>
              </ImageBackground>
            </Pressable>
          ))}
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

function CategoryCard({
  bg,
  icon,
  onPress,
  text,
  title,
}: {
  bg: [string, string];
  icon: React.ReactNode;
  onPress: () => void;
  text: string;
  title: string;
}) {
  const { theme } = useStudentTheme();
  return (
    <Pressable style={[styles.categoryCard, { backgroundColor: theme.isDark ? theme.surface : bg[1], borderColor: theme.border }]} onPress={onPress}>
      <View style={[styles.categoryGlow, { backgroundColor: theme.isDark ? theme.surfaceMuted : bg[0] }]} />
      <View style={[styles.categoryIcon, theme.isDark ? { backgroundColor: theme.surfaceMuted } : null]}>{icon}</View>
      <Text style={[styles.categoryTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.categoryText, { color: theme.textMuted }]}>{text}</Text>
    </Pressable>
  );
}

function SectionHeader({
  accent,
  onPress,
  subtitle,
  title,
}: {
  accent: string;
  onPress: () => void;
  subtitle?: string;
  title: string;
}) {
  const { theme } = useStudentTheme();
  return (
    <View style={styles.sectionBlock}>
      <View>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title} <Text style={styles.sectionAccent}>{accent}</Text></Text>
        {subtitle ? <Text style={[styles.sectionSub, { color: theme.textMuted }]}>{subtitle}</Text> : null}
      </View>
      <Pressable onPress={onPress}>
        <ChevronRight size={22} color={theme.textSoft} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  content: { padding: 16, paddingBottom: 118, gap: 16 },
  skeletonWrap: { padding: 16, gap: 12 },
  skeletonCard: { borderRadius: 24, backgroundColor: "#dde6ff" },

  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  greetingBlock: { gap: 2 },
  greetingRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  greeting: { color: "#13285f", fontSize: 31, fontWeight: "900" },
  waveEmoji: { fontSize: 28, marginTop: 4 },
  sub: { marginTop: 4, color: "#66708d", fontSize: 14, fontWeight: "600" },
  avatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#13285f", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 24, fontWeight: "900" },

  searchBar: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e7ebf5",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#a4add0",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  searchInput: { flex: 1, color: "#13285f", fontSize: 16, fontWeight: "600" },

  categoryRow: { flexDirection: "row", gap: 12 },
  categoryCard: {
    flex: 1,
    borderRadius: 26,
    padding: 14,
    minHeight: 146,
    justifyContent: "space-between",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#edf0f8",
  },
  categoryGlow: {
    position: "absolute",
    top: -18,
    left: -12,
    width: 120,
    height: 70,
    borderRadius: 30,
    opacity: 0.55,
  },
  categoryIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryTitle: { color: "#13285f", fontSize: 17, fontWeight: "900" },
  categoryText: { color: "#5f6b85", fontSize: 13, fontWeight: "600" },

  sectionBlock: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: "#13285f", fontSize: 20, fontWeight: "900" },
  sectionAccent: { color: "#ffcc63" },
  sectionSub: { marginTop: 4, color: "#6e7892", fontSize: 14, fontWeight: "600" },
  rail: { gap: 12, paddingRight: 6 },

  discoveryCard: {
    width: 276,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e9edf7",
    shadowColor: "#a4add0",
    shadowOpacity: 0.09,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  discoveryMedia: { height: 150, padding: 14, justifyContent: "space-between" },
  discoveryMediaImg: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  discoveryMediaShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,18,35,0.14)" },
  discoveryTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  discoveryEyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  discoveryEyebrowText: { color: "#13285f", fontSize: 11, fontWeight: "900" },
  discoveryBadge: {
    borderRadius: 999,
    backgroundColor: "#fff8e7",
    color: "#c98014",
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: "hidden",
    fontSize: 12,
    fontWeight: "900",
  },
  discoveryBody: { padding: 16, gap: 5 },
  discoveryTitle: { color: "#13285f", fontSize: 18, fontWeight: "900" },
  discoveryPrice: { color: "#233c8b", fontSize: 15, fontWeight: "900" },
  discoveryMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  discoveryMetaText: { flex: 1, color: "#6c7595", fontSize: 13, fontWeight: "700" },
  discoveryDot: { width: 10, height: 10, borderRadius: 5 },

  featureCard: { width: 296, height: 220, borderRadius: 28, overflow: "hidden", padding: 14, justifyContent: "space-between" },
  featureCardSmall: { width: 176 },
  featureImage: { borderRadius: 28 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(12,16,28,0.30)" },
  topPickChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    color: "#13285f",
    paddingHorizontal: 12,
    paddingVertical: 7,
    overflow: "hidden",
    fontSize: 12,
    fontWeight: "900",
  },
  featureBottom: { gap: 8 },
  featureTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  featureMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  featureMetaText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  primaryPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#233c8b",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  primaryPillText: { color: "#fff", fontSize: 14, fontWeight: "900" },

  walletStrip: {
    borderRadius: 24,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e9edf7",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  walletIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#f3f5fb",
    alignItems: "center",
    justifyContent: "center",
  },
  walletCopy: { flex: 1 },
  walletAmount: { color: "#13285f", fontSize: 17, fontWeight: "900" },
  walletMiniRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  walletMiniDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#bfc7dd" },
  walletMiniDotSoft: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#dfe4f2" },
  walletMiniBar: { width: 44, height: 8, borderRadius: 4, backgroundColor: "#eff2fa" },
  addFundsBtn: {
    borderRadius: 999,
    backgroundColor: "#eef1ff",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  addFundsText: { color: "#5a63a2", fontSize: 14, fontWeight: "800" },

  miniCard: { width: 200, height: 180, borderRadius: 28, overflow: "hidden", padding: 12, justifyContent: "space-between" },
  miniImage: { borderRadius: 28 },
  miniChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.88)",
    color: "#21335f",
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: "hidden",
    fontSize: 12,
    fontWeight: "900",
  },
  miniBottom: { gap: 4 },
  miniTitle: { color: "#fff", fontSize: 17, fontWeight: "900" },
  miniSub: { color: "#e7eefc", fontSize: 12, fontWeight: "700" },
  miniAction: {
    alignSelf: "flex-start",
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: "rgba(35,60,139,0.95)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  miniActionText: { color: "#fff", fontSize: 13, fontWeight: "900" },
});



