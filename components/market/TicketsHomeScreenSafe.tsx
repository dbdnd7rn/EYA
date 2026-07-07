import React from "react";
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, ChevronRight, Home, MapPin, Search, SlidersHorizontal, Ticket } from "lucide-react-native";
import EyaTicketsWordmark from "@/components/brand/EyaTicketsWordmark";
import { listTicketEventsSafe } from "@/lib/ticketEventsSafe";
import type { TicketEvent } from "@/lib/tickets";
import { EYA_ACCENT as ACCENT, EYA_BG as BG, EYA_BORDER as BORDER, EYA_CARD as CARD, EYA_MUTED as MUTED, EYA_TEXT as TEXT, eventDateLabel, eventImageUrl, eventLocation, eventPriceLabel } from "@/components/market/ticketingUi";

type Category = "All" | "Music" | "Party" | "Festival" | "Sports" | "Networking";
const categories: Category[] = ["All", "Music", "Party", "Festival", "Sports", "Networking"];

function matchesCategory(event: TicketEvent, category: Category) {
  if (category === "All") return true;
  return String(event.category || "").toLowerCase() === category.toLowerCase();
}

export default function TicketsHomeScreenSafe() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = React.useState<TicketEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState<Category>("All");

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const rows = await listTicketEventsSafe();
      if (active) {
        setEvents(rows);
        setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const filteredEvents = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return events.filter((event) => {
      const searchable = `${event.title} ${event.category} ${event.venue} ${event.city}`.toLowerCase();
      return matchesCategory(event, activeCategory) && (!term || searchable.includes(term));
    });
  }, [activeCategory, events, query]);

  const featured = filteredEvents[0] ?? null;
  const rest = featured ? filteredEvents.slice(1) : filteredEvents;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: Math.max(188, insets.bottom + 154) }]}>
          <View style={styles.header}>
            <EyaTicketsWordmark width={210} height={50} />
            <Pressable style={styles.myTicketsBtn} onPress={() => router.push("/(student)/market/my-tickets" as any)}>
              <Ticket size={17} color="#ffffff" />
              <Text style={styles.myTicketsText}>My tickets</Text>
            </Pressable>
          </View>

          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>Find your next event</Text>
            <Text style={styles.heroSub}>Concerts, festivals, sports and campus moments — book in a few taps.</Text>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Search size={20} color={MUTED} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Search events..." placeholderTextColor={MUTED} selectionColor={ACCENT} style={styles.searchInput} />
            </View>
            <Pressable style={styles.filterBtn}><SlidersHorizontal size={22} color={TEXT} /></Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {categories.map((category) => {
              const active = category === activeCategory;
              return <Pressable key={category} onPress={() => setActiveCategory(category)} style={[styles.categoryChip, active && styles.categoryChipActive]}><Text style={[styles.categoryText, active && styles.categoryTextActive]}>{category}</Text></Pressable>;
            })}
          </ScrollView>

          {loading ? <StateCard title="Loading tickets..." /> : !filteredEvents.length ? <StateCard title="No events found" icon /> : null}

          {!loading && featured ? <FeaturedEventCard event={featured} /> : null}

          {!loading && rest.length ? (
            <>
              <View style={styles.sectionHead}>
                <View>
                  <Text style={styles.sectionTitle}>More events</Text>
                  <Text style={styles.sectionSub}>{filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"} available</Text>
                </View>
                <Pressable style={styles.seeAllBtn} onPress={() => setActiveCategory("All")}>
                  <Text style={styles.seeAllText}>See all</Text><ChevronRight size={16} color={ACCENT} />
                </Pressable>
              </View>
              <View style={styles.eventList}>{rest.map((event) => <EventRow key={event.id} event={event} />)}</View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      <TicketsBottomNav active="home" />
    </View>
  );
}

function StateCard({ icon, title }: { icon?: boolean; title: string }) {
  return <View style={styles.stateCard}>{icon ? <Ticket size={34} color={ACCENT} /> : <ActivityIndicator color={ACCENT} />}<Text style={styles.stateTitle}>{title}</Text></View>;
}

function FeaturedEventCard({ event }: { event: TicketEvent }) {
  const router = useRouter();
  return (
    <Pressable style={styles.featuredCard} onPress={() => router.push({ pathname: "/(student)/market/event-details", params: { eventId: event.id } } as any)}>
      <ImageBackground source={{ uri: eventImageUrl(event, true) }} style={styles.featuredImage} imageStyle={styles.featuredImageRadius}>
        <LinearGradient colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.78)"]} style={StyleSheet.absoluteFill} />
        <View style={styles.categoryBadge}><Text style={styles.categoryBadgeText}>{String(event.category || "Event").toUpperCase()}</Text></View>
        <View style={styles.featuredBottom}>
          <Text style={styles.featuredTitle} numberOfLines={2}>{event.title}</Text>
          <InfoLine icon={<CalendarDays size={16} color="#ffffff" />} text={eventDateLabel(event)} light />
          <InfoLine icon={<MapPin size={16} color="#ffffff" />} text={eventLocation(event)} light />
          <View style={styles.featuredActionRow}><Text style={styles.featuredPrice}>{eventPriceLabel(event)}</Text><View style={styles.viewEventBtn}><Text style={styles.viewEventText}>View Event</Text><ChevronRight size={18} color="#ffffff" /></View></View>
        </View>
      </ImageBackground>
    </Pressable>
  );
}

function EventRow({ event }: { event: TicketEvent }) {
  const router = useRouter();
  return (
    <Pressable style={styles.eventRow} onPress={() => router.push({ pathname: "/(student)/market/event-details", params: { eventId: event.id } } as any)}>
      <ImageBackground source={{ uri: eventImageUrl(event) }} style={styles.rowImage} imageStyle={styles.rowImageRadius}><LinearGradient colors={["rgba(0,0,0,0.02)", "rgba(0,0,0,0.45)"]} style={StyleSheet.absoluteFill} /></ImageBackground>
      <View style={styles.rowBody}><Text style={styles.rowTitle} numberOfLines={2}>{event.title}</Text><InfoLine icon={<CalendarDays size={14} color={MUTED} />} text={eventDateLabel(event)} /><InfoLine icon={<MapPin size={14} color={MUTED} />} text={eventLocation(event)} /><View style={styles.rowFooter}><Text style={styles.rowPrice}>{eventPriceLabel(event)}</Text><View style={styles.rowArrow}><ChevronRight size={18} color={ACCENT} /></View></View></View>
    </Pressable>
  );
}

function InfoLine({ icon, light, text }: { icon: React.ReactNode; light?: boolean; text: string }) {
  return <View style={styles.infoLine}>{icon}<Text style={[styles.infoText, light && styles.infoTextLight]} numberOfLines={1}>{text}</Text></View>;
}

function TicketsBottomNav({ active }: { active: "home" | "tickets" }) {
  const router = useRouter();
  return <View style={styles.bottomNavOuter}><View style={styles.bottomNav}><Pressable style={styles.bottomItem}><Home size={24} color={active === "home" ? ACCENT : MUTED} fill={active === "home" ? ACCENT : "transparent"} /><Text style={[styles.bottomLabel, active === "home" && styles.bottomLabelActive]}>Home</Text><View style={[styles.bottomLine, active === "home" && styles.bottomLineActive]} /></Pressable><Pressable style={styles.bottomItem} onPress={() => router.push("/(student)/market/my-tickets" as any)}><Ticket size={24} color={MUTED} /><Text style={styles.bottomLabel}>Tickets</Text><View style={styles.bottomLine} /></Pressable></View></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, safeArea: { flex: 1, backgroundColor: BG }, content: { paddingHorizontal: 20, paddingTop: 12, gap: 18 }, header: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  myTicketsBtn: { minHeight: 42, borderRadius: 999, backgroundColor: ACCENT, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 7 }, myTicketsText: { color: "#ffffff", fontSize: 13, fontWeight: "900" }, heroCopy: { gap: 5, paddingTop: 4 }, heroTitle: { color: TEXT, fontSize: 31, lineHeight: 36, fontWeight: "900" }, heroSub: { color: MUTED, fontSize: 14, lineHeight: 20, fontWeight: "700", maxWidth: 340 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 12 }, searchBox: { flex: 1, minHeight: 58, borderRadius: 22, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 }, searchInput: { flex: 1, minWidth: 0, color: TEXT, fontSize: 15, fontWeight: "800", paddingVertical: 0 }, filterBtn: { width: 56, height: 56, borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  categoryRow: { gap: 10, paddingRight: 20 }, categoryChip: { minHeight: 38, borderRadius: 999, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, justifyContent: "center", paddingHorizontal: 15 }, categoryChipActive: { backgroundColor: ACCENT, borderColor: ACCENT }, categoryText: { color: MUTED, fontSize: 13, fontWeight: "900" }, categoryTextActive: { color: "#ffffff" },
  stateCard: { minHeight: 190, borderRadius: 28, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }, stateTitle: { color: TEXT, fontSize: 20, fontWeight: "900", textAlign: "center" },
  featuredCard: { borderRadius: 30, overflow: "hidden", shadowColor: "#13285f", shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 6 }, featuredImage: { minHeight: 390, justifyContent: "space-between", padding: 16, backgroundColor: "#111827" }, featuredImageRadius: { borderRadius: 30 }, categoryBadge: { alignSelf: "flex-start", minHeight: 36, borderRadius: 18, backgroundColor: ACCENT, justifyContent: "center", paddingHorizontal: 14 }, categoryBadgeText: { color: "#ffffff", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 }, featuredBottom: { gap: 10 }, featuredTitle: { color: "#ffffff", fontSize: 30, lineHeight: 35, fontWeight: "900" }, infoLine: { flexDirection: "row", alignItems: "center", gap: 8 }, infoText: { flex: 1, color: MUTED, fontSize: 13, fontWeight: "800" }, infoTextLight: { color: "#ffffff" }, featuredActionRow: { marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, featuredPrice: { color: "#ffffff", fontSize: 25, fontWeight: "900" }, viewEventBtn: { minHeight: 46, borderRadius: 23, backgroundColor: ACCENT, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 4 }, viewEventText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  sectionHead: { marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, sectionTitle: { color: TEXT, fontSize: 24, lineHeight: 29, fontWeight: "900" }, sectionSub: { color: MUTED, fontSize: 13, fontWeight: "700", marginTop: 2 }, seeAllBtn: { borderRadius: 999, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 13, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 2 }, seeAllText: { color: ACCENT, fontSize: 13, fontWeight: "900" }, eventList: { gap: 13 }, eventRow: { minHeight: 140, borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 10, flexDirection: "row", gap: 12 }, rowImage: { width: 112, borderRadius: 18, overflow: "hidden", backgroundColor: "#111827" }, rowImageRadius: { borderRadius: 18 }, rowBody: { flex: 1, minWidth: 0, justifyContent: "center", gap: 7 }, rowTitle: { color: TEXT, fontSize: 18, lineHeight: 23, fontWeight: "900" }, rowFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }, rowPrice: { flex: 1, color: TEXT, fontSize: 15, fontWeight: "900" }, rowArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  bottomNavOuter: { position: "absolute", left: 22, right: 22, bottom: 18 }, bottomNav: { minHeight: 88, borderRadius: 28, backgroundColor: "#ffffff", borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 8, shadowColor: "#13285f", shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 9 }, bottomItem: { flex: 1, minHeight: 72, alignItems: "center", justifyContent: "center", gap: 4 }, bottomLabel: { color: MUTED, fontSize: 13, fontWeight: "900" }, bottomLabelActive: { color: ACCENT }, bottomLine: { width: 42, height: 4, borderRadius: 2, backgroundColor: "transparent", marginTop: 2 }, bottomLineActive: { backgroundColor: ACCENT },
});
