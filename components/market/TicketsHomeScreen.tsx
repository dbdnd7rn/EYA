import React from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowRight,
  CalendarDays,
  Heart,
  Home,
  MapPin,
  Search,
  SlidersHorizontal,
  Ticket,
} from "lucide-react-native";
import EyaTicketsWordmark from "@/components/brand/EyaTicketsWordmark";
import { listTicketEvents, type TicketEvent } from "@/lib/tickets";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as CREAM,
  EYA_BORDER as BORDER,
  EYA_MUTED as MUTED,
  EYA_TEXT as BLACK,
  eventDateLabel,
  eventImageUrl,
  eventLocation,
  firstAvailableTier,
  money,
  uppercase,
} from "@/components/market/ticketingUi";

type Category = "All" | "Music" | "Party" | "Festival" | "Sports" | "Networking";

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}>;

const categories: Category[] = ["All", "Music", "Party", "Festival", "Sports", "Networking"];

export default function TicketsHomeScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { view } = useLocalSearchParams<{ view?: string | string[] }>();
  const scrollRef = React.useRef<ScrollView>(null);
  const isCompact = width < 768;
  const [activeCategory, setActiveCategory] = React.useState<Category>("All");
  const [query, setQuery] = React.useState("");
  const [showAllTickets, setShowAllTickets] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [favoriteIds, setFavoriteIds] = React.useState<Set<string>>(() => new Set());
  const [events, setEvents] = React.useState<TicketEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const layoutWidth = isCompact ? Math.min(width, 480) : width;
  const horizontalPadding = isCompact ? 20 : 20;
  const featureCardWidth = layoutWidth - horizontalPadding * 2;
  const featureCardHeight = isCompact
    ? Math.min(354, Math.max(296, featureCardWidth * 0.98))
    : Math.min(390, Math.max(318, featureCardWidth * 0.92));
  const popularCardWidth = isCompact ? Math.min(172, Math.max(146, width * 0.43)) : Math.min(184, Math.max(154, width * 0.42));

  React.useEffect(() => {
    const requestedView = Array.isArray(view) ? view[0] : view;
    if (requestedView === "all") {
      setShowAllTickets(true);
    }
  }, [view]);

  React.useEffect(() => {
    let active = true;
    const loadEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const liveEvents = await listTicketEvents();
        if (active) setEvents(liveEvents);
      } catch (loadError: any) {
        if (active) setError(loadError?.message || "Could not load ticket events.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadEvents();
    return () => {
      active = false;
    };
  }, []);

  const filteredEvents = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return events.filter((event) => {
      const categoryMatch = activeCategory === "All" || event.category.toLowerCase() === activeCategory.toLowerCase();
      const searchable = `${event.title} ${event.category} ${event.venue} ${event.city}`.toLowerCase();
      return categoryMatch && (!term || searchable.includes(term));
    });
  }, [activeCategory, events, query]);

  const featuredEvents = filteredEvents.slice(0, 2);
  const popularEvents = filteredEvents.slice(2, 8).length ? filteredEvents.slice(2, 8) : filteredEvents.slice(0, 8);
  const openAllTickets = React.useCallback(() => {
    setShowAllTickets(true);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  }, []);
  const selectCategory = React.useCallback((category: Category) => {
    setActiveCategory(category);
    setFiltersOpen(false);
  }, []);
  const toggleFavorite = React.useCallback((eventId: string) => {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(220, insets.bottom + 188) }]}>
          <Header compact={isCompact} />
          <SearchArea
            active={filtersOpen}
            compact={isCompact}
            query={query}
            onChangeQuery={setQuery}
            onToggleFilters={() => setFiltersOpen((current) => !current)}
          />

          {filtersOpen ? (
            <FilterPanel
              activeCategory={activeCategory}
              compact={isCompact}
              onClear={() => selectCategory("All")}
              onSelect={selectCategory}
            />
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.categoryRow, isCompact && styles.categoryRowCompact]}>
            {categories.map((category) => (
              <CategoryChip
                key={category}
                label={category}
                active={category === activeCategory}
                compact={isCompact}
                onPress={() => selectCategory(category)}
              />
            ))}
          </ScrollView>

          {loading ? <LoadingState /> : null}
          {!loading && error ? <MessageCard title="Tickets unavailable" message={error} /> : null}
          {!loading && !error && !filteredEvents.length ? (
            <MessageCard title="No ticket events" message="Published admin ticket events will appear here." />
          ) : null}

          {!loading && !error && filteredEvents.length ? (
            showAllTickets ? (
              <AllTicketsSection
                activeCategory={activeCategory}
                compact={isCompact}
                events={filteredEvents}
                onBack={() => setShowAllTickets(false)}
              />
            ) : (
              <>
                <SectionHeader title="Featured Events" onPress={openAllTickets} />
                <View style={[styles.featuredStack, isCompact && styles.featuredStackCompact]}>
                  {featuredEvents.map((event) => (
                    <FeaturedEventCard
                      key={event.id}
                      compact={isCompact}
                      event={event}
                      favorite={favoriteIds.has(event.id)}
                      height={featureCardHeight}
                      onFavoritePress={() => toggleFavorite(event.id)}
                      width={featureCardWidth}
                    />
                  ))}
                </View>

                <SectionHeader title="Popular Events" style={styles.popularHeader} onPress={openAllTickets} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.popularRow, isCompact && styles.popularRowCompact]}>
                  {popularEvents.map((event) => (
                    <PopularEventCard
                      key={event.id}
                      event={event}
                      favorite={favoriteIds.has(event.id)}
                      onFavoritePress={() => toggleFavorite(event.id)}
                      width={popularCardWidth}
                    />
                  ))}
                </ScrollView>
              </>
            )
          ) : null}
        </ScrollView>
      </SafeAreaView>

      <BottomNav />
    </View>
  );
}

function Header({ compact }: { compact: boolean }) {
  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      <View style={styles.brandLockup}>
        <EyaTicketsWordmark width={compact ? 206 : 248} height={compact ? 48 : 58} />
      </View>
    </View>
  );
}

function SearchArea({
  active,
  compact,
  onChangeQuery,
  onToggleFilters,
  query,
}: {
  active: boolean;
  compact: boolean;
  onChangeQuery: (value: string) => void;
  onToggleFilters: () => void;
  query: string;
}) {
  return (
    <View style={[styles.searchArea, compact && styles.searchAreaCompact]}>
      <View style={[styles.searchBar, compact && styles.searchBarCompact]}>
        <Search size={compact ? 21 : 24} color={MUTED} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          style={[styles.searchInput, compact && styles.searchInputCompact]}
          placeholder={compact ? "Search events..." : "Search events, artists, categories..."}
          placeholderTextColor={MUTED}
          selectionColor={ACCENT}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: active }}
        onPress={onToggleFilters}
        style={({ pressed }) => [
          styles.filterButton,
          compact && styles.filterButtonCompact,
          active && styles.filterButtonActive,
          pressed && styles.pressed,
        ]}>
        <SlidersHorizontal size={compact ? 22 : 24} color={active ? "#FFFFFF" : BLACK} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

function FilterPanel({
  activeCategory,
  compact,
  onClear,
  onSelect,
}: {
  activeCategory: Category;
  compact: boolean;
  onClear: () => void;
  onSelect: (category: Category) => void;
}) {
  return (
    <View style={[styles.filterPanel, compact && styles.filterPanelCompact]}>
      <View style={styles.filterPanelHeader}>
        <View>
          <Text style={styles.filterPanelTitle}>Filter tickets</Text>
          <Text style={styles.filterPanelMeta}>Choose a category to update the list.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClear} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
          <Text style={styles.filterPanelClear}>Clear</Text>
        </Pressable>
      </View>
      <View style={styles.filterGrid}>
        {categories.map((category) => (
          <Pressable
            key={category}
            accessibilityRole="button"
            accessibilityState={category === activeCategory ? { selected: true } : undefined}
            onPress={() => onSelect(category)}
            style={({ pressed }) => [
              styles.filterGridChip,
              category === activeCategory && styles.filterGridChipActive,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.filterGridText, category === activeCategory && styles.filterGridTextActive]}>{category}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CategoryChip({ active, compact, label, onPress }: { active: boolean; compact: boolean; label: Category; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryChip,
        compact && styles.categoryChipCompact,
        active ? styles.categoryChipActive : styles.categoryChipInactive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.categoryChipText, compact && styles.categoryChipTextCompact, active ? styles.categoryChipTextActive : styles.categoryChipTextInactive]}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ onPress, title, style }: { onPress?: () => void; title: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} hitSlop={10} style={({ pressed }) => [styles.seeAllButton, pressed && styles.pressed]}>
          <Text style={styles.seeAll}>See all</Text>
          <ArrowRight size={17} color={ACCENT} strokeWidth={2.7} />
        </Pressable>
      ) : null}
    </View>
  );
}

function AllTicketsSection({
  activeCategory,
  compact,
  events,
  onBack,
}: {
  activeCategory: Category;
  compact: boolean;
  events: TicketEvent[];
  onBack: () => void;
}) {
  return (
    <View style={[styles.allTicketsWrap, compact && styles.allTicketsWrapCompact]}>
      <View style={[styles.allTicketsHero, compact && styles.allTicketsHeroCompact]}>
        <View style={[styles.allTicketsIcon, compact && styles.allTicketsIconCompact]}>
          <Ticket size={compact ? 23 : 27} color="#FFFFFF" strokeWidth={2.4} />
        </View>
        <View style={styles.allTicketsCopy}>
          <Text style={styles.allTicketsEyebrow}>{activeCategory === "All" ? "ALL CATEGORIES" : uppercase(activeCategory)}</Text>
          <Text style={[styles.allTicketsTitle, compact && styles.allTicketsTitleCompact]}>All Tickets</Text>
          <Text style={[styles.allTicketsBody, compact && styles.allTicketsBodyCompact]}>
            Browse every available event and pick the ticket that fits your plans.
          </Text>
        </View>
        <View style={[styles.allTicketsCount, compact && styles.allTicketsCountCompact]}>
          <Text style={[styles.allTicketsCountValue, compact && styles.allTicketsCountValueCompact]}>{events.length}</Text>
          <Text style={styles.allTicketsCountLabel}>{events.length === 1 ? "EVENT" : "EVENTS"}</Text>
        </View>
      </View>

      <View style={[styles.allTicketsHeaderRow, compact && styles.allTicketsHeaderRowCompact]}>
        <View style={styles.allTicketsHeaderCopy}>
          <Text style={styles.allTicketsListTitle}>Available tickets</Text>
          <Text style={styles.allTicketsListMeta}>
            {events.length} {events.length === 1 ? "result" : "results"} ready to book
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.highlightsButton, pressed && styles.pressed]}>
          <Text style={styles.highlightsButtonText}>Highlights</Text>
        </Pressable>
      </View>

      <View style={styles.allTicketsList}>
        {events.map((event) => (
          <AllTicketCard key={event.id} compact={compact} event={event} />
        ))}
      </View>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.stateCard}>
      <ActivityIndicator color={ACCENT} />
      <Text style={styles.stateText}>Loading EYA tickets...</Text>
    </View>
  );
}

function MessageCard({ message, title }: { message: string; title: string }) {
  return (
    <View style={styles.stateCard}>
      <Ticket size={28} color={ACCENT} strokeWidth={2.2} />
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

function FeaturedEventCard({
  compact,
  event,
  favorite,
  height,
  onFavoritePress,
  width,
}: {
  compact: boolean;
  event: TicketEvent;
  favorite: boolean;
  height: number;
  onFavoritePress: () => void;
  width: number;
}) {
  const router = useRouter();
  const tier = firstAvailableTier(event);
  const price = tier?.available ? money(tier.priceMwk) : "Sold out";
  const openDetails = () => router.push({ pathname: "/(student)/market/event-details", params: { eventId: event.id } } as any);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={openDetails}
      style={({ pressed }) => [styles.featureCardShadow, { width }, pressed && styles.pressed]}>
      <ImageBackground
        source={{ uri: eventImageUrl(event, true) }}
        imageStyle={[styles.featureImage, compact && styles.featureImageCompact]}
        style={[styles.featureCard, compact && styles.featureCardCompact, { height }]}>
        <LinearGradient
          colors={["rgba(0,0,0,0.9)", "rgba(0,0,0,0.62)", "rgba(0,0,0,0.12)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.58)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.featureTopRow}>
          <View style={styles.featureBadge}>
            <Text style={styles.featureBadgeText}>{uppercase(event.category)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={favorite ? { selected: true } : undefined}
            onPress={onFavoritePress}
            style={({ pressed }) => [styles.heartButton, compact && styles.heartButtonCompact, pressed && styles.pressed]}>
            <Heart size={compact ? 24 : 27} color={favorite ? ACCENT : BLACK} fill={favorite ? ACCENT : "transparent"} strokeWidth={2.4} />
          </Pressable>
        </View>

        <View style={[styles.featureContent, compact && styles.featureContentCompact]}>
          <Text
            style={[styles.featureTitle, compact && styles.featureTitleCompact]}
            numberOfLines={compact ? 3 : 4}
            adjustsFontSizeToFit
            minimumFontScale={0.82}>
            {uppercase(event.title)}
          </Text>
          <InfoRow Icon={CalendarDays} text={eventDateLabel(event)} />
          <InfoRow Icon={MapPin} text={eventLocation(event)} />
        </View>

        <View style={[styles.featureFooter, compact && styles.featureFooterCompact]}>
          <View>
            <Text style={styles.fromLabel}>FROM</Text>
            <Text style={[styles.featurePrice, compact && styles.featurePriceCompact]}>{price}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.viewEventButton, compact && styles.viewEventButtonCompact, pressed && styles.pressed]}
            onPress={openDetails}
          >
            <Text style={[styles.viewEventText, compact && styles.viewEventTextCompact]}>View Event</Text>
            <View style={[styles.arrowCircle, compact && styles.arrowCircleCompact]}>
              <ArrowRight size={compact ? 18 : 20} color="#FFFFFF" strokeWidth={2.8} />
            </View>
          </Pressable>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

function InfoRow({ Icon, text }: { Icon: IconComponent; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Icon size={22} color="#FFFFFF" strokeWidth={2.3} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function PopularEventCard({
  event,
  favorite,
  onFavoritePress,
  width,
}: {
  event: TicketEvent;
  favorite: boolean;
  onFavoritePress: () => void;
  width: number;
}) {
  const router = useRouter();

  return (
    <Pressable
      style={({ pressed }) => [styles.popularCardShadow, { width }, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: "/(student)/market/event-details", params: { eventId: event.id } } as any)}
    >
      <View style={styles.popularCard}>
        <ImageBackground source={{ uri: eventImageUrl(event) }} imageStyle={styles.popularImage} style={styles.popularImageWrap}>
          <LinearGradient
            colors={["rgba(0,0,0,0.08)", "rgba(0,0,0,0.36)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={favorite ? { selected: true } : undefined}
            onPress={onFavoritePress}
            style={({ pressed }) => [styles.popularHeart, pressed && styles.pressed]}>
            <Heart size={23} color="#FFFFFF" fill={favorite ? "#FFFFFF" : "transparent"} strokeWidth={2.4} />
          </Pressable>
        </ImageBackground>
        <View style={styles.popularBody}>
          <Text style={styles.popularTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <View style={styles.popularDateRow}>
            <CalendarDays size={14} color={MUTED} strokeWidth={2.2} />
            <Text style={styles.popularDate} numberOfLines={1}>
              {eventDateLabel(event)}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function AllTicketCard({ compact, event }: { compact: boolean; event: TicketEvent }) {
  const router = useRouter();
  const tier = firstAvailableTier(event);
  const price = tier?.available ? money(tier.priceMwk) : "Sold out";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/(student)/market/event-details", params: { eventId: event.id } } as any)}
      style={({ pressed }) => [styles.allTicketCard, compact && styles.allTicketCardCompact, pressed && styles.pressed]}
    >
      <ImageBackground
        source={{ uri: eventImageUrl(event) }}
        imageStyle={[styles.allTicketImage, compact && styles.allTicketImageCompact]}
        style={[styles.allTicketImageWrap, compact && styles.allTicketImageWrapCompact]}>
        <LinearGradient
          colors={["rgba(0,0,0,0.02)", "rgba(0,0,0,0.48)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.allTicketCategory}>
          <Text style={styles.allTicketCategoryText}>{uppercase(event.category)}</Text>
        </View>
      </ImageBackground>

      <View style={[styles.allTicketBody, compact && styles.allTicketBodyCompact]}>
        <Text style={[styles.allTicketTitle, compact && styles.allTicketTitleCompact]} numberOfLines={compact ? 2 : 2}>
          {event.title}
        </Text>
        <View style={styles.allTicketMetaRow}>
          <CalendarDays size={16} color={MUTED} strokeWidth={2.3} />
          <Text style={styles.allTicketMetaText} numberOfLines={1}>
            {eventDateLabel(event)}
          </Text>
        </View>
        <View style={styles.allTicketMetaRow}>
          <MapPin size={16} color={MUTED} strokeWidth={2.3} />
          <Text style={styles.allTicketMetaText} numberOfLines={1}>
            {eventLocation(event)}
          </Text>
        </View>
      </View>

      <View style={[styles.allTicketAction, compact && styles.allTicketActionCompact]}>
        <Text style={[styles.allTicketPrice, compact && styles.allTicketPriceCompact]}>{price}</Text>
        <View style={[styles.allTicketArrow, compact && styles.allTicketArrowCompact]}>
          <ArrowRight size={compact ? 17 : 18} color="#FFFFFF" strokeWidth={2.8} />
        </View>
      </View>
    </Pressable>
  );
}

function BottomNav() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(14, insets.bottom + 8);
  const items: { key: string; label: string; Icon: IconComponent; active?: boolean; onPress: () => void }[] = [
    { key: "home", label: "Home", Icon: Home, active: true, onPress: () => undefined },
    { key: "tickets", label: "Tickets", Icon: Ticket, onPress: () => router.push("/(student)/market/my-tickets" as any) },
  ];

  return (
    <View style={[styles.bottomNavOuter, { bottom }]}>
      <View style={styles.bottomNav}>
        {items.map(({ active, Icon, key, label, onPress }) => {
          const color = active ? ACCENT : MUTED;
          return (
            <Pressable key={key} onPress={onPress} style={({ pressed }) => [styles.bottomNavItem, pressed && styles.pressed]}>
              <Icon size={26} color={color} fill={active ? ACCENT : "transparent"} strokeWidth={active ? 2.8 : 2.1} />
              <Text style={[styles.bottomNavLabel, { color }]}>{label}</Text>
              <View style={[styles.bottomNavUnderline, active && styles.bottomNavUnderlineActive]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  safeArea: { flex: 1, backgroundColor: CREAM },
  scrollContent: { paddingTop: 8 },
  header: {
    minHeight: 82,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerCompact: { minHeight: 68, paddingHorizontal: 14 },
  brandLockup: { flex: 1, minWidth: 0, justifyContent: "center" },
  searchArea: { paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 5 },
  searchAreaCompact: { paddingHorizontal: 14, gap: 9, marginTop: 2 },
  searchBar: {
    flex: 1,
    minHeight: 62,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 14,
    shadowColor: "#13285f",
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 3,
  },
  searchBarCompact: { minHeight: 56, borderRadius: 28, paddingHorizontal: 16, gap: 10 },
  searchInput: { flex: 1, minWidth: 0, color: BLACK, fontSize: 16, fontWeight: "500", paddingVertical: 0 },
  searchInputCompact: { fontSize: 14 },
  filterButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#13285f",
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 3,
  },
  filterButtonCompact: { width: 56, height: 56, borderRadius: 28 },
  filterButtonActive: { backgroundColor: BLACK, borderColor: BLACK },
  filterPanel: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    padding: 15,
    shadowColor: "#13285f",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  filterPanelCompact: { marginHorizontal: 14, borderRadius: 20, padding: 13 },
  filterPanelHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 13 },
  filterPanelTitle: { color: BLACK, fontSize: 17, lineHeight: 22, fontWeight: "900" },
  filterPanelMeta: { color: MUTED, fontSize: 12, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  filterPanelClear: { color: ACCENT, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  filterGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterGridChip: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#f8f9ff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  filterGridChipActive: { backgroundColor: BLACK, borderColor: BLACK },
  filterGridText: { color: MUTED, fontSize: 12, fontWeight: "900" },
  filterGridTextActive: { color: "#FFFFFF" },
  categoryRow: { paddingHorizontal: 20, paddingTop: 30, paddingBottom: 12, gap: 10 },
  categoryRowCompact: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 8, gap: 8 },
  categoryChip: { height: 54, minWidth: 86, paddingHorizontal: 22, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  categoryChipCompact: { height: 46, minWidth: 72, paddingHorizontal: 16, borderRadius: 23 },
  categoryChipActive: { backgroundColor: BLACK, borderWidth: 1, borderColor: BLACK, shadowColor: "#13285f", shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  categoryChipInactive: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: BORDER },
  categoryChipText: { fontSize: 15, fontWeight: "800" },
  categoryChipTextCompact: { fontSize: 13 },
  categoryChipTextActive: { color: "#FFFFFF" },
  categoryChipTextInactive: { color: MUTED },
  stateCard: {
    marginHorizontal: 20,
    marginTop: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    gap: 10,
    padding: 22,
  },
  stateTitle: { color: BLACK, fontSize: 17, fontWeight: "900" },
  stateText: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" },
  sectionHeader: { marginTop: 26, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: BLACK, fontSize: 24, fontWeight: "900", letterSpacing: 0 },
  seeAllButton: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingLeft: 12 },
  seeAll: { color: ACCENT, fontSize: 17, fontWeight: "900" },
  allTicketsWrap: { paddingHorizontal: 20, paddingTop: 20 },
  allTicketsWrapCompact: { width: "100%", maxWidth: 480, alignSelf: "center", paddingHorizontal: 14, paddingTop: 16 },
  allTicketsHero: {
    minHeight: 128,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    shadowColor: "#13285f",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 4,
  },
  allTicketsHeroCompact: { minHeight: 112, borderRadius: 22, gap: 10, padding: 12 },
  allTicketsIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  allTicketsIconCompact: { width: 44, height: 44, borderRadius: 15 },
  allTicketsCopy: { flex: 1, minWidth: 0 },
  allTicketsEyebrow: { color: MUTED, fontSize: 11, lineHeight: 14, fontWeight: "900" },
  allTicketsTitle: { color: BLACK, fontSize: 25, lineHeight: 31, fontWeight: "900", marginTop: 2 },
  allTicketsTitleCompact: { fontSize: 22, lineHeight: 27 },
  allTicketsBody: { color: MUTED, fontSize: 13, lineHeight: 18, fontWeight: "700", marginTop: 4 },
  allTicketsBodyCompact: { fontSize: 12, lineHeight: 17 },
  allTicketsCount: {
    width: 64,
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#f7f8ff",
    alignItems: "center",
    justifyContent: "center",
  },
  allTicketsCountCompact: { width: 54, minHeight: 54, borderRadius: 16 },
  allTicketsCountValue: { color: BLACK, fontSize: 24, lineHeight: 29, fontWeight: "900" },
  allTicketsCountValueCompact: { fontSize: 21, lineHeight: 25 },
  allTicketsCountLabel: { color: ACCENT, fontSize: 9, lineHeight: 12, fontWeight: "900" },
  allTicketsHeaderRow: {
    minHeight: 50,
    marginTop: 24,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  allTicketsHeaderRowCompact: { marginTop: 20, marginBottom: 12 },
  allTicketsHeaderCopy: { flex: 1, minWidth: 0 },
  allTicketsListTitle: { color: BLACK, fontSize: 20, lineHeight: 25, fontWeight: "900" },
  allTicketsListMeta: { color: MUTED, fontSize: 12, lineHeight: 17, fontWeight: "800", marginTop: 2 },
  highlightsButton: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  highlightsButtonText: { color: BLACK, fontSize: 12, fontWeight: "900" },
  allTicketsList: { width: "100%", alignSelf: "stretch", gap: 14 },
  allTicketCard: {
    minHeight: 152,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    padding: 10,
    shadowColor: "#13285f",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  allTicketCardCompact: {
    width: "100%",
    minHeight: 0,
    borderRadius: 22,
    flexDirection: "column",
    gap: 0,
    padding: 0,
    overflow: "hidden",
  },
  allTicketImageWrap: {
    width: 116,
    minHeight: 132,
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "flex-end",
    backgroundColor: "#eef1fb",
  },
  allTicketImageWrapCompact: { width: "100%", height: 158, minHeight: 158, borderRadius: 0 },
  allTicketImage: { borderRadius: 18 },
  allTicketImageCompact: { borderRadius: 0 },
  allTicketCategory: {
    alignSelf: "flex-start",
    margin: 10,
    minHeight: 26,
    borderRadius: 13,
    backgroundColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  allTicketCategoryText: { color: "#FFFFFF", fontSize: 10, lineHeight: 13, fontWeight: "900" },
  allTicketBody: { flex: 1, minWidth: 0, justifyContent: "center", gap: 8, paddingVertical: 4 },
  allTicketBodyCompact: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 10 },
  allTicketTitle: { color: BLACK, fontSize: 17, lineHeight: 22, fontWeight: "900" },
  allTicketTitleCompact: { fontSize: 18, lineHeight: 23 },
  allTicketMetaRow: { minHeight: 18, flexDirection: "row", alignItems: "center", gap: 7 },
  allTicketMetaText: { flex: 1, minWidth: 0, color: MUTED, fontSize: 12, lineHeight: 16, fontWeight: "800" },
  allTicketAction: { width: 76, alignItems: "flex-end", justifyContent: "space-between", paddingVertical: 5 },
  allTicketActionCompact: {
    width: "100%",
    minHeight: 56,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#f8f9ff",
  },
  allTicketPrice: { color: BLACK, fontSize: 13, lineHeight: 17, fontWeight: "900", textAlign: "right" },
  allTicketPriceCompact: { fontSize: 16, lineHeight: 21, textAlign: "left" },
  allTicketArrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: BLACK, alignItems: "center", justifyContent: "center" },
  allTicketArrowCompact: { width: 36, height: 36, borderRadius: 18 },
  featuredStack: { paddingHorizontal: 20, marginTop: 18, gap: 20 },
  featuredStackCompact: { paddingHorizontal: 14, marginTop: 14, gap: 16, alignItems: "center" },
  featureCardShadow: { borderRadius: 25, backgroundColor: "#FFFFFF", shadowColor: "#13285f", shadowOpacity: 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  featureCard: { borderRadius: 25, overflow: "hidden", padding: 18 },
  featureCardCompact: { borderRadius: 22, padding: 14 },
  featureImage: { borderRadius: 25 },
  featureImageCompact: { borderRadius: 22 },
  featureTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  featureBadge: { minHeight: 30, borderRadius: 15, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: ACCENT },
  featureBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  heartButton: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: "#13285f", shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  heartButtonCompact: { width: 48, height: 48, borderRadius: 24 },
  featureContent: { flex: 1, justifyContent: "flex-end", paddingRight: 58, paddingBottom: 24, gap: 14 },
  featureContentCompact: { paddingRight: 0, paddingBottom: 14, gap: 10 },
  featureTitle: { color: "#FFFFFF", fontSize: 33, lineHeight: 39, fontWeight: "900", letterSpacing: 0, marginBottom: 4 },
  featureTitleCompact: { fontSize: 28, lineHeight: 33 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  infoText: { flex: 1, color: "#FFFFFF", fontSize: 15, lineHeight: 20, fontWeight: "900" },
  featureFooter: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 14 },
  featureFooterCompact: { alignItems: "center", gap: 10 },
  fromLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", marginBottom: 4 },
  featurePrice: { color: "#FFFFFF", fontSize: 26, fontWeight: "900" },
  featurePriceCompact: { fontSize: 22 },
  viewEventButton: { minHeight: 56, borderRadius: 28, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 21, paddingRight: 7, shadowColor: "#13285f", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  viewEventButtonCompact: { minHeight: 50, borderRadius: 25, gap: 9, paddingLeft: 16, paddingRight: 6 },
  viewEventText: { color: BLACK, fontSize: 15, fontWeight: "900" },
  viewEventTextCompact: { fontSize: 13 },
  arrowCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: BLACK, alignItems: "center", justifyContent: "center" },
  arrowCircleCompact: { width: 38, height: 38, borderRadius: 19 },
  popularHeader: { marginTop: 32 },
  popularRow: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, gap: 16 },
  popularRowCompact: { paddingHorizontal: 14, paddingTop: 14, gap: 12 },
  popularCardShadow: { borderRadius: 16, backgroundColor: "#FFFFFF", shadowColor: "#13285f", shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  popularCard: { borderRadius: 16, overflow: "hidden", backgroundColor: "#FFFFFF" },
  popularImageWrap: { height: 132 },
  popularImage: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  popularHeart: { position: "absolute", top: 10, right: 10, width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.18)" },
  popularBody: { minHeight: 114, padding: 12, justifyContent: "space-between" },
  popularTitle: { color: BLACK, fontSize: 16, lineHeight: 20, fontWeight: "900" },
  popularDateRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  popularDate: { flex: 1, color: MUTED, fontSize: 11, fontWeight: "800" },
  bottomNavOuter: { position: "absolute", left: 18, right: 18 },
  bottomNav: {
    minHeight: 84,
    borderRadius: 25,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    shadowColor: "#13285f",
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 9,
  },
  bottomNavItem: { flex: 1, minHeight: 70, alignItems: "center", justifyContent: "center", gap: 4 },
  bottomNavLabel: { fontSize: 12, fontWeight: "800" },
  bottomNavUnderline: { width: 34, height: 4, borderRadius: 2, backgroundColor: "transparent", marginTop: 2 },
  bottomNavUnderlineActive: { backgroundColor: ACCENT },
  pressed: { opacity: 0.72 },
});
