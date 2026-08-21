import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ExpoCalendar from "expo-calendar";
import * as MailComposer from "expo-mail-composer";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import QRCode from "react-native-qrcode-svg";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Hash,
  Mail,
  MapPin,
  RefreshCw,
  Share2,
  ShieldCheck,
  Ticket,
  User,
} from "lucide-react-native";
import { getCachedMyTickets, listMyTickets, type IssuedTicket } from "@/lib/tickets";
import {
  canPresentTicketQr,
  issueLiveTicketCredential,
  liveCredentialSecondsRemaining,
  type LiveTicketCredential,
} from "@/lib/ticketCredential";
import { supabase } from "@/lib/supabase";
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
  userDisplayName,
} from "@/components/market/ticketingUi";

type PaymentAudit = { method: string | null; provider: string | null };
type UtilityAction = "download" | "send" | "calendar" | "share";

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

function mergeCachedTicketDetail(cached: IssuedTicket | null, live: IssuedTicket | null) {
  if (!cached || !live) return live;
  return {
    ...cached,
    ...live,
    event: live.event ?? cached.event,
    tier: live.tier ?? cached.tier,
    order: live.order ?? cached.order,
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPaymentMethod(method: string | null | undefined) {
  switch (String(method || "").toLowerCase()) {
    case "airtel_money": return "Airtel Money";
    case "mpamba": return "TNM Mpamba";
    case "bank_transfer": return "Bank Transfer";
    case "card": return "Card";
    default: return "Verified payment";
  }
}

function eventStart(event: any) {
  const raw = event?.starts_at || event?.startsAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function eventEnd(event: any, start: Date) {
  const raw = event?.ends_at || event?.endsAt;
  if (raw) {
    const date = new Date(raw);
    if (Number.isFinite(date.getTime()) && date.getTime() > start.getTime()) return date;
  }
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
}

function ticketLifecycle(ticket: IssuedTicket) {
  if (ticket.checked_in_at || String(ticket.status || "").toLowerCase() === "used") {
    return { label: "Used", tone: "used" as const, description: "This ticket has already been admitted." };
  }
  const status = issuedTicketStatus(ticket);
  if (status === "cancelled" || ["cancelled", "refunded"].includes(String(ticket.status || "").toLowerCase())) {
    return { label: "Cancelled", tone: "cancelled" as const, description: "This ticket is no longer valid for entry." };
  }
  if (status === "past") {
    return { label: "Past", tone: "past" as const, description: "The event date for this ticket has passed." };
  }
  if (canPresentTicketQr(ticket)) {
    return { label: "Ready for entry", tone: "ready" as const, description: "Your entry credential rotates automatically." };
  }
  return { label: "Unavailable", tone: "past" as const, description: "Entry is currently unavailable for this ticket." };
}

function ticketPdfHtml(ticket: IssuedTicket, holderName: string, paymentMethod: string) {
  const event = ticket.event as any;
  const tier = ticket.tier as any;
  const order = ticket.order as any;
  const quantity = Math.max(1, Number(order?.quantity || 1));
  const ticketPrice = Number(tier?.price_mwk || (Number(order?.total_mwk || 0) / quantity) || 0);

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  *{box-sizing:border-box}body{margin:0;padding:36px;background:#f4f2fb;color:#102a54;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.sheet{max-width:720px;margin:0 auto;background:#fff;border:1px solid #e6eaf5;border-radius:28px;overflow:hidden}.head{background:#5e73dd;color:#fff;padding:26px 30px;display:flex;justify-content:space-between;align-items:center}.brand{font-size:29px;font-weight:900;font-style:italic}.verified{font-size:11px;font-weight:900;background:rgba(255,255,255,.17);padding:9px 13px;border-radius:999px}.body{padding:30px}.eyebrow{font-size:10px;font-weight:900;letter-spacing:1.4px;color:#5e73dd}.title{font-size:31px;line-height:1.15;font-weight:900;margin:8px 0 6px}.tier{color:#6d7891;font-size:16px;font-weight:800}.grid{margin-top:24px;border:1px solid #e4e8f3;border-radius:22px;background:#f8f9fe;padding:22px}.row{padding:9px 0;border-bottom:1px solid #e5e9f4}.row:last-child{border-bottom:0}.label{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#75809a;font-weight:900}.value{margin-top:4px;font-size:14px;font-weight:800}.live{margin-top:22px;border-radius:18px;background:#eef1ff;padding:18px;color:#33467f;font-size:13px;line-height:1.6;font-weight:700}.foot{margin-top:20px;color:#6d7891;font-size:11px;line-height:1.6}
  </style></head><body><div class="sheet"><div class="head"><div class="brand">EYA</div><div class="verified">VERIFIED TICKET</div></div><div class="body"><div class="eyebrow">OFFICIAL EVENT PASS</div><div class="title">${escapeHtml(event?.title || "EYA ticket")}</div><div class="tier">${escapeHtml(tier?.name || "Ticket")}</div><div class="grid"><div class="row"><div class="label">Holder</div><div class="value">${escapeHtml(holderName)}</div></div><div class="row"><div class="label">Date</div><div class="value">${escapeHtml(eventDateLabel(event))}</div></div><div class="row"><div class="label">Time</div><div class="value">${escapeHtml(eventTimeLabel(event))}</div></div><div class="row"><div class="label">Venue</div><div class="value">${escapeHtml(eventLocation(event))}</div></div><div class="row"><div class="label">Ticket reference</div><div class="value">${escapeHtml(ticket.ticket_code)}</div></div><div class="row"><div class="label">Payment</div><div class="value">${escapeHtml(paymentMethod)}</div></div><div class="row"><div class="label">Ticket price</div><div class="value">${escapeHtml(money(ticketPrice))}</div></div></div><div class="live">For security, this document does not contain an entry QR. Open the live ticket inside EYA at the event gate to display the rotating QR and backup code.</div><div class="foot">The EYA app is the authoritative entry credential. Permanent ticket references and screenshots are not valid gate credentials.</div></div></div></body></html>`;
}

export default function SingleTicketScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId?: string }>();
  const { session, user } = useAuth();
  const [ticket, setTicket] = React.useState<IssuedTicket | null>(null);
  const [paymentAudit, setPaymentAudit] = React.useState<PaymentAudit>({ method: null, provider: null });
  const [liveCredential, setLiveCredential] = React.useState<LiveTicketCredential | null>(null);
  const [credentialError, setCredentialError] = React.useState<string | null>(null);
  const [credentialLoading, setCredentialLoading] = React.useState(false);
  const [secondsRemaining, setSecondsRemaining] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const loadTicket = async () => {
      setLoading(true);
      setError(null);
      let cachedTicket: IssuedTicket | null = null;
      try {
        const cached = await getCachedMyTickets(user?.id);
        cachedTicket = cached.find((item) => item.id === ticketId) ?? null;
        if (active && cachedTicket) setTicket(cachedTicket);

        if (!session?.access_token) throw new Error("Log in to view this ticket.");
        const liveTickets = await listMyTickets(session.access_token);
        const selected = liveTickets.find((item) => item.id === ticketId) ?? null;
        if (!selected) throw new Error("Ticket not found.");
        const merged = mergeCachedTicketDetail(cachedTicket, selected) ?? selected;
        if (active) setTicket(merged);
      } catch (loadError: any) {
        if (active) setError(loadError?.message || "Could not refresh this ticket.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadTicket();
    return () => { active = false; };
  }, [session?.access_token, ticketId, user?.id]);

  React.useEffect(() => {
    if (!ticket?.order_id) return;
    let active = true;
    void (async () => {
      const { data, error: paymentError } = await supabase
        .from("ticket_payments")
        .select("method,provider")
        .eq("order_id", ticket.order_id)
        .eq("status", "paid")
        .limit(1)
        .maybeSingle();
      if (!paymentError && active && data) {
        setPaymentAudit({
          method: typeof data.method === "string" ? data.method : null,
          provider: typeof data.provider === "string" ? data.provider : null,
        });
      }
    })();
    return () => { active = false; };
  }, [ticket?.order_id]);

  const rotateCredential = React.useCallback(async () => {
    if (!ticket?.id || !canPresentTicketQr(ticket)) return null;
    setCredentialLoading(true);
    try {
      const credential = await issueLiveTicketCredential(ticket.id);
      setLiveCredential(credential);
      setCredentialError(null);
      setSecondsRemaining(liveCredentialSecondsRemaining(credential));
      return credential;
    } catch (credentialIssueError) {
      setCredentialError(credentialIssueError instanceof Error ? credentialIssueError.message : "Could not refresh live QR.");
      return null;
    } finally {
      setCredentialLoading(false);
    }
  }, [ticket]);

  React.useEffect(() => {
    if (!ticket?.id || !canPresentTicketQr(ticket)) {
      setLiveCredential(null);
      setSecondsRemaining(0);
      return;
    }

    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const schedule = async () => {
      const credential = await rotateCredential();
      if (cancelled) return;
      const refreshSeconds = Math.max(10, credential?.refresh_after_seconds || 25);
      refreshTimer = setTimeout(() => { void schedule(); }, refreshSeconds * 1000);
    };

    void schedule();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [rotateCredential, ticket?.id, ticket?.status, ticket?.checked_in_at]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining(liveCredentialSecondsRemaining(liveCredential));
    }, 1000);
    return () => clearInterval(timer);
  }, [liveCredential]);

  if (loading && !ticket) {
    return <View style={styles.centeredRoot}><ActivityIndicator color={ACCENT} /><Text style={styles.stateTitle}>Loading your ticket</Text><Text style={styles.stateText}>Preparing the latest entry status.</Text></View>;
  }

  if (!ticket) {
    return <View style={styles.centeredRoot}><Ticket size={34} color={ACCENT} /><Text style={styles.stateTitle}>Ticket unavailable</Text><Text style={styles.stateText}>{error || "This ticket could not be found."}</Text></View>;
  }

  const holderName = userDisplayName(user);
  const paymentMethod = formatPaymentMethod(paymentAudit.method);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <Header />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {error ? <Text style={styles.syncWarning}>{error}</Text> : null}
          <TicketHero ticket={ticket} />
          <LiveEntryCard
            ticket={ticket}
            credential={liveCredential}
            loading={credentialLoading}
            error={credentialError}
            secondsRemaining={secondsRemaining}
            onRefresh={() => void rotateCredential()}
          />
          <TicketDetails ticket={ticket} holderName={holderName} paymentMethod={paymentMethod} />
          <TicketActions ticket={ticket} holderName={holderName} paymentMethod={paymentMethod} />
          <View style={styles.securityNote}><ShieldCheck size={20} color={ACCENT} /><Text style={styles.securityNoteText}>Screenshots and permanent ticket IDs are not accepted at the gate. Use the live rotating credential above.</Text></View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Header() {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <Pressable style={styles.backButton} onPress={() => router.back()}><ArrowLeft size={24} color={TEXT} /></Pressable>
      <View style={styles.headerCopy}><Text style={styles.headerEyebrow}>LIVE EVENT PASS</Text><Text style={styles.headerTitle}>My Ticket</Text></View>
      <View style={styles.secureBadge}><ShieldCheck size={19} color={SUCCESS} /><Text style={styles.secureText}>Secure</Text></View>
    </View>
  );
}

function TicketHero({ ticket }: { ticket: IssuedTicket }) {
  const event = ticket.event as any;
  const tier = ticket.tier as any;
  const lifecycle = ticketLifecycle(ticket);
  return (
    <View style={styles.heroCard}>
      <Image source={{ uri: eventImageUrl(event, true) }} style={styles.heroImage} />
      <View style={styles.heroOverlay} />
      <View style={styles.heroContent}>
        <View style={[styles.statusPill, lifecycle.tone === "ready" && styles.statusPillReady]}><Text style={[styles.statusText, lifecycle.tone === "ready" && styles.statusTextReady]}>{lifecycle.label.toUpperCase()}</Text></View>
        <Text style={styles.eventTitle}>{event?.title || "EYA Ticket"}</Text>
        <Text style={styles.ticketTier}>{tier?.name || "Ticket"}</Text>
        <MetaLine Icon={Calendar} text={eventDateLabel(event)} light />
        <MetaLine Icon={Clock} text={eventTimeLabel(event)} light />
        <MetaLine Icon={MapPin} text={eventLocation(event)} light />
      </View>
    </View>
  );
}

function LiveEntryCard({
  ticket,
  credential,
  loading,
  error,
  secondsRemaining,
  onRefresh,
}: {
  ticket: IssuedTicket;
  credential: LiveTicketCredential | null;
  loading: boolean;
  error: string | null;
  secondsRemaining: number;
  onRefresh: () => void;
}) {
  const lifecycle = ticketLifecycle(ticket);
  const canEnter = lifecycle.tone === "ready";
  const activeCredential = Boolean(credential?.token && secondsRemaining > 0);

  return (
    <View style={styles.liveCard}>
      <View style={styles.liveHeader}>
        <View><Text style={styles.sectionEyebrow}>LIVE ENTRY CREDENTIAL</Text><Text style={styles.liveTitle}>{canEnter ? "Rotating QR" : lifecycle.label}</Text></View>
        {canEnter ? <View style={styles.liveStatus}><View style={styles.liveDot} /><Text style={styles.liveStatusText}>LIVE</Text></View> : null}
      </View>

      {canEnter && activeCredential ? (
        <>
          <View style={styles.qrShell}><QRCode value={credential!.token} size={230} backgroundColor="#ffffff" color="#102a54" /></View>
          <View style={styles.rotationRow}>
            <RefreshCw size={16} color={ACCENT} />
            <Text style={styles.rotationText}>Auto-refreshing · expires in {secondsRemaining}s</Text>
          </View>
          <View style={styles.manualBox}>
            <Text style={styles.manualLabel}>ROTATING BACKUP CODE</Text>
            <Text style={styles.manualCode}>{credential!.manual_code}</Text>
            <Text style={styles.manualHint}>Use only if the camera cannot scan the live QR.</Text>
          </View>
        </>
      ) : canEnter ? (
        <View style={styles.qrLoadingBox}>
          {loading ? <ActivityIndicator color={ACCENT} /> : <ShieldCheck size={32} color={ACCENT} />}
          <Text style={styles.qrLoadingTitle}>{loading ? "Generating secure QR..." : "Live QR needs refresh"}</Text>
          <Text style={styles.qrLoadingText}>{error || "A fresh credential is required for entry."}</Text>
          {!loading ? <Pressable style={styles.refreshButton} onPress={onRefresh}><RefreshCw size={16} color="#ffffff" /><Text style={styles.refreshButtonText}>Refresh Live QR</Text></Pressable> : null}
        </View>
      ) : (
        <View style={styles.qrLoadingBox}><ShieldCheck size={32} color={MUTED} /><Text style={styles.qrLoadingTitle}>{lifecycle.label}</Text><Text style={styles.qrLoadingText}>{lifecycle.description}</Text></View>
      )}

      <View style={styles.referenceBox}><Text style={styles.referenceLabel}>PERMANENT TICKET REFERENCE · NOT VALID FOR ENTRY</Text><Text style={styles.referenceValue}>{ticket.ticket_code}</Text></View>
    </View>
  );
}

function TicketDetails({ ticket, holderName, paymentMethod }: { ticket: IssuedTicket; holderName: string; paymentMethod: string }) {
  const tier = ticket.tier as any;
  const order = ticket.order as any;
  const quantity = Math.max(1, Number(order?.quantity || 1));
  const ticketPrice = Number(tier?.price_mwk || (Number(order?.total_mwk || 0) / quantity) || 0);
  const rows = [
    { label: "Ticket type", value: tier?.name || "Ticket", Icon: Ticket },
    { label: "Holder", value: holderName, Icon: User },
    { label: "Reference", value: ticket.ticket_code, Icon: Hash },
    { label: "Purchased", value: formatDateTime(order?.paid_at || ticket.issued_at), Icon: Calendar },
    { label: "Paid with", value: paymentMethod, Icon: CreditCard },
    { label: "Ticket price", value: money(ticketPrice), Icon: CreditCard },
  ];
  return (
    <View style={styles.detailsSection}><Text style={styles.sectionTitle}>TICKET DETAILS</Text><View style={styles.detailsCard}>{rows.map(({ label, value, Icon }, index) => <View key={label} style={[styles.detailRow, index < rows.length - 1 && styles.detailBorder]}><View style={styles.detailIcon}><Icon size={19} color={ACCENT} /></View><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue} numberOfLines={2}>{String(value)}</Text></View>)}</View></View>
  );
}

function TicketActions({ ticket, holderName, paymentMethod }: { ticket: IssuedTicket; holderName: string; paymentMethod: string }) {
  const [working, setWorking] = React.useState<UtilityAction | null>(null);
  const event = ticket.event as any;

  const run = async (action: UtilityAction) => {
    if (working) return;
    setWorking(action);
    try {
      if (action === "download" || action === "send") {
        const { uri } = await Print.printToFileAsync({ html: ticketPdfHtml(ticket, holderName, paymentMethod) });
        if (action === "send" && await MailComposer.isAvailableAsync()) {
          await MailComposer.composeAsync({
            subject: `${event?.title || "EYA"} ticket`,
            body: "Your EYA ticket is attached. Open the EYA app at the gate for the live rotating entry QR.",
            attachments: [uri],
          });
        } else if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Share EYA ticket" });
        } else {
          await Print.printAsync({ html: ticketPdfHtml(ticket, holderName, paymentMethod) });
        }
        return;
      }

      if (action === "calendar") {
        const start = eventStart(event);
        if (!start) throw new Error("This event does not have a calendar-ready start time yet.");
        await ExpoCalendar.createEventInCalendarAsync({
          title: event?.title || "EYA Event",
          startDate: start,
          endDate: eventEnd(event, start),
          location: eventLocation(event),
          notes: `EYA ticket reference: ${ticket.ticket_code}. Open EYA at the gate for the live rotating QR.`,
        });
        return;
      }

      await Share.share({
        title: event?.title || "EYA Event",
        message: `${event?.title || "EYA Event"}\n${eventDateLabel(event)} · ${eventTimeLabel(event)}\n${eventLocation(event)}\nBooked with EYA`,
      });
    } catch (actionError) {
      Alert.alert("Ticket action", actionError instanceof Error ? actionError.message : "Could not complete this action.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <View style={styles.actionsSection}><Text style={styles.sectionTitle}>TICKET TOOLS</Text><View style={styles.actionGrid}>
      <ActionButton Icon={Download} label="Download" working={working === "download"} onPress={() => void run("download")} />
      <ActionButton Icon={Mail} label="Send Ticket" working={working === "send"} onPress={() => void run("send")} />
      <ActionButton Icon={Calendar} label="Add Calendar" working={working === "calendar"} onPress={() => void run("calendar")} />
      <ActionButton Icon={Share2} label="Share Event" working={working === "share"} onPress={() => void run("share")} />
    </View></View>
  );
}

function ActionButton({ Icon, label, working, onPress }: { Icon: IconComponent; label: string; working: boolean; onPress: () => void }) {
  return <Pressable style={styles.actionButton} onPress={onPress} disabled={working}>{working ? <ActivityIndicator color={ACCENT} /> : <Icon size={22} color={ACCENT} />}<Text style={styles.actionButtonText}>{label}</Text></Pressable>;
}

function MetaLine({ Icon, text, light = false }: { Icon: IconComponent; text: string; light?: boolean }) {
  const color = light ? "rgba(255,255,255,0.88)" : MUTED;
  return <View style={styles.metaRow}><Icon size={15} color={color} /><Text style={[styles.metaText, light && styles.metaTextLight]} numberOfLines={1}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  centeredRoot: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 26 },
  stateTitle: { color: TEXT, fontSize: 20, fontWeight: "900", textAlign: "center" },
  stateText: { color: MUTED, fontSize: 14, lineHeight: 20, fontWeight: "700", textAlign: "center" },
  header: { minHeight: 78, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 48, height: 48, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  headerEyebrow: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  headerTitle: { color: TEXT, fontSize: 23, fontWeight: "900", marginTop: 2 },
  secureBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  secureText: { color: SUCCESS, fontSize: 12, fontWeight: "900" },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 36, gap: 20 },
  syncWarning: { color: MUTED, fontSize: 12, fontWeight: "700", textAlign: "center" },
  heroCard: { height: 265, borderRadius: 26, overflow: "hidden", backgroundColor: TEXT, position: "relative" },
  heroImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(9,25,53,0.63)" },
  heroContent: { flex: 1, padding: 22, justifyContent: "flex-end" },
  statusPill: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 11, paddingVertical: 6, marginBottom: 10 },
  statusPillReady: { backgroundColor: "#daf7e8" },
  statusText: { color: "#ffffff", fontSize: 10, fontWeight: "900" },
  statusTextReady: { color: "#087443" },
  eventTitle: { color: "#ffffff", fontSize: 28, lineHeight: 32, fontWeight: "900" },
  ticketTier: { color: "rgba(255,255,255,0.78)", fontSize: 14, fontWeight: "800", marginTop: 5, marginBottom: 7 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  metaText: { flex: 1, color: MUTED, fontSize: 12, fontWeight: "800" },
  metaTextLight: { color: "rgba(255,255,255,0.88)" },
  liveCard: { borderRadius: 28, borderWidth: 1, borderColor: "#d9e1ff", backgroundColor: CARD, padding: 20, alignItems: "center", shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 9 }, elevation: 4 },
  liveHeader: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  sectionEyebrow: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  liveTitle: { color: TEXT, fontSize: 22, fontWeight: "900", marginTop: 3 },
  liveStatus: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: "#e8fff2", paddingHorizontal: 11, paddingVertical: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: SUCCESS },
  liveStatusText: { color: SUCCESS, fontSize: 10, fontWeight: "900" },
  qrShell: { padding: 15, borderRadius: 22, borderWidth: 1, borderColor: BORDER, backgroundColor: "#ffffff" },
  rotationRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 14 },
  rotationText: { color: ACCENT, fontSize: 12, fontWeight: "900" },
  manualBox: { width: "100%", marginTop: 18, borderRadius: 20, backgroundColor: "#f1f3ff", padding: 16, alignItems: "center" },
  manualLabel: { color: MUTED, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  manualCode: { color: TEXT, fontSize: 24, fontWeight: "900", letterSpacing: 1.4, marginTop: 6 },
  manualHint: { color: MUTED, fontSize: 11, fontWeight: "700", marginTop: 5, textAlign: "center" },
  qrLoadingBox: { minHeight: 255, width: "100%", borderRadius: 22, backgroundColor: "#f7f8fe", alignItems: "center", justifyContent: "center", padding: 24, gap: 9 },
  qrLoadingTitle: { color: TEXT, fontSize: 18, fontWeight: "900", textAlign: "center" },
  qrLoadingText: { color: MUTED, fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center" },
  refreshButton: { minHeight: 46, marginTop: 5, borderRadius: 16, backgroundColor: ACCENT, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  refreshButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  referenceBox: { width: "100%", marginTop: 18, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 14 },
  referenceLabel: { color: MUTED, fontSize: 9, fontWeight: "900", letterSpacing: 0.7, textAlign: "center" },
  referenceValue: { color: TEXT, fontSize: 14, fontWeight: "900", textAlign: "center", marginTop: 5 },
  detailsSection: { marginTop: 2 },
  sectionTitle: { color: TEXT, fontSize: 15, fontWeight: "900", letterSpacing: 0.5, marginBottom: 12 },
  detailsCard: { borderRadius: 22, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, overflow: "hidden" },
  detailRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 },
  detailBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  detailIcon: { width: 28, alignItems: "center" },
  detailLabel: { width: 92, color: MUTED, fontSize: 13, fontWeight: "800" },
  detailValue: { flex: 1, color: TEXT, fontSize: 13, fontWeight: "900", textAlign: "right" },
  actionsSection: { marginTop: 2 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionButton: { width: "48%", flexGrow: 1, minHeight: 72, borderRadius: 19, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center", gap: 7 },
  actionButtonText: { color: TEXT, fontSize: 12, fontWeight: "900" },
  securityNote: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 20, backgroundColor: "#eef1ff", padding: 15 },
  securityNoteText: { flex: 1, color: MUTED, fontSize: 12, lineHeight: 18, fontWeight: "700" },
});
