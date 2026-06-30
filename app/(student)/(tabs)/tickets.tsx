import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarDays, ChevronRight, MapPin, Search, Sparkles, Ticket, WalletCards } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { cacheMyTickets, getCachedMyTickets, listMyTickets, listTicketEvents, ticketEvents, ticketPriceLabel, type TicketEvent } from "@/lib/tickets";
import { useAuth } from "@/providers/AuthProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

function matchesEvent(event: TicketEvent, term: string) {
  if (!term) return true;
  const haystack = [event.title, event.category, event.venue, event.city, event.description ?? ""].join(" ").toLowerCase();
  return haystack.includes(term);
}

function eventDateLabel(event: TicketEvent) {
  if (event.dateLabel) return event.dateLabel;
  if (!event.startsAt) return "Date coming soon";
  const date = new Date(event.startsAt);
  if (Number.isNaN(date.getTime())) return "Date coming soon";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function availableTierCount(event: TicketEvent) {
  return event.tiers.filter((tier) => tier.available).length;
}

export default function StudentTicketsScreen() {
  const router = useRouter();
  const { session, user } = useAuth();
  const { theme } = useStudentTheme();
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<TicketEvent[]>(ticketEvents);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myTicketCount, setMyTicketCount] = useState(0);

  const loadEvents = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      else setLoading(true);

      try {
        const liveEvents = await listTicketEvents(query);
        setEvents(liveEvents.length ? liveEvents : ticketEvents);
        setError(null);
      } catch {
        const term = query.trim().toLowerCase();
        setEvents(ticketEvents.filter((event) => matchesEvent(event, term)));
        setError("Showing saved ticket events while live ticket data is unavailable.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadEvents(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [loadEvents]);

  useEffect(() => {
    let active = true;

    const loadMyTicketCount = async () => {
      if (!user?.id) {
        if (active) setMyTicketCount(0);
        return;
      }

      const cached = await getCachedMyTickets(user.id);
      if (active && cached.length) setMyTicketCount(cached.length);

      const token = session?.access_token;
      if (!token) return;

      try {
        const liveTickets = await listMyTickets(token);
        if (!active) return;
        setMyTicketCount(liveTickets.length);
        await cacheMyTickets(user.id, liveTickets);
      } catch {
        if (active && !cached.length) setMyTicketCount(0);
      }
    };

    void loadMyTicketCount();
    return () => {
      active = false;
    };
  }, [session?.access_token, user?.id]);

  const filteredEvents = useMemo(() => {
    const term = query.trim().toLowerCase();
    return events.filter((event) => matchesEvent(event, term));
  }, [events, query]);

  const featuredEvent = filteredEvents[0] ?? ticketEvents[0];
  const eventCountLabel = `${filteredEvents.length || 0} live ${filteredEvents.length === 1 ? "event" : "events"}`;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}> 
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadEvents(true)} tintColor={theme.accent} />}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, { color: theme.textMuted }]}>EYA Tickets</Text>
            <Text style={[styles.title, { color: theme.heading }]}>Book events without stress</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Browse events, reserve seats, and keep your issued tickets in one place.</Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: theme.accentSoft }]}> 
            <Ticket size={30} color={theme.accent} />
          </View>
        </View>

        <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
          <Search size={19} color={theme.textSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search events, venues, cities..."
            placeholderTextColor={theme.textSoft}
            style={[styles.searchInput, { color: theme.text }]}
            returnKeyType="search"
          />
        </View>

        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <CalendarDays size={20} color={theme.accent} />
            <Text style={[styles.summaryValue, { color: theme.text }]}>{eventCountLabel}</Text>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>available now</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <WalletCards size={20} color={theme.success} />
            <Text style={[styles.summaryValue, { color: theme.text }]}>{myTicketCount}</Text>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>my tickets</Text>
          </View>
        </View>

        {error ? (
          <View style={[styles.notice, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}> 
            <Sparkles size={16} color={theme.accent} />
            <Text style={[styles.noticeText, { color: theme.text }]}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading tickets...</Text>
          </View>
        ) : null}

        {!loading && featuredEvent ? (
          <Pressable
            style={styles.heroCard}
            onPress={() => router.push(`/(student)/ticket-events/${encodeURIComponent(featuredEvent.id)}` as any)}
          >
            <ImageBackground source={{ uri: featuredEvent.heroImage || featuredEvent.image }} style={styles.heroMedia} imageStyle={styles.heroImage}>
              <View style={styles.heroShade} />
              <View style={styles.heroTopRow}>
                <Text style={styles.heroChip}>Featured</Text>
                <Text style={styles.heroChip}>{ticketPriceLabel(featuredEvent)}</Text>
              </View>
              <View style={styles.heroBottom}>
                <Text numberOfLines={2} style={styles.heroTitle}>{featuredEvent.title}</Text>
                <View style={styles.heroMetaRow}>
                  <MapPin size={15} color="#ffffff" />
                  <Text numberOfLines={1} style={styles.heroMeta}>{featuredEvent.venue}, {featuredEvent.city}</Text>
                </View>
              </View>
            </ImageBackground>
          </Pressable>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>All tickets</Text>
            <Text style={[styles.sectionSub, { color: theme.textMuted }]}>Tap an event to view ticket types and checkout options.</Text>
          </View>
        </View>

        {!loading && !filteredEvents.length ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No ticket events found</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>Try searching another city, venue, or event name.</Text>
          </View>
        ) : null}

        <View style={styles.eventStack}>
          {filteredEvents.map((event) => (
            <Pressable
              key={event.id}
              style={[styles.eventCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => router.push(`/(student)/ticket-events/${encodeURIComponent(event.id)}` as any)}
            >
              <ImageBackground source={{ uri: event.image || event.heroImage }} style={styles.eventThumb} imageStyle={styles.eventThumbImage}>
                <View style={styles.eventThumbShade} />
                <Text style={styles.eventCategory}>{event.category}</Text>
              </ImageBackground>
              <View style={styles.eventBody}>
                <View style={styles.eventTitleRow}>
                  <Text numberOfLines={2} style={[styles.eventTitle, { color: theme.text }]}>{event.title}</Text>
                  <ChevronRight size={20} color={theme.textSoft} />
                </View>
                <Text numberOfLines={1} style={[styles.eventMeta, { color: theme.textMuted }]}>{eventDateLabel(event)}</Text>
                <Text numberOfLines={1} style={[styles.eventMeta, { color: theme.textMuted }]}>{event.venue}, {event.city}</Text>
                <View style={styles.eventFooterRow}>
                  <Text style={[styles.pricePill, { color: theme.accent, backgroundColor: theme.accentSoft }]}>{ticketPriceLabel(event)}</Text>
                  <Text style={[styles.tierCount, { color: theme.textSoft }]}>{availableTierCount(event)} ticket types</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 124, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  kicker: { fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.2 },
  title: { marginTop: 4, fontSize: 31, lineHeight: 36, fontWeight: "900", letterSpacing: -0.7 },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  headerIcon: { width: 62, height: 62, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  searchBar: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: "700" },
  summaryGrid: { flexDirection: "row", gap: 12 },
  summaryCard: { flex: 1, borderWidth: 1, borderRadius: 24, padding: 14, gap: 7 },
  summaryValue: { fontSize: 18, fontWeight: "900" },
  summaryLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 },
  notice: { borderWidth: 1, borderRadius: 20, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  loadingBlock: { minHeight: 110, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 14, fontWeight: "700" },
  heroCard: { borderRadius: 30, overflow: "hidden" },
  heroMedia: { minHeight: 260, padding: 16, justifyContent: "space-between" },
  heroImage: { borderRadius: 30 },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(7, 12, 26, 0.42)" },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  heroChip: { overflow: "hidden", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.92)", color: "#13285f", paddingHorizontal: 12, paddingVertical: 7, fontSize: 12, fontWeight: "900" },
  heroBottom: { gap: 10 },
  heroTitle: { color: "#ffffff", fontSize: 28, lineHeight: 33, fontWeight: "900" },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroMeta: { flex: 1, color: "#ffffff", fontSize: 14, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  sectionTitle: { fontSize: 22, fontWeight: "900" },
  sectionSub: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  emptyCard: { borderWidth: 1, borderRadius: 24, padding: 16, gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: "900" },
  emptyText: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  eventStack: { gap: 12 },
  eventCard: { borderWidth: 1, borderRadius: 26, padding: 10, flexDirection: "row", gap: 12 },
  eventThumb: { width: 104, minHeight: 122, borderRadius: 22, overflow: "hidden", padding: 10, justifyContent: "flex-end" },
  eventThumbImage: { borderRadius: 22 },
  eventThumbShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(7, 12, 26, 0.25)" },
  eventCategory: { alignSelf: "flex-start", overflow: "hidden", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.9)", color: "#13285f", paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: "900" },
  eventBody: { flex: 1, paddingVertical: 4, gap: 6 },
  eventTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  eventTitle: { flex: 1, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  eventMeta: { fontSize: 13, fontWeight: "700" },
  eventFooterRow: { marginTop: "auto", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  pricePill: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, fontWeight: "900" },
  tierCount: { fontSize: 12, fontWeight: "800" },
});
