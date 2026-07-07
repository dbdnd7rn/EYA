import React from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar, ChevronRight, Clock, Home, MapPin, Search, ShieldCheck, Ticket, XCircle } from "lucide-react-native";
import { cacheMyTickets, getCachedMyTickets, listMyTickets, type IssuedTicket } from "@/lib/tickets";
import { useAuth } from "@/providers/AuthProvider";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as BG,
  EYA_BORDER as BORDER,
  EYA_CARD as CARD,
  EYA_MUTED as MUTED,
  EYA_TEXT as TEXT,
  eventDateLabel,
  eventLocation,
  eventTimeLabel,
  issuedTicketStatus,
  money,
  ticketCountLabel,
} from "@/components/market/ticketingUi";

type TicketStatus = "upcoming" | "past" | "cancelled";

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}>;

const tabs: { key: TicketStatus; label: string; Icon: IconComponent }[] = [
  { key: "upcoming", label: "Upcoming", Icon: Calendar },
  { key: "past", label: "Past", Icon: Clock },
  { key: "cancelled", label: "Cancelled", Icon: XCircle },
];

function mergeCachedTicketDetails(cachedTickets: IssuedTicket[], liveTickets: IssuedTicket[]) {
  if (!cachedTickets.length || !liveTickets.length) return liveTickets;
  const cachedByKey = new Map<string, IssuedTicket>();
  cachedTickets.forEach((ticket) => {
    if (ticket.id) cachedByKey.set(ticket.id, ticket);
    if (ticket.ticket_code) cachedByKey.set(ticket.ticket_code, ticket);
  });

  return liveTickets.map((ticket) => {
    const cached = cachedByKey.get(ticket.id) ?? cachedByKey.get(ticket.ticket_code);
    if (!cached) return ticket;
    return {
      ...cached,
      ...ticket,
      event: ticket.event ?? cached.event,
      tier: ticket.tier ?? cached.tier,
      order: ticket.order ?? cached.order,
      qr_data_url: ticket.qr_data_url ?? cached.qr_data_url,
    };
  });
}

export default function MyTicketsScreen() {
  const { session, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = React.useState<TicketStatus>("upcoming");
  const [query, setQuery] = React.useState("");
  const [tickets, setTickets] = React.useState<IssuedTicket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const loadTickets = async () => {
      setLoading(true);
      setSyncing(false);
      setError(null);
      let cachedTickets: IssuedTicket[] = [];
      try {
        cachedTickets = await getCachedMyTickets(user?.id);
        if (!active) return;
        setTickets(cachedTickets);
        setLoading(false);

        if (!session?.access_token) {
          setError("Log in to view your EYA tickets.");
          return;
        }

        setSyncing(true);
        const liveTickets = await listMyTickets(session.access_token);
        const nextTickets = mergeCachedTicketDetails(cachedTickets, liveTickets);
        await cacheMyTickets(user?.id, nextTickets).catch(() => undefined);
        if (active) {
          setTickets(nextTickets);
          setError(null);
        }
      } catch (loadError: any) {
        if (active) {
          setError(loadError?.message || "Could not load your tickets.");
          setTickets(cachedTickets);
        }
      } finally {
        if (active) {
          setLoading(false);
          setSyncing(false);
        }
      }
    };
    void loadTickets();
    return () => {
      active = false;
    };
  }, [session?.access_token, user?.id]);

  const counts = React.useMemo(() => {
    return tickets.reduce(
      (next, ticket) => {
        next[issuedTicketStatus(ticket)] += 1;
        return next;
      },
      { upcoming: 0, past: 0, cancelled: 0 } as Record<TicketStatus, number>,
    );
  }, [tickets]);

  const visibleTickets = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const status = issuedTicketStatus(ticket);
      const event = ticket.event as any;
      const tier = ticket.tier as any;
      const searchable = `${event?.title || ""} ${tier?.name || ""} ${event?.venue || ""} ${event?.city || ""} ${ticket.ticket_code || ""}`.toLowerCase();
      return status === activeTab && (!term || searchable.includes(term));
    });
  }, [activeTab, query, tickets]);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: Math.max(190, insets.bottom + 156) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>My Tickets</Text>
            <Text style={styles.subtitle}>All your EYA tickets in one place</Text>
          </View>

          <View style={styles.statsCard}>
            {tabs.map(({ Icon, key, label }) => {
              const active = activeTab === key;
              return (
                <Pressable key={key} style={[styles.statItem, active && styles.statItemActive]} onPress={() => setActiveTab(key)}>
                  <View style={[styles.statIcon, active && styles.statIconActive]}>
                    <Icon size={20} color={active ? "#ffffff" : TEXT} strokeWidth={2.4} />
                  </View>
                  <Text style={[styles.statLabel, active && styles.statLabelActive]} numberOfLines={1}>{label}</Text>
                  <Text style={[styles.statValue, active && styles.statValueActive]}>{counts[key]}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.searchBox}>
            <Search size={20} color={MUTED} strokeWidth={2.2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              placeholder="Search tickets..."
              placeholderTextColor={MUTED}
              selectionColor={ACCENT}
            />
          </View>

          {loading ? <StateCard loading title="Loading your tickets..." /> : null}
          {syncing && tickets.length ? <Text style={styles.noticeText}>Refreshing tickets...</Text> : null}
          {error && tickets.length ? <Text style={styles.noticeText}>{error}</Text> : null}

          <View style={styles.list}>
            {visibleTickets.map((ticket) => (
              <TicketCard key={ticket.id || ticket.ticket_code} ticket={ticket} />
            ))}
            {!loading && !visibleTickets.length ? <EmptyState activeTab={activeTab} error={tickets.length ? null : error} /> : null}
          </View>

          <SafetyNote />
        </ScrollView>
      </SafeAreaView>
      <BottomNav />
    </View>
  );
}

function StateCard({ loading, title }: { loading?: boolean; title: string }) {
  return (
    <View style={styles.stateCard}>
      {loading ? <ActivityIndicator color={ACCENT} /> : <Ticket size={32} color={ACCENT} />}
      <Text style={styles.stateTitle}>{title}</Text>
    </View>
  );
}

function EmptyState({ activeTab, error }: { activeTab: TicketStatus; error: string | null }) {
  const label = activeTab === "cancelled" ? "cancelled tickets" : `${activeTab} tickets`;
  return (
    <View style={styles.emptyCard}>
      <Ticket size={38} color={ACCENT} strokeWidth={2.2} />
      <Text style={styles.emptyTitle}>No {label}</Text>
      <Text style={styles.emptyText}>{error || "Tickets matching this view will appear here after purchase."}</Text>
    </View>
  );
}

function TicketCard({ ticket }: { ticket: IssuedTicket }) {
  const router = useRouter();
  const event = ticket.event as any;
  const tier = ticket.tier as any;
  const order = ticket.order as any;
  const status = issuedTicketStatus(ticket);
  const faded = status !== "upcoming";
  const paid = Number(order?.total_mwk || tier?.price_mwk || 0);

  return (
    <Pressable style={[styles.ticketCard, faded && styles.ticketCardMuted]} onPress={() => router.push({ pathname: "/(student)/market/single-ticket", params: { ticketId: ticket.id } } as any)}>
      <View style={[styles.ticketAccent, faded && styles.ticketAccentMuted]}>
        <Text style={styles.ticketAccentText}>EYA</Text>
      </View>
      <View style={styles.ticketBody}>
        <View style={styles.ticketTopRow}>
          <View style={[styles.statusPill, status === "upcoming" ? styles.statusPillLive : styles.statusPillMuted]}>
            <Text style={[styles.statusText, status === "upcoming" ? styles.statusTextLive : styles.statusTextMuted]}>{status.toUpperCase()}</Text>
          </View>
          <Text style={styles.ticketQty}>{ticketCountLabel(order?.quantity)}</Text>
        </View>
        <Text style={[styles.ticketTitle, faded && styles.fadedText]} numberOfLines={2}>{event?.title || "EYA ticket"}</Text>
        <Text style={styles.ticketTier}>{tier?.name || "Ticket"}</Text>
        <MetaLine Icon={Calendar} text={eventDateLabel(event)} faded={faded} />
        <MetaLine Icon={Clock} text={eventTimeLabel(event)} faded={faded} />
        <MetaLine Icon={MapPin} text={eventLocation(event)} faded={faded} />
        <View style={styles.ticketFooter}>
          <View>
            <Text style={styles.paidLabel}>Paid</Text>
            <Text style={styles.paidValue}>{money(paid)}</Text>
          </View>
          <View style={styles.viewBtn}>
            <Text style={styles.viewBtnText}>View ticket</Text>
            <ChevronRight size={17} color={ACCENT} />
          </View>
        </View>
      </View>
      <View style={styles.qrColumn}>
        {ticket.qr_data_url ? <Image source={{ uri: ticket.qr_data_url }} style={styles.qrImage} /> : <View style={styles.qrPlaceholder}><Text style={styles.qrPlaceholderText}>QR</Text></View>}
        <Text style={styles.ticketCode} numberOfLines={1}>{ticket.ticket_code}</Text>
      </View>
    </Pressable>
  );
}

function MetaLine({ Icon, faded, text }: { Icon: IconComponent; faded?: boolean; text: string }) {
  return (
    <View style={styles.metaRow}>
      <Icon size={14} color={faded ? "#8a91a3" : MUTED} strokeWidth={2.1} />
      <Text style={[styles.metaText, faded && styles.fadedText]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function SafetyNote() {
  return (
    <View style={styles.safetyCard}>
      <View style={styles.safetyIconCircle}>
        <ShieldCheck size={30} color={TEXT} strokeWidth={2.3} />
      </View>
      <View style={styles.safetyCopy}>
        <Text style={styles.safetyTitle}>Keep your tickets safe</Text>
        <Text style={styles.safetyText}>Don't share your QR code with anyone. Screenshots may not be accepted.</Text>
      </View>
    </View>
  );
}

function BottomNav() {
  const router = useRouter();
  return (
    <View style={styles.bottomNavOuter}>
      <View style={styles.bottomNav}>
        <Pressable style={styles.bottomItem} onPress={() => router.push("/(student)/market/tickets" as any)}>
          <Home size={24} color={MUTED} />
          <Text style={styles.bottomLabel}>Home</Text>
          <View style={styles.bottomLine} />
        </Pressable>
        <Pressable style={styles.bottomItem} onPress={() => undefined}>
          <Ticket size={24} color={ACCENT} fill={ACCENT} />
          <Text style={[styles.bottomLabel, styles.bottomLabelActive]}>Tickets</Text>
          <View style={[styles.bottomLine, styles.bottomLineActive]} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 18 },
  header: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  title: { color: TEXT, fontSize: 32, lineHeight: 38, fontWeight: "900" },
  subtitle: { color: MUTED, fontSize: 15, lineHeight: 21, fontWeight: "700", marginTop: 5, textAlign: "center" },
  statsCard: { borderRadius: 28, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 10, flexDirection: "row", gap: 8, shadowColor: "#13285f", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  statItem: { flex: 1, minWidth: 0, minHeight: 96, borderRadius: 22, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 4 },
  statItemActive: { backgroundColor: ACCENT },
  statIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#eef1ff" },
  statIconActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  statLabel: { color: TEXT, fontSize: 12, fontWeight: "900", textAlign: "center" },
  statLabelActive: { color: "#ffffff" },
  statValue: { color: ACCENT, fontSize: 18, fontWeight: "900" },
  statValueActive: { color: "#ffffff" },
  searchBox: { minHeight: 62, borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, shadowColor: "#13285f", shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  searchInput: { flex: 1, minWidth: 0, color: TEXT, fontSize: 16, fontWeight: "800", paddingVertical: 0 },
  noticeText: { color: MUTED, fontSize: 12, fontWeight: "800", textAlign: "center" },
  stateCard: { minHeight: 150, borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center", gap: 10, padding: 20 },
  stateTitle: { color: TEXT, fontSize: 17, fontWeight: "900", textAlign: "center" },
  list: { gap: 14 },
  emptyCard: { minHeight: 210, borderRadius: 28, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center", padding: 26, gap: 10 },
  emptyTitle: { color: TEXT, fontSize: 22, lineHeight: 27, fontWeight: "900", textAlign: "center" },
  emptyText: { color: MUTED, fontSize: 15, lineHeight: 22, fontWeight: "700", textAlign: "center" },
  ticketCard: { borderRadius: 26, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, overflow: "hidden", flexDirection: "row", minHeight: 230, shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 4 },
  ticketCardMuted: { opacity: 0.86 },
  ticketAccent: { width: 54, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  ticketAccentMuted: { backgroundColor: "#717784" },
  ticketAccentText: { color: "#ffffff", fontSize: 22, fontWeight: "900", fontStyle: "italic", transform: [{ rotate: "-90deg" }] },
  ticketBody: { flex: 1, minWidth: 0, padding: 16, gap: 7 },
  ticketTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusPillLive: { backgroundColor: "#eef1ff" },
  statusPillMuted: { backgroundColor: "#edf0f5" },
  statusText: { fontSize: 10, fontWeight: "900" },
  statusTextLive: { color: ACCENT },
  statusTextMuted: { color: MUTED },
  ticketQty: { color: ACCENT, fontSize: 12, fontWeight: "900" },
  ticketTitle: { color: TEXT, fontSize: 18, lineHeight: 23, fontWeight: "900" },
  ticketTier: { color: MUTED, fontSize: 13, fontWeight: "900" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  metaText: { flex: 1, minWidth: 0, color: MUTED, fontSize: 12, fontWeight: "800" },
  fadedText: { color: "#7f8798" },
  ticketFooter: { marginTop: 4, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  paidLabel: { color: MUTED, fontSize: 11, fontWeight: "800" },
  paidValue: { color: TEXT, fontSize: 16, fontWeight: "900", marginTop: 2 },
  viewBtn: { borderRadius: 999, backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 11, paddingVertical: 9 },
  viewBtnText: { color: ACCENT, fontSize: 12, fontWeight: "900" },
  qrColumn: { width: 94, borderLeftWidth: 1, borderLeftColor: BORDER, borderStyle: "dashed", alignItems: "center", justifyContent: "center", paddingHorizontal: 8, gap: 9 },
  qrImage: { width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: "#ffffff" },
  qrPlaceholder: { width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: "#f7f8fe", alignItems: "center", justifyContent: "center" },
  qrPlaceholderText: { color: MUTED, fontSize: 12, fontWeight: "900" },
  ticketCode: { maxWidth: 78, color: MUTED, fontSize: 10, fontWeight: "900" },
  safetyCard: { borderRadius: 28, borderWidth: 1, borderColor: "#d9e5fb", backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", gap: 14, padding: 18, marginTop: 6 },
  safetyIconCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#dfe6ff", alignItems: "center", justifyContent: "center" },
  safetyCopy: { flex: 1, minWidth: 0 },
  safetyTitle: { color: TEXT, fontSize: 19, lineHeight: 23, fontWeight: "900" },
  safetyText: { color: MUTED, fontSize: 14, lineHeight: 20, fontWeight: "700", marginTop: 5 },
  bottomNavOuter: { position: "absolute", left: 22, right: 22, bottom: 18 },
  bottomNav: { minHeight: 88, borderRadius: 28, backgroundColor: "#ffffff", borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 8, shadowColor: "#13285f", shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 9 },
  bottomItem: { flex: 1, minHeight: 72, alignItems: "center", justifyContent: "center", gap: 4 },
  bottomLabel: { color: MUTED, fontSize: 13, fontWeight: "900" },
  bottomLabelActive: { color: ACCENT },
  bottomLine: { width: 42, height: 4, borderRadius: 2, backgroundColor: "transparent", marginTop: 2 },
  bottomLineActive: { backgroundColor: ACCENT },
});
