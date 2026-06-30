import React from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Home,
  Mail,
  MapPin,
  Share2,
  ShieldCheck,
  Ticket,
} from "lucide-react-native";
import { getTicketOrderDetail, type IssuedTicket, type TicketOrderDetail } from "@/lib/tickets";
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
  money,
  uppercase,
} from "@/components/market/ticketingUi";

const BLUE = ACCENT;

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}>;

type QuickAction = {
  id: string;
  title: string;
  subtitle: string;
  Icon: IconComponent;
};

const quickActions: QuickAction[] = [
  { id: "download", title: "Download", subtitle: "Save Ticket", Icon: Download },
  { id: "send", title: "Send Ticket", subtitle: "Email or SMS", Icon: Mail },
  { id: "calendar", title: "Add to Calendar", subtitle: "Save Event", Icon: Calendar },
  { id: "share", title: "Share Event", subtitle: "Invite Friends", Icon: Share2 },
];

export default function PaymentSuccessScreen() {
  const { orderId, ticketId } = useLocalSearchParams<{ orderId?: string; ticketId?: string }>();
  const { session, user } = useAuth();
  const [detail, setDetail] = React.useState<TicketOrderDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const loadDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!orderId || !session?.access_token) throw new Error("Ticket order could not be loaded.");
        const nextDetail = await getTicketOrderDetail(session.access_token, orderId);
        if (active) setDetail(nextDetail);
      } catch (loadError: any) {
        if (active) setError(loadError?.message || "Could not load confirmed ticket.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDetail();
    return () => {
      active = false;
    };
  }, [orderId, session?.access_token]);

  const ticket = React.useMemo(() => {
    return detail?.tickets.find((item) => item.id === ticketId) ?? detail?.tickets[0] ?? null;
  }, [detail?.tickets, ticketId]);

  if (loading) {
    return (
      <View style={styles.centeredRoot}>
        <ActivityIndicator color={ACCENT} />
        <Text style={styles.stateText}>Loading confirmed ticket...</Text>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.centeredRoot}>
        <Ticket size={34} color={ACCENT} strokeWidth={2.2} />
        <Text style={styles.stateTitle}>Ticket unavailable</Text>
        <Text style={styles.stateText}>{error || "We could not load this ticket order."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <Header />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <SuccessStepper />
          <SuccessHero />
          <EmailNotice email={user?.email || "your email"} />
          <OrderDetailsCard detail={detail} />
          {ticket ? <TicketPreviewCard detail={detail} ticket={ticket} /> : null}
          <QuickActionsGrid />
          <ImportantNote />
          <BackHomeButton />
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
      <Text style={styles.headerTitle} numberOfLines={1}>Payment Successful</Text>
      <View style={styles.secureBadge}>
        <ShieldCheck size={23} color={GREEN} strokeWidth={2.2} />
        <Text style={styles.secureText} numberOfLines={1}>100% Secure</Text>
      </View>
    </View>
  );
}

function SuccessStepper() {
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperTrack}>
        <StepperPoint label="Details" />
        <View style={[styles.stepLine, styles.stepLineActive]} />
        <StepperPoint label="Payment" />
        <View style={[styles.stepLine, styles.stepLineActive]} />
        <StepperPoint label="Confirmation" emphasized />
      </View>
    </View>
  );
}

function StepperPoint({ emphasized, label }: { emphasized?: boolean; label: string }) {
  return (
    <View style={styles.stepPoint}>
      <View style={styles.stepCircle}>
        <Check size={21} color="#FFFFFF" strokeWidth={3} />
      </View>
      <Text style={[styles.stepLabel, emphasized && styles.stepLabelActive]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function SuccessHero() {
  return (
    <View style={styles.successHero}>
      <View style={styles.confettiWrap}>
        <Confetti style={[styles.confettiOne, { backgroundColor: ACCENT }]} />
        <Confetti style={[styles.confettiTwo, { backgroundColor: "#8B5CF6" }]} />
        <Confetti style={[styles.confettiThree, { backgroundColor: SUCCESS }]} />
        <Confetti style={[styles.confettiFour, { backgroundColor: "#EF5B2A" }]} />
        <Confetti style={[styles.confettiFive, { backgroundColor: "#3B82F6" }]} />
        <Confetti style={[styles.confettiSix, { backgroundColor: "#EF6072" }]} />
        <View style={styles.successRingOuter}>
          <View style={styles.successRingMiddle}>
            <View style={styles.successRingInner}>
              <View style={styles.successIconCircle}>
                <Check size={48} color="#FFFFFF" strokeWidth={3.2} />
              </View>
            </View>
          </View>
        </View>
      </View>
      <Text style={styles.successTitle}>Payment Successful!</Text>
      <Text style={styles.successSubtitle}>Your payment has been received and your tickets are confirmed.</Text>
    </View>
  );
}

function Confetti({ style }: { style: object }) {
  return <View style={[styles.confetti, style]} />;
}

function EmailNotice({ email }: { email: string }) {
  return (
    <View style={styles.emailNotice}>
      <View style={styles.emailIconCircle}>
        <Ticket size={30} color={SUCCESS} strokeWidth={2.2} />
      </View>
      <Text style={styles.emailText}>
        Your tickets have been sent to your email <Text style={styles.emailHighlight}>{email}</Text> and are ready to use.
      </Text>
    </View>
  );
}

function OrderDetailsCard({ detail }: { detail: TicketOrderDetail }) {
  return (
    <View style={styles.orderCard}>
      <View style={styles.orderHeader}>
        <Text style={styles.orderHeaderTitle}>ORDER DETAILS</Text>
        <Pressable style={({ pressed }) => [styles.orderIdWrap, pressed && styles.pressed]}>
          <Text style={styles.orderId} numberOfLines={1}>Order ID: {detail.order.id}</Text>
          <Copy size={18} color={ACCENT} strokeWidth={2.3} />
        </Pressable>
      </View>

      <EventSummary detail={detail} />
      <TicketSummaryRow detail={detail} />
    </View>
  );
}

function EventSummary({ detail }: { detail: TicketOrderDetail }) {
  const event = detail.event as any;
  return (
    <View style={styles.eventSummary}>
      <Image source={{ uri: eventImageUrl(event) }} style={styles.eventImage} />
      <View style={styles.eventCopy}>
        <Text style={styles.eventTitle} numberOfLines={2}>{uppercase(event?.title || "Ticket event")}</Text>
        <EventMetaRow Icon={Calendar} text={eventDateLabel(event)} />
        <EventMetaRow Icon={Clock} text={eventTimeLabel(event)} />
        <EventMetaRow Icon={MapPin} text={eventLocation(event)} />
        <View style={styles.eventBadge}>
          <Text style={styles.eventBadgeText}>{uppercase(event?.category || "EYA")}</Text>
        </View>
      </View>
    </View>
  );
}

function EventMetaRow({ Icon, text }: { Icon: IconComponent; text: string }) {
  return (
    <View style={styles.eventMetaRow}>
      <Icon size={18} color={MUTED} strokeWidth={2.1} />
      <Text style={styles.eventMetaText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function TicketSummaryRow({ detail }: { detail: TicketOrderDetail }) {
  const tier = detail.tier as any;
  const quantity = Number(detail.order.quantity || 1);
  const unitPrice = Number(tier?.price_mwk || detail.order.unit_price_mwk || 0);

  return (
    <View style={styles.ticketSummary}>
      <View style={styles.ticketIconBox}>
        <Ticket size={34} color={ACCENT} strokeWidth={2.2} />
      </View>
      <View style={styles.ticketSummaryCopy}>
        <Text style={styles.ticketSummaryTitle}>{String(tier?.name || "Ticket")}</Text>
        <Text style={styles.ticketSummaryMeta}>{money(unitPrice)} x {quantity}</Text>
      </View>
      <View style={styles.ticketTotal}>
        <Text style={styles.ticketTotalLabel}>Total Amount</Text>
        <Text style={styles.ticketTotalValue}>{money(detail.order.total_mwk)}</Text>
      </View>
    </View>
  );
}

function TicketPreviewCard({ detail, ticket }: { detail: TicketOrderDetail; ticket: IssuedTicket }) {
  const router = useRouter();
  const event = detail.event as any;
  const tier = detail.tier as any;

  return (
    <View style={styles.ticketPreviewSection}>
      <View style={styles.ticketPreviewHeader}>
        <Text style={styles.ticketPreviewTitle}>YOUR TICKET</Text>
        <Pressable style={({ pressed }) => [styles.viewTicketsLink, pressed && styles.pressed]} onPress={() => router.push("/(student)/market/my-tickets" as any)}>
          <Text style={styles.viewTicketsText}>View All Tickets</Text>
          <ChevronRight size={20} color={ACCENT} strokeWidth={2.4} />
        </Pressable>
      </View>

      <View style={styles.ticketPreviewCard}>
        <View style={styles.ticketBrandStrip}>
          <Text style={styles.ticketBrandText}>EYA</Text>
        </View>
        <View style={styles.ticketMain}>
          <Text style={styles.ticketEventTitle} numberOfLines={1}>{uppercase(event?.title || "Ticket event")}</Text>
          <Text style={styles.ticketClass}>{String(tier?.name || "Ticket")}</Text>
          <TicketMeta Icon={Calendar} text={eventDateLabel(event)} />
          <TicketMeta Icon={Clock} text={eventTimeLabel(event)} />
          <TicketMeta Icon={MapPin} text={eventLocation(event)} />
        </View>
        <View style={styles.ticketDash} />
        <View style={styles.qrSide}>
          {ticket.qr_data_url ? <Image source={{ uri: ticket.qr_data_url }} style={styles.qrImage} /> : <QRCodeUnavailable />}
          <Text style={styles.ticketIdLabel}>Ticket ID</Text>
          <Text style={styles.ticketIdValue}>{ticket.ticket_code}</Text>
        </View>
      </View>
    </View>
  );
}

function TicketMeta({ Icon, text }: { Icon: IconComponent; text: string }) {
  return (
    <View style={styles.ticketMetaRow}>
      <Icon size={14} color={MUTED} strokeWidth={2} />
      <Text style={styles.ticketMetaText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function QRCodeUnavailable() {
  return (
    <View style={styles.qrUnavailable}>
      <Text style={styles.qrUnavailableText}>QR unavailable</Text>
    </View>
  );
}

function QuickActionsGrid() {
  return (
    <View style={styles.quickGrid}>
      {quickActions.map(({ Icon, id, subtitle, title }) => (
        <Pressable key={id} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
          <Icon size={30} color={ACCENT} strokeWidth={2.2} />
          <Text style={styles.quickTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.quickSubtitle} numberOfLines={1}>{subtitle}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ImportantNote() {
  return (
    <Pressable style={({ pressed }) => [styles.importantCard, pressed && styles.pressed]}>
      <View style={styles.importantIconCircle}>
        <ShieldCheck size={43} color={BLUE} strokeWidth={2.1} />
      </View>
      <View style={styles.importantCopy}>
        <Text style={styles.importantTitle}>Important</Text>
        <Text style={styles.importantText}>Show your QR code at the event entrance. Each ticket is valid for one entry only.</Text>
      </View>
      <ChevronRight size={26} color={MUTED} strokeWidth={2.3} />
    </Pressable>
  );
}

function BackHomeButton() {
  const router = useRouter();

  return (
    <Pressable style={({ pressed }) => [styles.backHomeButton, pressed && styles.pressed]} onPress={() => router.replace("/(student)/market/tickets" as any)}>
      <Home size={25} color={TEXT} strokeWidth={2.4} />
      <Text style={styles.backHomeText}>BACK TO HOME</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  centeredRoot: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  stateTitle: { color: TEXT, fontSize: 19, fontWeight: "900", textAlign: "center" },
  stateText: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" },
  header: { minHeight: 84, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 54, height: 54, borderRadius: 17, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  headerTitle: { flex: 1, color: TEXT, fontSize: 20, fontWeight: "900", textAlign: "center", letterSpacing: 0 },
  secureBadge: { minWidth: 104, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 },
  secureText: { color: GREEN, fontSize: 13, fontWeight: "900" },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 28 },
  stepper: { paddingTop: 20, paddingBottom: 24 },
  stepperTrack: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center" },
  stepPoint: { width: 94, alignItems: "center" },
  stepCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  stepLabel: { color: TEXT, fontSize: 13, fontWeight: "800", marginTop: 10 },
  stepLabelActive: { fontWeight: "900" },
  stepLine: { width: 58, height: 2, backgroundColor: "#D1D5DB", marginTop: 20 },
  stepLineActive: { backgroundColor: ACCENT },
  successHero: { alignItems: "center", paddingTop: 8, paddingBottom: 24 },
  confettiWrap: { width: 260, height: 208, alignItems: "center", justifyContent: "center" },
  confetti: { position: "absolute", width: 9, height: 15, borderRadius: 2 },
  confettiOne: { left: 32, top: 66, transform: [{ rotate: "-22deg" }] },
  confettiTwo: { left: 86, top: 28, transform: [{ rotate: "18deg" }] },
  confettiThree: { right: 72, top: 12, transform: [{ rotate: "-18deg" }] },
  confettiFour: { right: 36, top: 76, transform: [{ rotate: "24deg" }] },
  confettiFive: { left: 70, bottom: 42, transform: [{ rotate: "21deg" }] },
  confettiSix: { right: 74, bottom: 36, transform: [{ rotate: "-16deg" }] },
  successRingOuter: { width: 170, height: 170, borderRadius: 85, backgroundColor: "rgba(34,164,71,0.08)", alignItems: "center", justifyContent: "center" },
  successRingMiddle: { width: 128, height: 128, borderRadius: 64, backgroundColor: "rgba(34,164,71,0.12)", alignItems: "center", justifyContent: "center" },
  successRingInner: { width: 96, height: 96, borderRadius: 48, backgroundColor: CARD, alignItems: "center", justifyContent: "center" },
  successIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: SUCCESS, alignItems: "center", justifyContent: "center", shadowColor: SUCCESS, shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  successTitle: { color: TEXT, fontSize: 28, fontWeight: "900", textAlign: "center" },
  successSubtitle: { color: MUTED, fontSize: 16, lineHeight: 25, fontWeight: "600", textAlign: "center", maxWidth: 320, marginTop: 12 },
  emailNotice: { maxWidth: 560, alignSelf: "center", borderRadius: 17, borderWidth: 1, borderColor: "#cfe8d8", backgroundColor: "#eaf8f0", flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 16, marginBottom: 18 },
  emailIconCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#d8f0df", alignItems: "center", justifyContent: "center" },
  emailText: { flex: 1, color: MUTED, fontSize: 15, lineHeight: 23, fontWeight: "700" },
  emailHighlight: { color: GREEN, fontWeight: "900" },
  orderCard: { borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 16, shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  orderHeader: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  orderHeaderTitle: { color: TEXT, fontSize: 14, fontWeight: "900", letterSpacing: 0.9 },
  orderIdWrap: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  orderId: { flexShrink: 1, color: MUTED, fontSize: 13, fontWeight: "700" },
  eventSummary: { flexDirection: "row", gap: 16 },
  eventImage: { width: 120, height: 150, borderRadius: 17, backgroundColor: BORDER },
  eventCopy: { flex: 1, minWidth: 0, justifyContent: "center" },
  eventTitle: { color: TEXT, fontSize: 23, lineHeight: 28, fontWeight: "900", letterSpacing: 0, marginBottom: 12 },
  eventMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  eventMetaText: { flex: 1, color: MUTED, fontSize: 13, fontWeight: "800" },
  eventBadge: { alignSelf: "flex-start", minHeight: 31, borderRadius: 16, paddingHorizontal: 14, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", marginTop: 4 },
  eventBadgeText: { color: BLUE, fontSize: 13, fontWeight: "900", letterSpacing: 0.8 },
  ticketSummary: { marginTop: 24, borderRadius: 17, backgroundColor: "#f7f8fe", borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  ticketIconBox: { width: 66, height: 66, borderRadius: 15, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  ticketSummaryCopy: { flex: 1, minWidth: 0 },
  ticketSummaryTitle: { color: TEXT, fontSize: 17, fontWeight: "900" },
  ticketSummaryMeta: { color: MUTED, fontSize: 14, fontWeight: "700", marginTop: 9 },
  ticketTotal: { alignItems: "flex-end", minWidth: 112 },
  ticketTotalLabel: { color: MUTED, fontSize: 13, fontWeight: "700", marginBottom: 7 },
  ticketTotalValue: { color: TEXT, fontSize: 23, fontWeight: "900" },
  ticketPreviewSection: { marginTop: 18, borderRadius: 22, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 16 },
  ticketPreviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  ticketPreviewTitle: { color: TEXT, fontSize: 14, fontWeight: "900", letterSpacing: 0.9 },
  viewTicketsLink: { flexDirection: "row", alignItems: "center", gap: 3 },
  viewTicketsText: { color: ACCENT, fontSize: 13, fontWeight: "900" },
  ticketPreviewCard: { minHeight: 168, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: "#f7f8fe", flexDirection: "row", overflow: "hidden" },
  ticketBrandStrip: { width: 78, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  ticketBrandText: { color: "#FFFFFF", fontSize: 21, fontWeight: "900", fontStyle: "italic" },
  ticketMain: { flex: 1, minWidth: 0, padding: 16, justifyContent: "center" },
  ticketEventTitle: { color: TEXT, fontSize: 18, fontWeight: "900", marginBottom: 6 },
  ticketClass: { color: TEXT, fontSize: 13, fontWeight: "800", marginBottom: 9 },
  ticketMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  ticketMetaText: { flex: 1, color: MUTED, fontSize: 11, fontWeight: "700" },
  ticketDash: { width: 1, borderLeftWidth: 1, borderStyle: "dashed", borderColor: "#C9C9C9" },
  qrSide: { width: 126, alignItems: "center", justifyContent: "center", padding: 10 },
  qrImage: { width: 86, height: 86, borderRadius: 8, backgroundColor: "#FFFFFF" },
  qrUnavailable: { width: 86, height: 86, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", padding: 8 },
  qrUnavailableText: { color: MUTED, fontSize: 10, fontWeight: "800", textAlign: "center" },
  ticketIdLabel: { color: MUTED, fontSize: 12, fontWeight: "700", marginTop: 9 },
  ticketIdValue: { color: TEXT, fontSize: 12, fontWeight: "900", marginTop: 2 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 18 },
  quickCard: { flexGrow: 1, flexBasis: "47%", minHeight: 118, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center", padding: 14, shadowColor: "#13285f", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  quickTitle: { color: TEXT, fontSize: 14, fontWeight: "900", marginTop: 12 },
  quickSubtitle: { color: MUTED, fontSize: 12, fontWeight: "600", marginTop: 6 },
  importantCard: { marginTop: 18, borderRadius: 20, borderWidth: 1, borderColor: "#D8E3FF", backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", gap: 16, padding: 18 },
  importantIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#dfe6ff", alignItems: "center", justifyContent: "center" },
  importantCopy: { flex: 1, minWidth: 0 },
  importantTitle: { color: TEXT, fontSize: 17, fontWeight: "900", marginBottom: 6 },
  importantText: { color: MUTED, fontSize: 14, lineHeight: 21, fontWeight: "600" },
  backHomeButton: { minHeight: 68, borderRadius: 17, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 22 },
  backHomeText: { color: TEXT, fontSize: 17, fontWeight: "900", letterSpacing: 2 },
  pressed: { opacity: 0.72 },
});
