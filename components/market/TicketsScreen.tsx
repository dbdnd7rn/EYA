import React from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Heart,
  MapPin,
  Minus,
  Plus,
  Search,
  Smartphone,
  Star,
  Ticket,
} from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import {
  appendCachedMyTickets,
  createTicketOrderPayment,
  listTicketEvents,
  ticketEvents,
  ticketPriceLabel,
  verifyTicketOrderPayment,
  type IssuedTicket,
  type TicketEvent,
  type TicketPaymentMethod,
  type TicketPaymentSession,
  type TicketTier,
} from "@/lib/tickets";
import PaymentBrandLogo from "@/components/payment/PaymentBrandLogo";
import TicketBottomNav from "@/components/market/TicketBottomNav";
import { useStudentTheme } from "@/providers/StudentThemeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";

type BookingReceipt = {
  orderId: string;
  event: TicketEvent;
  tier: TicketTier;
  quantity: number;
  total: number;
  tickets: { id: string; ticket_code: string; qr_data_url?: string | null; status: string; issued_at: string }[];
};

function firstAvailableTier(event: TicketEvent) {
  return event.tiers.find((tier) => tier.available) ?? event.tiers[0];
}

export default function TicketsScreen() {
  const router = useRouter();
  const { theme } = useStudentTheme();
  const { user, session } = useAuth();
  const { isOnline } = useNetwork();
  const scrollRef = React.useRef<ScrollView>(null);
  const glow = React.useRef(new Animated.Value(0)).current;
  const [query, setQuery] = React.useState("");
  const [events, setEvents] = React.useState<TicketEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const [eventLoadError, setEventLoadError] = React.useState<string | null>(null);
  const [showAllEvents, setShowAllEvents] = React.useState(false);
  const [selectedEventId, setSelectedEventId] = React.useState("");
  const [selectedTierId, setSelectedTierId] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);
  const [paymentMethod, setPaymentMethod] = React.useState<TicketPaymentMethod>("mpamba");
  const [phone, setPhone] = React.useState("");
  const [startingPayment, setStartingPayment] = React.useState(false);
  const [verifyingPayment, setVerifyingPayment] = React.useState(false);
  const [pendingSession, setPendingSession] = React.useState<TicketPaymentSession | null>(null);
  const [paymentSheetOpen, setPaymentSheetOpen] = React.useState(false);
  const [receipt, setReceipt] = React.useState<BookingReceipt | null>(null);

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [glow]);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingEvents(true);
      setEventLoadError(null);
      try {
        const liveEvents = await listTicketEvents();
        if (active) {
          setEvents(liveEvents);
          setSelectedEventId((current) => liveEvents.find((event) => event.id === current)?.id ?? liveEvents[0]?.id ?? "");
        }
      } catch (error: any) {
        if (active) {
          setEvents([]);
          setSelectedEventId("");
          setEventLoadError(error?.message ?? "Could not load ticket events.");
        }
      } finally {
        if (active) setLoadingEvents(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const selectedEvent = React.useMemo(() => {
    return events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;
  }, [events, selectedEventId]);

  React.useEffect(() => {
    if (!selectedEvent) {
      setSelectedTierId("");
      return;
    }
    setSelectedTierId((current) => {
      const currentTier = selectedEvent.tiers.find((tier) => tier.id === current);
      return currentTier?.available ? current : firstAvailableTier(selectedEvent)?.id ?? "";
    });
    setQuantity(1);
    setPendingSession(null);
  }, [selectedEvent]);

  const selectedTier = selectedEvent?.tiers.find((tier) => tier.id === selectedTierId);
  const total = selectedTier ? selectedTier.priceMwk * quantity : 0;
  const filteredEvents = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return events;
    return events.filter((event) =>
      [event.title, event.category, event.venue, event.city].some((value) => value.toLowerCase().includes(term)),
    );
  }, [events, query]);
  const visibleEvents = React.useMemo(() => {
    if (showAllEvents || query.trim()) return filteredEvents;
    return filteredEvents.slice(0, 2);
  }, [filteredEvents, query, showAllEvents]);
  const heroOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });
  const heroScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const heroImage = selectedEvent?.heroImage || ticketEvents[0]?.heroImage;

  const handleSelectEvent = (event: TicketEvent) => {
    setSelectedEventId(event.id);
    setReceipt(null);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 620, animated: true });
    }, 80);
  };

  const proceedToPay = async () => {
    if (!selectedEvent || !selectedTier) return;
    if (!isOnline) {
      Alert.alert("Offline", "Ticket payment needs internet so we can reserve stock and confirm payment.");
      return;
    }
    if (!session?.access_token || !user?.email) {
      Alert.alert("Login required", "Please log in again before buying tickets.");
      return;
    }
    const cleanPhone = phone.trim().replace(/\s+/g, "");
    if ((paymentMethod === "airtel_money" || paymentMethod === "mpamba") && cleanPhone.replace(/[^\d]/g, "").length < 8) {
      Alert.alert("Phone required", "Enter the phone number that will approve the mobile money charge.");
      return;
    }

    try {
      setStartingPayment(true);
      setPendingSession(null);
      const payment = await createTicketOrderPayment(session.access_token, {
        eventId: selectedEvent.id,
        tierId: selectedTier.id,
        quantity,
        paymentMethod,
        phone: paymentMethod === "bank_transfer" ? null : cleanPhone,
      });
      setPendingSession(payment);
      setPaymentSheetOpen(true);
    } catch (error: any) {
      Alert.alert("Ticket payment failed", error?.message ?? "Could not start ticket payment.");
    } finally {
      setStartingPayment(false);
    }
  };

  const checkPaymentStatus = async () => {
    if (!pendingSession || !session?.access_token || !selectedEvent || !selectedTier) return;
    try {
      setVerifyingPayment(true);
      const verified = await verifyTicketOrderPayment(session.access_token, pendingSession.order.id, pendingSession.txRef);
      if (!verified.fulfilled || !verified.tickets.length) {
        Alert.alert("Payment pending", verified.payment_status === "paid" ? "Payment is paid, but ticket issuing needs admin review." : "Payment is still processing. Try again in a moment.");
        return;
      }
      setPendingSession(null);
      setPaymentSheetOpen(false);
      const paidAt = verified.order.paid_at ?? new Date().toISOString();
      const issuedTickets: IssuedTicket[] = verified.tickets.map((ticket) => ({
        id: ticket.id,
        qr_data_url: ticket.qr_data_url ?? null,
        order_id: verified.order.id,
        event_id: verified.order.event_id || selectedEvent.id,
        tier_id: verified.order.tier_id || selectedTier.id,
        ticket_code: ticket.ticket_code,
        status: ticket.status || "active",
        checked_in_at: null,
        issued_at: ticket.issued_at || paidAt,
        event: {
          title: selectedEvent.title,
          category: selectedEvent.category,
          date_label: selectedEvent.dateLabel,
          venue: selectedEvent.venue,
          city: selectedEvent.city,
          image_url: selectedEvent.image,
          hero_image_url: selectedEvent.heroImage,
        },
        tier: {
          name: selectedTier.name,
          price_mwk: selectedTier.priceMwk,
        },
        order: {
          id: verified.order.id,
          total_mwk: Number(verified.order.total_mwk || total),
          quantity: Number(verified.order.quantity || quantity),
          status: verified.order.status || "paid",
          payment_status: verified.order.payment_status || verified.payment_status || "paid",
          paid_at: paidAt,
        },
      }));
      await appendCachedMyTickets(user?.id, issuedTickets).catch(() => undefined);
      setReceipt({
        orderId: verified.order.id,
        event: selectedEvent,
        tier: selectedTier,
        quantity: verified.order.quantity,
        total: Number(verified.order.total_mwk || total),
        tickets: verified.tickets,
      });
    } catch (error: any) {
      Alert.alert("Verification failed", error?.message ?? "Could not verify this ticket payment.");
    } finally {
      setVerifyingPayment(false);
    }
  };

  const resetReceipt = () => {
    setReceipt(null);
    setPendingSession(null);
    setPaymentSheetOpen(false);
    setQuantity(1);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.back()}>
            <ArrowLeft size={20} color={theme.heading} />
          </Pressable>
          <Text style={[styles.screenTitle, { color: theme.heading }]}>Tickets</Text>
          <Pressable style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Heart size={20} color={theme.heading} />
          </Pressable>
        </View>

        <View style={[styles.heroShell, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ImageBackground source={{ uri: heroImage }} style={styles.hero} imageStyle={styles.heroImage}>
            <View style={styles.heroOverlay} />
            <Animated.View style={[styles.heroGlow, { opacity: heroOpacity, transform: [{ scale: heroScale }] }]} />
            <View style={styles.heroContent}>
              <View style={styles.ticketBadge}>
                <Ticket size={16} color="#ffffff" />
                <Text style={styles.ticketBadgeText}>EYA Tickets</Text>
              </View>
              <Text style={styles.heroTitle}>Book the moments that matter most.</Text>
              <Text style={styles.heroSub}>Concerts, festivals, comedy nights, sports matches and campus events.</Text>
              <View style={styles.searchHero}>
                <Search size={18} color="#8a94af" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  style={styles.searchInput}
                  placeholder="Search events, artists, venues..."
                  placeholderTextColor="#8a94af"
                />
              </View>
            </View>
          </ImageBackground>
        </View>

        <View style={[styles.statsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <StatCell value="50K+" label="Tickets sold" />
          <StatCell value="200+" label="Live events" />
          <StatCell value="98%" label="Satisfaction" />
          <StatCell value="40+" label="Venues" />
        </View>

        {receipt ? (
          <SuccessReceipt receipt={receipt} onBack={resetReceipt} />
        ) : (
          <>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: theme.heading }]}>Popular events</Text>
              <Pressable
                style={styles.viewAllBtn}
                onPress={() => setShowAllEvents((current) => !current)}
                disabled={loadingEvents || filteredEvents.length <= 2}
              >
                <Text style={[styles.sectionLink, { color: loadingEvents || filteredEvents.length <= 2 ? theme.textSoft : theme.accent }]}>
                  {loadingEvents ? "Loading..." : showAllEvents ? "Show less" : "View all"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.eventList}>
              {visibleEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  selected={event.id === selectedEvent?.id}
                  onPress={() => handleSelectEvent(event)}
                />
              ))}
              {!loadingEvents && !visibleEvents.length ? (
                <View style={[styles.emptyEventCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.emptyEventTitle, { color: theme.heading }]}>No ticket events yet</Text>
                  <Text style={[styles.emptyEventText, { color: theme.textMuted }]}>
                    {eventLoadError ? eventLoadError : "Admin-created ticket listings will appear here once published."}
                  </Text>
                </View>
              ) : null}
            </View>

            {selectedEvent ? (
              <View style={[styles.bookingCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <ImageBackground source={{ uri: selectedEvent.heroImage || selectedEvent.image }} style={styles.detailHero} imageStyle={styles.detailHeroImage}>
                  <View style={styles.detailHeroOverlay} />
                  <View style={styles.detailHeroContent}>
                    <Text style={styles.detailTag}>{selectedEvent.category}</Text>
                    <Text style={styles.detailTitle}>{selectedEvent.title}</Text>
                    <View style={styles.detailMetaWrap}>
                      <View style={styles.detailMetaPill}>
                        <CalendarDays size={14} color="#ffffff" />
                        <Text style={styles.detailMetaText}>{selectedEvent.dateLabel}</Text>
                      </View>
                      <View style={styles.detailMetaPill}>
                        <MapPin size={14} color="#ffffff" />
                        <Text style={styles.detailMetaText}>{selectedEvent.venue}, {selectedEvent.city}</Text>
                      </View>
                    </View>
                  </View>
                </ImageBackground>

                <View style={[styles.eventDetailBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                  <Text style={[styles.eventDetailTitle, { color: theme.heading }]}>Event details</Text>
                  <Text style={[styles.eventDetailText, { color: theme.textMuted }]}>
                    {selectedEvent.description || "Full event information, ticket types, venue, and checkout are available below."}
                  </Text>
                  <View style={styles.detailStatRow}>
                    <View style={[styles.detailStat, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <Star size={15} color="#f4b83d" fill="#f4b83d" />
                      <Text style={[styles.detailStatText, { color: theme.heading }]}>{selectedEvent.rating.toFixed(1)}</Text>
                    </View>
                    <View style={[styles.detailStat, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <Ticket size={15} color={theme.accent} />
                      <Text style={[styles.detailStatText, { color: theme.heading }]}>{ticketPriceLabel(selectedEvent)}</Text>
                    </View>
                  </View>
                </View>

                <Text style={[styles.blockLabel, { color: theme.heading }]}>Select tickets</Text>
                <View style={styles.tierList}>
                  {selectedEvent.tiers.map((tier) => {
                    const active = tier.id === selectedTierId;
                    return (
                      <Pressable
                        key={tier.id}
                        disabled={!tier.available}
                        style={[
                          styles.tierCard,
                          { borderColor: active ? theme.accent : theme.border, backgroundColor: active ? theme.accentSoft : theme.surfaceAlt },
                          !tier.available && styles.tierDisabled,
                        ]}
                        onPress={() => setSelectedTierId(tier.id)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.tierName, { color: theme.heading }]}>{tier.name}</Text>
                          <Text style={[styles.tierDescription, { color: theme.textMuted }]}>{tier.description}</Text>
                          <Text style={[styles.tierStatus, { color: tier.available ? "#0d9b63" : theme.danger }]}>
                            {tier.available ? "Available" : "Sold out"}
                          </Text>
                        </View>
                        <View style={styles.tierRight}>
                          <Text style={[styles.tierPrice, { color: theme.heading }]}>{kwacha(tier.priceMwk)}</Text>
                          <View style={[styles.radio, active && { borderColor: theme.accent }]}>
                            {active ? <View style={[styles.radioDot, { backgroundColor: theme.accent }]} /> : null}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                  {!selectedEvent.tiers.length ? (
                    <Text style={[styles.emptyEventText, { color: theme.textMuted }]}>No ticket types have been added for this event yet.</Text>
                  ) : null}
                </View>

              <View style={[styles.reviewBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                <View style={styles.quantityRow}>
                  <View>
                    <Text style={[styles.blockLabel, { color: theme.heading }]}>Quantity</Text>
                    <Text style={[styles.reviewMuted, { color: theme.textMuted }]}>Choose how many tickets you need.</Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable style={[styles.stepBtn, { borderColor: theme.border }]} onPress={() => setQuantity((current) => Math.max(1, current - 1))}>
                      <Minus size={16} color={theme.heading} />
                    </Pressable>
                    <Text style={[styles.quantityText, { color: theme.heading }]}>{quantity}</Text>
                    <Pressable style={[styles.stepBtn, { borderColor: theme.border }]} onPress={() => setQuantity((current) => Math.min(10, current + 1))}>
                      <Plus size={16} color={theme.heading} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.priceRows}>
                  <PriceRow label="Ticket type" value={selectedTier?.name ?? "-"} />
                  <PriceRow label="Subtotal" value={kwacha(total)} />
                  <PriceRow label="Booking fee" value="MWK 0" />
                  <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
                    <Text style={[styles.totalLabel, { color: theme.heading }]}>Total</Text>
                    <Text style={[styles.totalValue, { color: theme.heading }]}>{kwacha(total)}</Text>
                  </View>
                </View>
              </View>

              <Text style={[styles.blockLabel, { color: theme.heading }]}>Payment methods</Text>
              <View style={styles.paymentGrid}>
                <PaymentChoice
                  active={paymentMethod === "mpamba"}
                  icon={<PaymentBrandLogo brand="mpamba" size={38} active={paymentMethod === "mpamba"} />}
                  label="TNM Mpamba"
                  subtitle="Pay from your TNM wallet"
                  onPress={() => setPaymentMethod("mpamba")}
                />
                <PaymentChoice
                  active={paymentMethod === "airtel_money"}
                  icon={<PaymentBrandLogo brand="airtel_money" size={38} active={paymentMethod === "airtel_money"} />}
                  label="Airtel Money"
                  subtitle="Pay from Airtel Money"
                  onPress={() => setPaymentMethod("airtel_money")}
                />
              </View>
              <View style={styles.paymentGrid}>
                <PaymentChoice
                  active={paymentMethod === "bank_transfer"}
                  icon={<CreditCard size={26} color={paymentMethod === "bank_transfer" ? theme.accent : theme.textMuted} />}
                  label="Bank Transfer"
                  subtitle="Use your preferred bank"
                  onPress={() => setPaymentMethod("bank_transfer")}
                />
              </View>

              {paymentMethod !== "bank_transfer" ? (
                <View style={[styles.phoneInputWrap, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                  <Smartphone size={18} color={theme.accent} />
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    style={[styles.phoneInput, { color: theme.heading }]}
                    placeholder={paymentMethod === "airtel_money" ? "Airtel Money number" : "TNM Mpamba number"}
                    placeholderTextColor={theme.textSoft}
                  />
                </View>
              ) : null}

              {pendingSession ? (
                <PendingPaymentCard
                  session={pendingSession}
                  method={paymentMethod}
                  verifying={verifyingPayment}
                  onVerify={checkPaymentStatus}
                />
              ) : null}

              <Pressable
                style={[styles.payBtn, { backgroundColor: theme.accent, shadowColor: theme.accent }, (startingPayment || verifyingPayment || !selectedTier) && styles.payBtnDisabled]}
                onPress={proceedToPay}
                disabled={startingPayment || verifyingPayment || !selectedTier}
              >
                {startingPayment ? <ActivityIndicator size="small" color="#ffffff" /> : null}
                <Text style={styles.payBtnText}>{startingPayment ? "Starting payment..." : pendingSession ? "Start New Payment" : selectedTier ? "Proceed to Pay" : "No tickets available"}</Text>
              </Pressable>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <TicketBottomNav active="home" />
      <TicketPaymentSheet
        visible={paymentSheetOpen && !!pendingSession}
        session={pendingSession}
        method={paymentMethod}
        verifying={verifyingPayment}
        onClose={() => setPaymentSheetOpen(false)}
        onVerify={checkPaymentStatus}
      />
    </SafeAreaView>
  );
}

function StatCell({ value, label }: { value: string; label: string }) {
  const { theme } = useStudentTheme();
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color: theme.heading }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

function EventCard({ event, selected, onPress }: { event: TicketEvent; selected: boolean; onPress: () => void }) {
  const { theme } = useStudentTheme();
  return (
    <Pressable
      style={[
        styles.eventCard,
        { backgroundColor: theme.surface, borderColor: selected ? theme.accent : theme.border },
        selected && { shadowColor: theme.accent },
      ]}
      onPress={onPress}
    >
      <Image source={{ uri: event.image }} style={styles.eventImage} />
      <View style={styles.eventBody}>
        <View style={styles.eventTopRow}>
          <Text style={[styles.eventTag, { backgroundColor: theme.accentSoft, color: theme.accent }]}>{event.category}</Text>
          <Heart size={18} color={selected ? theme.accent : theme.textSoft} fill={selected ? theme.accent : "transparent"} />
        </View>
        <Text style={[styles.eventTitle, { color: theme.heading }]} numberOfLines={2}>{event.title}</Text>
        <MetaRow icon={<CalendarDays size={13} color={theme.textMuted} />} text={event.dateLabel} />
        <MetaRow icon={<MapPin size={13} color={theme.textMuted} />} text={`${event.venue}, ${event.city}`} />
        <View style={styles.eventBottom}>
          <View style={styles.inlineMeta}>
            <Star size={13} color="#f4b83d" fill="#f4b83d" />
            <Text style={[styles.eventMetaText, { color: theme.textMuted }]}>{event.rating.toFixed(1)}</Text>
          </View>
          <Text style={[styles.eventPrice, { color: theme.heading }]}>{ticketPriceLabel(event)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function MetaRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  const { theme } = useStudentTheme();
  return (
    <View style={styles.metaRow}>
      {icon}
      <Text style={[styles.metaText, { color: theme.textMuted }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function PriceRow({ label, value }: { label: string; value: string }) {
  const { theme } = useStudentTheme();
  return (
    <View style={styles.priceRow}>
      <Text style={[styles.priceLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.priceValue, { color: theme.heading }]}>{value}</Text>
    </View>
  );
}

function PaymentChoice({
  active,
  icon,
  label,
  subtitle,
  onPress,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  onPress: () => void;
}) {
  const { theme } = useStudentTheme();
  return (
    <Pressable
      style={[
        styles.paymentChoice,
        {
          borderColor: active ? theme.accent : theme.border,
          backgroundColor: active ? theme.accentSoft : theme.surfaceAlt,
          shadowColor: active ? theme.accent : "#000000",
        },
      ]}
      onPress={onPress}
    >
      <View style={[styles.paymentIconShell, { backgroundColor: theme.surface, borderColor: active ? theme.accent : theme.border }]}>
        {icon}
      </View>
      <View style={styles.paymentCopy}>
        <Text style={[styles.paymentText, { color: theme.heading }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.paymentSub, { color: theme.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={[styles.paymentRadio, { borderColor: active ? theme.accent : theme.border }]}>
        {active ? <View style={[styles.paymentRadioDot, { backgroundColor: theme.accent }]} /> : null}
      </View>
    </Pressable>
  );
}

function findDetailValue(details: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!details) return null;
  for (const key of keys) {
    const match = Object.entries(details).find(([entryKey, value]) => entryKey.toLowerCase() === key && value != null && String(value).trim());
    if (match) return String(match[1]).trim();
  }
  return null;
}

function paymentMethodLabel(method: TicketPaymentMethod) {
  if (method === "airtel_money") return "Airtel Money";
  if (method === "mpamba") return "TNM Mpamba";
  return "Bank Transfer";
}

function PendingPaymentCard({
  session,
  method,
  verifying,
  onVerify,
}: {
  session: TicketPaymentSession;
  method: TicketPaymentMethod;
  verifying: boolean;
  onVerify: () => void;
}) {
  const { theme } = useStudentTheme();
  const bankDetails = session.directCharge.paymentAccountDetails;
  const bankName = findDetailValue(bankDetails, ["bank_name", "bank", "institution_name"]);
  const accountName = findDetailValue(bankDetails, ["account_name", "account_holder_name", "merchant_name", "name"]);
  const accountNumber = findDetailValue(bankDetails, ["account_number", "account_no", "account"]);
  const paymentCode = findDetailValue(bankDetails, ["payment_code", "code"]);
  const instruction = method === "bank_transfer"
    ? "Send the exact amount to the bank details below, then check payment status."
    : "Approve the mobile money prompt on your phone, then check payment status.";

  return (
    <View style={[styles.pendingCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
      <View style={styles.pendingHeader}>
        <View style={[styles.pendingIcon, { backgroundColor: theme.accentSoft }]}>
          <Ticket size={18} color={theme.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.pendingTitle, { color: theme.heading }]}>Payment pending</Text>
          <Text style={[styles.pendingText, { color: theme.textMuted }]}>{instruction}</Text>
        </View>
      </View>
      <PriceRow label="Reference" value={session.txRef} />
      <PriceRow label="Reserved until" value={new Date(session.order.reserved_until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
      {method === "bank_transfer" ? (
        <View style={styles.bankDetails}>
          {bankName ? <PriceRow label="Bank" value={bankName} /> : null}
          {accountName ? <PriceRow label="Account name" value={accountName} /> : null}
          {accountNumber ? <PriceRow label="Account number" value={accountNumber} /> : null}
          {paymentCode ? <PriceRow label="Payment code" value={paymentCode} /> : null}
        </View>
      ) : null}
      <Pressable
        style={[styles.verifyBtn, { backgroundColor: theme.heading }, verifying && styles.payBtnDisabled]}
        onPress={onVerify}
        disabled={verifying}
      >
        {verifying ? <ActivityIndicator size="small" color="#ffffff" /> : null}
        <Text style={styles.verifyBtnText}>{verifying ? "Checking..." : "Check payment status"}</Text>
      </Pressable>
    </View>
  );
}

function TicketPaymentSheet({
  visible,
  session,
  method,
  verifying,
  onClose,
  onVerify,
}: {
  visible: boolean;
  session: TicketPaymentSession | null;
  method: TicketPaymentMethod;
  verifying: boolean;
  onClose: () => void;
  onVerify: () => void;
}) {
  const { theme } = useStudentTheme();
  if (!session) return null;

  const details = session.directCharge.paymentAccountDetails;
  const authorization = session.directCharge.authorization;
  const instruction = method === "bank_transfer"
    ? "Send the exact amount to the bank details from PayChangu, then check payment status."
    : "Approve the mobile money prompt on your phone, then check payment status.";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.sheetRoot, { backgroundColor: theme.backgroundAlt }]}>
        <View style={[styles.sheetHeader, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sheetTitle, { color: theme.heading }]}>Complete ticket payment</Text>
            <Text style={[styles.sheetSub, { color: theme.textMuted }]}>{paymentMethodLabel(method)} via PayChangu</Text>
          </View>
          <Pressable style={[styles.sheetCloseBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} onPress={onClose} disabled={verifying}>
            <Text style={[styles.sheetCloseText, { color: theme.heading }]}>Close</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
          <View style={[styles.sheetHeroCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.sheetBrandRow}>
              {method === "bank_transfer" ? (
                <View style={[styles.sheetBrandFallback, { backgroundColor: theme.accentSoft }]}>
                  <CreditCard size={28} color={theme.accent} />
                </View>
              ) : (
                <PaymentBrandLogo brand={method} size={62} active />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetAmount, { color: theme.heading }]}>{kwacha(Number(session.order.total_mwk || 0))}</Text>
                <Text style={[styles.sheetInstruction, { color: theme.textMuted }]}>{instruction}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.sheetCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sheetCardTitle, { color: theme.heading }]}>PayChangu details</Text>
            <PriceRow label="Method" value={paymentMethodLabel(method)} />
            <PriceRow label="Charge ID" value={session.txRef} />
            {session.directCharge.providerReference ? <PriceRow label="Provider ref" value={session.directCharge.providerReference} /> : null}
            <PriceRow label="Status" value={verifying ? "Checking" : session.directCharge.status || "Pending"} />
            <PriceRow label="Reserved until" value={new Date(session.order.reserved_until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
          </View>

          {details ? (
            <View style={[styles.sheetCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.sheetCardTitle, { color: theme.heading }]}>Provider details</Text>
              {Object.entries(details).map(([key, value]) => (
                <PriceRow key={key} label={key.replace(/_/g, " ")} value={String(value ?? "")} />
              ))}
            </View>
          ) : null}

          {authorization ? (
            <View style={[styles.sheetCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.sheetCardTitle, { color: theme.heading }]}>Authorization</Text>
              {Object.entries(authorization).map(([key, value]) => (
                <PriceRow key={key} label={key.replace(/_/g, " ")} value={String(value ?? "")} />
              ))}
            </View>
          ) : null}

          <Pressable
            style={[styles.sheetPrimaryBtn, { backgroundColor: theme.accent }, verifying && styles.payBtnDisabled]}
            onPress={onVerify}
            disabled={verifying}
          >
            {verifying ? <ActivityIndicator size="small" color="#ffffff" /> : null}
            <Text style={styles.sheetPrimaryText}>{verifying ? "Checking payment..." : "Check payment status"}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function SuccessReceipt({ receipt, onBack }: { receipt: BookingReceipt; onBack: () => void }) {
  const { theme } = useStudentTheme();
  const router = useRouter();
  return (
    <View style={[styles.successCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.successIcon, { backgroundColor: theme.accentSoft }]}>
        <CheckCircle2 size={44} color="#18a75f" />
      </View>
      <Text style={[styles.successTitle, { color: theme.heading }]}>Payment Successful!</Text>
      <Text style={[styles.successSub, { color: theme.textMuted }]}>Your ticket has been booked successfully.</Text>

      <View style={[styles.receiptBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
        <PriceRow label="Order ID" value={receipt.orderId} />
        <PriceRow label="Event" value={receipt.event.title} />
        <PriceRow label="Date" value={receipt.event.dateLabel} />
        <PriceRow label="Ticket type" value={receipt.tier.name} />
        <PriceRow label="Quantity" value={String(receipt.quantity)} />
        <PriceRow label="Ticket code" value={receipt.tickets[0]?.ticket_code ?? "Issued"} />
        <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
          <Text style={[styles.totalLabel, { color: theme.heading }]}>Amount paid</Text>
          <Text style={[styles.totalValue, { color: theme.heading }]}>{kwacha(receipt.total)}</Text>
        </View>
      </View>

      <Pressable style={[styles.payBtn, { backgroundColor: theme.accent, shadowColor: theme.accent }]} onPress={() => router.push("/(student)/market/my-tickets" as any)}>
        <Text style={styles.payBtnText}>View My Ticket</Text>
      </Pressable>
      <Pressable style={[styles.secondaryBtn, { borderColor: theme.border }]} onPress={onBack}>
        <Text style={[styles.secondaryBtnText, { color: theme.heading }]}>Back to Tickets</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  content: { padding: 14, paddingBottom: 118, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: { flex: 1, textAlign: "center", fontSize: 20, fontWeight: "900" },
  heroShell: {
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    shadowColor: "#13285f",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  hero: { minHeight: 256, justifyContent: "flex-end" },
  heroImage: { borderRadius: 28 },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.58)" },
  heroGlow: {
    position: "absolute",
    right: -50,
    top: -42,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "rgba(94,115,221,0.44)",
  },
  heroContent: { padding: 18, gap: 12 },
  ticketBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  ticketBadgeText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  heroTitle: { color: "#ffffff", fontSize: 34, lineHeight: 38, fontWeight: "900", maxWidth: 420 },
  heroSub: { color: "rgba(255,255,255,0.82)", fontSize: 14, lineHeight: 20, fontWeight: "700", maxWidth: 420 },
  searchHero: {
    minHeight: 54,
    borderRadius: 17,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: "#13285f", fontWeight: "800", fontSize: 14 },
  statsCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    shadowColor: "#13285f",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  statCell: { flex: 1, alignItems: "center", gap: 4, paddingHorizontal: 4 },
  statValue: { fontSize: 20, fontWeight: "900" },
  statLabel: { fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 18, fontWeight: "900" },
  viewAllBtn: { minHeight: 34, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  sectionLink: { fontSize: 13, fontWeight: "900" },
  eventList: { gap: 12 },
  emptyEventCard: { borderRadius: 22, borderWidth: 1, padding: 18, gap: 6, alignItems: "center" },
  emptyEventTitle: { fontSize: 17, fontWeight: "900", textAlign: "center" },
  emptyEventText: { fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center" },
  eventCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 10,
    flexDirection: "row",
    gap: 12,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  eventImage: { width: 92, height: 106, borderRadius: 18, backgroundColor: "#eef1fb" },
  eventBody: { flex: 1, gap: 6 },
  eventTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eventTag: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: "900", textTransform: "uppercase", overflow: "hidden" },
  eventTitle: { fontSize: 16, lineHeight: 20, fontWeight: "900" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { flex: 1, fontSize: 12, fontWeight: "700" },
  eventBottom: { marginTop: 2, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  inlineMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  eventMetaText: { fontSize: 12, fontWeight: "900" },
  eventPrice: { fontSize: 14, fontWeight: "900" },
  bookingCard: { borderRadius: 28, borderWidth: 1, padding: 16, gap: 15 },
  detailHero: { minHeight: 230, justifyContent: "flex-end", overflow: "hidden", borderRadius: 24 },
  detailHeroImage: { borderRadius: 24 },
  detailHeroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.48)" },
  detailHeroContent: { padding: 16, gap: 9 },
  detailTag: {
    alignSelf: "flex-start",
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    paddingHorizontal: 11,
    paddingVertical: 6,
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  detailTitle: { color: "#ffffff", fontSize: 27, lineHeight: 31, fontWeight: "900" },
  detailMetaWrap: { gap: 7 },
  detailMetaPill: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.17)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailMetaText: { flexShrink: 1, color: "#ffffff", fontSize: 12, fontWeight: "800" },
  eventDetailBox: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 10 },
  eventDetailTitle: { fontSize: 17, fontWeight: "900" },
  eventDetailText: { fontSize: 13, lineHeight: 20, fontWeight: "700" },
  detailStatRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  detailStat: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  detailStatText: { fontSize: 12, fontWeight: "900" },
  bookingHead: { flexDirection: "row", gap: 12, alignItems: "center" },
  bookingPoster: { width: 72, height: 72, borderRadius: 18, backgroundColor: "#eef1fb" },
  bookingTitle: { fontSize: 19, lineHeight: 23, fontWeight: "900", marginBottom: 4 },
  blockLabel: { fontSize: 15, fontWeight: "900" },
  tierList: { gap: 10 },
  tierCard: { borderRadius: 18, borderWidth: 1, padding: 12, flexDirection: "row", gap: 10 },
  tierDisabled: { opacity: 0.52 },
  tierName: { fontSize: 15, fontWeight: "900" },
  tierDescription: { marginTop: 3, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  tierStatus: { marginTop: 6, fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  tierRight: { alignItems: "flex-end", justifyContent: "space-between", gap: 8 },
  tierPrice: { fontSize: 15, fontWeight: "900" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#dbe2f4", alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  reviewBox: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 14 },
  quantityRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  reviewMuted: { marginTop: 3, fontSize: 12, fontWeight: "700" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  quantityText: { minWidth: 22, textAlign: "center", fontSize: 17, fontWeight: "900" },
  priceRows: { gap: 9 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  priceLabel: { flex: 1, fontSize: 12, fontWeight: "800" },
  priceValue: { flex: 1, textAlign: "right", fontSize: 12, fontWeight: "900" },
  totalRow: { marginTop: 4, paddingTop: 12, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", gap: 12 },
  totalLabel: { fontSize: 15, fontWeight: "900" },
  totalValue: { fontSize: 17, fontWeight: "900" },
  paymentGrid: { flexDirection: "row", gap: 10 },
  paymentChoice: {
    flex: 1,
    minHeight: 82,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  paymentIconShell: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentCopy: { flex: 1, minWidth: 0, gap: 3 },
  paymentText: { fontSize: 13, fontWeight: "900" },
  paymentSub: { fontSize: 10, fontWeight: "800", lineHeight: 13 },
  paymentRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentRadioDot: { width: 8, height: 8, borderRadius: 4 },
  phoneInputWrap: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  phoneInput: { flex: 1, fontSize: 15, fontWeight: "800", paddingVertical: 12 },
  pendingCard: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 12 },
  pendingHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  pendingIcon: { width: 38, height: 38, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  pendingTitle: { fontSize: 16, fontWeight: "900" },
  pendingText: { marginTop: 3, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  bankDetails: { gap: 8, paddingTop: 4 },
  verifyBtn: { minHeight: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  verifyBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  sheetRoot: { flex: 1 },
  sheetHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: "900" },
  sheetSub: { marginTop: 2, fontSize: 12, fontWeight: "700" },
  sheetCloseBtn: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  sheetCloseText: { fontSize: 12, fontWeight: "900" },
  sheetBody: { padding: 16, paddingBottom: 30, gap: 12 },
  sheetHeroCard: { borderRadius: 24, borderWidth: 1, padding: 16 },
  sheetBrandRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  sheetBrandFallback: { width: 62, height: 62, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sheetAmount: { fontSize: 25, fontWeight: "900" },
  sheetInstruction: { marginTop: 5, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  sheetCard: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 10 },
  sheetCardTitle: { fontSize: 15, fontWeight: "900" },
  sheetPrimaryBtn: { minHeight: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  sheetPrimaryText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  payBtn: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  payBtnDisabled: { opacity: 0.66 },
  payBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  secondaryBtn: { minHeight: 54, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  secondaryBtnText: { fontSize: 14, fontWeight: "900" },
  successCard: { borderRadius: 28, borderWidth: 1, padding: 18, gap: 14, alignItems: "stretch" },
  successIcon: { alignSelf: "center", width: 86, height: 86, borderRadius: 43, alignItems: "center", justifyContent: "center" },
  successTitle: { textAlign: "center", fontSize: 22, fontWeight: "900" },
  successSub: { textAlign: "center", fontSize: 13, fontWeight: "700" },
  receiptBox: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 10 },
});
