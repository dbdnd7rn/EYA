import React from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Calendar, CheckCircle2, Clock, Lock, MapPin, QrCode, Smartphone, Ticket, WalletCards } from "lucide-react-native";
import { createTicketOrderPayment, listTicketEvents, type TicketEvent, type TicketTier } from "@/lib/tickets";
import PaymentBrandLogo from "@/components/payment/PaymentBrandLogo";
import { useAuth } from "@/providers/AuthProvider";
import { EYA_ACCENT as ACCENT, EYA_BG as BG, EYA_BORDER as BORDER, EYA_MUTED as MUTED, EYA_TEXT as TEXT, eventDateLabel, eventImageUrl, eventLocation, eventTimeLabel, money } from "@/components/market/ticketingUi";

type MobileProvider = "mpamba" | "airtel_money";

type Provider = {
  id: MobileProvider;
  title: string;
  subtitle: string;
  placeholder: string;
};

const providers: Provider[] = [
  { id: "mpamba", title: "TNM Mpamba", subtitle: "Pay using your TNM wallet", placeholder: "999 123 456" },
  { id: "airtel_money", title: "Airtel Money", subtitle: "Pay using Airtel Money", placeholder: "999 123 456" },
];

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export default function MobileMoneyPaymentScreenV2() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { eventId, quantity: quantityParam, tierId } = useLocalSearchParams<{ eventId?: string; tierId?: string; quantity?: string }>();
  const [event, setEvent] = React.useState<TicketEvent | null>(null);
  const [tier, setTier] = React.useState<TicketTier | null>(null);
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<MobileProvider>("mpamba");
  const [loading, setLoading] = React.useState(true);
  const [startingPayment, setStartingPayment] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const quantity = Math.max(1, Math.min(10, Number(quantityParam || 1) || 1));
  const total = Number(tier?.priceMwk || 0) * quantity;
  const phoneDigits = phoneNumber.replace(/\D/g, "");
  const phoneValid = phoneDigits.length >= 8;
  const activeProvider = providers.find((item) => item.id === paymentMethod) ?? providers[0];
  const bottomPad = Math.max(180, insets.bottom + 150);

  React.useEffect(() => {
    let active = true;
    const loadOrder = async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listTicketEvents();
        const selectedEvent = rows.find((item) => item.id === eventId) ?? null;
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
    void loadOrder();
    return () => {
      active = false;
    };
  }, [eventId, tierId]);

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
        params: { orderId: payment.order.id, txRef: payment.txRef, eventId: event.id, tierId: tier.id, quantity: String(quantity) },
      } as any);
    } catch (paymentError: any) {
      Alert.alert("Payment failed", paymentError?.message || "Could not start this ticket payment.");
    } finally {
      setStartingPayment(false);
    }
  }, [event, paymentMethod, phoneDigits, phoneValid, quantity, router, session?.access_token, tier]);

  if (loading) {
    return <View style={styles.centeredRoot}><ActivityIndicator color={ACCENT} /><Text style={styles.stateText}>Preparing payment...</Text></View>;
  }

  if (error || !event || !tier) {
    return <View style={styles.centeredRoot}><Ticket size={36} color={ACCENT} /><Text style={styles.stateTitle}>Payment unavailable</Text><Text style={styles.stateText}>{error || "Select tickets before paying."}</Text></View>;
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <Header />
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}> 
          <EventCard event={event} />
          <TicketCard quantity={quantity} tier={tier} />

          <Text style={styles.sectionKicker}>PAYMENT METHOD</Text>
          <View style={styles.paymentMethods}>
            {providers.map((provider) => {
              const active = paymentMethod === provider.id;
              return (
                <Pressable key={provider.id} style={[styles.methodCard, active && styles.methodCardActive]} onPress={() => setPaymentMethod(provider.id)}>
                  <View style={styles.methodLogo}><PaymentBrandLogo brand={provider.id} size={38} active={active} /></View>
                  <View style={styles.methodCopy}>
                    <Text style={styles.methodTitle}>{provider.title}</Text>
                    <Text style={styles.methodSub}>{provider.subtitle}</Text>
                  </View>
                  <View style={[styles.radioOuter, active && styles.radioOuterActive]}>{active ? <View style={styles.radioInner} /> : null}</View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionKicker}>PHONE NUMBER</Text>
          <View style={styles.phoneCard}>
            <Text style={styles.countryCode}>+265</Text>
            <TextInput value={phoneNumber} onChangeText={(value) => setPhoneNumber(formatPhone(value))} placeholder={activeProvider.placeholder} placeholderTextColor={MUTED} keyboardType="phone-pad" style={styles.phoneInput} selectionColor={ACCENT} />
          </View>

          <View style={styles.qrInfoCard}>
            <View style={styles.qrIconBox}><QrCode size={28} color={ACCENT} /></View>
            <View style={styles.qrCopy}>
              <Text style={styles.qrTitle}>Fast Entry with QR Code</Text>
              <Text style={styles.qrText}>After payment, show your QR at the gate and get in instantly.</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <PayBar enabled={phoneValid && !startingPayment} loading={startingPayment} onPay={handlePay} total={total} />
    </View>
  );
}

function Header() {
  const router = useRouter();
  return <View style={styles.header}><Pressable style={styles.backButton} onPress={() => router.back()}><ArrowLeft size={24} color={TEXT} /></Pressable><Text style={styles.headerTitle}>Ticket Details</Text></View>;
}

function EventCard({ event }: { event: TicketEvent }) {
  return (
    <View style={styles.eventCard}>
      <Image source={{ uri: eventImageUrl(event, true) }} style={styles.eventImage} />
      <View style={styles.eventCopy}>
        <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
        <View style={styles.eventBadge}><Text style={styles.eventBadgeText}>{String(event.category || "Event").toUpperCase()}</Text></View>
        <MetaRow Icon={Calendar} text={eventDateLabel(event)} />
        <MetaRow Icon={Clock} text={eventTimeLabel(event)} />
        <MetaRow Icon={MapPin} text={eventLocation(event)} />
      </View>
    </View>
  );
}

function TicketCard({ quantity, tier }: { quantity: number; tier: TicketTier }) {
  return (
    <View>
      <Text style={styles.sectionKicker}>YOUR TICKET</Text>
      <View style={styles.ticketCard}>
        <View style={styles.ticketIcon}><Ticket size={32} color={ACCENT} /></View>
        <View style={styles.ticketCopy}>
          <Text style={styles.ticketTitle}>{tier.name}</Text>
          <Text style={styles.ticketSub}>{tier.description || "Official EYA event ticket"}</Text>
          <Text style={styles.ticketPrice}>{money(tier.priceMwk)}</Text>
        </View>
        <View style={styles.qtyPill}><Text style={styles.qtyText}>Qty: {quantity}</Text></View>
      </View>
    </View>
  );
}

function MetaRow({ Icon, text }: { Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; text: string }) {
  return <View style={styles.metaRow}><Icon size={15} color={MUTED} strokeWidth={2.1} /><Text style={styles.metaText} numberOfLines={1}>{text}</Text></View>;
}

function PayBar({ enabled, loading, onPay, total }: { enabled: boolean; loading: boolean; onPay: () => void; total: number }) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(14, insets.bottom + 8);
  return <View style={[styles.payBarOuter, { bottom }]}><View style={styles.payBar}><View style={styles.payCopy}><Text style={styles.payLabel}>TOTAL PAYABLE</Text><Text style={styles.payAmount}>{money(total)}</Text></View><Pressable disabled={!enabled} style={[styles.payButton, !enabled && styles.payButtonDisabled]} onPress={onPay}>{loading ? <ActivityIndicator color="#ffffff" /> : <><Text style={styles.payButtonText}>Pay Now</Text><Lock size={18} color="#ffffff" /></>}</Pressable></View></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, safeArea: { flex: 1, backgroundColor: BG }, centeredRoot: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  stateTitle: { color: TEXT, fontSize: 20, fontWeight: "900", textAlign: "center" }, stateText: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" },
  header: { minHeight: 76, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 16 }, backButton: { width: 48, height: 48, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" }, headerTitle: { color: TEXT, fontSize: 22, fontWeight: "900" },
  content: { paddingHorizontal: 18, gap: 18 }, eventCard: { borderRadius: 26, backgroundColor: "rgba(255,255,255,0.88)", borderWidth: 1, borderColor: BORDER, padding: 14, flexDirection: "row", gap: 14, shadowColor: "#13285f", shadowOpacity: 0.05, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 }, eventImage: { width: 104, height: 146, borderRadius: 18, backgroundColor: BORDER }, eventCopy: { flex: 1, minWidth: 0, justifyContent: "center", gap: 8 }, eventTitle: { color: TEXT, fontSize: 20, lineHeight: 25, fontWeight: "900" }, eventBadge: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#eef1ff", paddingHorizontal: 10, paddingVertical: 7 }, eventBadgeText: { color: ACCENT, fontSize: 11, fontWeight: "900" }, metaRow: { flexDirection: "row", alignItems: "center", gap: 8 }, metaText: { flex: 1, color: TEXT, fontSize: 12, fontWeight: "700" },
  sectionKicker: { color: TEXT, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 }, ticketCard: { marginTop: 12, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.88)", borderWidth: 1, borderColor: BORDER, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }, ticketIcon: { width: 66, height: 66, borderRadius: 18, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" }, ticketCopy: { flex: 1, minWidth: 0, gap: 6 }, ticketTitle: { color: TEXT, fontSize: 18, fontWeight: "900" }, ticketSub: { color: MUTED, fontSize: 13, lineHeight: 19, fontWeight: "700" }, ticketPrice: { color: ACCENT, fontSize: 20, fontWeight: "900", marginTop: 4 }, qtyPill: { borderRadius: 999, backgroundColor: "#f7f8fe", paddingHorizontal: 12, paddingVertical: 8 }, qtyText: { color: TEXT, fontSize: 12, fontWeight: "900" },
  paymentMethods: { gap: 12 }, methodCard: { minHeight: 82, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.86)", flexDirection: "row", alignItems: "center", gap: 13, paddingHorizontal: 14 }, methodCardActive: { borderColor: ACCENT, backgroundColor: "#ffffff" }, methodLogo: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }, methodCopy: { flex: 1, minWidth: 0 }, methodTitle: { color: TEXT, fontSize: 15, fontWeight: "900" }, methodSub: { color: MUTED, fontSize: 12, fontWeight: "700", marginTop: 4 }, radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: MUTED, alignItems: "center", justifyContent: "center" }, radioOuterActive: { borderColor: ACCENT }, radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT },
  phoneCard: { minHeight: 66, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 }, countryCode: { color: TEXT, fontSize: 15, fontWeight: "900" }, phoneInput: { flex: 1, minWidth: 0, color: TEXT, fontSize: 17, fontWeight: "800" },
  qrInfoCard: { borderRadius: 22, backgroundColor: "#e8ddff", padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }, qrIconBox: { width: 54, height: 54, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.58)", alignItems: "center", justifyContent: "center" }, qrCopy: { flex: 1, minWidth: 0 }, qrTitle: { color: TEXT, fontSize: 15, fontWeight: "900" }, qrText: { color: TEXT, opacity: 0.74, fontSize: 13, lineHeight: 19, fontWeight: "700", marginTop: 5 },
  payBarOuter: { position: "absolute", left: 14, right: 14 }, payBar: { borderRadius: 26, backgroundColor: "#ffffff", borderWidth: 1, borderColor: BORDER, padding: 14, gap: 14, shadowColor: "#13285f", shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 }, payCopy: { gap: 5 }, payLabel: { color: MUTED, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 }, payAmount: { color: TEXT, fontSize: 23, fontWeight: "900" }, payButton: { minHeight: 58, borderRadius: 17, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }, payButtonDisabled: { backgroundColor: "#cfd4df" }, payButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
});
