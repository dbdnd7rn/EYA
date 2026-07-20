import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Calendar,
  Clock,
  CreditCard,
  Landmark,
  Lock,
  MapPin,
  QrCode,
  ShieldCheck,
  Ticket,
} from "lucide-react-native";
import PaymentBrandLogo from "@/components/payment/PaymentBrandLogo";
import { useAuth } from "@/providers/AuthProvider";
import type { TicketEvent, TicketTier } from "@/lib/tickets";
import { listTicketEventsSafe } from "@/lib/ticketEventsSafe";
import {
  createHybridTicketCheckout,
  type HybridPaymentMethod,
} from "@/lib/standardTicketCheckout";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as BG,
  EYA_BORDER as BORDER,
  EYA_MUTED as MUTED,
  EYA_TEXT as TEXT,
  eventDateLabel,
  eventImageUrl,
  eventLocation,
  eventTimeLabel,
  money,
} from "@/components/market/ticketingUi";

const METHODS: Array<{
  id: HybridPaymentMethod;
  title: string;
  subtitle: string;
}> = [
  { id: "airtel_money", title: "Airtel Money", subtitle: "Approve the secure prompt on your Airtel line" },
  { id: "mpamba", title: "TNM Mpamba", subtitle: "Approve the secure prompt on your TNM line" },
  { id: "bank_transfer", title: "Bank Transfer", subtitle: "Receive a temporary Malawian bank account" },
  { id: "card", title: "Debit or Credit Card", subtitle: "Continue to PayChangu's PCI-compliant card page" },
];

function getNationalMobileDigits(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const national = digits.startsWith("265")
    ? digits.slice(3)
    : digits.startsWith("0")
      ? digits.slice(1)
      : digits;

  return /^[89]\d{8}$/.test(national) ? national : null;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const localDigits = digits.startsWith("265")
    ? `0${digits.slice(3, 12)}`
    : digits.slice(0, 10);

  if (localDigits.length <= 4) return localDigits;
  if (localDigits.length <= 7) return `${localDigits.slice(0, 4)} ${localDigits.slice(4)}`;
  return `${localDigits.slice(0, 4)} ${localDigits.slice(4, 7)} ${localDigits.slice(7)}`;
}

function getFriendlyPaymentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();
  if (lower.includes("login") || lower.includes("session")) {
    return { title: "Login required", message: "Your session has expired. Sign in again before paying." };
  }
  if (lower.includes("network") || lower.includes("timeout") || lower.includes("reach")) {
    return { title: "Payment network issue", message };
  }
  if (lower.includes("untrusted") || lower.includes("checkout address")) {
    return { title: "Checkout blocked", message: "EYA blocked an unexpected payment address. No payment was started." };
  }
  return { title: "Checkout unavailable", message: message || "Could not start secure checkout." };
}

export default function HybridTicketCheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { eventId, quantity: quantityParam, tierId } = useLocalSearchParams<{
    eventId?: string;
    tierId?: string;
    quantity?: string;
  }>();
  const [event, setEvent] = React.useState<TicketEvent | null>(null);
  const [tier, setTier] = React.useState<TicketTier | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [startingPayment, setStartingPayment] = React.useState(false);
  const [paymentMethod, setPaymentMethod] = React.useState<HybridPaymentMethod>("airtel_money");
  const [phone, setPhone] = React.useState("");
  const quantity = Math.max(1, Math.min(10, Number(quantityParam || 1) || 1));
  const estimatedTotal = Number(tier?.priceMwk || 0) * quantity;
  const nationalPhoneDigits = getNationalMobileDigits(phone);
  const needsPhone = paymentMethod === "airtel_money" || paymentMethod === "mpamba";
  const canContinue = !startingPayment && (!needsPhone || Boolean(nationalPhoneDigits));

  React.useEffect(() => {
    let mounted = true;
    void listTicketEventsSafe()
      .then((rows) => {
        const selectedEvent = typeof eventId === "string" ? rows.find((item) => item.id === eventId) ?? null : null;
        const selectedTier = selectedEvent && typeof tierId === "string"
          ? selectedEvent.tiers.find((item) => item.id === tierId) ?? null
          : null;
        if (!mounted) return;
        setEvent(selectedEvent);
        setTier(selectedTier);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [eventId, tierId]);

  const handlePay = React.useCallback(async () => {
    if (!event || !tier || !canContinue) return;
    if (!session?.access_token) {
      Alert.alert("Login required", "Please sign in again before buying tickets.");
      return;
    }

    try {
      setStartingPayment(true);
      const canonicalPhone = needsPhone && nationalPhoneDigits ? `+265${nationalPhoneDigits}` : null;
      const payment = await createHybridTicketCheckout(session.access_token, {
        eventId: event.id,
        tierId: tier.id,
        quantity,
        paymentMethod,
        phone: canonicalPhone,
      });

      if (payment.paymentMethod === "card") {
        if (!payment.checkoutUrl) throw new Error("The secure card page is unavailable.");
        router.push({
          pathname: "/pay/checkout",
          params: {
            url: encodeURIComponent(payment.checkoutUrl),
            tx_ref: payment.txRef,
            order_id: payment.order.id,
            payment_id: payment.paymentIntentId,
            payment_method: payment.paymentMethod,
          },
        } as any);
        return;
      }

      const bank = payment.directCharge.bankTransfer;
      router.push({
        pathname: "/(student)/market/payment-processing",
        params: {
          orderId: payment.order.id,
          txRef: payment.txRef,
          paymentId: payment.paymentIntentId,
          paymentMethod: payment.paymentMethod,
          phone: canonicalPhone ?? undefined,
          bankName: bank?.bankName,
          accountNumber: bank?.accountNumber,
          accountName: bank?.accountName,
          expiresAt: bank?.expiresAt ? String(bank.expiresAt) : undefined,
        },
      } as any);
    } catch (error) {
      const friendly = getFriendlyPaymentError(error);
      Alert.alert(friendly.title, friendly.message);
    } finally {
      setStartingPayment(false);
    }
  }, [canContinue, event, nationalPhoneDigits, needsPhone, paymentMethod, quantity, router, session?.access_token, tier]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={ACCENT} /><Text style={styles.muted}>Preparing secure checkout...</Text></View>;
  }
  if (!event || !tier) {
    return <View style={styles.center}><Ticket size={36} color={ACCENT} /><Text style={styles.title}>Checkout unavailable</Text><Text style={styles.muted}>The selected event or ticket type could not be found.</Text></View>;
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable style={styles.roundBtn} onPress={() => router.back()}><ArrowLeft size={24} color={TEXT} /></Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>EYA Secure Checkout</Text>
            <View style={styles.secureRow}><ShieldCheck size={14} color={ACCENT} /><Text style={styles.secureText}>Server-priced and PayChangu verified</Text></View>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: Math.max(205, insets.bottom + 175) }]}>
          <EventCard event={event} />

          <Text style={styles.kicker}>ORDER SUMMARY</Text>
          <View style={styles.summaryCard}>
            <View style={styles.ticketRow}>
              <View style={styles.ticketIcon}><Ticket size={28} color={ACCENT} /></View>
              <View style={styles.ticketCopy}><Text style={styles.ticketTitle}>{tier.name}</Text><Text style={styles.ticketSub}>{money(tier.priceMwk)} × {quantity}</Text></View>
              <Text style={styles.ticketTotal}>{money(estimatedTotal)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Estimated total</Text><Text style={styles.totalValue}>{money(estimatedTotal)}</Text></View>
            <Text style={styles.serverNote}>EYA's backend recalculates and locks the final amount before PayChangu creates the charge.</Text>
          </View>

          <Text style={styles.kicker}>CHOOSE PAYMENT METHOD</Text>
          <View style={styles.methodsWrap}>
            {METHODS.map((method) => (
              <PaymentMethodCard
                key={method.id}
                method={method}
                active={paymentMethod === method.id}
                onPress={() => setPaymentMethod(method.id)}
              />
            ))}
          </View>

          {needsPhone ? (
            <View style={styles.fieldSection}>
              <Text style={styles.kicker}>MOBILE-MONEY NUMBER</Text>
              <View style={styles.phoneCard}>
                <TextInput
                  value={phone}
                  onChangeText={(value) => setPhone(formatPhone(value))}
                  placeholder="0980 991 460"
                  placeholderTextColor={MUTED}
                  keyboardType="phone-pad"
                  maxLength={12}
                  style={styles.phoneInput}
                  selectionColor={ACCENT}
                />
              </View>
              <Text style={styles.fieldHelp}>Enter the normal 10-digit Malawi number, for example 0980 991 460 or 0894 656 119. EYA will never ask for your PIN.</Text>
            </View>
          ) : null}

          {paymentMethod === "bank_transfer" ? (
            <InfoCard icon={<Landmark size={23} color={ACCENT} />} title="Temporary account details" text="After you continue, EYA will show the exact bank, account number, amount and expiry returned securely by PayChangu." />
          ) : null}
          {paymentMethod === "card" ? (
            <InfoCard icon={<CreditCard size={23} color={ACCENT} />} title="Card details stay outside EYA" text="Card number, CVV and 3-D Secure authentication are handled only on PayChangu's secure hosted page." />
          ) : null}

          <View style={styles.qrInfoCard}>
            <View style={styles.qrIconBox}><QrCode size={28} color={ACCENT} /></View>
            <View style={styles.qrCopy}><Text style={styles.qrTitle}>Ticket issued after verification</Text><Text style={styles.qrText}>A screen, prompt or redirect never proves payment. The backend verifies the reference, currency and exact amount before issuing one QR ticket per purchase.</Text></View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <View style={[styles.payBarOuter, { bottom: Math.max(14, insets.bottom + 8) }]}>
        <View style={styles.payBar}>
          <View><Text style={styles.payLabel}>TOTAL</Text><Text style={styles.payAmount}>{money(estimatedTotal)}</Text></View>
          <Pressable disabled={!canContinue} style={[styles.payButton, !canContinue && styles.payButtonDisabled]} onPress={() => void handlePay()}>
            {startingPayment ? <ActivityIndicator color="#ffffff" /> : <><Text style={styles.payButtonText}>{paymentMethod === "bank_transfer" ? "Get bank details" : paymentMethod === "card" ? "Continue securely" : "Send payment prompt"}</Text><Lock size={18} color="#ffffff" /></>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function PaymentMethodCard({ active, method, onPress }: { active: boolean; method: typeof METHODS[number]; onPress: () => void }) {
  return (
    <Pressable style={[styles.methodCard, active && styles.methodCardActive]} onPress={onPress}>
      <View style={styles.methodIconBox}>
        {method.id === "airtel_money" || method.id === "mpamba" ? (
          <PaymentBrandLogo brand={method.id} size={50} active={active} />
        ) : method.id === "bank_transfer" ? <Landmark size={27} color={active ? ACCENT : TEXT} /> : <CreditCard size={27} color={active ? ACCENT : TEXT} />}
      </View>
      <View style={styles.methodCopy}><Text style={styles.methodTitle}>{method.title}</Text><Text style={styles.methodSub}>{method.subtitle}</Text></View>
      <View style={[styles.radioOuter, active && styles.radioOuterActive]}>{active ? <View style={styles.radioInner} /> : null}</View>
    </Pressable>
  );
}

function InfoCard({ icon, text, title }: { icon: React.ReactNode; text: string; title: string }) {
  return <View style={styles.infoCard}><View style={styles.infoIcon}>{icon}</View><View style={styles.infoCopy}><Text style={styles.infoTitle}>{title}</Text><Text style={styles.infoText}>{text}</Text></View></View>;
}

function EventCard({ event }: { event: TicketEvent }) {
  return <View style={styles.eventCard}><Image source={{ uri: eventImageUrl(event, true) }} style={styles.eventImage} /><View style={styles.eventCopy}><Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text><MetaRow Icon={Calendar} text={eventDateLabel(event)} /><MetaRow Icon={Clock} text={eventTimeLabel(event)} /><MetaRow Icon={MapPin} text={eventLocation(event)} /></View></View>;
}

function MetaRow({ Icon, text }: { Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; text: string }) {
  return <View style={styles.metaRow}><Icon size={15} color={MUTED} /><Text style={styles.metaText} numberOfLines={1}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, safe: { flex: 1 }, center: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }, title: { color: TEXT, fontSize: 20, fontWeight: "900" }, muted: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" },
  header: { minHeight: 82, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 14 }, roundBtn: { width: 48, height: 48, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" }, headerCopy: { flex: 1, gap: 5 }, headerTitle: { color: TEXT, fontSize: 22, fontWeight: "900" }, secureRow: { flexDirection: "row", alignItems: "center", gap: 6 }, secureText: { flex: 1, color: ACCENT, fontSize: 11, fontWeight: "800" },
  content: { paddingHorizontal: 18, gap: 18 }, kicker: { color: TEXT, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 }, eventCard: { borderRadius: 26, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: BORDER, padding: 14, flexDirection: "row", gap: 14 }, eventImage: { width: 104, height: 136, borderRadius: 18, backgroundColor: BORDER }, eventCopy: { flex: 1, minWidth: 0, justifyContent: "center", gap: 9 }, eventTitle: { color: TEXT, fontSize: 20, lineHeight: 25, fontWeight: "900" }, metaRow: { flexDirection: "row", alignItems: "center", gap: 8 }, metaText: { flex: 1, color: TEXT, fontSize: 12, fontWeight: "700" },
  summaryCard: { borderRadius: 24, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: BORDER, padding: 17, gap: 14 }, ticketRow: { flexDirection: "row", alignItems: "center", gap: 12 }, ticketIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" }, ticketCopy: { flex: 1, minWidth: 0, gap: 5 }, ticketTitle: { color: TEXT, fontSize: 16, fontWeight: "900" }, ticketSub: { color: MUTED, fontSize: 13, fontWeight: "700" }, ticketTotal: { color: TEXT, fontSize: 17, fontWeight: "900" }, divider: { height: 1, backgroundColor: BORDER }, totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, totalLabel: { color: TEXT, fontSize: 16, fontWeight: "900" }, totalValue: { color: ACCENT, fontSize: 24, fontWeight: "900" }, serverNote: { color: MUTED, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  methodsWrap: { gap: 11 }, methodCard: { minHeight: 86, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.86)", flexDirection: "row", alignItems: "center", gap: 13, padding: 13 }, methodCardActive: { borderWidth: 2, borderColor: ACCENT, backgroundColor: "#ffffff" }, methodIconBox: { width: 60, height: 54, borderRadius: 15, backgroundColor: "#f7f8fe", alignItems: "center", justifyContent: "center" }, methodCopy: { flex: 1, minWidth: 0 }, methodTitle: { color: TEXT, fontSize: 15, fontWeight: "900" }, methodSub: { color: MUTED, fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 4 }, radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: MUTED, alignItems: "center", justifyContent: "center" }, radioOuterActive: { borderColor: ACCENT }, radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT },
  fieldSection: { gap: 10 }, phoneCard: { minHeight: 66, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 }, phoneInput: { flex: 1, minWidth: 0, color: TEXT, fontSize: 17, fontWeight: "800" }, fieldHelp: { color: MUTED, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  infoCard: { borderRadius: 22, backgroundColor: "#eef1ff", padding: 16, flexDirection: "row", alignItems: "center", gap: 13 }, infoIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.72)", alignItems: "center", justifyContent: "center" }, infoCopy: { flex: 1 }, infoTitle: { color: TEXT, fontSize: 15, fontWeight: "900" }, infoText: { color: MUTED, fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: 4 },
  qrInfoCard: { borderRadius: 22, backgroundColor: "#e8ddff", padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }, qrIconBox: { width: 54, height: 54, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.58)", alignItems: "center", justifyContent: "center" }, qrCopy: { flex: 1 }, qrTitle: { color: TEXT, fontSize: 15, fontWeight: "900" }, qrText: { color: TEXT, opacity: 0.74, fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: 5 },
  payBarOuter: { position: "absolute", left: 14, right: 14 }, payBar: { minHeight: 86, borderRadius: 26, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fff", padding: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, shadowColor: "#13285f", shadowOpacity: 0.18, shadowRadius: 26, shadowOffset: { width: 0, height: 12 }, elevation: 14 }, payLabel: { color: MUTED, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }, payAmount: { color: TEXT, fontSize: 22, fontWeight: "900", marginTop: 4 }, payButton: { flex: 1, maxWidth: 215, minHeight: 58, borderRadius: 18, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 }, payButtonDisabled: { backgroundColor: "#cfd4df" }, payButtonText: { color: "#fff", fontSize: 13, fontWeight: "900", textAlign: "center" },
});