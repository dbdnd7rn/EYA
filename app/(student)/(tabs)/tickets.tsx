import React from "react";
import { ActivityIndicator, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { CalendarDays, ChevronRight, MapPin, Search, Ticket, WalletCards } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { listTicketEvents, type TicketEvent } from "@/lib/tickets";
import { useStudentTheme } from "@/providers/StudentThemeProvider";
import { eventDateLabel, eventImageUrl, eventLocation, eventPriceLabel, eventTimeLabel } from "@/components/market/ticketingUi";

type TicketFilter = "all" | "music" | "party" | "festival" | "sports" | "networking";

const filters: { key: TicketFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "music", label: "Music" },
  { key: "party", label: "Party" },
  { key: "festival", label: "Festival" },
  { key: "sports", label: "Sports" },
  { key: "networking", label: "Networking" },
];

function matchesFilter(event: TicketEvent, filter: TicketFilter) {
  if (filter === "all") return true;
  return String(event.category || "").toLowerCase() === filter;
}

export default function StudentTicketsTabPage() {
  const router = useRouter();
  const { theme } = useStudentTheme();
  const [events, setEvents] = React.useState<TicketEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [activeFilter, setActiveFilter] = React.useState<TicketFilter>("all");

  const loadEvents = React.useCallback(async () => {
    setError(null);
    try {
      const rows = await listTicketEvents();
      setEvents(rows);
    } catch (loadError: any) {
      setError(loadError?.message || "Could not load ticket events.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const filteredEvents = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return events.filter((event) => {
      if (!matchesFilter(event, activeFilter)) return false;
      if (!term) return true;
      return [event.title, event.category, event.venue, event.city, event.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [activeFilter, events, query]);

  const featured = filteredEvents[0] ?? null;
  const rest = featured ? filteredEvents.slice(1) : filteredEvents;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={[styles.root, { backgroundColor: theme.background }]}> 
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={theme.accent}
            onRefresh={() => {
              setRefreshing(true);
              void loadEvents();
            }}
          />
        }
      >
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: theme.accent }]}>EYA TICKETS</Text>
            <Text style={[styles.title, { color: theme.heading }]}>Find events fast</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Browse, select and pay for tickets with fewer taps.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            style={[styles.myTicketsButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => router.push("/(student)/market/my-tickets" as any)}
          >
            <WalletCards size={22} color={theme.accent} />
            <Text style={[styles.myTicketsText, { color: theme.text }]}>Mine</Text>
          </Pressable>
        </View>

        <View style={[styles.searchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          <Search size={20} color={theme.textSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search events, venue, category..."
            placeholderTextColor={theme.textSoft}
            selectionColor={theme.accent}
            style={[styles.searchInput, { color: theme.text }]}
            returnKeyType="search"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {filters.map((item) => {
            const active = item.key === activeFilter;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityState={active ? { selected: true } : undefined}
                style={[
                  styles.filterChip,
                  { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.accent : theme.surface },
                ]}
                onPress={() => setActiveFilter(item.key)}
              >
                <Text style={[styles.filterText, { color: active ? "#ffffff" : theme.textMuted }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={[styles.stateCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.stateText, { color: theme.textMuted }]}>Loading tickets...</Text>
          </View>
        ) : error ? (
          <View style={[styles.stateCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <Ticket size={30} color={theme.accent} />
            <Text style={[styles.stateTitle, { color: theme.text }]}>Tickets unavailable</Text>
            <Text style={[styles.stateText, { color: theme.textMuted }]}>{error}</Text>
          </View>
        ) : !filteredEvents.length ? (
          <View style={[styles.stateCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <Ticket size={30} color={theme.accent} />
            <Text style={[styles.stateTitle, { color: theme.text }]}>No tickets found</Text>
            <Text style={[styles.stateText, { color: theme.textMuted }]}>Try another category or search term.</Text>
          </View>
        ) : (
          <>
            {featured ? <FeaturedTicketCard event={featured} /> : null}

            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Available tickets</Text>
              <Text style={[styles.sectionMeta, { color: theme.textMuted }]}>{filteredEvents.length} result{filteredEvents.length === 1 ? "" : "s"}</Text>
            </View>

            <View style={styles.ticketList}>
              {rest.map((event) => (
                <TicketListCard key={event.id} event={event} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FeaturedTicketCard({ event }: { event: TicketEvent }) {
  const router = useRouter();
  const { theme } = useStudentTheme();

  return (
    <Pressable
      accessibilityRole="button"
      style={styles.featuredCard}
      onPress={() => router.push({ pathname: "/(student)/market/event-details", params: { eventId: event.id } } as any)}
    >
      <ImageBackground source={{ uri: eventImageUrl(event, true) }} imageStyle={styles.featuredImage} style={styles.featuredImageWrap}>
        <LinearGradient colors={["rgba(0,0,0,0.08)", "rgba(0,0,0,0.76)"]} style={StyleSheet.absoluteFill} />
        <View style={styles.featuredBadge}>
          <Text style={styles.featuredBadgeText}>{String(event.category || "Event").toUpperCase()}</Text>
        </View>
        <View style={styles.featuredBottom}>
          <Text style={styles.featuredLabel}>Featured</Text>
          <Text style={styles.featuredTitle} numberOfLines={2}>{event.title}</Text>
          <View style={styles.metaLine}>
            <CalendarDays size={15} color="#ffffff" />
            <Text style={styles.featuredMeta} numberOfLines={1}>{eventDateLabel(event)} • {eventTimeLabel(event)}</Text>
          </View>
          <View style={styles.featuredActionRow}>
            <Text style={styles.featuredPrice}>{eventPriceLabel(event)}</Text>
            <View style={[styles.bookPill, { backgroundColor: theme.accent }]}> 
              <Text style={styles.bookPillText}>View</Text>
              <ChevronRight size={17} color="#ffffff" />
            </View>
          </View>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

function TicketListCard({ event }: { event: TicketEvent }) {
  const router = useRouter();
  const { theme } = useStudentTheme();

  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => router.push({ pathname: "/(student)/market/event-details", params: { eventId: event.id } } as any)}
    >
      <ImageBackground source={{ uri: eventImageUrl(event) }} imageStyle={styles.listImage} style={styles.listImageWrap}>
        <LinearGradient colors={["rgba(0,0,0,0.02)", "rgba(0,0,0,0.38)"]} style={StyleSheet.absoluteFill} />
      </ImageBackground>
      <View style={styles.listBody}>
        <Text style={[styles.listTitle, { color: theme.text }]} numberOfLines={2}>{event.title}</Text>
        <View style={styles.listMetaRow}>
          <CalendarDays size={14} color={theme.textMuted} />
          <Text style={[styles.listMeta, { color: theme.textMuted }]} numberOfLines={1}>{eventDateLabel(event)}</Text>
        </View>
        <View style={styles.listMetaRow}>
          <MapPin size={14} color={theme.textMuted} />
          <Text style={[styles.listMeta, { color: theme.textMuted }]} numberOfLines={1}>{eventLocation(event)}</Text>
        </View>
        <View style={styles.listFooter}>
          <Text style={[styles.listPrice, { color: theme.text }]}>{eventPriceLabel(event)}</Text>
          <View style={[styles.listArrow, { backgroundColor: theme.accentSoft }]}> 
            <ChevronRight size={18} color={theme.accent} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 172, gap: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "900", marginTop: 3 },
  subtitle: { fontSize: 14, lineHeight: 20, fontWeight: "700", marginTop: 4 },
  myTicketsButton: {
    width: 66,
    minHeight: 58,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  myTicketsText: { fontSize: 12, fontWeight: "900" },
  searchCard: {
    minHeight: 56,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: "700", paddingVertical: 0 },
  filterRow: { gap: 8, paddingRight: 16 },
  filterChip: { minHeight: 42, borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 15 },
  filterText: { fontSize: 13, fontWeight: "900" },
  stateCard: { minHeight: 158, borderRadius: 24, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 18 },
  stateTitle: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  stateText: { fontSize: 14, fontWeight: "700", textAlign: "center", lineHeight: 20 },
  featuredCard: { borderRadius: 26, overflow: "hidden", shadowColor: "#13285f", shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  featuredImageWrap: { minHeight: 320, justifyContent: "space-between", padding: 16, backgroundColor: "#111827" },
  featuredImage: { borderRadius: 26 },
  featuredBadge: { alignSelf: "flex-start", minHeight: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.92)", justifyContent: "center", paddingHorizontal: 12 },
  featuredBadgeText: { color: "#0e2756", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  featuredBottom: { gap: 9 },
  featuredLabel: { color: "rgba(255,255,255,0.82)", fontSize: 13, fontWeight: "900" },
  featuredTitle: { color: "#ffffff", fontSize: 28, lineHeight: 33, fontWeight: "900" },
  metaLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  featuredMeta: { flex: 1, color: "#ffffff", fontSize: 13, fontWeight: "800" },
  featuredActionRow: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 3 },
  featuredPrice: { flex: 1, color: "#ffffff", fontSize: 19, fontWeight: "900" },
  bookPill: { minHeight: 46, borderRadius: 23, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingLeft: 17, paddingRight: 12 },
  bookPillText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  sectionRow: { marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { fontSize: 20, fontWeight: "900" },
  sectionMeta: { fontSize: 13, fontWeight: "800" },
  ticketList: { gap: 12 },
  listCard: { minHeight: 142, borderRadius: 22, borderWidth: 1, flexDirection: "row", padding: 10, gap: 12 },
  listImageWrap: { width: 110, borderRadius: 18, overflow: "hidden", backgroundColor: "#e8edf7" },
  listImage: { borderRadius: 18 },
  listBody: { flex: 1, minWidth: 0, justifyContent: "center", gap: 7 },
  listTitle: { fontSize: 17, lineHeight: 22, fontWeight: "900" },
  listMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  listMeta: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: "800" },
  listFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 3 },
  listPrice: { flex: 1, fontSize: 14, fontWeight: "900" },
  listArrow: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
