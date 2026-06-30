import React from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  Download,
  Hash,
  Info,
  MapPin,
  Share2,
  ShieldCheck,
  Ticket,
  User,
  Wallet,
} from "lucide-react-native";
import { getCachedMyTickets, listMyTickets, type IssuedTicket } from "@/lib/tickets";
import { useAuth } from "@/providers/AuthProvider";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as BG,
  EYA_BORDER as BORDER,
  EYA_CARD as CARD,
  EYA_GREEN as GREEN,
  EYA_MUTED as MUTED,
  EYA_SUCCESS as SUCCESS,
  EYA_TEXT as TEXT,
  eventDateLabel,
  eventImageUrl,
  eventLocation,
  eventTimeLabel,
  issuedTicketStatus,
  money,
  uppercase,
  userDisplayName,
} from "@/components/market/ticketingUi";

const BLUE = ACCENT;

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}>;

type DetailRow = {
  label: string;
  value: string;
  Icon: IconComponent;
  emphasized?: boolean;
};

function mergeCachedTicketDetail(cached: IssuedTicket | null, live: IssuedTicket | null) {
  if (!cached || !live) return live;
  return {
    ...cached,
    ...live,
    event: live.event ?? cached.event,
    tier: live.tier ?? cached.tier,
    order: live.order ?? cached.order,
    qr_data_url: live.qr_data_url ?? cached.qr_data_url,
  };
}

export default function SingleTicketScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId?: string }>();
  const { session, user } = useAuth();
  const [ticket, setTicket] = React.useState<IssuedTicket | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const loadTicket = async () => {
      setLoading(true);
      setError(null);
      try {
        const cached = await getCachedMyTickets(user?.id);
        const cachedTicket = cached.find((item) => item.id === ticketId) ?? cached[0] ?? null;
        if (active && cachedTicket) setTicket(cachedTicket);
        if (!session?.access_token) throw new Error("Log in to view this ticket.");
        const liveTickets = await listMyTickets(session.access_token);
        const selected = liveTickets.find((item) => item.id === ticketId) ?? liveTickets[0] ?? null;
        if (!selected) throw new Error("Ticket not found.");
        if (active) setTicket(mergeCachedTicketDetail(cachedTicket, selected));
      } catch (loadError: any) {
        if (active) setError(loadError?.message || "Could not load this ticket.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadTicket();
    return () => {
      active = false;
    };
  }, [session?.access_token, ticketId, user?.id]);

  if (loading && !ticket) {
    return (
      <View style={styles.centeredRoot}>
        <ActivityIndicator color={ACCENT} />
        <Text style={styles.stateText}>Loading ticket...</Text>
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.centeredRoot}>
        <Ticket size={34} color={ACCENT} strokeWidth={2.2} />
        <Text style={styles.stateTitle}>Ticket unavailable</Text>
        <Text style={styles.stateText}>{error || "This ticket could not be found."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <Header />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {error ? <Text style={styles.syncWarning}>{error}</Text> : null}
          <TicketQRCodeCard ticket={ticket} />
          <ReminderCard ticket={ticket} />
          <TicketDetailsCard ticket={ticket} userName={userDisplayName(user)} />
          <ActionButtons />
          <BottomNote />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Header() {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <Pressable style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} onPress={() => router.back()}>
        <ArrowLeft size={25} color={TEXT} strokeWidth={2.4} />
      </Pressable>

      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>My Ticket</Text>
        <Text style={styles.headerSubtitle}>Show this QR code at the event entrance</Text>
      </View>

      <View style={styles.secureBadge}>
        <ShieldCheck size={23} color={GREEN} strokeWidth={2.2} />
        <Text style={styles.secureText} numberOfLines={1}>100% Secure</Text>
      </View>
    </View>
  );
}

function TicketQRCodeCard({ ticket }: { ticket: IssuedTicket }) {
  const { width } = useWindowDimensions();
  const event = ticket.event as any;
  const tier = ticket.tier as any;
  const stripWidth = width < 390 ? 78 : 88;
  const qrSize = Math.min(266, Math.max(214, width - stripWidth - 94));
  const status = issuedTicketStatus(ticket);
  const isValid = ticket.status === "active" && !ticket.checked_in_at && status === "upcoming";

  return (
    <View style={styles.ticketCard}>
      <ImageBackground source={{ uri: eventImageUrl(event, true) }} imageStyle={styles.stripImage} style={[styles.ticketStrip, { width: stripWidth }]}>
        <View style={styles.stripOverlay} />
        <View style={styles.stripTextWrap}>
          <Text style={styles.stripBrand}>EYA</Text>
          <Text style={styles.stripLabel}>TICKET</Text>
        </View>
      </ImageBackground>

      <View style={styles.ticketContent}>
        <View style={styles.ticketTop}>
          <View style={styles.ticketInfo}>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{status.toUpperCase()}</Text>
            </View>
            <Text style={styles.eventTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82}>
              {uppercase(event?.title || "EYA ticket")}
            </Text>
            <Text style={styles.ticketType}>{String(tier?.name || "Ticket")}</Text>
            <TicketMeta Icon={Calendar} text={eventDateLabel(event)} />
            <TicketMeta Icon={Clock} text={eventTimeLabel(event)} />
            <TicketMeta Icon={MapPin} text={eventLocation(event)} />
          </View>

          <View style={styles.ticketIdColumn}>
            <Text style={styles.ticketIdLabel}>Ticket ID</Text>
            <Pressable style={({ pressed }) => [styles.ticketIdCopyRow, pressed && styles.pressed]}>
              <Text style={styles.ticketIdValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{ticket.ticket_code}</Text>
              <Copy size={17} color={ACCENT} strokeWidth={2.4} />
            </Pressable>
            <View style={styles.counterBox}>
              <Text style={styles.counterValue}>1 / 1</Text>
              <Text style={styles.counterLabel}>Ticket</Text>
            </View>
          </View>
        </View>

        <View style={styles.qrDivider}>
          <CutoutCircle style={styles.dividerLeftCutout} />
          <CutoutCircle style={styles.dividerRightCutout} />
        </View>

        <View style={styles.qrSection}>
          {ticket.qr_data_url ? (
            <Image source={{ uri: ticket.qr_data_url }} style={[styles.qrImage, { width: qrSize, height: qrSize }]} />
          ) : (
            <View style={[styles.qrUnavailable, { width: qrSize, height: qrSize }]}>
              <Text style={styles.qrUnavailableTitle}>QR unavailable</Text>
              <Text style={styles.qrUnavailableText}>Refresh your tickets before event entry.</Text>
            </View>
          )}
          <View style={styles.validRow}>
            <CheckCircle size={22} color={isValid ? SUCCESS : MUTED} strokeWidth={2.4} />
            <Text style={[styles.validText, !isValid && styles.invalidText]}>{isValid ? "This ticket is valid" : `This ticket is ${ticket.status}`}</Text>
          </View>
          <Text style={styles.qrHelper}>Present this QR code for scanning</Text>
        </View>
      </View>

      <CutoutCircle style={styles.topNotch} />
      <CutoutCircle style={styles.bottomNotch} />
      <CutoutCircle style={styles.leftOuterNotch} />
      <CutoutCircle style={styles.rightOuterNotch} />
    </View>
  );
}

function TicketMeta({ Icon, text }: { Icon: IconComponent; text: string }) {
  return (
    <View style={styles.ticketMetaRow}>
      <Icon size={18} color={MUTED} strokeWidth={2.1} />
      <Text style={styles.ticketMetaText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function CutoutCircle({ style }: { style: StyleProp<ViewStyle> }) {
  return <View style={[styles.cutoutCircle, style]} />;
}

function ReminderCard({ ticket }: { ticket: IssuedTicket }) {
  const event = ticket.event as any;
  const days = daysUntil(event?.starts_at);
  const title = days == null ? "Keep this ticket ready" : days >= 0 ? `This event is in ${days} ${days === 1 ? "day" : "days"}` : "This event date has passed";

  return (
    <Pressable style={({ pressed }) => [styles.reminderCard, pressed && styles.pressed]}>
      <View style={styles.reminderIconCircle}>
        <Clock size={31} color={TEXT} strokeWidth={2.4} />
      </View>
      <View style={styles.reminderCopy}>
        <Text style={styles.reminderTitle}>{title}</Text>
        <Text style={styles.reminderText}>Arrive early and keep your QR code ready for the event team.</Text>
      </View>
      <ChevronRight size={27} color={TEXT} strokeWidth={2.5} />
    </Pressable>
  );
}

function TicketDetailsCard({ ticket, userName }: { ticket: IssuedTicket; userName: string }) {
  const tier = ticket.tier as any;
  const order = ticket.order;
  const detailRows: DetailRow[] = [
    { label: "Ticket Type", value: String(tier?.name || "Ticket"), Icon: Ticket },
    { label: "Name", value: userName, Icon: User },
    { label: "Ticket ID", value: ticket.ticket_code, Icon: Hash },
    { label: "Purchase Date", value: formatDateTime(order?.paid_at || ticket.issued_at), Icon: Calendar },
    { label: "Paid With", value: "EYA Mobile Money", Icon: CreditCard },
    { label: "Amount Paid", value: money(order?.total_mwk || tier?.price_mwk || 0), Icon: DollarSign, emphasized: true },
  ];

  return (
    <View style={styles.detailsSection}>
      <Text style={styles.sectionTitle}>TICKET DETAILS</Text>
      <View style={styles.detailsCard}>
        {detailRows.map(({ Icon, emphasized, label, value }, index) => (
          <View key={label} style={[styles.detailRow, index < detailRows.length - 1 && styles.detailRowBorder]}>
            <View style={styles.detailIconWrap}>
              <Icon size={21} color={ACCENT} strokeWidth={2.3} />
            </View>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={[styles.detailValue, emphasized && styles.detailValueEmphasized]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ActionButtons() {
  return (
    <View style={styles.actionsSection}>
      <View style={styles.secondaryActions}>
        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Download size={24} color={TEXT} strokeWidth={2.4} />
          <Text style={styles.secondaryButtonText}>Download Ticket</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Share2 size={24} color={TEXT} strokeWidth={2.4} />
          <Text style={styles.secondaryButtonText}>Share Ticket</Text>
        </Pressable>
      </View>

      <Pressable style={({ pressed }) => [styles.walletButton, pressed && styles.pressed]}>
        <Wallet size={26} color={TEXT} strokeWidth={2.5} />
        <Text style={styles.walletButtonText}>Add to Wallet</Text>
      </Pressable>
    </View>
  );
}

function BottomNote() {
  return (
    <View style={styles.bottomNote}>
      <Info size={19} color={MUTED} strokeWidth={2.2} />
      <Text style={styles.bottomNoteText}>Screenshots may not be accepted at the entrance.</Text>
    </View>
  );
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const eventTime = Date.parse(value);
  if (!Number.isFinite(eventTime)) return null;
  const diff = eventTime - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return date.toLocaleString("en-US", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  centeredRoot: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  stateTitle: { color: TEXT, fontSize: 19, fontWeight: "900", textAlign: "center" },
  stateText: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" },
  syncWarning: { color: MUTED, fontSize: 12, fontWeight: "700", marginBottom: 12, textAlign: "center" },
  header: { minHeight: 92, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 58, height: 58, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center", shadowColor: "#13285f", shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  headerCopy: { flex: 1, alignItems: "center", minWidth: 0 },
  headerTitle: { color: TEXT, fontSize: 22, fontWeight: "900", letterSpacing: 0 },
  headerSubtitle: { color: MUTED, fontSize: 13, fontWeight: "700", marginTop: 6, textAlign: "center" },
  secureBadge: { minWidth: 108, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 },
  secureText: { color: GREEN, fontSize: 13, fontWeight: "900" },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 28 },
  ticketCard: { position: "relative", minHeight: 690, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, flexDirection: "row", shadowColor: "#13285f", shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  ticketStrip: { overflow: "hidden", borderTopLeftRadius: 18, borderBottomLeftRadius: 18, alignItems: "center", justifyContent: "center" },
  stripImage: { opacity: 0.45 },
  stripOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(94,115,221,0.9)" },
  stripTextWrap: { alignItems: "center", gap: 10 },
  stripBrand: { color: "#FFFFFF", fontSize: 32, fontWeight: "900", fontStyle: "italic", letterSpacing: 0 },
  stripLabel: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", letterSpacing: 0.4 },
  ticketContent: { flex: 1, minWidth: 0, paddingTop: 24 },
  ticketTop: { minHeight: 250, flexDirection: "row", gap: 10, paddingLeft: 26, paddingRight: 18, paddingBottom: 22 },
  ticketInfo: { flex: 1, minWidth: 0 },
  statusPill: { alignSelf: "flex-start", minHeight: 26, borderRadius: 13, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", paddingHorizontal: 12, marginBottom: 14 },
  statusPillText: { color: BLUE, fontSize: 12, fontWeight: "900" },
  eventTitle: { color: TEXT, fontSize: 28, lineHeight: 33, fontWeight: "900", letterSpacing: 0 },
  ticketType: { color: MUTED, fontSize: 16, fontWeight: "800", marginTop: 10, marginBottom: 12 },
  ticketMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  ticketMetaText: { flex: 1, color: MUTED, fontSize: 13, fontWeight: "800" },
  ticketIdColumn: { width: 114, alignItems: "flex-end" },
  ticketIdLabel: { color: MUTED, fontSize: 14, fontWeight: "800", textAlign: "right" },
  ticketIdCopyRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  ticketIdValue: { flex: 1, color: TEXT, fontSize: 13, fontWeight: "900", textAlign: "right" },
  counterBox: { width: 100, minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: "#f7f8fe", alignItems: "center", justifyContent: "center", marginTop: 58 },
  counterValue: { color: TEXT, fontSize: 29, fontWeight: "900" },
  counterLabel: { color: MUTED, fontSize: 15, fontWeight: "700", marginTop: 8 },
  qrDivider: { position: "relative", borderTopWidth: 1, borderStyle: "dashed", borderColor: BORDER },
  qrSection: { alignItems: "center", paddingHorizontal: 20, paddingTop: 28, paddingBottom: 30 },
  qrImage: { borderRadius: 15, borderWidth: 1, borderColor: BORDER, backgroundColor: "#FFFFFF" },
  qrUnavailable: { borderRadius: 15, borderWidth: 1, borderColor: BORDER, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", padding: 20 },
  qrUnavailableTitle: { color: TEXT, fontSize: 17, fontWeight: "900", textAlign: "center" },
  qrUnavailableText: { color: MUTED, fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 8 },
  validRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 18 },
  validText: { color: GREEN, fontSize: 16, fontWeight: "900" },
  invalidText: { color: MUTED },
  qrHelper: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center", marginTop: 13 },
  cutoutCircle: { position: "absolute", width: 25, height: 25, borderRadius: 13, backgroundColor: BG, borderWidth: 1, borderColor: BORDER, zIndex: 5 },
  topNotch: { left: 76, top: -13 },
  bottomNotch: { left: 76, bottom: -13 },
  leftOuterNotch: { left: -13, top: "67%" },
  rightOuterNotch: { right: -13, top: "67%" },
  dividerLeftCutout: { left: -13, top: -13 },
  dividerRightCutout: { right: -13, top: -13 },
  reminderCard: { minHeight: 106, borderRadius: 18, borderWidth: 1, borderColor: "#d9e5fb", backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 17, marginTop: 24 },
  reminderIconCircle: { width: 62, height: 62, borderRadius: 31, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  reminderCopy: { flex: 1, minWidth: 0 },
  reminderTitle: { color: TEXT, fontSize: 18, fontWeight: "900", marginBottom: 7 },
  reminderText: { color: MUTED, fontSize: 15, lineHeight: 22, fontWeight: "700" },
  detailsSection: { marginTop: 28 },
  sectionTitle: { color: TEXT, fontSize: 16, fontWeight: "900", letterSpacing: 0.4, marginBottom: 16 },
  detailsCard: { borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, overflow: "hidden" },
  detailRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18 },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  detailIconWrap: { width: 28, alignItems: "center" },
  detailLabel: { flex: 1, color: MUTED, fontSize: 15, fontWeight: "700" },
  detailValue: { flex: 1.26, color: TEXT, fontSize: 15, fontWeight: "800", textAlign: "left" },
  detailValueEmphasized: { fontSize: 17, fontWeight: "900" },
  actionsSection: { marginTop: 24 },
  secondaryActions: { flexDirection: "row", gap: 12 },
  secondaryButton: { flex: 1, minHeight: 70, borderRadius: 15, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 11, paddingHorizontal: 12 },
  secondaryButtonText: { color: TEXT, fontSize: 15, fontWeight: "900" },
  walletButton: { minHeight: 72, borderRadius: 15, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 15, marginTop: 22, shadowColor: ACCENT, shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  walletButtonText: { color: TEXT, fontSize: 18, fontWeight: "900" },
  bottomNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingTop: 18, paddingBottom: 4 },
  bottomNoteText: { flexShrink: 1, color: MUTED, fontSize: 13, fontWeight: "700", textAlign: "center" },
  pressed: { opacity: 0.72 },
});
