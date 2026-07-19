import React from "react";
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Headphones,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Ticket,
} from "lucide-react-native";
import { appendCachedMyTickets, getTicketOrderDetail, type TicketOrderDetail } from "@/lib/tickets";
import { useAuth } from "@/providers/AuthProvider";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as BG,
  EYA_BORDER as BORDER,
  EYA_CARD as CARD,
  EYA_GREEN as GREEN,
  EYA_MUTED as MUTED,
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

export default function PaymentProcessingScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const { session, user } = useAuth();
  const [secondsLeft, setSecondsLeft] = React.useState(5 * 60);
  const [detail, setDetail] = React.useState<TicketOrderDetail | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const secondsLeftRef = React.useRef(secondsLeft);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    secondsLeftRef.current = secondsLeft;
  }, [secondsLeft]);

  React.useEffect(() => {
    let active = true;
    const loadDetail = async () => {
      if (!orderId || !session?.access_token) return;
      try {
        const nextDetail = await getTicketOrderDetail(session.access_token, orderId);
        if (active) setDetail(nextDetail);
      } catch (loadError: any) {
        if (active) setError(loadError?.message || "Could not load ticket order.");
      }
    };
    void loadDetail();
    return () => {
      active = false;
    };
  }, [orderId, session?.access_token]);

  const checkPaymentStatus = React.useCallback(async () => {
    if (!orderId || !session?.access_token || checking) return;
    try {
      setChecking(true);
      setError(null);
      const nextDetail = await getTicketOrderDetail(session.access_token, orderId);
      setDetail(nextDetail);
      if (nextDetail.fulfilled && nextDetail.tickets?.length) {
        const issued = nextDetail.tickets;
        await appendCachedMyTickets(user?.id, issued).catch(() => undefined);
        const firstTicketId = issued[0]?.id || "";
        router.replace({ pathname: "/(student)/market/payment-success", params: { orderId, ticketId: firstTicketId } } as any);
      }
    } catch (verifyError: any) {
      setError(verifyError?.message || "Payment is still waiting for confirmation.");
    } finally {
      setChecking(false);
    }
  }, [checking, orderId, router, session?.access_token, user?.id]);

  React.useEffect(() => {
    if (!orderId || !session?.access_token) return undefined;
    const firstCheck = setTimeout(() => {
      if (secondsLeftRef.current > 0) void checkPaymentStatus();
    }, 3500);
    const interval = setInterval(() => {
      if (secondsLeftRef.current > 0) void checkPaymentStatus();
    }, 9000);
    return () => {
      clearTimeout(firstCheck);
      clearInterval(interval);
    };
  }, [checkPaymentStatus, orderId, session?.access_token]);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <Header />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <PaymentStepper />
          <ProcessingLoader />

          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>Payment Request Sent!</Text>
            <Text style={styles.statusSubtitle}>We've sent a payment request to your TNM Mpamba account.</Text>
            {checking ? <Text style={styles.checkingText}>Checking payment status...</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <WaitingNotice />
          <CountdownTimer secondsLeft={secondsLeft} />
          <EventOrderSummary detail={detail} />
          <InstructionCard />
          <HelpCard />
          <SecurityBanner />
          <CancelPaymentButton />
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
      <Text style={styles.headerTitle} numberOfLines={1}>Payment Processing</Text>
      <View style={styles.secureBadge}>
        <ShieldCheck size={23} color={GREEN} strokeWidth={2.2} />
        <Text style={styles.secureText} numberOfLines={1}>100% Secure</Text>
      </View>
    </View>
  );
}

function PaymentStepper() {
  return (
    <View style={styles.stepper}>
      <View style={styles.stepperTrack}>
        <StepperPoint label="Details" state="done" value="1" />
        <View style={[styles.stepLine, styles.stepLineActive]} />
        <StepperPoint label="Payment" state="done" value="2" />
        <View style={[styles.stepLine, styles.stepLineActive]} />
        <StepperPoint label="Confirmation" state="active" value="3" />
      </View>
    </View>
  );
}

function StepperPoint({ label, state, value }: { label: string; state: "done" | "active"; value: string }) {
  return (
    <View style={styles.stepPoint}>
      <View style={styles.stepCircle}>
        {state === "done" ? <Check size={21} color="#FFFFFF" strokeWidth={3} /> : <Text style={styles.stepNumber}>{value}</Text>}
      </View>
      <Text style={[styles.stepLabel, state === "active" && styles.stepLabelActive]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ProcessingLoader() {
  const pulse = React.useRef(new Animated.Value(0)).current;
  const spin = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    const spinAnimation = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 2200, useNativeDriver: true }));
    pulseAnimation.start();
    spinAnimation.start();
    return () => {
      pulseAnimation.stop();
      spinAnimation.stop();
    };
  }, [pulse, spin]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.04] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.loaderWrap}>
      <Animated.View style={[styles.loaderGlowLarge, { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
      <Animated.View style={[styles.loaderGlowSmall, { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
      <Animated.View style={[styles.loaderRing, { transform: [{ rotate }] }]}>
        <View style={styles.loaderDot} />
      </Animated.View>
      <View style={styles.loaderCenter}>
        <Smartphone size={82} color={ACCENT} strokeWidth={2.2} />
        <View style={styles.messageBubble}>
          <MessageCircle size={28} color="#FFFFFF" fill={ACCENT} strokeWidth={2.3} />
        </View>
      </View>
    </View>
  );
}

function WaitingNotice() {
  return (
    <View style={styles.waitingCard}>
      <View style={styles.waitingIconCircle}>
        <Clock size={29} color={ACCENT} strokeWidth={2.4} />
      </View>
      <View style={styles.waitingCopy}>
        <Text style={styles.waitingTitle}>Waiting for your approval</Text>
        <Text style={styles.waitingText}>Please approve the payment request on your phone to complete your purchase.</Text>
      </View>
    </View>
  );
}

function CountdownTimer({ secondsLeft }: { secondsLeft: number }) {
  return (
    <View style={styles.countdownRow}>
      <Text style={styles.countdownLabel}>Request expires in</Text>
      <View style={styles.countdownBadge}>
        <Clock size={17} color={ACCENT} strokeWidth={2.4} />
        <Text style={styles.countdownText}>{formatTime(secondsLeft)}</Text>
      </View>
    </View>
  );
}

function EventOrderSummary({ detail }: { detail: TicketOrderDetail | null }) {
  const event = detail?.event as any;
  const tier = detail?.tier as any;
  const order = detail?.order;
  const quantity = Number(order?.quantity || 1);
  const unitPrice = Number(tier?.price_mwk || order?.unit_price_mwk || 0);
  const total = Number(order?.total_mwk || unitPrice * quantity);

  return (
    <View style={styles.orderCard}>
      <View style={styles.eventSummary}>
        <Image source={{ uri: eventImageUrl(event) }} style={styles.eventImage} />
        <View style={styles.eventCopy}>
          <Text style={styles.eventTitle} numberOfLines={2}>{uppercase(event?.title || "Ticket order")}</Text>
          <EventMetaRow Icon={Calendar} text={eventDateLabel(event)} />
          <EventMetaRow Icon={Clock} text={eventTimeLabel(event)} />
          <EventMetaRow Icon={MapPin} text={eventLocation(event)} />
          <View style={styles.eventBadge}>
            <Text style={styles.eventBadgeText}>{uppercase(event?.category || "EYA")}</Text>
          </View>
        </View>
      </View>

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
          <Text style={styles.ticketTotalValue}>{money(total)}</Text>
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

function InstructionCard() {
  return (
    <View style={styles.instructionCard}>
      <View style={styles.instructionIconCircle}>
        <ShieldCheck size={45} color="#3F5FAE" strokeWidth={2.1} />
      </View>
      <View style={styles.instructionCopy}>
        <Text style={styles.instructionTitle}>Check your phone</Text>
        <Text style={styles.instructionText}>You will receive a prompt on your phone. Approve the payment to confirm your tickets.</Text>
      </View>
    </View>
  );
}

function HelpCard() {
  return (
    <Pressable style={({ pressed }) => [styles.helpCard, pressed && styles.pressed]}>
      <View style={styles.helpIconCircle}>
        <Headphones size={29} color={MUTED} strokeWidth={2.2} />
      </View>
      <View style={styles.helpCopy}>
        <Text style={styles.helpTitle}>Need help?</Text>
        <Text style={styles.helpSubtitle}>Contact our support team</Text>
      </View>
      <ChevronRight size={28} color={MUTED} strokeWidth={2.4} />
    </Pressable>
  );
}

function SecurityBanner() {
  return (
    <View style={styles.securityBanner}>
      <ShieldCheck size={24} color={GREEN} strokeWidth={2.2} />
      <Text style={styles.securityBannerText}>Your payment is protected and encrypted</Text>
    </View>
  );
}

function CancelPaymentButton() {
  const router = useRouter();

  return (
    <View style={styles.cancelCard}>
      <Pressable style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]} onPress={() => router.replace("/(student)/market/tickets" as any)}>
        <Text style={styles.cancelButtonText}>CANCEL PAYMENT</Text>
      </Pressable>
    </View>
  );
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  header: { minHeight: 84, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 54, height: 54, borderRadius: 17, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  headerTitle: { flex: 1, color: TEXT, fontSize: 20, fontWeight: "900", textAlign: "center", letterSpacing: 0 },
  secureBadge: { minWidth: 104, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 },
  secureText: { color: GREEN, fontSize: 13, fontWeight: "900" },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 28 },
  stepper: { paddingTop: 20, paddingBottom: 20 },
  stepperTrack: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center" },
  stepPoint: { width: 94, alignItems: "center" },
  stepCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  stepNumber: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  stepLabel: { color: TEXT, fontSize: 13, fontWeight: "800", marginTop: 10 },
  stepLabelActive: { fontWeight: "900" },
  stepLine: { width: 58, height: 2, backgroundColor: "#D1D5DB", marginTop: 20 },
  stepLineActive: { backgroundColor: ACCENT },
  loaderWrap: { width: 250, height: 250, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 8 },
  loaderGlowLarge: { position: "absolute", width: 230, height: 230, borderRadius: 115, backgroundColor: ACCENT },
  loaderGlowSmall: { position: "absolute", width: 168, height: 168, borderRadius: 84, backgroundColor: ACCENT },
  loaderRing: { position: "absolute", width: 172, height: 172, borderRadius: 86, borderWidth: 3, borderColor: "rgba(94,115,221,0.18)", borderRightColor: ACCENT, borderBottomColor: ACCENT },
  loaderDot: { position: "absolute", right: 15, bottom: 22, width: 13, height: 13, borderRadius: 7, backgroundColor: ACCENT, shadowColor: ACCENT, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  loaderCenter: { width: 126, height: 126, borderRadius: 63, backgroundColor: CARD, alignItems: "center", justifyContent: "center", shadowColor: "#13285f", shadowOpacity: 0.07, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  messageBubble: { position: "absolute", width: 41, height: 41, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  statusCopy: { alignItems: "center", marginTop: 8, marginBottom: 26, paddingHorizontal: 20 },
  statusTitle: { color: TEXT, fontSize: 28, lineHeight: 34, fontWeight: "900", textAlign: "center" },
  statusSubtitle: { color: MUTED, fontSize: 16, lineHeight: 25, fontWeight: "600", textAlign: "center", marginTop: 14, maxWidth: 320 },
  checkingText: { color: ACCENT, fontSize: 13, fontWeight: "900", marginTop: 10 },
  errorText: { color: MUTED, fontSize: 13, fontWeight: "700", marginTop: 10, textAlign: "center" },
  waitingCard: { maxWidth: 540, alignSelf: "center", borderRadius: 17, borderWidth: 1, borderColor: "#d9e5fb", backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", gap: 18, paddingHorizontal: 20, paddingVertical: 18 },
  waitingIconCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: CARD, alignItems: "center", justifyContent: "center" },
  waitingCopy: { flex: 1, minWidth: 0 },
  waitingTitle: { color: TEXT, fontSize: 17, fontWeight: "900", marginBottom: 7 },
  waitingText: { color: MUTED, fontSize: 14, lineHeight: 21, fontWeight: "600" },
  countdownRow: { marginTop: 22, marginBottom: 26, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 13 },
  countdownLabel: { color: MUTED, fontSize: 15, fontWeight: "700" },
  countdownBadge: { minHeight: 36, borderRadius: 18, backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13 },
  countdownText: { color: ACCENT, fontSize: 15, fontWeight: "900" },
  orderCard: { borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 16, shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
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
  instructionCard: { marginTop: 22, borderRadius: 20, borderWidth: 1, borderColor: "#D8E3FF", backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", gap: 18, padding: 20 },
  instructionIconCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: "#d9e5fb", alignItems: "center", justifyContent: "center", backgroundColor: "#f7f8fe" },
  instructionCopy: { flex: 1, minWidth: 0 },
  instructionTitle: { color: TEXT, fontSize: 18, fontWeight: "900", marginBottom: 8 },
  instructionText: { color: MUTED, fontSize: 15, lineHeight: 23, fontWeight: "600" },
  helpCard: { minHeight: 94, marginTop: 18, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, flexDirection: "row", alignItems: "center", gap: 15, padding: 18 },
  helpIconCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#f7f8fe", alignItems: "center", justifyContent: "center" },
  helpCopy: { flex: 1, minWidth: 0 },
  helpTitle: { color: TEXT, fontSize: 16, fontWeight: "900", marginBottom: 6 },
  helpSubtitle: { color: MUTED, fontSize: 14, fontWeight: "600" },
  securityBanner: { minHeight: 58, borderRadius: 16, backgroundColor: "#eaf8f0", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 18, paddingHorizontal: 18 },
  securityBannerText: { color: GREEN, fontSize: 15, fontWeight: "800" },
  cancelCard: { marginTop: 14, borderRadius: 23, backgroundColor: CARD, padding: 16, shadowColor: "#13285f", shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  cancelButton: { minHeight: 58, borderRadius: 14, borderWidth: 2, borderColor: ACCENT, alignItems: "center", justifyContent: "center" },
  cancelButtonText: { color: ACCENT, fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  pressed: { opacity: 0.72 },
});
