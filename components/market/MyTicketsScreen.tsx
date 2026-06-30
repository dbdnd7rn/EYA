import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Calendar,
  ChevronRight,
  Clock,
  Eye,
  Funnel,
  Home,
  MapPin,
  MoreVertical,
  Search,
  ShieldCheck,
  Ticket,
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
  EYA_TEXT as TEXT,
  eventDateLabel,
  eventLocation,
  eventTimeLabel,
  issuedTicketStatus,
  money,
  ticketCountLabel,
  uppercase,
} from "@/components/market/ticketingUi";

type TicketStatus = "upcoming" | "past" | "cancelled";

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}>;

const tabConfig: { key: TicketStatus; label: string; Icon: IconComponent }[] = [
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
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = React.useState<TicketStatus>("upcoming");
  const [query, setQuery] = React.useState("");
  const [tickets, setTickets] = React.useState<IssuedTicket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const compact = width < 768;
  const scrollBottomPadding = Math.max(compact ? 236 : 188, insets.bottom + (compact ? 202 : 162));

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

  const normalizedQuery = query.trim().toLowerCase();
  const visibleTickets = React.useMemo(() => {
    return tickets.filter((ticket) => {
      const status = issuedTicketStatus(ticket);
      const searchable = `${ticket.event?.title || ""} ${ticket.tier?.name || ""} ${ticket.event?.date_label || ""} ${ticket.event?.venue || ""} ${ticket.event?.city || ""} ${ticket.ticket_code}`.toLowerCase();
      return status === activeTab && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [activeTab, normalizedQuery, tickets]);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <Header />
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}>
          <TicketTabs activeTab={activeTab} compact={compact} counts={counts} onChange={setActiveTab} />
          <SearchFilterRow compact={compact} query={query} onChangeQuery={setQuery} />

          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={ACCENT} />
              <Text style={styles.loadingText}>Loading your EYA tickets...</Text>
            </View>
          ) : null}
          {error && tickets.length ? <Text style={styles.syncWarning}>{error}</Text> : null}
          {syncing && tickets.length ? <Text style={styles.syncWarning}>Refreshing tickets...</Text> : null}

          <View style={[styles.ticketList, compact && styles.ticketListCompact]}>
            {visibleTickets.map((ticket) => (
              <TicketWalletCard key={ticket.id} ticket={ticket} />
            ))}
            {!loading && !visibleTickets.length ? <EmptyTickets activeTab={activeTab} compact={compact} error={tickets.length ? null : error} /> : null}
          </View>

          <SafetyNote compact={compact} />
        </ScrollView>
      </SafeAreaView>
      <BottomNav />
    </View>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>My Tickets</Text>
        <Text style={styles.headerSubtitle}>All your EYA tickets in one place</Text>
      </View>
    </View>
  );
}

function TicketTabs({ activeTab, compact, counts, onChange }: { activeTab: TicketStatus; compact: boolean; counts: Record<TicketStatus, number>; onChange: (tab: TicketStatus) => void }) {
  const renderTab = ({ Icon, key, label }: { key: TicketStatus; label: string; Icon: IconComponent }) => {
    const isActive = activeTab === key;
    return (
      <Pressable key={key} onPress={() => onChange(key)} style={({ pressed }) => [styles.tabButton, compact && styles.tabButtonCompact, isActive ? styles.tabButtonActive : styles.tabButtonInactive, pressed && styles.pressed]}>
        <Icon size={compact ? 23 : 18} color={isActive ? "#FFFFFF" : TEXT} strokeWidth={2.4} />
        <Text style={[styles.tabText, compact && styles.tabTextCompact, isActive ? styles.tabTextActive : styles.tabTextInactive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
          {label}
        </Text>
        <View style={[styles.tabCountBadge, compact && styles.tabCountBadgeCompact, isActive && styles.tabCountBadgeActive]}>
          <Text style={[styles.tabCountText, compact && styles.tabCountTextCompact, isActive && styles.tabCountTextActive]}>{counts[key]}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.tabsCard, compact && styles.tabsCardCompact]}>
      {compact
        ? tabConfig.map(renderTab)
        : tabConfig.map((tab, index) => (
            <React.Fragment key={tab.key}>
              {renderTab(tab)}
              {index < tabConfig.length - 1 ? <View style={styles.tabDivider} /> : null}
            </React.Fragment>
          ))}
    </View>
  );
}

function SearchFilterRow({ compact, onChangeQuery, query }: { compact: boolean; onChangeQuery: (text: string) => void; query: string }) {
  return (
    <View style={[styles.searchFilterRow, compact && styles.searchFilterRowCompact]}>
      <View style={[styles.searchBox, compact && styles.searchBoxCompact]}>
        <Search size={compact ? 22 : 24} color={MUTED} strokeWidth={2.2} />
        <TextInput value={query} onChangeText={onChangeQuery} style={[styles.searchInput, compact && styles.searchInputCompact]} placeholder="Search tickets..." placeholderTextColor={MUTED} selectionColor={ACCENT} />
      </View>
      <Pressable accessibilityLabel="Filter tickets" style={({ pressed }) => [styles.filterButton, compact && styles.filterButtonCompact, pressed && styles.pressed]}>
        <Funnel size={compact ? 22 : 23} color={TEXT} strokeWidth={2.2} />
      </Pressable>
    </View>
  );
}

function TicketWalletCard({ ticket }: { ticket: IssuedTicket }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 768;
  const narrow = width < 370;
  const status = issuedTicketStatus(ticket);
  const isPast = status === "past";
  const isCancelled = status === "cancelled";
  const stripWidth = narrow ? 66 : compact ? 76 : 92;
  const qrWidth = narrow ? 88 : compact ? 96 : 110;
  const event = ticket.event as any;
  const tier = ticket.tier as any;
  const order = ticket.order;
  const paid = Number(order?.total_mwk || tier?.price_mwk || 0);

  return (
    <View style={[styles.walletCard, (isPast || isCancelled) && styles.walletCardPast]}>
      <View style={styles.walletMain}>
        <View style={[styles.brandStrip, { width: stripWidth }, (isPast || isCancelled) && styles.brandStripPast]}>
          <Text style={styles.brandText}>EYA</Text>
          <PerforationDots muted={isPast || isCancelled} />
        </View>

        <View style={styles.ticketInfo}>
          <View style={[styles.statusPill, status === "upcoming" ? styles.statusPillUpcoming : styles.statusPillPast]}>
            <Text style={[styles.statusPillText, status === "upcoming" ? styles.statusPillTextUpcoming : styles.statusPillTextPast]}>{status.toUpperCase()}</Text>
          </View>
          <Text style={[styles.ticketTitle, (isPast || isCancelled) && styles.ticketTitlePast]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82}>
            {uppercase(event?.title || "EYA ticket")}
          </Text>
          <Text style={[styles.ticketType, (isPast || isCancelled) && styles.ticketMuted]}>{String(tier?.name || "Ticket")}</Text>
          <TicketMeta Icon={Calendar} text={eventDateLabel(event)} muted={isPast || isCancelled} compact={compact} />
          <TicketMeta Icon={Clock} text={eventTimeLabel(event)} muted={isPast || isCancelled} compact={compact} />
          <TicketMeta Icon={MapPin} text={eventLocation(event)} muted={isPast || isCancelled} compact={compact} />
        </View>

        <View style={styles.qrDivider}>
          <CutoutDot style={styles.qrCutoutTop} />
          <CutoutDot style={styles.qrCutoutBottom} />
        </View>

        <View style={[styles.qrArea, { width: qrWidth }]}>
          <Text style={[styles.qrLabel, (isPast || isCancelled) && styles.ticketMuted]}>Ticket ID</Text>
          <Text style={[styles.qrTicketId, (isPast || isCancelled) && styles.ticketTitlePast]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
            {ticket.ticket_code}
          </Text>
          {ticket.qr_data_url ? <Image source={{ uri: ticket.qr_data_url }} style={styles.qrImage} /> : <QRUnavailable muted={isPast || isCancelled} />}
          <View style={[styles.ticketCountBadge, status === "upcoming" ? styles.ticketCountBadgeUpcoming : styles.ticketCountBadgePast]}>
            <Text style={[styles.ticketCountText, status === "upcoming" ? styles.ticketCountTextUpcoming : styles.ticketCountTextPast]}>{ticketCountLabel(order?.quantity)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.ticketFooter}>
        <View>
          <Text style={styles.paidLabel}>Paid</Text>
          <Text style={styles.paidValue}>{money(paid)}</Text>
        </View>
        <View style={styles.ticketActions}>
          <Pressable
            onPress={() => router.push({ pathname: "/(student)/market/single-ticket", params: { ticketId: ticket.id } } as any)}
            style={({ pressed }) => [styles.viewTicketButton, isPast || isCancelled ? styles.viewTicketButtonPast : styles.viewTicketButtonUpcoming, pressed && styles.pressed]}
          >
            {isPast || isCancelled ? <Eye size={18} color={TEXT} strokeWidth={2.4} /> : <Ticket size={18} color={ACCENT} strokeWidth={2.3} />}
            <Text style={[styles.viewTicketText, isPast || isCancelled ? styles.viewTicketTextPast : styles.viewTicketTextUpcoming]}>
              {isPast || isCancelled ? "View Details" : "View Ticket"}
            </Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}>
            <MoreVertical size={22} color={TEXT} strokeWidth={2.3} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TicketMeta({ Icon, compact, muted, text }: { Icon: IconComponent; compact?: boolean; muted?: boolean; text: string }) {
  return (
    <View style={styles.ticketMetaRow}>
      <Icon size={compact ? 15 : 17} color={muted ? "#7C7F86" : MUTED} strokeWidth={2.1} />
      <Text style={[styles.ticketMetaText, muted && styles.ticketMuted]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function PerforationDots({ muted }: { muted?: boolean }) {
  return (
    <View style={styles.perforationDots}>
      {Array.from({ length: 10 }).map((_, index) => (
        <View key={index} style={[styles.perforationDot, { backgroundColor: muted ? "#f7f8fe" : BG }]} />
      ))}
    </View>
  );
}

function CutoutDot({ style }: { style: object }) {
  return <View style={[styles.cutoutDot, style]} />;
}

function QRUnavailable({ muted }: { muted?: boolean }) {
  return (
    <View style={[styles.qrUnavailable, muted && styles.qrUnavailableMuted]}>
      <Text style={styles.qrUnavailableText}>QR unavailable</Text>
    </View>
  );
}

function EmptyTickets({ activeTab, compact, error }: { activeTab: TicketStatus; compact: boolean; error: string | null }) {
  const label = activeTab === "cancelled" ? "cancelled tickets" : `${activeTab} tickets`;

  return (
    <View style={[styles.emptyCard, compact && styles.emptyCardCompact]}>
      <Ticket size={compact ? 34 : 30} color={ACCENT} strokeWidth={2.2} />
      <Text style={[styles.emptyTitle, compact && styles.emptyTitleCompact]}>No {label}</Text>
      <Text style={[styles.emptyText, compact && styles.emptyTextCompact]}>{error || "Tickets matching this view will appear here after purchase."}</Text>
    </View>
  );
}

function SafetyNote({ compact }: { compact: boolean }) {
  return (
    <Pressable style={({ pressed }) => [styles.safetyCard, compact && styles.safetyCardCompact, pressed && styles.pressed]}>
      <View style={[styles.safetyIconCircle, compact && styles.safetyIconCircleCompact]}>
        <ShieldCheck size={compact ? 31 : 38} color="#19335F" strokeWidth={2.2} />
      </View>
      <View style={styles.safetyCopy}>
        <Text style={[styles.safetyTitle, compact && styles.safetyTitleCompact]}>Keep your tickets safe</Text>
        <Text style={[styles.safetyText, compact && styles.safetyTextCompact]}>Don't share your QR code with anyone. Screenshots may not be accepted.</Text>
      </View>
      <View style={styles.safetyArrow}>
        <ChevronRight size={compact ? 22 : 25} color={TEXT} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

function BottomNav() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(14, insets.bottom + 8);
  const items: { key: string; label: string; Icon: IconComponent; active?: boolean; onPress: () => void }[] = [
    { key: "home", label: "Home", Icon: Home, onPress: () => router.push("/(student)/market/tickets" as any) },
    { key: "tickets", label: "Tickets", Icon: Ticket, active: true, onPress: () => undefined },
  ];

  return (
    <View style={[styles.bottomNavOuter, { bottom }]}>
      <View style={styles.bottomNav}>
        {items.map(({ Icon, active, key, label, onPress }) => {
          const color = active ? ACCENT : MUTED;
          return (
            <Pressable key={key} onPress={onPress} style={({ pressed }) => [styles.bottomNavItem, pressed && styles.pressed]}>
              <Icon size={25} color={color} fill={active ? ACCENT : "transparent"} strokeWidth={active ? 2.8 : 2.1} />
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
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  header: { minHeight: 124, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", gap: 14 },
  headerCopy: { flex: 1, alignItems: "center", minWidth: 0 },
  headerTitle: { color: TEXT, fontSize: 30, lineHeight: 36, fontWeight: "900", letterSpacing: 0 },
  headerSubtitle: { color: MUTED, fontSize: 16, lineHeight: 22, fontWeight: "700", marginTop: 6 },
  scrollContent: { paddingHorizontal: 22, paddingBottom: 188 },
  tabsCard: { minHeight: 68, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, flexDirection: "row", alignItems: "center", padding: 7, shadowColor: "#13285f", shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  tabsCardCompact: { minHeight: 110, borderRadius: 24, padding: 8, gap: 0 },
  tabButton: { flex: 1, minWidth: 0, minHeight: 50, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 6 },
  tabButtonCompact: { minHeight: 92, borderRadius: 20, flexDirection: "column", gap: 4, paddingHorizontal: 3, paddingVertical: 8 },
  tabButtonActive: { backgroundColor: ACCENT },
  tabButtonInactive: { backgroundColor: CARD },
  tabDivider: { width: 1, height: 28, backgroundColor: BORDER, marginHorizontal: 3 },
  tabText: { flexShrink: 1, fontSize: 13, fontWeight: "900" },
  tabTextCompact: { maxWidth: "100%", fontSize: 13, lineHeight: 16, textAlign: "center" },
  tabTextActive: { color: "#FFFFFF" },
  tabTextInactive: { color: TEXT },
  tabCountBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  tabCountBadgeCompact: { minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 7 },
  tabCountBadgeActive: { backgroundColor: "#FFFFFF" },
  tabCountText: { color: ACCENT, fontSize: 11, fontWeight: "900" },
  tabCountTextCompact: { fontSize: 13 },
  tabCountTextActive: { color: ACCENT },
  searchFilterRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  searchFilterRowCompact: { gap: 14, marginTop: 24 },
  searchBox: { flex: 1, minHeight: 62, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, shadowColor: "#13285f", shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  searchBoxCompact: { minHeight: 72, borderRadius: 22, gap: 12, paddingHorizontal: 20 },
  searchInput: { flex: 1, minWidth: 0, color: TEXT, fontSize: 16, fontWeight: "700", paddingVertical: 0 },
  searchInputCompact: { fontSize: 16 },
  filterButton: { width: 62, minHeight: 62, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center", shadowColor: "#13285f", shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  filterButtonCompact: { width: 72, minHeight: 72, borderRadius: 22 },
  loadingCard: { marginTop: 18, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", gap: 10, padding: 20 },
  loadingText: { color: MUTED, fontSize: 14, fontWeight: "700" },
  syncWarning: { color: MUTED, fontSize: 12, fontWeight: "700", marginTop: 12, textAlign: "center" },
  ticketList: { gap: 18, marginTop: 18 },
  ticketListCompact: { marginTop: 28 },
  walletCard: { borderRadius: 18, borderWidth: 1, borderColor: ACCENT, backgroundColor: CARD, overflow: "hidden", shadowColor: "#13285f", shadowOpacity: 0.09, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 5 },
  walletCardPast: { borderColor: BORDER },
  walletMain: { minHeight: 226, flexDirection: "row", backgroundColor: CARD },
  brandStrip: { backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  brandStripPast: { backgroundColor: "#6F7177" },
  brandText: { color: "#FFFFFF", fontSize: 26, fontWeight: "900", fontStyle: "italic", letterSpacing: 0 },
  perforationDots: { position: "absolute", top: 11, bottom: 11, right: -5, justifyContent: "space-between" },
  perforationDot: { width: 10, height: 10, borderRadius: 5 },
  ticketInfo: { flex: 1, minWidth: 0, justifyContent: "center", paddingLeft: 18, paddingRight: 10, paddingVertical: 18 },
  statusPill: { alignSelf: "flex-start", minHeight: 25, borderRadius: 13, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  statusPillUpcoming: { backgroundColor: "#eef1ff" },
  statusPillPast: { backgroundColor: "#E5E7EB" },
  statusPillText: { fontSize: 11, fontWeight: "900" },
  statusPillTextUpcoming: { color: ACCENT },
  statusPillTextPast: { color: MUTED },
  ticketTitle: { color: TEXT, fontSize: 17, lineHeight: 22, fontWeight: "900", letterSpacing: 0 },
  ticketTitlePast: { color: TEXT },
  ticketType: { color: MUTED, fontSize: 15, fontWeight: "800", marginTop: 6, marginBottom: 8 },
  ticketMuted: { color: MUTED },
  ticketMetaRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 7 },
  ticketMetaText: { flex: 1, color: MUTED, fontSize: 12, fontWeight: "800" },
  qrDivider: { width: 1, borderLeftWidth: 1, borderStyle: "dashed", borderColor: BORDER },
  cutoutDot: { position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, left: -7 },
  qrCutoutTop: { top: -7 },
  qrCutoutBottom: { bottom: -7 },
  qrArea: { alignItems: "center", justifyContent: "center", paddingHorizontal: 6, paddingVertical: 20 },
  qrLabel: { color: MUTED, fontSize: 11, fontWeight: "800" },
  qrTicketId: { color: TEXT, fontSize: 11, fontWeight: "900", marginTop: 3, marginBottom: 11 },
  qrImage: { width: 78, height: 78, borderRadius: 9, borderWidth: 1, borderColor: BORDER, backgroundColor: "#FFFFFF" },
  qrUnavailable: { width: 78, height: 78, borderRadius: 9, borderWidth: 1, borderColor: BORDER, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", padding: 8 },
  qrUnavailableMuted: { backgroundColor: "#F3F4F6" },
  qrUnavailableText: { color: MUTED, fontSize: 10, fontWeight: "800", textAlign: "center" },
  ticketCountBadge: { minHeight: 28, borderRadius: 14, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", marginTop: 12 },
  ticketCountBadgeUpcoming: { backgroundColor: "#eef1ff" },
  ticketCountBadgePast: { backgroundColor: "#EFEFEF" },
  ticketCountText: { fontSize: 11, fontWeight: "900" },
  ticketCountTextUpcoming: { color: ACCENT },
  ticketCountTextPast: { color: TEXT },
  ticketFooter: { minHeight: 76, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: "#f7f8fe", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  paidLabel: { color: MUTED, fontSize: 13, fontWeight: "700" },
  paidValue: { color: TEXT, fontSize: 19, fontWeight: "900", marginTop: 4 },
  ticketActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  viewTicketButton: { minHeight: 42, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12 },
  viewTicketButtonUpcoming: { borderColor: ACCENT, backgroundColor: CARD },
  viewTicketButtonPast: { borderColor: BORDER, backgroundColor: CARD },
  viewTicketText: { fontSize: 13, fontWeight: "900" },
  viewTicketTextUpcoming: { color: ACCENT },
  viewTicketTextPast: { color: TEXT },
  moreButton: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center" },
  emptyCard: { borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", padding: 24, gap: 8 },
  emptyCardCompact: { minHeight: 190, borderRadius: 24, justifyContent: "center", paddingHorizontal: 26, paddingVertical: 30, gap: 11 },
  emptyTitle: { color: TEXT, fontSize: 17, fontWeight: "900" },
  emptyTitleCompact: { fontSize: 22, lineHeight: 27 },
  emptyText: { color: MUTED, fontSize: 13, fontWeight: "700", textAlign: "center" },
  emptyTextCompact: { fontSize: 16, lineHeight: 22 },
  safetyCard: { minHeight: 110, borderRadius: 20, borderWidth: 1, borderColor: "#d9e5fb", backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 17, marginTop: 24, marginBottom: 10 },
  safetyCardCompact: { minHeight: 124, borderRadius: 24, gap: 15, paddingHorizontal: 20, paddingVertical: 18, marginTop: 30 },
  safetyIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#dfe6ff", alignItems: "center", justifyContent: "center" },
  safetyIconCircleCompact: { width: 68, height: 68, borderRadius: 34 },
  safetyCopy: { flex: 1, minWidth: 0 },
  safetyTitle: { color: TEXT, fontSize: 17, fontWeight: "900", marginBottom: 6 },
  safetyTitleCompact: { fontSize: 20, lineHeight: 24, marginBottom: 7 },
  safetyText: { color: MUTED, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  safetyTextCompact: { fontSize: 15, lineHeight: 22 },
  safetyArrow: { width: 24, alignItems: "flex-end", justifyContent: "center" },
  bottomNavOuter: { position: "absolute", left: 22, right: 22 },
  bottomNav: { minHeight: 92, borderRadius: 28, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 8, shadowColor: "#13285f", shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 9 },
  bottomNavItem: { flex: 1, minHeight: 78, alignItems: "center", justifyContent: "center", gap: 4 },
  bottomNavLabel: { fontSize: 13, fontWeight: "800" },
  bottomNavUnderline: { width: 44, height: 5, borderRadius: 3, backgroundColor: "transparent", marginTop: 2 },
  bottomNavUnderlineActive: { backgroundColor: ACCENT },
  pressed: { opacity: 0.72 },
});
