import React from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  Clock,
  Crown,
  Lock,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Star,
  Ticket,
} from "lucide-react-native";
import { listTicketEvents, type TicketEvent, type TicketTier } from "@/lib/tickets";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as BG,
  EYA_BORDER as BORDER,
  EYA_GREEN as GREEN,
  EYA_MUTED as MUTED,
  EYA_TEXT as TEXT,
  availableQuantity,
  eventDateLabel,
  eventImageUrl,
  eventLocation,
  eventTimeLabel,
  firstAvailableTier,
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

export default function SelectTicketsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const [event, setEvent] = React.useState<TicketEvent | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedTierId, setSelectedTierId] = React.useState("");
  const [quantity, setQuantity] = React.useState(1);

  React.useEffect(() => {
    let active = true;
    const loadEvent = async () => {
      setLoading(true);
      setError(null);
      try {
        const events = await listTicketEvents();
        const selected = events.find((item) => item.id === eventId) ?? events[0] ?? null;
        if (active) {
          setEvent(selected);
          const tier = firstAvailableTier(selected);
          setSelectedTierId(tier?.id ?? "");
          setQuantity(tier?.available ? 1 : 0);
        }
      } catch (loadError: any) {
        if (active) setError(loadError?.message || "Could not load ticket options.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadEvent();
    return () => {
      active = false;
    };
  }, [eventId]);

  const selectedTier = event?.tiers.find((tier) => tier.id === selectedTierId) ?? null;
  const total = selectedTier ? selectedTier.priceMwk * quantity : 0;

  const updateQuantity = React.useCallback((tier: TicketTier, delta: number) => {
    const maxQuantity = Math.min(10, availableQuantity(tier));
    if (!tier.available || maxQuantity <= 0) return;

    if (delta > 0) {
      setSelectedTierId((current) => {
        if (current !== tier.id) {
          setQuantity(1);
          return tier.id;
        }
        setQuantity((next) => Math.min(maxQuantity, next + 1));
        return current;
      });
      return;
    }

    setQuantity((next) => (selectedTierId === tier.id ? Math.max(0, next - 1) : next));
  }, [selectedTierId]);

  if (loading) {
    return (
      <View style={styles.centeredRoot}>
        <ActivityIndicator color={ACCENT} />
        <Text style={styles.stateText}>Loading ticket types...</Text>
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.centeredRoot}>
        <Ticket size={34} color={ACCENT} strokeWidth={2.2} />
        <Text style={styles.stateTitle}>Tickets unavailable</Text>
        <Text style={styles.stateText}>{error || "This event has no published ticket tiers yet."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <Header />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <EventSummaryCard event={event} />

          <Text style={styles.sectionLabel}>TICKET TYPES</Text>
          <View style={styles.ticketStack}>
            {event.tiers.map((ticket, index) => (
              <TicketTypeCard
                key={ticket.id}
                ticket={ticket}
                quantity={ticket.id === selectedTierId ? quantity : 0}
                popular={index === 0}
                onDecrease={() => updateQuantity(ticket, -1)}
                onIncrease={() => updateQuantity(ticket, 1)}
              />
            ))}
            {!event.tiers.length ? <Text style={styles.emptySummary}>No ticket tiers have been added by admin.</Text> : null}
          </View>

          <OrderSummary selectedTier={selectedTier} quantity={quantity} total={total} />

          <View style={styles.securityNotice}>
            <ShieldCheck size={23} color="#8A919E" strokeWidth={2.1} />
            <Text style={styles.securityText}>Your payment is protected and encrypted</Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      <StickyCheckoutBar event={event} selectedTier={selectedTier} quantity={quantity} total={total} />
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
      <Text style={styles.headerTitle} numberOfLines={1}>Select Tickets</Text>
      <View style={styles.secureBadge}>
        <ShieldCheck size={23} color={GREEN} strokeWidth={2.2} />
        <Text style={styles.secureText} numberOfLines={1}>100% Secure</Text>
      </View>
    </View>
  );
}

function EventSummaryCard({ event }: { event: TicketEvent }) {
  return (
    <View style={styles.eventCard}>
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

function iconForTier(ticket: TicketTier) {
  const name = ticket.name.toLowerCase();
  if (name.includes("vvip")) return { Icon: Star, iconColor: "#5e73dd", iconBg: "#eef1ff" };
  if (name.includes("vip")) return { Icon: Crown, iconColor: "#5FB244", iconBg: "#eaf8f0" };
  return { Icon: Ticket, iconColor: ACCENT, iconBg: "#eef1ff" };
}

function TicketTypeCard({
  onDecrease,
  onIncrease,
  popular,
  quantity,
  ticket,
}: {
  onDecrease: () => void;
  onIncrease: () => void;
  popular?: boolean;
  quantity: number;
  ticket: TicketTier;
}) {
  const selected = quantity > 0;
  const remaining = availableQuantity(ticket);
  const disabled = !ticket.available || remaining <= 0;
  const { Icon, iconBg, iconColor } = iconForTier(ticket);

  return (
    <View style={[styles.ticketCard, selected && styles.ticketCardSelected, disabled && styles.ticketCardDisabled]}>
      {popular && !disabled ? (
        <View style={styles.popularBadge}>
          <Star size={14} color={ACCENT} fill={ACCENT} strokeWidth={2.2} />
          <Text style={styles.popularText}>POPULAR</Text>
        </View>
      ) : null}
      {disabled ? (
        <View style={styles.soldOutBadge}>
          <Text style={styles.soldOutText}>SOLD OUT</Text>
        </View>
      ) : null}
      <View style={[styles.ticketIconBox, { backgroundColor: iconBg }]}>
        <Icon size={38} color={iconColor} strokeWidth={2.2} />
      </View>
      <View style={styles.ticketInfo}>
        <Text style={styles.ticketTitle} numberOfLines={1}>{ticket.name}</Text>
        <Text style={styles.ticketSubtitle} numberOfLines={2}>{ticket.description || "Official EYA event ticket"}</Text>
        <Text style={styles.ticketPrice}>{money(ticket.priceMwk)}</Text>
      </View>
      <QuantitySelector disabled={disabled} quantity={quantity} onDecrease={onDecrease} onIncrease={onIncrease} />
    </View>
  );
}

function QuantitySelector({
  disabled,
  onDecrease,
  onIncrease,
  quantity,
}: {
  disabled?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  quantity: number;
}) {
  return (
    <View style={[styles.quantityBox, disabled && styles.quantityBoxDisabled]}>
      <Pressable disabled={quantity === 0 || disabled} style={({ pressed }) => [styles.quantityButton, (quantity === 0 || disabled) && styles.quantityButtonDisabled, pressed && styles.pressed]} onPress={onDecrease}>
        <Minus size={20} color={quantity === 0 || disabled ? "#C8CDD5" : MUTED} strokeWidth={2.4} />
      </Pressable>
      <Text style={styles.quantityText}>{quantity}</Text>
      <Pressable disabled={disabled} style={({ pressed }) => [styles.quantityButton, disabled && styles.quantityButtonDisabled, pressed && !disabled && styles.pressed]} onPress={onIncrease}>
        <Plus size={21} color={disabled ? "#C8CDD5" : ACCENT} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

function OrderSummary({ quantity, selectedTier, total }: { quantity: number; selectedTier: TicketTier | null; total: number }) {
  return (
    <View style={styles.summarySection}>
      <Text style={styles.sectionLabel}>ORDER SUMMARY</Text>
      <View style={styles.summaryCard}>
        {selectedTier && quantity > 0 ? (
          <View style={styles.summaryLine}>
            <View style={styles.summaryLineCopy}>
              <Text style={styles.summaryTitle}>{selectedTier.name}</Text>
              <Text style={styles.summaryMeta}>{money(selectedTier.priceMwk)} x {quantity}</Text>
            </View>
            <Text style={styles.summaryPrice}>{money(total)}</Text>
          </View>
        ) : (
          <Text style={styles.emptySummary}>No ticket selected</Text>
        )}
        <View style={styles.summaryDivider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{money(total)}</Text>
        </View>
      </View>
    </View>
  );
}

function StickyCheckoutBar({ event, quantity, selectedTier, total }: { event: TicketEvent; quantity: number; selectedTier: TicketTier | null; total: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const disabled = !selectedTier || quantity <= 0 || total <= 0;
  const bottom = Math.max(14, insets.bottom + 8);

  return (
    <View style={[styles.checkoutOuter, { bottom }]}>
      <View style={styles.checkoutBar}>
        <View style={styles.checkoutTotal}>
          <Text style={styles.checkoutLabel}>TOTAL</Text>
          <Text style={styles.checkoutAmount}>{money(total)}</Text>
        </View>
        <Pressable style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}>
          <Text style={styles.detailsText}>View Details</Text>
          <ChevronDown size={18} color={ACCENT} strokeWidth={2.4} />
        </Pressable>
        <Pressable
          disabled={disabled}
          style={({ pressed }) => [styles.checkoutButton, disabled && styles.checkoutButtonDisabled, pressed && !disabled && styles.pressed]}
          onPress={() => router.push({ pathname: "/(student)/market/mobile-money-payment", params: { eventId: event.id, tierId: selectedTier?.id, quantity: String(quantity) } } as any)}
        >
          <Lock size={19} color={TEXT} strokeWidth={2.5} />
          <Text style={styles.checkoutButtonText}>PROCEED TO CHECKOUT</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  centeredRoot: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  stateTitle: { color: TEXT, fontSize: 19, fontWeight: "900", textAlign: "center" },
  stateText: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" },
  header: { minHeight: 86, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  backButton: { width: 58, height: 58, borderRadius: 17, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  headerTitle: { flex: 1, color: TEXT, fontSize: 26, fontWeight: "900", letterSpacing: 0 },
  secureBadge: { minWidth: 116, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 },
  secureText: { color: GREEN, fontSize: 14, fontWeight: "900" },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 158 },
  eventCard: { borderRadius: 24, backgroundColor: "#FFFFFF", flexDirection: "row", gap: 16, padding: 16, shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  eventImage: { width: 122, height: 152, borderRadius: 17, backgroundColor: BORDER },
  eventCopy: { flex: 1, minWidth: 0, justifyContent: "center" },
  eventTitle: { color: TEXT, fontSize: 23, lineHeight: 28, fontWeight: "900", letterSpacing: 0, marginBottom: 12 },
  eventMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  eventMetaText: { flex: 1, color: MUTED, fontSize: 13, fontWeight: "800" },
  eventBadge: { alignSelf: "flex-start", minHeight: 31, borderRadius: 16, paddingHorizontal: 14, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", marginTop: 4 },
  eventBadgeText: { color: BLUE, fontSize: 13, fontWeight: "900", letterSpacing: 0.8 },
  sectionLabel: { color: TEXT, fontSize: 18, fontWeight: "900", letterSpacing: 1.8, marginTop: 36, marginBottom: 16 },
  ticketStack: { gap: 16 },
  ticketCard: { position: "relative", minHeight: 170, borderRadius: 22, borderWidth: 1, borderColor: BORDER, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 16, padding: 16, shadowColor: "#13285f", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  ticketCardSelected: { borderWidth: 2, borderColor: ACCENT },
  ticketCardDisabled: { opacity: 0.68 },
  popularBadge: { position: "absolute", top: 0, right: 0, minHeight: 35, borderTopRightRadius: 20, borderBottomLeftRadius: 18, paddingHorizontal: 14, backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", gap: 7 },
  popularText: { color: ACCENT, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  soldOutBadge: { position: "absolute", top: 0, right: 0, minHeight: 35, borderTopRightRadius: 20, borderBottomLeftRadius: 18, paddingHorizontal: 14, backgroundColor: "#E5E7EB", justifyContent: "center" },
  soldOutText: { color: MUTED, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  ticketIconBox: { width: 72, height: 72, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  ticketInfo: { flex: 1, minWidth: 0, paddingRight: 116 },
  ticketTitle: { color: TEXT, fontSize: 19, fontWeight: "900" },
  ticketSubtitle: { color: MUTED, fontSize: 14, lineHeight: 19, fontWeight: "600", marginTop: 9 },
  ticketPrice: { color: TEXT, fontSize: 22, fontWeight: "900", marginTop: 18 },
  quantityBox: { position: "absolute", right: 16, bottom: 22, width: 116, height: 54, borderRadius: 19, borderWidth: 1, borderColor: BORDER, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  quantityBoxDisabled: { backgroundColor: "#F3F4F6" },
  quantityButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  quantityButtonDisabled: { opacity: 0.55 },
  quantityText: { color: TEXT, fontSize: 23, fontWeight: "900", minWidth: 24, textAlign: "center" },
  summarySection: { marginTop: 0 },
  summaryCard: { borderRadius: 17, backgroundColor: "#f7f8fe", paddingHorizontal: 18, paddingVertical: 18 },
  summaryLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 16 },
  summaryLineCopy: { flex: 1, minWidth: 0 },
  summaryTitle: { color: TEXT, fontSize: 16, fontWeight: "900" },
  summaryMeta: { color: MUTED, fontSize: 14, fontWeight: "700", marginTop: 8 },
  summaryPrice: { color: TEXT, fontSize: 15, fontWeight: "900" },
  emptySummary: { color: MUTED, fontSize: 15, fontWeight: "700", marginBottom: 16 },
  summaryDivider: { height: 1, borderStyle: "dashed", borderWidth: 1, borderColor: BORDER, marginBottom: 18 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  totalLabel: { color: TEXT, fontSize: 18, fontWeight: "900" },
  totalAmount: { color: TEXT, fontSize: 24, fontWeight: "900" },
  securityNotice: { minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.48)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 30, paddingHorizontal: 18 },
  securityText: { color: MUTED, fontSize: 15, fontWeight: "700" },
  checkoutOuter: { position: "absolute", left: 12, right: 12 },
  checkoutBar: { minHeight: 102, borderRadius: 24, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, shadowColor: "#13285f", shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  checkoutTotal: { minWidth: 90, paddingRight: 8, borderRightWidth: 1, borderRightColor: BORDER },
  checkoutLabel: { color: MUTED, fontSize: 12, fontWeight: "900", letterSpacing: 1.4, marginBottom: 7 },
  checkoutAmount: { color: TEXT, fontSize: 23, fontWeight: "900" },
  detailsButton: { minWidth: 86, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  detailsText: { color: ACCENT, fontSize: 14, fontWeight: "900" },
  checkoutButton: { flex: 1, minHeight: 62, borderRadius: 17, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 10 },
  checkoutButtonDisabled: { backgroundColor: "#E5E7EB" },
  checkoutButtonText: { color: TEXT, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  pressed: { opacity: 0.72 },
});
