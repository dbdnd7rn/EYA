import React from "react";
import { Alert, Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Boxes,
  ChevronRight,
  Grid2X2,
  Heart,
  Laptop,
  MessageCircle,
  MoreHorizontal,
  PackageCheck,
  PencilLine,
  ScanLine,
  Search,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Star,
  Ticket,
  Trash2,
  Truck,
} from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { listMarketCards, type MarketCard } from "@/lib/newApp/browse";
import { ticketEvents } from "@/lib/tickets";
import { supabase } from "@/lib/supabase";
import { locationMatchScore, usePreferredLocationOptional } from "@/providers/PreferredLocationProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import MarketBottomNav from "@/components/market/MarketBottomNav";
import { useLiveProximity } from "@/lib/liveProximity";
import { useStudentTheme } from "@/providers/StudentThemeProvider";
import {
  diversifyMarketListings,
  rankMarketListing,
} from "@/lib/marketplaceRanking";

type Props = { detailRoute: "/(market)/item/[id]" | "/(student)/market/[id]"; showModeSwitch?: boolean };
type CategoryCard = { id: string; label: string; aliases: string[]; image: string };
type SellerCard = { id: string; vendorId: string; name: string; rating: number; items: number; image: string };
type MarketShortcut = {
  id: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  tint: string;
  soft: string;
  categoryId?: string;
  route?: "all" | "tickets";
};

const MARKET_CACHE_KEY = "student_market_cards_v1";
const PROMO_WIDTH = 310;
const categories: CategoryCard[] = [
  { id: "essentials", label: "Essentials", aliases: ["essentials", "room"], image: "https://images.unsplash.com/photo-1583947582886-f40ec95dd752?auto=format&fit=crop&w=700&q=80" },
  { id: "study", label: "Study", aliases: ["study", "books"], image: "https://images.unsplash.com/photo-1516979187457-637abb4f9353?auto=format&fit=crop&w=700&q=80" },
  { id: "electronics", label: "Electronics", aliases: ["electronics"], image: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=700&q=80" },
  { id: "fashion", label: "Apparel", aliases: ["fashion", "clothes"], image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=700&q=80" },
];
const marketShortcuts: MarketShortcut[] = [
  { id: "all", label: "All", Icon: Grid2X2, tint: "#5e73dd", soft: "#eef1ff", categoryId: "all" },
  { id: "view-all", label: "View All", Icon: Boxes, tint: "#5e73dd", soft: "#eef1ff", route: "all" },
  { id: "tickets", label: "Tickets", Icon: Ticket, tint: "#6f48e7", soft: "#efe9ff", route: "tickets" },
  { id: "essentials", label: "Essentials", Icon: ShoppingBag, tint: "#22a46e", soft: "#eaf8f0", categoryId: "essentials" },
  { id: "electronics", label: "Electronics", Icon: Laptop, tint: "#8a35db", soft: "#f2e8ff", categoryId: "electronics" },
  { id: "fashion", label: "Apparel", Icon: Shirt, tint: "#f01567", soft: "#ffe8f1", categoryId: "fashion" },
  { id: "study", label: "Study", Icon: BookOpen, tint: "#0f8f86", soft: "#e5f7f4", categoryId: "study" },
  { id: "more", label: "More", Icon: MoreHorizontal, tint: "#66708b", soft: "#f0f2fa", route: "all" },
];
const promos = [
  { id: "delivery", title: "Free delivery", sub: "Selected sellers can bring items closer today.", cta: "See offers", tone: "#f6ebcb", accent: "#102a54", kind: "delivery" },
  { id: "budget", title: "Budget finds", sub: "Good value items under MWK 5,000.", cta: "Browse deals", tone: "#e9f7f5", accent: "#0f8f86", kind: "star" },
  { id: "tickets", title: "Online tickets", sub: "Book concerts, events, movies, travel and more.", cta: "Explore tickets", tone: "#efe9ff", accent: "#5e73dd", kind: "ticket" },
];

function initials(label?: string | null) {
  const value = (label ?? "").trim();
  if (!value) return "U";
  const parts = value.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "U";
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return `${first}${second}`.toUpperCase();
}

function listingAreaLabel(item: MarketCard) {
  return [item.area, item.campus].filter(Boolean).join(" - ") || "Campus pickup";
}

function badgeLabelForItem(index: number) {
  return index === 0 ? "Hot Deal!" : "New";
}

function formatListedOn(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "recently";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

export default function MarketplaceBrowseScreen({ detailRoute, showModeSwitch = false }: Props) {
  const router = useRouter();
  const { theme } = useStudentTheme();
  const isStudentBrowse = detailRoute === "/(student)/market/[id]";
  const showMarketNav = isStudentBrowse && showModeSwitch;
  const { user } = useAuth();
  const { workspace: sellerWorkspace, setProductActive, archiveProduct } = useSellerWorkspace("market", { autoCreateVendor: false });
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
  const { point: liveLocation } = useLiveProximity(isStudentBrowse);

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
    const ranked = items
      .filter((item) => {
        const matchesTerm = !term || [item.name, item.vendor, item.area, item.campus, item.description, item.category].some((value) => value.toLowerCase().includes(term));
        const matchesCategory = selectedCategory === "all" || categories.find((c) => c.id === selectedCategory)?.aliases.some((alias) => item.category.toLowerCase().includes(alias));
        return matchesTerm && !!matchesCategory;
      })
      .map((item) => ({
        item,
        rank: rankMarketListing({
          item,
          term,
          liveLocation,
          savedLocationScore: locationMatchScore(preferredLocation, { area: item.area, campus: item.campus }),
        }),
      }))
      .sort((a, b) => {
        return (
          b.rank.score - a.rank.score
          || (a.rank.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.rank.distanceMeters ?? Number.MAX_SAFE_INTEGER)
          || new Date(b.item.refreshedAt).getTime() - new Date(a.item.refreshedAt).getTime()
          || new Date(b.item.listedAt).getTime() - new Date(a.item.listedAt).getTime()
        );
      })
      .map((row) => row.item);

    return diversifyMarketListings(ranked)
      .slice(0, 8);
  }, [items, liveLocation, preferredLocation, query, selectedCategory]);

  const featured = filtered.slice(0, 3);
  const topSellers = React.useMemo(() => {
    return deriveTopSellers(filtered);
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
  const noticeRoute = isStudentBrowse ? "/(student)/market/requests" : "/(market)/(tabs)/orders";
  const messageRoute = isStudentBrowse ? "/(student)/market/messages" : "/(market)/buyers";
  const exploreAllRoute = isStudentBrowse ? "/(student)/market/all-products" : "/(market)/all-products";
  const ticketRoute = "/(student)/market/tickets";
  const homeRoute = isStudentBrowse ? "/(student)/(tabs)/home" : "/(market)/(tabs)/dashboard";
  const showInlineSellerListings = false;
  const profileTitle = ((user?.user_metadata?.full_name as string | undefined) ?? "").trim() || user?.email?.split("@")[0] || "Marketplace";
  const safeAreaEdges: Edge[] = showMarketNav ? ["top", "left", "right"] : ["top", "left", "right", "bottom"];
  const leadTicketEvent = ticketEvents[0];

  const openSellerSetup = () => router.push(sellerWorkspace.hasVendor ? "/sell/products" : "/sell/setup");
  const openSellerEditor = (itemId: string) => router.push({ pathname: "/sell/add-product", params: { itemId } });
  const openShortcut = (shortcut: MarketShortcut) => {
    if (shortcut.route === "tickets") {
      router.push(ticketRoute as any);
      return;
    }
    if (shortcut.route === "all") {
      router.push(exploreAllRoute as any);
      return;
    }
    setSelectedCategory(shortcut.categoryId ?? "all");
  };
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

  if (loading) return <SafeAreaView edges={safeAreaEdges} style={[styles.root, { backgroundColor: theme.background }]}><View style={[styles.skeleton, { backgroundColor: theme.surfaceMuted }]} /></SafeAreaView>;

  return (
    <SafeAreaView edges={safeAreaEdges} style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView style={styles.scroller} contentContainerStyle={[styles.content, showMarketNav && styles.contentWithBottomNav]} showsVerticalScrollIndicator={false}>
        <View style={styles.topSection}>
          <View style={styles.brandRow}>
            <BackHomeButton onPress={() => router.replace(homeRoute as any)} />
            <Text style={[styles.brandTag, { color: theme.heading }]}>EYA market</Text>
          </View>
          <View style={styles.headerRow}>
            <View style={styles.locationChip}>
              {profileAvatarUrl ? (
                <Image source={{ uri: profileAvatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarFallbackText}>{initials((user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? null)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.city, { color: theme.text }]} numberOfLines={1}>{profileTitle}</Text>
                <View style={styles.inline}>
                  <ShoppingBag size={13} color={theme.accent} />
                  <Text style={[styles.citySub, { color: theme.textMuted }]} numberOfLines={1}>Browse campus marketplace</Text>
                </View>
              </View>
            </View>
            <View style={styles.inline}>
              <IconBtn icon={<Bell size={20} color={theme.text} />} badge="4" onPress={() => router.push(noticeRoute as any)} />
              <IconBtn icon={<MessageCircle size={20} color={theme.accent} />} badge="3" accent onPress={() => router.push(messageRoute as any)} />
            </View>
          </View>

          <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Search size={20} color={theme.textSoft} />
            <TextInput value={query} onChangeText={setQuery} style={[styles.searchInput, { color: theme.text }]} placeholder="Search products, food, rooms, tickets..." placeholderTextColor={theme.textSoft} />
            <Pressable style={[styles.scanBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
              <ScanLine size={18} color={theme.accent} />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcutRow}>
            {marketShortcuts.map((shortcut) => (
              <MarketShortcutTile
                key={shortcut.id}
                shortcut={shortcut}
                active={selectedCategory === shortcut.categoryId || (shortcut.id === "all" && selectedCategory === "all")}
                onPress={() => openShortcut(shortcut)}
              />
            ))}
          </ScrollView>

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
              <View key={promo.id} style={[styles.promo, { backgroundColor: theme.isDark ? theme.surface : promo.tone, borderColor: theme.isDark ? theme.border : "transparent" }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.promoKicker, { color: promo.accent }]}>{promo.id === "delivery" ? "Today only" : "Student deals"}</Text>
                  <Text style={[styles.promoTitle, { color: theme.isDark ? theme.text : "#102a54" }]}>{promo.title}</Text>
                  <Text style={[styles.promoSub, { color: theme.isDark ? theme.textMuted : "#355968" }]}>{promo.sub}</Text>
                  <Pressable style={styles.promoBtn} onPress={() => router.push((promo.kind === "ticket" ? ticketRoute : exploreAllRoute) as any)}>
                    <Text style={[styles.promoBtnText, { color: promo.accent }]}>{promo.cta}</Text>
                    <ChevronRight size={15} color={promo.accent} />
                  </Pressable>
                </View>
                <View style={[styles.promoBubble, { backgroundColor: `${promo.accent}18` }]}>
                  {promo.kind === "delivery" ? <PackageCheck size={42} color={promo.accent} /> : promo.kind === "star" ? <Star size={42} color={promo.accent} fill={promo.accent} /> : promo.kind === "ticket" ? <Ticket size={42} color={promo.accent} /> : <ShoppingBag size={42} color={promo.accent} />}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.dots}>{promos.map((promo, index) => <View key={promo.id} style={[styles.dot, index === promoIndex && styles.dotActive]} />)}</View>

          {leadTicketEvent ? (
            <Pressable style={styles.ticketHeroCard} onPress={() => router.push(ticketRoute as any)}>
              <ImageBackground source={{ uri: leadTicketEvent.heroImage }} style={styles.ticketHeroImage} imageStyle={styles.ticketHeroImageStyle}>
                <View style={styles.ticketHeroOverlay} />
                <View style={styles.ticketHeroContent}>
                  <Text style={styles.ticketHeroTitle}>Your next experience is a click away</Text>
                  <Text style={styles.ticketHeroSub}>Concerts, festivals, sports and campus events. Book tickets instantly.</Text>
                  <View style={styles.ticketHeroBtn}>
                    <Ticket size={16} color="#ffffff" />
                    <Text style={styles.ticketHeroBtnText}>Explore Tickets</Text>
                  </View>
                </View>
              </ImageBackground>
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <InfoPill icon={<Truck size={16} color="#10a56e" />} label="Free delivery" />
          <InfoPill icon={<Star size={16} color="#f0ae28" fill="#f0ae28" />} label="Top rated sellers" />
          <InfoPill icon={<ShieldCheck size={16} color="#5e73dd" />} label="Secure payments" />
        </ScrollView>

        <Pressable style={[styles.sellCard, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={openSellerSetup}>
          <View style={[styles.sellIcon, { backgroundColor: theme.accentSoft }]}><ShoppingBag size={20} color={theme.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sellTitle, { color: theme.text }]}>{sellerWorkspace.hasVendor ? "Manage your shop" : "Sell your products"}</Text>
            <Text style={[styles.sellSub, { color: theme.textMuted }]}>
              {sellerWorkspace.hasVendor ? "Edit listings, add new items, and keep your shop active." : "Create your shop and start earning."}
            </Text>
          </View>
          <ChevronRight size={18} color={theme.textSoft} />
        </Pressable>

        {showInlineSellerListings ? (
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
                      <Text style={styles.manageMeta}>{kwacha(Number(item.price_mwk))} - {item.channel === "food" ? "Food" : "Market"}</Text>
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

        {error ? <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text> : null}

        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: theme.heading }]}>New products</Text>
          <Pressable style={[styles.sectionLink, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.push(exploreAllRoute as any)}>
            <Text style={[styles.sectionLinkText, { color: theme.accent }]}>Explore all</Text>
          </Pressable>
        </View>
        {featured.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productRow}>
          {featured.map((item, index) => {
            const liked = !!favourites[item.id];
            const badgeLabel = badgeLabelForItem(index);
            return (
              <Pressable key={item.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.push({ pathname: detailRoute, params: { id: item.id } })}>
                <View>
                  <Image source={{ uri: item.image }} style={styles.cardImage} />
                  <View style={styles.badge}><Text style={styles.badgeText}>{badgeLabel}</Text></View>
                  <Pressable style={styles.heart} onPress={(event) => { event.stopPropagation(); setFavourites((current) => ({ ...current, [item.id]: !liked })); }}>
                    <Heart size={15} color="#f05e84" fill={liked ? "#f05e84" : "transparent"} />
                  </Pressable>
                </View>
                <View style={styles.cardBody}>
                  <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>{item.name}</Text>
                  <Text style={[styles.cardPrice, { color: theme.text }]}>{kwacha(item.price)}</Text>
                  <Text style={[styles.cardMeta, { color: theme.textMuted }]}>{item.rating.toFixed(1)} - {listingAreaLabel(item)}</Text>
                  <Text style={[styles.cardListed, { color: theme.textSoft }]}>Listed {formatListedOn(item.listedAt)}</Text>
                  <Text style={[styles.softPill, { backgroundColor: theme.accentSoft, color: theme.text }]}>{item.vendor}</Text>
                </View>
              </Pressable>
            );
          })}
          </ScrollView>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No live products yet</Text>
            <Text style={[styles.emptySub, { color: theme.textMuted }]}>Approved marketplace listings will appear here automatically.</Text>
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: theme.heading }]}>Top sellers</Text>
        {topSellers.length ? topSellers.slice(0, 2).map((seller) => (
          <View key={seller.id} style={[styles.sellerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Image source={{ uri: seller.image }} style={styles.sellerImage} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sellerName, { color: theme.text }]}>{seller.name}</Text>
              <Text style={[styles.cardMeta, { color: theme.textMuted }]}>{seller.rating.toFixed(1)} - {seller.items} items</Text>
              <Pressable
                style={styles.viewBtn}
                onPress={() => router.push({ pathname: detailRoute === "/(market)/item/[id]" ? "/(market)/shop/[vendorId]" : "/(student)/market/shop/[vendorId]", params: { vendorId: seller.vendorId } })}
              >
                <Text style={styles.viewBtnText}>View shop</Text>
              </Pressable>
            </View>
          </View>
        )) : (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No seller activity yet</Text>
            <Text style={[styles.emptySub, { color: theme.textMuted }]}>Seller rankings will appear after live products are published.</Text>
          </View>
        )}
      </ScrollView>
      {showMarketNav ? <MarketBottomNav active="market" /> : null}
    </SafeAreaView>
  );
}

function IconBtn({ icon, badge, onPress, accent = false }: { icon: React.ReactNode; badge: string; onPress: () => void; accent?: boolean }) {
  const { theme } = useStudentTheme();
  return <Pressable style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.accent }]} onPress={onPress}>{icon}<View style={[styles.iconBadge, accent && { backgroundColor: theme.accent }]}><Text style={styles.iconBadgeText}>{badge}</Text></View></Pressable>;
}

function BackHomeButton({ onPress }: { onPress: () => void }) {
  const { theme } = useStudentTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back to home" hitSlop={10} style={[styles.backHomeBtn, { backgroundColor: theme.accent, borderColor: theme.surface, shadowColor: theme.accent }]} onPress={onPress}>
      <ArrowLeft size={20} color="#ffffff" strokeWidth={3} />
    </Pressable>
  );
}

function InfoPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  const { theme } = useStudentTheme();
  return <View style={[styles.infoPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>{icon}<Text style={[styles.infoPillText, { color: theme.text }]}>{label}</Text></View>;
}

function MarketShortcutTile({ shortcut, active, onPress }: { shortcut: MarketShortcut; active: boolean; onPress: () => void }) {
  const { theme } = useStudentTheme();
  const Icon = shortcut.Icon;
  return (
    <Pressable style={styles.shortcutTile} onPress={onPress}>
      <View
        style={[
          styles.shortcutIconWrap,
          { backgroundColor: theme.isDark ? theme.surfaceAlt : shortcut.soft, borderColor: active ? shortcut.tint : theme.border },
          active && styles.shortcutIconWrapActive,
        ]}
      >
        <Icon size={28} color={shortcut.tint} strokeWidth={2.4} />
      </View>
      <Text style={[styles.shortcutText, { color: active ? shortcut.tint : theme.text }]}>{shortcut.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#edf7f8" },
  scroller: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 110, gap: 16 },
  contentWithBottomNav: { paddingBottom: 164 },
  skeleton: { margin: 16, height: 280, borderRadius: 28, backgroundColor: "#d8edf2" },
  topSection: { gap: 16 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 2 },
  brandTag: { color: "#102a54", fontSize: 16, fontWeight: "900" },
  backHomeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0f6d80",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
    shadowColor: "#0b3d4f",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
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
  search: { borderRadius: 999, borderWidth: 1, borderColor: "#d0e7ec", backgroundColor: "#fff", flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 18, paddingRight: 8, paddingVertical: 8, minHeight: 58, shadowColor: "#0b3d4f", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  searchInput: { flex: 1, color: "#0b3d4f", fontSize: 16, fontWeight: "700" },
  scanBtn: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  shortcutRow: { gap: 14, paddingRight: 8, paddingVertical: 2 },
  shortcutTile: { width: 82, alignItems: "center", gap: 8 },
  shortcutIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#13285f",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  shortcutIconWrapActive: { borderWidth: 2, transform: [{ translateY: -2 }] },
  shortcutText: { color: "#0b3d4f", fontWeight: "900", fontSize: 12, textAlign: "center" },
  promoRow: { gap: 10, paddingRight: 18 },
  promo: { width: 300, minHeight: 170, borderRadius: 24, borderWidth: 1, paddingVertical: 20, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", shadowColor: "#0b3d4f", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  promoKicker: { fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  promoTitle: { color: "#102a54", fontSize: 26, lineHeight: 30, fontWeight: "900", marginTop: 4, maxWidth: 168 },
  promoSub: { color: "#355968", fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 6, maxWidth: 168 },
  promoBtn: { marginTop: 12, alignSelf: "flex-start", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.92)", paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 4 },
  promoBtnText: { fontWeight: "900" },
  promoBubble: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#c1d7dd" },
  dotActive: { width: 18, backgroundColor: "#0f6d80" },
  ticketHeroCard: {
    borderRadius: 24,
    overflow: "hidden",
    minHeight: 150,
    shadowColor: "#13285f",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  ticketHeroImage: { minHeight: 150, justifyContent: "center" },
  ticketHeroImageStyle: { borderRadius: 24 },
  ticketHeroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(9,12,35,0.56)" },
  ticketHeroContent: { padding: 18, gap: 7, maxWidth: 420 },
  ticketHeroTitle: { color: "#ffffff", fontSize: 25, lineHeight: 29, fontWeight: "900" },
  ticketHeroSub: { color: "rgba(255,255,255,0.86)", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  ticketHeroBtn: { marginTop: 7, alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#5e73dd", paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 7 },
  ticketHeroBtnText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionLink: { borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dcecf1", paddingHorizontal: 14, paddingVertical: 10 },
  sectionLinkText: { color: "#0f6d80", fontWeight: "900", fontSize: 13 },
  filterRow: { gap: 10, paddingRight: 18, paddingTop: 2 },
  infoPill: { borderRadius: 18, borderWidth: 1, borderColor: "#d7e6ea", backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 170, shadowColor: "#0b3d4f", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  infoPillText: { color: "#0b3d4f", fontWeight: "900", fontSize: 14 },
  sectionTitle: { color: "#0b3d4f", fontSize: 19, fontWeight: "900" },
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
  emptyCard: { borderRadius: 22, borderWidth: 1, borderColor: "#d9e5fb", backgroundColor: "#f8fbff", padding: 16, gap: 6 },
  emptyTitle: { color: "#102a54", fontSize: 16, fontWeight: "900" },
  emptySub: { color: "#60708f", fontSize: 13, fontWeight: "700" },
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
  cardListed: { color: "#6d8a95", fontWeight: "700", fontSize: 11 },
  softPill: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#edf3ff", color: "#102a54", fontWeight: "800", fontSize: 11, paddingHorizontal: 10, paddingVertical: 6, overflow: "hidden" },
  sellerCard: { borderRadius: 22, borderWidth: 1, borderColor: "#cfe3e9", backgroundColor: "#fcfeff", padding: 12, flexDirection: "row", gap: 12, alignItems: "center" },
  sellerImage: { width: 86, height: 86, borderRadius: 18, backgroundColor: "#dcecf1" },
  sellerName: { color: "#0b3d4f", fontWeight: "900", fontSize: 16 },
  viewBtn: { marginTop: 8, alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#0f6d80", paddingHorizontal: 16, paddingVertical: 10 },
  viewBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
});
