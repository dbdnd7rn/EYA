import React from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Calendar,
  Check,
  CircleCheck as CheckCircle,
  ChevronDown,
  Clock,
  Lock,
  MapPin,
  Phone,
  ShieldCheck,
  Smartphone,
  Ticket,
} from "lucide-react-native";
import { createTicketOrderPayment, listTicketEvents, type TicketEvent, type TicketTier } from "@/lib/tickets";
import PaymentBrandLogo from "@/components/payment/PaymentBrandLogo";
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

type HowStep = {
  id: string;
  Icon: IconComponent;
  title: string;
  subtitle: string;
};

type MobileProvider = "mpamba" | "airtel_money";

const mobileProviders: {
  id: MobileProvider;
  label: string;
  shortLabel: string;
  helper: string;
  noticeTitle: string;
  noticeText: string;
  placeholder: string;
}[] = [
  {
    id: "mpamba",
    label: "TNM Mpamba",
    shortLabel: "TNM",
    helper: "Enter the TNM Mpamba number registered on your account",
    noticeTitle: "Using TNM Mpamba",
    noticeText: "You will receive a TNM Mpamba prompt on your phone to approve this ticket payment.",
    placeholder: "999 123 456",
  },
  {
    id: "airtel_money",
    label: "Airtel Money",
    shortLabel: "Airtel",
    helper: "Enter the Airtel Money number registered on your account",
    noticeTitle: "Using Airtel Money",
    noticeText: "You will receive an Airtel Money prompt on your phone to approve this ticket payment.",
    placeholder: "999 123 456",
  },
];

function getHowSteps(providerLabel: string): HowStep[] {
  return [
    { id: "number", Icon: Phone, title: "1. Enter Number", subtitle: `Enter your ${providerLabel} number above` },
    { id: "confirm", Icon: Smartphone, title: "2. Confirm Payment", subtitle: "You'll receive a prompt on your phone" },
    { id: "complete", Icon: CheckCircle, title: "3. Payment Complete", subtitle: "Your tickets will be confirmed instantly" },
  ];
}

export default function MobileMoneyPaymentScreen() {
  const router = useRouter();
  const { eventId, quantity: quantityParam, tierId } = useLocalSearchParams<{ eventId?: string; tierId?: string; quantity?: string }>();
  const { session } = useAuth();
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [event, setEvent] = React.useState<TicketEvent | null>(null);
  const [tier, setTier] = React.useState<TicketTier | null>(null);
  const [paymentMethod, setPaymentMethod] = React.useState<MobileProvider>("mpamba");
  const [loading, setLoading] = React.useState(true);
  const [startingPayment, setStartingPayment] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const quantity = Math.max(1, Math.min(10, Number(quantityParam || 1) || 1));
  const total = Number(tier?.priceMwk || 0) * quantity;
  const phoneDigits = phoneNumber.replace(/\D/g, "");
  const phoneValid = phoneDigits.length >= 8;
  const activeProvider = mobileProviders.find((provider) => provider.id === paymentMethod) ?? mobileProviders[0];

  React.useEffect(() => {
    let active = true;
    const loadOrderContext = async () => {
      setLoading(true);
      setError(null);
      try {
        const events = await listTicketEvents();
        const selectedEvent = events.find((item) => item.id === eventId) ?? null;
        const selectedTier = selectedEvent?.tiers.find((item) => item.id === tierId) ?? null;
        if (!selectedEvent || !selectedTier) throw new Error("Ticket selection could not be found.");
        if (active) {
          setEvent(selectedEvent);
          setTier(selectedTier);
        }
      } catch (loadError: any) {
        if (active) setError(loadError?.message || "Could not load ticket order.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadOrderContext();
    return () => {
      active = false;
    };
  }, [eventId, tierId]);

  const handlePhoneChange = React.useCallback((value: string) => {
    setPhoneNumber(formatPhone(value.replace(/\D/g, "").slice(0, 9)));
  }, []);

  const handlePay = React.useCallback(async () => {
    if (!event || !tier) return;
    if (!session?.access_token) {
      Alert.alert("Login required", "Please log in again before buying tickets.");
      return;
    }
    if (!phoneValid) {
      Alert.alert("Phone required", "Enter the mobile money number that will approve this payment.");
      return;
    }

    try {
      setStartingPayment(true);
      const payment = await createTicketOrderPayment(session.access_token, {
        eventId: event.id,
        tierId: tier.id,
        quantity,
        paymentMethod,
        phone: `+265${phoneDigits}`,
      });
      router.push({
        pathname: "/(student)/market/payment-processing",
        params: {
          orderId: payment.order.id,
          txRef: payment.txRef,
          eventId: event.id,
          tierId: tier.id,
          quantity: String(quantity),
        },
      } as any);
    } catch (paymentError: any) {
      Alert.alert("Payment failed", paymentError?.message || "Could not start this ticket payment.");
    } finally {
      setStartingPayment(false);
    }
  }, [event, paymentMethod, phoneDigits, phoneValid, quantity, router, session?.access_token, tier]);

  if (loading) {
    return (
      <View style={styles.centeredRoot}>
        <ActivityIndicator color={ACCENT} />
        <Text style={styles.stateText}>Preparing payment...</Text>
      </View>
    );
  }

  if (error || !event || !tier) {
    return (
      <View style={styles.centeredRoot}>
        <Ticket size={34} color={ACCENT} strokeWidth={2.2} />
        <Text style={styles.stateTitle}>Payment unavailable</Text>
        <Text style={styles.stateText}>{error || "Select tickets before paying."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <Header />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <PaymentStepper />
          <EventOrderCard event={event} quantity={quantity} tier={tier} total={total} />

          <Text style={styles.sectionLabel}>PAY WITH</Text>
          <PaymentMethodCard activeMethod={paymentMethod} onChange={setPaymentMethod} />

          <Text style={styles.sectionLabel}>ENTER YOUR {activeProvider.shortLabel.toUpperCase()} NUMBER</Text>
          <PhoneNumberInput
            helper={activeProvider.helper}
            onChangeText={handlePhoneChange}
            placeholder={activeProvider.placeholder}
            value={phoneNumber}
          />

          <View style={styles.infoNotice}>
            <PaymentBrandLogo brand={paymentMethod} size={42} active />
            <View style={styles.infoNoticeCopy}>
              <Text style={styles.infoNoticeTitle}>{activeProvider.noticeTitle}</Text>
              <Text style={styles.infoNoticeText}>{activeProvider.noticeText}</Text>
            </View>
          </View>

          <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
          <HowItWorks providerLabel={activeProvider.label} />
          <SecurityBanner />
        </ScrollView>
      </SafeAreaView>

      <StickyPayBar enabled={phoneValid && !startingPayment} loading={startingPayment} onPay={handlePay} total={total} />
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
      <Text style={styles.headerTitle} numberOfLines={1}>Mobile Money Payment</Text>
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
        <StepperPoint label="Payment" state="active" value="2" />
        <View style={styles.stepLine} />
        <StepperPoint label="Confirmation" state="idle" value="3" />
      </View>
    </View>
  );
}

function StepperPoint({ label, state, value }: { label: string; state: "done" | "active" | "idle"; value: string }) {
  const active = state !== "idle";
  return (
    <View style={styles.stepPoint}>
      <View style={[styles.stepCircle, active ? styles.stepCircleActive : styles.stepCircleIdle]}>
        {state === "done" ? <Check size={21} color="#FFFFFF" strokeWidth={3} /> : <Text style={[styles.stepNumber, active ? styles.stepNumberActive : styles.stepNumberIdle]}>{value}</Text>}
      </View>
      <Text style={[styles.stepLabel, state === "active" && styles.stepLabelActive]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function EventOrderCard({ event, quantity, tier, total }: { event: TicketEvent; quantity: number; tier: TicketTier; total: number }) {
  return (
    <View style={styles.orderCard}>
      <View style={styles.eventSummary}>
        <Image source={{ uri: eventImageUrl(event) }} style={styles.eventImage} />
        <View style={styles.eventCopy}>
          <Text style={styles.eventTitle} numberOfLines={2}>{uppercase(event.title)}</Text>
          <EventMetaRow Icon={Calendar} text={eventDateLabel(event)} />
          <EventMetaRow Icon={Clock} text={eventTimeLabel(event)} />
          <EventMetaRow Icon={MapPin} text={eventLocation(event)} />
          <View style={styles.eventBadge}>
            <Text style={styles.eventBadgeText}>{uppercase(event.category)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.ticketSummary}>
        <View style={styles.ticketIconBox}>
          <Ticket size={34} color={ACCENT} strokeWidth={2.2} />
        </View>
        <View style={styles.ticketSummaryCopy}>
          <Text style={styles.ticketSummaryTitle}>{tier.name}</Text>
          <Text style={styles.ticketSummaryMeta}>{money(tier.priceMwk)} x {quantity}</Text>
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

function PaymentMethodCard({
  activeMethod,
  onChange,
}: {
  activeMethod: MobileProvider;
  onChange: (method: MobileProvider) => void;
}) {
  return (
    <View style={styles.paymentProviderGrid}>
      {mobileProviders.map((provider) => {
        const active = activeMethod === provider.id;
        return (
          <Pressable
            key={provider.id}
            onPress={() => onChange(provider.id)}
            style={({ pressed }) => [
              styles.providerCard,
              active && styles.providerCardActive,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.providerLogoShell, active && styles.providerLogoShellActive]}>
              <PaymentBrandLogo brand={provider.id} size={74} active={active} />
            </View>
            <View style={styles.providerCopy}>
              <Text style={[styles.providerTitle, active && styles.providerTitleActive]} numberOfLines={1}>
                {provider.label}
              </Text>
              <Text style={styles.providerSubtitle} numberOfLines={2}>
                Tap to pay with {provider.shortLabel}
              </Text>
            </View>
            <View style={[styles.providerRadio, active && styles.providerRadioActive]}>
              {active ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function PhoneNumberInput({
  helper,
  onChangeText,
  placeholder,
  value,
}: {
  helper: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View>
      <View style={styles.phoneInputWrap}>
        <Pressable style={({ pressed }) => [styles.countrySelector, pressed && styles.pressed]}>
          <Text style={styles.flag}>MW</Text>
          <Text style={styles.countryCode}>+265</Text>
          <ChevronDown size={18} color={TEXT} strokeWidth={2.3} />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="phone-pad"
          maxLength={11}
          style={styles.phoneInput}
          placeholder={placeholder}
          placeholderTextColor="#A2A7B1"
          selectionColor={ACCENT}
        />
      </View>
      <Text style={styles.phoneHelper}>{helper}</Text>
    </View>
  );
}

function HowItWorks({ providerLabel }: { providerLabel: string }) {
  const steps = React.useMemo(() => getHowSteps(providerLabel), [providerLabel]);

  return (
    <View style={styles.howWrap}>
      {steps.map(({ Icon, id, subtitle, title }, index) => (
        <React.Fragment key={id}>
          <View style={styles.howStep}>
            <View style={styles.howIconCircle}>
              <Icon size={29} color={TEXT} strokeWidth={2.2} />
            </View>
            <Text style={styles.howTitle} numberOfLines={2}>{title}</Text>
            <Text style={styles.howSubtitle} numberOfLines={3}>{subtitle}</Text>
          </View>
          {index < steps.length - 1 ? <View style={styles.dottedConnector} /> : null}
        </React.Fragment>
      ))}
    </View>
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

function StickyPayBar({ enabled, loading, onPay, total }: { enabled: boolean; loading: boolean; onPay: () => void; total: number }) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(14, insets.bottom + 8);

  return (
    <View style={[styles.payBarOuter, { bottom }]}>
      <View style={styles.payBar}>
        <View style={styles.payTotal}>
          <Text style={styles.payTotalLabel}>TOTAL AMOUNT</Text>
          <Text style={styles.payTotalValue}>{money(total)}</Text>
        </View>
        <Pressable disabled={!enabled} style={({ pressed }) => [styles.payButton, !enabled && styles.payButtonDisabled, pressed && enabled && styles.pressed]} onPress={onPay}>
          {loading ? <ActivityIndicator color={TEXT} /> : <Lock size={21} color={TEXT} strokeWidth={2.6} />}
          <Text style={styles.payButtonText}>{loading ? "STARTING..." : `PAY ${money(total)}`}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatPhone(digits: string) {
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  centeredRoot: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  stateTitle: { color: TEXT, fontSize: 19, fontWeight: "900", textAlign: "center" },
  stateText: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" },
  header: { minHeight: 84, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: { width: 54, height: 54, borderRadius: 17, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  headerTitle: { flex: 1, color: TEXT, fontSize: 18, fontWeight: "900", textAlign: "center", letterSpacing: 0 },
  secureBadge: { minWidth: 104, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 },
  secureText: { color: GREEN, fontSize: 13, fontWeight: "900" },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 162 },
  stepper: { paddingTop: 20, paddingBottom: 28 },
  stepperTrack: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center" },
  stepPoint: { width: 94, alignItems: "center" },
  stepCircle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  stepCircleActive: { backgroundColor: ACCENT },
  stepCircleIdle: { backgroundColor: CARD, borderWidth: 1, borderColor: "#D8DCE3" },
  stepNumber: { fontSize: 17, fontWeight: "900" },
  stepNumberActive: { color: "#FFFFFF" },
  stepNumberIdle: { color: TEXT },
  stepLabel: { color: TEXT, fontSize: 13, fontWeight: "800", marginTop: 10 },
  stepLabelActive: { fontWeight: "900" },
  stepLine: { width: 58, height: 2, backgroundColor: "#D1D5DB", marginTop: 20 },
  stepLineActive: { backgroundColor: ACCENT },
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
  sectionLabel: { color: MUTED, fontSize: 14, fontWeight: "900", letterSpacing: 1.4, marginTop: 32, marginBottom: 14 },
  paymentProviderGrid: { flexDirection: "row", gap: 12 },
  providerCard: {
    flex: 1,
    minHeight: 146,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
    shadowColor: "#13285f",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  providerCardActive: {
    borderColor: ACCENT,
    backgroundColor: "#f8faff",
    shadowColor: ACCENT,
    shadowOpacity: 0.13,
    shadowRadius: 18,
  },
  providerLogoShell: {
    width: 94,
    height: 78,
    borderRadius: 20,
    backgroundColor: "#f4f6ff",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  providerLogoShellActive: {
    backgroundColor: "#ffffff",
    borderColor: "#d8e0ff",
  },
  providerCopy: { alignItems: "center", minWidth: 0 },
  providerTitle: { color: TEXT, fontSize: 15, fontWeight: "900", textAlign: "center" },
  providerTitleActive: { color: ACCENT },
  providerSubtitle: { color: MUTED, fontSize: 11, lineHeight: 15, fontWeight: "700", textAlign: "center", marginTop: 4 },
  providerRadio: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  providerRadioActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT,
  },
  phoneInputWrap: { minHeight: 78, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, flexDirection: "row", overflow: "hidden" },
  countrySelector: { minWidth: 118, paddingHorizontal: 15, borderRightWidth: 1, borderRightColor: BORDER, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  flag: { color: TEXT, fontSize: 14, fontWeight: "900" },
  countryCode: { color: TEXT, fontSize: 17, fontWeight: "900" },
  phoneInput: { flex: 1, minWidth: 0, color: TEXT, fontSize: 19, fontWeight: "800", paddingHorizontal: 20 },
  phoneHelper: { color: MUTED, fontSize: 14, lineHeight: 20, fontWeight: "600", marginTop: 12, paddingHorizontal: 2 },
  infoNotice: { minHeight: 80, marginTop: 22, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.58)", flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 14 },
  infoNoticeCopy: { flex: 1, minWidth: 0 },
  infoNoticeTitle: { color: TEXT, fontSize: 15, fontWeight: "900", marginBottom: 5 },
  infoNoticeText: { color: MUTED, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  howWrap: { minHeight: 168, flexDirection: "row", alignItems: "flex-start", justifyContent: "center" },
  howStep: { width: 100, alignItems: "center" },
  howIconCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: "#d9e5fb", backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  howTitle: { color: TEXT, fontSize: 13, lineHeight: 17, fontWeight: "900", textAlign: "center", minHeight: 34 },
  howSubtitle: { color: MUTED, fontSize: 12, lineHeight: 17, fontWeight: "600", textAlign: "center", marginTop: 5 },
  dottedConnector: { width: 39, height: 1, borderTopWidth: 1, borderColor: "#AEB4BE", borderStyle: "dashed", marginTop: 36 },
  securityBanner: { minHeight: 58, borderRadius: 16, backgroundColor: "#eaf8f0", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 22, paddingHorizontal: 18 },
  securityBannerText: { color: GREEN, fontSize: 15, fontWeight: "800" },
  payBarOuter: { position: "absolute", left: 12, right: 12 },
  payBar: { minHeight: 100, borderRadius: 23, backgroundColor: CARD, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, shadowColor: "#13285f", shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  payTotal: { minWidth: 128, paddingRight: 14, borderRightWidth: 1, borderRightColor: BORDER },
  payTotalLabel: { color: MUTED, fontSize: 12, fontWeight: "900", letterSpacing: 1.1, marginBottom: 8 },
  payTotalValue: { color: TEXT, fontSize: 23, fontWeight: "900" },
  payButton: { flex: 1, minHeight: 62, borderRadius: 17, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 10 },
  payButtonDisabled: { backgroundColor: "#E5E7EB" },
  payButtonText: { color: TEXT, fontSize: 14, fontWeight: "900", letterSpacing: 0.8 },
  pressed: { opacity: 0.72 },
});
