import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  Smartphone,
  Ticket,
} from "lucide-react-native";
import { useAuth } from "@/providers/AuthProvider";
import type { TicketEvent, TicketTier } from "@/lib/tickets";
import { listTicketEventsSafe } from "@/lib/ticketEventsSafe";
import { createStandardTicketCheckout } from "@/lib/standardTicketCheckout";
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

const paymentMethods = [
  { id: "mobile", title: "Mobile Money", subtitle: "Airtel Money and TNM Mpamba", Icon: Smartphone },
  { id: "bank", title: "Bank Transfer", subtitle: "Available Malawian bank options", Icon: Landmark },
  { id: "card", title: "Debit or Credit Card", subtitle: "Shown when enabled by PayChangu", Icon: CreditCard },
] as const;

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
    return {
      title: "Checkout blocked",
      message: "EYA blocked an unexpected payment address. No payment was started.",
    };
  }
  return { title: "Checkout unavailable", message: message || "Could not start secure checkout." };
}

export default function StandardTicketCheckoutScreen() {
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
  const quantity = Math.max(1, Math.min(10, Number(quantityParam || 1) || 1));
  const estimatedTotal = Number(tier?.priceMwk || 0) * quantity;

  React.useEffect(() => {
    let mounted = true;
    void listTicketEventsSafe()
      .then((rows) => {
        const selectedEvent = typeof eventId === "string"
          ? rows.find((item) => item.id === eventId) ?? null
          : null;
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
    if (!event || !tier) return;
    if (!session?.access_token) {
      Alert.alert("Login required", "Please sign in again before buying tickets.");
      return;
    }

    try {
      setStartingPayment(true);
      const payment = await createStandardTicketCheckout(session.access_token, {
        eventId: event.id,
        tierId: tier.id,
        quantity,
      });

      router.push({
        pathname: "/pay/checkout",
        params: {
          url: encodeURIComponent(payment.checkoutUrl),
          tx_ref: payment.txRef,
          order_id: payment.order.id,
          payment_id: payment.paymentIntentId,
        },
      } as any);
    } catch (error) {
      const friendly = getFriendlyPaymentError(error);
      Alert.alert(friendly.title, friendly.message);
    } finally {
      setStartingPayment(false);
    }
  }, [event, quantity, router, session?.access_token, tier]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={ACCENT} />
        <Text style={styles.muted}>Preparing secure checkout...</Text>
      </View>
    );
  }

  if (!event || !tier) {
    return (
      <View style={styles.center}>
        <Ticket size={36} color={ACCENT} />
        <Text style={styles.title}>Checkout unavailable</Text>
        <Text style={styles.muted}>The selected event or ticket type could not be found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable style={styles.roundBtn} onPress={() => router.back()}>
            <ArrowLeft size={24} color={TEXT} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Standard Checkout</Text>
            <View style={styles.secureRow}>
              <ShieldCheck size={14} color={ACCENT} />
              <Text style={styles.secureText}>Secured by EYA, VAC Payments and PayChangu</Text>
            </View>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(190, insets.bottom + 160) }]}
        >
          <EventCard event={event} />

          <Text style={styles.kicker}>ORDER SUMMARY</Text>
          <View style={styles.summaryCard}>
            <View style={styles.ticketRow}>
              <View style={styles.ticketIcon}>
                <Ticket size={28} color={ACCENT} />
              </View>
              <View style={styles.ticketCopy}>
                <Text style={styles.ticketTitle}>{tier.name}</Text>
                <Text style={styles.ticketSub}>{money(tier.priceMwk)} × {quantity}</Text>
              </View>
              <Text style={styles.ticketTotal}>{money(estimatedTotal)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Estimated total</Text>
              <Text style={styles.totalValue}>{money(estimatedTotal)}</Text>
            </View>
            <Text style={styles.serverNote}>
              The final amount is recalculated and locked by EYA's backend before PayChangu opens.
            </Text>
          </View>

          <Text style={styles.kicker}>PAY SECURELY WITH</Text>
          <View style={styles.methodsCard}>
            {paymentMethods.map(({ Icon, id, subtitle, title }, index) => (
              <View key={id} style={[styles.methodRow, index > 0 && styles.methodBorder]}>
                <View style={styles.methodIcon}>
                  <Icon size={22} color={ACCENT} />
                </View>
                <View style={styles.methodCopy}>
                  <Text style={styles.methodTitle}>{title}</Text>
                  <Text style={styles.methodSub}>{subtitle}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.securityCard}>
            <Lock size={22} color={ACCENT} />
            <View style={styles.securityCopy}>
              <Text style={styles.securityTitle}>Your payment details stay with PayChangu</Text>
              <Text style={styles.securityText}>
                EYA never asks for your mobile-money PIN, card CVV or banking password. Enter those only on the secure PayChangu or bank page.
              </Text>
            </View>
          </View>

          <View style={styles.qrInfoCard}>
            <View style={styles.qrIconBox}>
              <QrCode size={28} color={ACCENT} />
            </View>
            <View style={styles.qrCopy}>
              <Text style={styles.qrTitle}>Ticket issued after verification</Text>
              <Text style={styles.qrText}>
                Returning to EYA does not mark the order as paid. The backend verifies PayChangu first, then creates the QR ticket once.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <View style={[styles.payBarOuter, { bottom: Math.max(14, insets.bottom + 8) }]}>
        <View style={styles.payBar}>
          <View>
            <Text style={styles.payLabel}>TOTAL</Text>
            <Text style={styles.payAmount}>{money(estimatedTotal)}</Text>
          </View>
          <Pressable
            disabled={startingPayment}
            style={[styles.payButton, startingPayment && styles.payButtonDisabled]}
            onPress={() => void handlePay()}
          >
            {startingPayment ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={styles.payButtonText}>Open PayChangu</Text>
                <Lock size={18} color="#ffffff" />
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function EventCard({ event }: { event: TicketEvent }) {
  return (
    <View style={styles.eventCard}>
      <Image source={{ uri: eventImageUrl(event, true) }} style={styles.eventImage} />
      <View style={styles.eventCopy}>
        <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
        <MetaRow Icon={Calendar} text={eventDateLabel(event)} />
        <MetaRow Icon={Clock} text={eventTimeLabel(event)} />
        <MetaRow Icon={MapPin} text={eventLocation(event)} />
      </View>
    </View>
  );
}

function MetaRow({ Icon, text }: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  text: string;
}) {
  return (
    <View style={styles.metaRow}>
      <Icon size={15} color={MUTED} />
      <Text style={styles.metaText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safe: { flex: 1 },
  center: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { color: TEXT, fontSize: 20, fontWeight: "900" },
  muted: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" },
  header: { minHeight: 82, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  roundBtn: { width: 48, height: 48, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, gap: 5 },
  headerTitle: { color: TEXT, fontSize: 22, fontWeight: "900" },
  secureRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  secureText: { flex: 1, color: ACCENT, fontSize: 11, fontWeight: "800" },
  content: { paddingHorizontal: 18, gap: 18 },
  kicker: { color: TEXT, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  eventCard: { borderRadius: 26, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: BORDER, padding: 14, flexDirection: "row", gap: 14 },
  eventImage: { width: 104, height: 136, borderRadius: 18, backgroundColor: BORDER },
  eventCopy: { flex: 1, minWidth: 0, justifyContent: "center", gap: 9 },
  eventTitle: { color: TEXT, fontSize: 20, lineHeight: 25, fontWeight: "900" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { flex: 1, color: TEXT, fontSize: 12, fontWeight: "700" },
  summaryCard: { borderRadius: 24, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: BORDER, padding: 17, gap: 14 },
  ticketRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  ticketIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  ticketCopy: { flex: 1, minWidth: 0, gap: 5 },
  ticketTitle: { color: TEXT, fontSize: 16, fontWeight: "900" },
  ticketSub: { color: MUTED, fontSize: 12, fontWeight: "700" },
  ticketTotal: { color: TEXT, fontSize: 17, fontWeight: "900" },
  divider: { height: 1, backgroundColor: BORDER },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { color: TEXT, fontSize: 16, fontWeight: "900" },
  totalValue: { color: ACCENT, fontSize: 24, fontWeight: "900" },
  serverNote: { color: MUTED, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  methodsCard: { borderRadius: 24, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: BORDER, paddingHorizontal: 16 },
  methodRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 13 },
  methodBorder: { borderTopWidth: 1, borderTopColor: BORDER },
  methodIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  methodCopy: { flex: 1 },
  methodTitle: { color: TEXT, fontSize: 15, fontWeight: "900" },
  methodSub: { color: MUTED, fontSize: 12, fontWeight: "700", marginTop: 4 },
  securityCard: { borderRadius: 22, backgroundColor: "#eef7ff", borderWidth: 1, borderColor: "#d9eaff", padding: 16, flexDirection: "row", alignItems: "flex-start", gap: 13 },
  securityCopy: { flex: 1 },
  securityTitle: { color: TEXT, fontSize: 14, fontWeight: "900" },
  securityText: { color: MUTED, fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: 5 },
  qrInfoCard: { borderRadius: 22, backgroundColor: "#e8ddff", padding: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  qrIconBox: { width: 54, height: 54, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.58)", alignItems: "center", justifyContent: "center" },
  qrCopy: { flex: 1 },
  qrTitle: { color: TEXT, fontSize: 15, fontWeight: "900" },
  qrText: { color: TEXT, opacity: 0.74, fontSize: 13, lineHeight: 19, fontWeight: "700", marginTop: 5 },
  payBarOuter: { position: "absolute", left: 14, right: 14 },
  payBar: { minHeight: 88, borderRadius: 27, backgroundColor: "#ffffff", borderWidth: 1, borderColor: BORDER, padding: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, shadowColor: "#13285f", shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 16 },
  payLabel: { color: MUTED, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  payAmount: { color: TEXT, fontSize: 22, fontWeight: "900", marginTop: 4 },
  payButton: { minWidth: 174, minHeight: 58, borderRadius: 18, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 17 },
  payButtonDisabled: { opacity: 0.65 },
  payButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
});
