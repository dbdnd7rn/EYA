import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Home,
  MapPin,
  Search,
  ShieldCheck,
  Ticket,
  X,
  XCircle,
} from "lucide-react-native";
import { cacheMyTickets, getCachedMyTickets, listMyTickets, type IssuedTicket } from "@/lib/tickets";
import { useAuth } from "@/providers/AuthProvider";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as BG,
  EYA_BORDER as BORDER,
  EYA_CARD as CARD,
  EYA_MUTED as MUTED,
  EYA_SUCCESS as SUCCESS,
  EYA_TEXT as TEXT,
  eventDateLabel,
  eventImageUrl,
  eventLocation,
  eventTimeLabel,
  issuedTicketStatus,
  money,
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
          setError(loadError?.message || "Could not refresh your tickets.");
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

  const refreshTickets = React.useCallback(async () => {
    if (syncing) return;
    if (!session?.access_token) {
      setError("Log in to refresh your EYA tickets.");
      return;
    }

    setSyncing(true);
    setError(null);
    try {
      const cachedTickets = await getCachedMyTickets(user?.id);
      const liveTickets = await listMyTickets(session.access_token);
      const nextTickets = mergeCachedTicketDetails(cachedTickets, liveTickets);
      setTickets(nextTickets);
      await cacheMyTickets(user?.id, nextTickets).catch(() => undefined);
    } catch (refreshError: any) {
      setError(refreshError?.message || "Could not refresh your tickets.");
    } finally {
      setSyncing(false);
    }
  }, [session?.access_token, syncing, user?.id]);

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
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={syncing} onRefresh={refreshTickets} tintColor={ACCENT} colors={[ACCENT]} />}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(178, insets.bottom + 144) }]}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>TICKET WALLET</Text>
              <Text style={styles.title}>My Tickets</Text>
              <Text style={styles.subtitle}>Your purchased tickets, ready whenever you need them.</Text>
            </View>
            <View style={styles.totalBadge}>
              <Ticket size={18} color={ACCENT} strokeWidth={2.3} />
              <Text style={styles.totalValue}>{tickets.length}</Text>
            </View>
          </View>

          <View style={styles.tabsCard}>
            {tabs.map(({ Icon, key, label }) => {
              const active = activeTab === key;
              return (
                <Pressable key={key} style={[styles.tabItem, active && styles.tabItemActive]} onPress={() => setActiveTab(key)}>
                  <View style={[styles.tabIcon, active && styles.tabIconActive]}>
                    <Icon size={16} color={active ? "#ffffff" : MUTED} strokeWidth={2.4} />
                  </View>
                  <View style={styles.tabCopy}>
                    <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>{label}</Text>
                    <Text style={[styles.tabCount, active && styles.tabCountActive]}>{counts[key]}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.searchBox}>
            <Search size={19} color={MUTED} strokeWidth={2.2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              placeholder="Search event, venue or ticket ID"
              placeholderTextColor={MUTED}
              selectionColor={ACCENT}
            />
            {query ? (
              <Pressable style={styles.clearSearch} onPress={() => setQuery("")}>
                <X size={16} color={MUTED} strokeWidth={2.5} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>{activeTab.toUpperCase()}</Text>
              <Text style={styles.sectionTitle}>{visibleTickets.length === 1 ? "1 ticket" : `${visibleTickets.length} tickets`}</Text>
            </View>
            {syncing ? (
              <View style={styles.syncPill}>
                <ActivityIndicator size="small" color={ACCENT} />
                <Text style={styles.syncText}>Refreshing</Text>
              </View>
            ) : null}
          </View>

          {error && tickets.length ? (
            <View style={styles.warningCard}>
              <Text style={styles.warningText}>{error}</Text>
              <Pressable onPress={() => void refreshTickets()}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {loading ? <StateCard loading title="Loading your ticket wallet..." /> : null}

          <View style={styles.list}>
            {visibleTickets.map((ticket) => (
              <TicketCard key={ticket.id || ticket.ticket_code} ticket={ticket} />
            ))}
            {!loading && !visibleTickets.length ? (
              <EmptyState activeTab={activeTab} error={tickets.length ? null : error} searching={Boolean(query.trim())} />
            ) : null}
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
      <View style={styles.stateIcon}>{loading ? <ActivityIndicator color={ACCENT} /> : <Ticket size={28} color={ACCENT} />}</View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>This should only take a moment.</Text>
    </View>
  );
}

function EmptyState({
  activeTab,
  error,
  searching,
}: {
  activeTab: TicketStatus;
  error: string | null;
  searching: boolean;
}) {
  const label = activeTab === "cancelled" ? "cancelled tickets" : `${activeTab} tickets`;
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ticket size={30} color={ACCENT} strokeWidth={2.2} />
      </View>
      <Text style={styles.emptyTitle}>{searching ? "No matching tickets" : `No ${label}`}</Text>
      <Text style={styles.emptyText}>
        {error || (searching ? "Try another event name, venue or ticket ID." : "Tickets matching this view will appear here after purchase.")}
      </Text>
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
  const quantity = Math.max(1, Number(order?.quantity || 1));
  const orderTotal = Number(order?.total_mwk || 0);
  const unitPrice = Number(tier?.price_mwk || (orderTotal > 0 ? orderTotal / quantity : 0));
  const statusLabel = status === "upcoming" ? "Ready" : status === "past" ? "Past" : "Cancelled";

  const openTicket = () =>
    router.push({ pathname: "/(student)/market/single-ticket", params: { ticketId: ticket.id } } as any);

  return (
    <Pressable style={({ pressed }) => [styles.ticketCard, faded && styles.ticketCardMuted, pressed && styles.pressed]} onPress={openTicket}>
      <View style={styles.ticketHeroRow}>
        <Image source={{ uri: eventImageUrl(event) }} style={[styles.eventImage, faded && styles.eventImageMuted]} />
        <View style={styles.ticketHeading}>
          <View style={styles.ticketTopRow}>
            <View
              style={[
                styles.statusPill,
                status === "upcoming" ? styles.statusPillLive : status === "cancelled" ? styles.statusPillCancelled : styles.statusPillMuted,
              ]}
            >
              {status === "upcoming" ? (
                <CheckCircle2 size={13} color={SUCCESS} strokeWidth={2.6} />
              ) : status === "cancelled" ? (
                <XCircle size={13} color="#b54747" strokeWidth={2.4} />
              ) : (
                <Clock size={13} color={MUTED} strokeWidth={2.4} />
              )}
              <Text
                style={[
                  styles.statusText,
                  status === "upcoming" ? styles.statusTextLive : status === "cancelled" ? styles.statusTextCancelled : styles.statusTextMuted,
                ]}
              >
                {statusLabel}
              </Text>
            </View>
            <View style={styles.eyaBadge}>
              <Text style={styles.eyaBadgeText}>EYA</Text>
            </View>
          </View>

          <Text style={[styles.ticketTitle, faded && styles.fadedText]} numberOfLines={2}>{event?.title || "EYA ticket"}</Text>
          <Text style={styles.ticketTier} numberOfLines={1}>{tier?.name || "Ticket"}</Text>
        </View>
      </View>

      <View style={styles.metaGrid}>
        <MetaCard Icon={Calendar} label="Date" text={eventDateLabel(event)} faded={faded} />
        <MetaCard Icon={Clock} label="Time" text={eventTimeLabel(event)} faded={faded} />
        <MetaCard Icon={MapPin} label="Venue" text={eventLocation(event)} faded={faded} wide />
      </View>

      <View style={styles.ticketDivider} />

      <View style={styles.ticketInfoRow}>
        <View style={styles.ticketCodeWrap}>
          <Text style={styles.infoLabel}>TICKET ID</Text>
          <Text style={styles.ticketCode} selectable numberOfLines={1}>{ticket.ticket_code}</Text>
        </View>
        <View style={styles.priceWrap}>
          <Text style={styles.infoLabel}>PRICE</Text>
          <Text style={styles.priceValue}>{money(unitPrice)}</Text>
        </View>
      </View>

      <View style={styles.openRow}>
        <View style={styles.openCopy}>
          <ShieldCheck size={16} color={ACCENT} strokeWidth={2.3} />
          <Text style={styles.openHint}>{status === "upcoming" ? "Open for entry details" : "Open ticket details"}</Text>
        </View>
        <View style={styles.openButton}>
          <Text style={styles.openButtonText}>Open ticket</Text>
          <ChevronRight size={17} color="#ffffff" strokeWidth={2.5} />
        </View>
      </View>
    </Pressable>
  );
}

function MetaCard({
  Icon,
  faded,
  label,
  text,
  wide = false,
}: {
  Icon: IconComponent;
  faded?: boolean;
  label: string;
  text: string;
  wide?: boolean;
}) {
  return (
    <View style={[styles.metaCard, wide && styles.metaCardWide]}>
      <View style={[styles.metaIcon, faded && styles.metaIconMuted]}>
        <Icon size={15} color={faded ? "#8a91a3" : ACCENT} strokeWidth={2.2} />
      </View>
      <View style={styles.metaCopy}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={[styles.metaText, faded && styles.fadedText]} numberOfLines={1}>{text}</Text>
      </View>
    </View>
  );
}

function SafetyNote() {
  return (
    <View style={styles.safetyCard}>
      <View style={styles.safetyIconCircle}>
        <ShieldCheck size={24} color={ACCENT} strokeWidth={2.3} />
      </View>
      <View style={styles.safetyCopy}>
        <Text style={styles.safetyTitle}>Your ticket wallet is private</Text>
        <Text style={styles.safetyText}>Keep ticket IDs and entry credentials private. Open the ticket inside EYA when you need to present it.</Text>
      </View>
    </View>
  );
}

function BottomNav() {
  const router = useRouter();
  return (
    <View style={styles.bottomNavOuter}>
      <View style={styles.bottomNav}>
        <Pressable style={styles.bottomItem} onPress={() => router.replace("/(student)/market/tickets" as any)}>
          <Home size={22} color={MUTED} />
          <Text style={styles.bottomLabel}>Home</Text>
        </Pressable>
        <Pressable style={[styles.bottomItem, styles.bottomItemActive]} onPress={() => undefined}>
          <Ticket size={22} color={ACCENT} fill={ACCENT} />
          <Text style={[styles.bottomLabel, styles.bottomLabelActive]}>My Tickets</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  content: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },

  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14, paddingHorizontal: 2, paddingBottom: 2 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: ACCENT, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: TEXT, fontSize: 31, lineHeight: 36, fontWeight: "900", marginTop: 4 },
  subtitle: { color: MUTED, fontSize: 13, lineHeight: 19, fontWeight: "600", marginTop: 5, maxWidth: 330 },
  totalBadge: { minWidth: 54, height: 42, borderRadius: 16, backgroundColor: "#eef1ff", borderWidth: 1, borderColor: "#dce4ff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10 },
  totalValue: { color: ACCENT, fontSize: 15, fontWeight: "900" },

  tabsCard: { borderRadius: 22, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 6, flexDirection: "row", gap: 5, shadowColor: "#13285f", shadowOpacity: 0.045, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  tabItem: { flex: 1, minWidth: 0, minHeight: 58, borderRadius: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 5 },
  tabItemActive: { backgroundColor: ACCENT },
  tabIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: "#f3f5fb", alignItems: "center", justifyContent: "center" },
  tabIconActive: { backgroundColor: "rgba(255,255,255,0.18)" },
  tabCopy: { minWidth: 0 },
  tabLabel: { color: TEXT, fontSize: 9, fontWeight: "900" },
  tabLabelActive: { color: "#ffffff" },
  tabCount: { color: MUTED, fontSize: 10, fontWeight: "900", marginTop: 2 },
  tabCountActive: { color: "rgba(255,255,255,0.88)" },

  searchBox: { minHeight: 54, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, minWidth: 0, color: TEXT, fontSize: 13, fontWeight: "700", paddingVertical: 0 },
  clearSearch: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#f3f5fb", alignItems: "center", justifyContent: "center" },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 42, paddingHorizontal: 2 },
  sectionEyebrow: { color: MUTED, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  sectionTitle: { color: TEXT, fontSize: 17, fontWeight: "900", marginTop: 2 },
  syncPill: { minHeight: 32, borderRadius: 16, paddingHorizontal: 10, backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", gap: 7 },
  syncText: { color: ACCENT, fontSize: 10, fontWeight: "900" },

  warningCard: { minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: "#f2ddbd", backgroundColor: "#fff9ef", paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  warningText: { flex: 1, color: "#8a6433", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  retryText: { color: ACCENT, fontSize: 11, fontWeight: "900" },

  stateCard: { minHeight: 168, borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center", padding: 22 },
  stateIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  stateTitle: { color: TEXT, fontSize: 16, fontWeight: "900", textAlign: "center", marginTop: 12 },
  stateText: { color: MUTED, fontSize: 11, fontWeight: "600", textAlign: "center", marginTop: 4 },

  list: { gap: 13 },
  emptyCard: { minHeight: 210, borderRadius: 26, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center", padding: 26 },
  emptyIcon: { width: 66, height: 66, borderRadius: 23, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: TEXT, fontSize: 19, lineHeight: 24, fontWeight: "900", textAlign: "center", marginTop: 13 },
  emptyText: { color: MUTED, fontSize: 12, lineHeight: 18, fontWeight: "600", textAlign: "center", marginTop: 6, maxWidth: 300 },

  ticketCard: { borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 13, shadowColor: "#13285f", shadowOpacity: 0.055, shadowRadius: 17, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  ticketCardMuted: { opacity: 0.9 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.994 }] },
  ticketHeroRow: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  eventImage: { width: 94, height: 106, borderRadius: 18, backgroundColor: BORDER },
  eventImageMuted: { opacity: 0.76 },
  ticketHeading: { flex: 1, minWidth: 0, justifyContent: "center" },
  ticketTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 },
  statusPill: { minHeight: 26, borderRadius: 13, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 },
  statusPillLive: { backgroundColor: "#eaf8f0" },
  statusPillMuted: { backgroundColor: "#eef0f4" },
  statusPillCancelled: { backgroundColor: "#fff0f0" },
  statusText: { fontSize: 9, fontWeight: "900" },
  statusTextLive: { color: SUCCESS },
  statusTextMuted: { color: MUTED },
  statusTextCancelled: { color: "#b54747" },
  eyaBadge: { minHeight: 25, borderRadius: 10, backgroundColor: "#eef1ff", paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  eyaBadgeText: { color: ACCENT, fontSize: 9, fontWeight: "900", fontStyle: "italic" },
  ticketTitle: { color: TEXT, fontSize: 17, lineHeight: 21, fontWeight: "900" },
  ticketTier: { color: ACCENT, fontSize: 10, fontWeight: "900", marginTop: 5 },
  fadedText: { color: "#7f8798" },

  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  metaCard: { flexGrow: 1, flexBasis: "47%", minHeight: 50, borderRadius: 14, backgroundColor: "#f8f9fd", borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 8, padding: 8 },
  metaCardWide: { flexBasis: "100%" },
  metaIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  metaIconMuted: { backgroundColor: "#eef0f4" },
  metaCopy: { flex: 1, minWidth: 0 },
  metaLabel: { color: MUTED, fontSize: 7, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase" },
  metaText: { color: TEXT, fontSize: 9, fontWeight: "800", marginTop: 2 },

  ticketDivider: { height: 1, backgroundColor: BORDER, marginVertical: 12 },
  ticketInfoRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  ticketCodeWrap: { flex: 1, minWidth: 0 },
  priceWrap: { alignItems: "flex-end" },
  infoLabel: { color: MUTED, fontSize: 7, fontWeight: "900", letterSpacing: 0.8 },
  ticketCode: { color: TEXT, fontSize: 11, fontWeight: "900", letterSpacing: 0.4, marginTop: 3 },
  priceValue: { color: TEXT, fontSize: 15, fontWeight: "900", marginTop: 2 },

  openRow: { marginTop: 12, borderRadius: 16, backgroundColor: "#f5f6fd", borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 8 },
  openCopy: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 3 },
  openHint: { flex: 1, color: MUTED, fontSize: 9, fontWeight: "700" },
  openButton: { minHeight: 36, borderRadius: 13, backgroundColor: ACCENT, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  openButtonText: { color: "#ffffff", fontSize: 10, fontWeight: "900" },

  safetyCard: { borderRadius: 20, borderWidth: 1, borderColor: "#dce4ff", backgroundColor: "#f2f5ff", flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 13, marginTop: 2 },
  safetyIconCircle: { width: 43, height: 43, borderRadius: 15, backgroundColor: "#e4e9ff", alignItems: "center", justifyContent: "center" },
  safetyCopy: { flex: 1, minWidth: 0 },
  safetyTitle: { color: TEXT, fontSize: 13, fontWeight: "900" },
  safetyText: { color: MUTED, fontSize: 10, lineHeight: 16, fontWeight: "600", marginTop: 3 },

  bottomNavOuter: { position: "absolute", left: 16, right: 16, bottom: 14 },
  bottomNav: { minHeight: 70, borderRadius: 25, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", padding: 6, shadowColor: "#13285f", shadowOpacity: 0.11, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  bottomItem: { flex: 1, minHeight: 56, borderRadius: 19, alignItems: "center", justifyContent: "center", gap: 4 },
  bottomItemActive: { backgroundColor: "#eef1ff" },
  bottomLabel: { color: MUTED, fontSize: 10, fontWeight: "900" },
  bottomLabelActive: { color: ACCENT },
});
