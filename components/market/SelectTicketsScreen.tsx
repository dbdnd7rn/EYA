import React from "react";
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Crown,
  Lock,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Ticket,
  UsersRound,
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
} from "@/components/market/ticketingUi";

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

  const selectTier = React.useCallback((tier: TicketTier) => {
    const maxQuantity = Math.min(10, availableQuantity(tier));
    if (!tier.available || maxQuantity <= 0) return;
    setSelectedTierId(tier.id);
    setQuantity((current) => (selectedTierId === tier.id ? Math.max(1, current) : 1));
  }, [selectedTierId]);

  const updateQuantity = React.useCallback((tier: TicketTier, delta: number) => {
    const maxQuantity = Math.min(10, availableQuantity(tier));
    if (!tier.available || maxQuantity <= 0) return;

    if (selectedTierId !== tier.id) {
      setSelectedTierId(tier.id);
      setQuantity(1);
      return;
    }

    setQuantity((current) => Math.max(0, Math.min(maxQuantity, current + delta)));
  }, [selectedTierId]);

  if (loading) {
    return (
      <View style={styles.centeredRoot}>
        <ActivityIndicator color={ACCENT} />
        <Text style={styles.stateText}>Loading ticket options...</Text>
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.centeredRoot}>
        <Ticket size={36} color={ACCENT} strokeWidth={2.3} />
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
          <EventHeroCard event={event} />
          <BookingSteps />

          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionKicker}>CHOOSE TICKETS</Text>
              <Text style={styles.sectionTitle}>Select your experience</Text>
            </View>
            <View style={styles.secureMiniBadge}>
              <ShieldCheck size={15} color={GREEN} strokeWidth={2.3} />
              <Text style={styles.secureMiniText}>Secure</Text>
            </View>
          </View>

          <View style={styles.ticketStack}>
            {event.tiers.map((ticket, index) => (
              <TicketTierCard
                key={ticket.id}
                ticket={ticket}
                quantity={ticket.id === selectedTierId ? quantity : 0}
                popular={index === 0}
                selected={ticket.id === selectedTierId && quantity > 0}
                onPress={() => selectTier(ticket)}
                onDecrease={() => updateQuantity(ticket, -1)}
                onIncrease={() => updateQuantity(ticket, 1)}
              />
            ))}
            {!event.tiers.length ? <Text style={styles.emptySummary}>No ticket tiers have been added by admin.</Text> : null}
          </View>

          <OrderSummary selectedTier={selectedTier} quantity={quantity} total={total} />

          <View style={styles.securityNotice}>
            <ShieldCheck size={22} color={GREEN} strokeWidth={2.3} />
            <View style={styles.securityCopy}>
              <Text style={styles.securityTitle}>Protected checkout</Text>
              <Text style={styles.securityText}>Your QR ticket will be issued after successful payment.</Text>
            </View>
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
        <ArrowLeft size={24} color={TEXT} strokeWidth={2.5} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>Book tickets</Text>
        <Text style={styles.headerSub}>Choose tier, quantity, then pay</Text>
      </View>
      <View style={styles.secureBadge}>
        <ShieldCheck size={20} color={GREEN} strokeWidth={2.3} />
      </View>
    </View>
  );
}

function EventHeroCard({ event }: { event: TicketEvent }) {
  return (
    <ImageBackground source={{ uri: eventImageUrl(event, true) }} style={styles.eventHero} imageStyle={styles.eventHeroImage}>
      <LinearGradient colors={["rgba(6,10,28,0.08)", "rgba(6,10,28,0.84)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.eventHeroTop}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{String(event.category || "Event").toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.eventHeroBottom}>
        <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
        <View style={styles.eventMetaGrid}>
          <EventMeta Icon={Calendar} text={eventDateLabel(event)} light />
          <EventMeta Icon={Clock} text={eventTimeLabel(event)} light />
          <EventMeta Icon={MapPin} text={eventLocation(event)} light />
        </View>
      </View>
    </ImageBackground>
  );
}

function EventMeta({ Icon, light, text }: { Icon: IconComponent; light?: boolean; text: string }) {
  return (
    <View style={styles.metaRow}>
      <Icon size={15} color={light ? "#ffffff" : MUTED} strokeWidth={2.2} />
      <Text style={[styles.metaText, light && styles.metaTextLight]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function BookingSteps() {
  return (
    <View style={styles.stepsCard}>
      <StepItem active icon={<Ticket size={18} color="#ffffff" />} label="Tickets" />
      <View style={styles.stepLine} />
      <StepItem icon={<Lock size={18} color={ACCENT} />} label="Pay" />
      <View style={styles.stepLine} />
      <StepItem icon={<CheckCircle2 size={18} color={ACCENT} />} label="QR ready" />
    </View>
  );
}

function StepItem({ active, icon, label }: { active?: boolean; icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.stepItem}>
      <View style={[styles.stepIcon, active && styles.stepIconActive]}>{icon}</View>
      <Text style={[styles.stepText, active && styles.stepTextActive]}>{label}</Text>
    </View>
  );
}

function iconForTier(ticket: TicketTier) {
  const name = ticket.name.toLowerCase();
  if (name.includes("vvip") || name.includes("gold")) return { Icon: Sparkles, iconColor: "#9b6a00", iconBg: "#fff5d8" };
  if (name.includes("vip")) return { Icon: Crown, iconColor: "#2f8f46", iconBg: "#eaf8f0" };
  return { Icon: Ticket, iconColor: ACCENT, iconBg: "#eef1ff" };
}

function TicketTierCard({
  onDecrease,
  onIncrease,
  onPress,
  popular,
  quantity,
  selected,
  ticket,
}: {
  onDecrease: () => void;
  onIncrease: () => void;
  onPress: () => void;
  popular?: boolean;
  quantity: number;
  selected: boolean;
  ticket: TicketTier;
}) {
  const remaining = availableQuantity(ticket);
  const disabled = !ticket.available || remaining <= 0;
  const { Icon, iconBg, iconColor } = iconForTier(ticket);

  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.tierCard, selected && styles.tierCardSelected, disabled && styles.tierCardDisabled, pressed && !disabled && styles.pressed]}>
      <View style={styles.tierTopRow}>
        <View style={[styles.tierIcon, { backgroundColor: iconBg }]}>
          <Icon size={30} color={iconColor} strokeWidth={2.3} />
        </View>
        <View style={styles.tierCopy}>
          <View style={styles.tierTitleRow}>
            <Text style={styles.tierTitle} numberOfLines={1}>{ticket.name}</Text>
            {selected ? <CheckCircle2 size={19} color={ACCENT} fill="#eef1ff" /> : null}
          </View>
          <Text style={styles.tierDescription} numberOfLines={2}>{ticket.description || "Official EYA event ticket"}</Text>
        </View>
      </View>

      <View style={styles.tierFooter}>
        <View>
          <Text style={styles.priceLabel}>PRICE</Text>
          <Text style={styles.tierPrice}>{money(ticket.priceMwk)}</Text>
          <Text style={styles.remainingText}>{disabled ? "Sold out" : remaining > 20 ? "Available now" : `${remaining} left`}</Text>
        </View>
        <QuantitySelector disabled={disabled} quantity={quantity} onDecrease={onDecrease} onIncrease={onIncrease} />
      </View>

      {popular && !disabled ? (
        <View style={styles.popularBadge}>
          <Sparkles size={13} color={ACCENT} strokeWidth={2.4} />
          <Text style={styles.popularText}>Popular</Text>
        </View>
      ) : null}
      {disabled ? (
        <View style={styles.soldOutBadge}>
          <Text style={styles.soldOutText}>Sold out</Text>
        </View>
      ) : null}
    </Pressable>
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
        <Minus size={18} color={quantity === 0 || disabled ? "#C8CDD5" : TEXT} strokeWidth={2.6} />
      </Pressable>
      <Text style={styles.quantityText}>{quantity}</Text>
      <Pressable disabled={disabled} style={({ pressed }) => [styles.quantityButton, disabled && styles.quantityButtonDisabled, pressed && !disabled && styles.pressed]} onPress={onIncrease}>
        <Plus size={19} color={disabled ? "#C8CDD5" : ACCENT} strokeWidth={2.6} />
      </Pressable>
    </View>
  );
}

function OrderSummary({ quantity, selectedTier, total }: { quantity: number; selectedTier: TicketTier | null; total: number }) {
  const hasTicket = selectedTier && quantity > 0;
  return (
    <View style={styles.summarySection}>
      <Text style={styles.sectionKicker}>ORDER SUMMARY</Text>
      <View style={styles.summaryCard}>
        {hasTicket ? (
          <View style={styles.summaryLine}>
            <View style={styles.summaryLineCopy}>
              <Text style={styles.summaryTitle}>{selectedTier.name}</Text>
              <Text style={styles.summaryMeta}>{money(selectedTier.priceMwk)} × {quantity}</Text>
            </View>
            <Text style={styles.summaryPrice}>{money(total)}</Text>
          </View>
        ) : (
          <Text style={styles.emptySummary}>Choose a ticket type to continue.</Text>
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
        <View style={styles.checkoutCopy}>
          <Text style={styles.checkoutLabel}>{quantity || 0} ticket{quantity === 1 ? "" : "s"} selected</Text>
          <Text style={styles.checkoutAmount}>{money(total)}</Text>
        </View>
        <Pressable
          disabled={disabled}
          style={({ pressed }) => [styles.checkoutButton, disabled && styles.checkoutButtonDisabled, pressed && !disabled && styles.pressed]}
          onPress={() => router.push({ pathname: "/(student)/market/mobile-money-payment", params: { eventId: event.id, tierId: selectedTier?.id, quantity: String(quantity) } } as any)}
        >
          <Lock size={17} color="#ffffff" strokeWidth={2.6} />
          <Text style={styles.checkoutButtonText}>{disabled ? "Select ticket" : "Checkout"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  centeredRoot: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  stateTitle: { color: TEXT, fontSize: 20, fontWeight: "900", textAlign: "center" },
  stateText: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" },
  header: { minHeight: 78, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 13 },
  backButton: { width: 48, height: 48, borderRadius: 17, backgroundColor: "#ffffff", borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: TEXT, fontSize: 27, lineHeight: 32, fontWeight: "900" },
  headerSub: { color: MUTED, fontSize: 12, fontWeight: "800", marginTop: 2 },
  secureBadge: { width: 48, height: 48, borderRadius: 18, backgroundColor: "#eaf8f0", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#d8f0df" },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 168, gap: 18 },
  eventHero: { minHeight: 268, borderRadius: 30, overflow: "hidden", justifyContent: "space-between", padding: 16, backgroundColor: "#111827", shadowColor: "#13285f", shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  eventHeroImage: { borderRadius: 30 },
  eventHeroTop: { flexDirection: "row", justifyContent: "flex-start" },
  categoryBadge: { minHeight: 34, borderRadius: 17, backgroundColor: ACCENT, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  categoryBadgeText: { color: "#ffffff", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  eventHeroBottom: { gap: 11 },
  eventTitle: { color: "#ffffff", fontSize: 30, lineHeight: 36, fontWeight: "900" },
  eventMetaGrid: { gap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { flex: 1, color: MUTED, fontSize: 13, fontWeight: "800" },
  metaTextLight: { color: "#ffffff" },
  stepsCard: { minHeight: 78, borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", paddingHorizontal: 12, shadowColor: "#13285f", shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  stepItem: { flex: 1, alignItems: "center", gap: 6 },
  stepIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  stepIconActive: { backgroundColor: ACCENT },
  stepText: { color: MUTED, fontSize: 11, fontWeight: "900" },
  stepTextActive: { color: TEXT },
  stepLine: { width: 24, height: 1, backgroundColor: BORDER },
  sectionHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 2 },
  sectionKicker: { color: MUTED, fontSize: 12, fontWeight: "900", letterSpacing: 1.7 },
  sectionTitle: { color: TEXT, fontSize: 24, lineHeight: 29, fontWeight: "900", marginTop: 5 },
  secureMiniBadge: { minHeight: 34, borderRadius: 999, backgroundColor: "#eaf8f0", borderWidth: 1, borderColor: "#d8f0df", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11 },
  secureMiniText: { color: GREEN, fontSize: 12, fontWeight: "900" },
  ticketStack: { gap: 14 },
  tierCard: { position: "relative", borderRadius: 26, borderWidth: 1, borderColor: BORDER, backgroundColor: "#ffffff", padding: 15, gap: 14, shadowColor: "#13285f", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  tierCardSelected: { borderWidth: 2, borderColor: ACCENT, backgroundColor: "#fbfcff" },
  tierCardDisabled: { opacity: 0.58 },
  tierTopRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  tierIcon: { width: 62, height: 62, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  tierCopy: { flex: 1, minWidth: 0 },
  tierTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  tierTitle: { flex: 1, minWidth: 0, color: TEXT, fontSize: 19, lineHeight: 24, fontWeight: "900" },
  tierDescription: { color: MUTED, fontSize: 13, lineHeight: 19, fontWeight: "700", marginTop: 5 },
  tierFooter: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  priceLabel: { color: MUTED, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  tierPrice: { color: TEXT, fontSize: 24, lineHeight: 29, fontWeight: "900", marginTop: 3 },
  remainingText: { color: MUTED, fontSize: 11, fontWeight: "800", marginTop: 4 },
  popularBadge: { position: "absolute", top: 0, right: 0, minHeight: 34, borderTopRightRadius: 24, borderBottomLeftRadius: 18, backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12 },
  popularText: { color: ACCENT, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  soldOutBadge: { position: "absolute", top: 0, right: 0, minHeight: 34, borderTopRightRadius: 24, borderBottomLeftRadius: 18, backgroundColor: "#e5e7eb", justifyContent: "center", paddingHorizontal: 12 },
  soldOutText: { color: MUTED, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  quantityBox: { minWidth: 128, height: 52, borderRadius: 19, borderWidth: 1, borderColor: BORDER, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10 },
  quantityBoxDisabled: { backgroundColor: "#f3f4f6" },
  quantityButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  quantityButtonDisabled: { opacity: 0.55 },
  quantityText: { color: TEXT, fontSize: 22, fontWeight: "900", minWidth: 24, textAlign: "center" },
  summarySection: { gap: 12, marginTop: 4 },
  summaryCard: { borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: "#ffffff", padding: 18, gap: 15 },
  summaryLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  summaryLineCopy: { flex: 1, minWidth: 0 },
  summaryTitle: { color: TEXT, fontSize: 16, fontWeight: "900" },
  summaryMeta: { color: MUTED, fontSize: 13, fontWeight: "800", marginTop: 6 },
  summaryPrice: { color: TEXT, fontSize: 16, fontWeight: "900" },
  emptySummary: { color: MUTED, fontSize: 14, fontWeight: "700" },
  summaryDivider: { height: 1, borderStyle: "dashed", borderWidth: 1, borderColor: BORDER },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  totalLabel: { color: TEXT, fontSize: 18, fontWeight: "900" },
  totalAmount: { color: TEXT, fontSize: 26, fontWeight: "900" },
  securityNotice: { minHeight: 78, borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.62)", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 },
  securityCopy: { flex: 1, minWidth: 0 },
  securityTitle: { color: TEXT, fontSize: 15, fontWeight: "900" },
  securityText: { color: MUTED, fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 3 },
  checkoutOuter: { position: "absolute", left: 14, right: 14 },
  checkoutBar: { minHeight: 94, borderRadius: 28, backgroundColor: "#ffffff", borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, shadowColor: "#13285f", shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  checkoutCopy: { flex: 1, minWidth: 0 },
  checkoutLabel: { color: MUTED, fontSize: 12, fontWeight: "900" },
  checkoutAmount: { color: TEXT, fontSize: 25, lineHeight: 31, fontWeight: "900", marginTop: 4 },
  checkoutButton: { minWidth: 142, minHeight: 58, borderRadius: 19, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  checkoutButtonDisabled: { backgroundColor: "#cfd4df" },
  checkoutButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.72 },
});
