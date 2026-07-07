import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CheckCircle2, Crown, Lock, Minus, Plus, ShieldCheck, Sparkles, Ticket } from "lucide-react-native";
import { listTicketEvents, type TicketEvent, type TicketTier } from "@/lib/tickets";
import { EYA_ACCENT as ACCENT, EYA_BG as BG, EYA_BORDER as BORDER, EYA_GREEN as GREEN, EYA_MUTED as MUTED, EYA_TEXT as TEXT, availableQuantity, firstAvailableTier, money } from "@/components/market/ticketingUi";

type IconComponent = React.ComponentType<{ size?: number; color?: string; fill?: string; strokeWidth?: number }>;

export default function SelectTicketsScreenV2() {
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
    return <View style={styles.centeredRoot}><ActivityIndicator color={ACCENT} /><Text style={styles.stateText}>Loading ticket options...</Text></View>;
  }

  if (error || !event) {
    return <View style={styles.centeredRoot}><Ticket size={36} color={ACCENT} /><Text style={styles.stateTitle}>Tickets unavailable</Text><Text style={styles.stateText}>{error || "This event has no published ticket tiers yet."}</Text></View>;
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <Header />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionKicker}>CHOOSE YOUR TICKET</Text>
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
          </View>
          <OrderSummary selectedTier={selectedTier} quantity={quantity} total={total} />
          <View style={styles.securityNotice}><ShieldCheck size={20} color={ACCENT} /><Text style={styles.securityText}>Your payment is protected and encrypted</Text></View>
        </ScrollView>
      </SafeAreaView>
      <StickyCheckoutBar event={event} selectedTier={selectedTier} quantity={quantity} total={total} />
    </View>
  );
}

function Header() {
  const router = useRouter();
  return <View style={styles.header}><Pressable style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} onPress={() => router.back()}><ArrowLeft size={24} color={TEXT} /></Pressable><Text style={styles.headerTitle}>Select Tickets</Text><View style={styles.secureTextWrap}><ShieldCheck size={19} color={ACCENT} /><Text style={styles.secureText}>100% Secure</Text></View></View>;
}

function iconForTier(ticket: TicketTier): { Icon: IconComponent; iconColor: string; iconBg: string } {
  const name = ticket.name.toLowerCase();
  if (name.includes("vvip") || name.includes("gold")) return { Icon: Sparkles, iconColor: "#ef3f75", iconBg: "#fff0f5" };
  if (name.includes("vip")) return { Icon: Crown, iconColor: "#38a353", iconBg: "#eaf8f0" };
  return { Icon: Ticket, iconColor: ACCENT, iconBg: "#eef1ff" };
}

function TicketTierCard({ onDecrease, onIncrease, onPress, popular, quantity, selected, ticket }: { onDecrease: () => void; onIncrease: () => void; onPress: () => void; popular?: boolean; quantity: number; selected: boolean; ticket: TicketTier }) {
  const remaining = availableQuantity(ticket);
  const disabled = !ticket.available || remaining <= 0;
  const { Icon, iconBg, iconColor } = iconForTier(ticket);
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.tierCard, selected && styles.tierCardSelected, disabled && styles.tierCardDisabled, pressed && !disabled && styles.pressed]}>
      <View style={[styles.tierIcon, { backgroundColor: iconBg }]}><Icon size={32} color={iconColor} /></View>
      <View style={styles.tierCopy}>
        <View style={styles.tierTitleRow}><Text style={styles.tierTitle} numberOfLines={1}>{ticket.name}</Text>{selected ? <CheckCircle2 size={18} color={ACCENT} fill="#eef1ff" /> : null}</View>
        <Text style={styles.tierDescription} numberOfLines={2}>{ticket.description || "Official EYA event ticket"}</Text>
        <Text style={styles.tierPrice}>{money(ticket.priceMwk)}</Text>
      </View>
      <QuantitySelector disabled={disabled} quantity={quantity} onDecrease={onDecrease} onIncrease={onIncrease} />
      {popular && !disabled ? <View style={styles.popularBadge}><Text style={styles.popularText}>POPULAR</Text></View> : null}
      {disabled ? <View style={styles.soldOutBadge}><Text style={styles.soldOutText}>SOLD OUT</Text></View> : null}
    </Pressable>
  );
}

function QuantitySelector({ disabled, onDecrease, onIncrease, quantity }: { disabled?: boolean; onDecrease: () => void; onIncrease: () => void; quantity: number }) {
  return <View style={[styles.quantityBox, disabled && styles.quantityBoxDisabled]}><Pressable disabled={quantity === 0 || disabled} style={styles.quantityButton} onPress={onDecrease}><Minus size={18} color={quantity === 0 || disabled ? "#C8CDD5" : MUTED} /></Pressable><Text style={styles.quantityText}>{quantity}</Text><Pressable disabled={disabled} style={styles.quantityButton} onPress={onIncrease}><Plus size={19} color={disabled ? "#C8CDD5" : ACCENT} /></Pressable></View>;
}

function OrderSummary({ quantity, selectedTier, total }: { quantity: number; selectedTier: TicketTier | null; total: number }) {
  const hasTicket = selectedTier && quantity > 0;
  return (
    <View style={styles.summarySection}>
      <Text style={styles.sectionKicker}>ORDER SUMMARY</Text>
      <View style={styles.summaryCard}>
        {hasTicket ? <><View style={styles.summaryLine}><View><Text style={styles.summaryTitle}>{selectedTier.name}</Text><Text style={styles.summaryMeta}>{money(selectedTier.priceMwk)} × {quantity}</Text></View><Text style={styles.summaryPrice}>{money(total)}</Text></View><View style={styles.summaryLineMuted}><Text style={styles.summaryMutedText}>Subtotal</Text><Text style={styles.summaryMutedText}>{money(total)}</Text></View><View style={styles.summaryLineMuted}><Text style={styles.summaryMutedText}>Service Fee</Text><Text style={styles.summaryMutedText}>{money(0)}</Text></View></> : <Text style={styles.emptySummary}>Choose a ticket type to continue.</Text>}
        <View style={styles.summaryDivider} />
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalAmount}>{money(total)}</Text></View>
      </View>
    </View>
  );
}

function StickyCheckoutBar({ event, quantity, selectedTier, total }: { event: TicketEvent; quantity: number; selectedTier: TicketTier | null; total: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const disabled = !selectedTier || quantity <= 0 || total <= 0;
  const bottom = Math.max(14, insets.bottom + 8);
  return <View style={[styles.checkoutOuter, { bottom }]}><View style={styles.checkoutBar}><View style={styles.checkoutCopy}><Text style={styles.checkoutLabel}>TOTAL</Text><Text style={styles.checkoutAmount}>{money(total)}</Text></View><Pressable style={styles.detailsButton}><Text style={styles.detailsText}>View Details</Text></Pressable><Pressable disabled={disabled} style={({ pressed }) => [styles.checkoutButton, disabled && styles.checkoutButtonDisabled, pressed && !disabled && styles.pressed]} onPress={() => router.push({ pathname: "/(student)/market/mobile-money-payment", params: { eventId: event.id, tierId: selectedTier?.id, quantity: String(quantity) } } as any)}><Text style={styles.checkoutButtonText}>{disabled ? "Select" : "Proceed"}</Text><Lock size={16} color="#ffffff" /></Pressable></View></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, safeArea: { flex: 1, backgroundColor: BG }, centeredRoot: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  stateTitle: { color: TEXT, fontSize: 20, fontWeight: "900", textAlign: "center" }, stateText: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" },
  header: { minHeight: 78, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 13 }, backButton: { width: 48, height: 48, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: TEXT, fontSize: 24, fontWeight: "900" }, secureTextWrap: { flexDirection: "row", alignItems: "center", gap: 7 }, secureText: { color: ACCENT, fontSize: 12, fontWeight: "900" },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 170, gap: 18 }, sectionKicker: { color: TEXT, fontSize: 12, fontWeight: "900", letterSpacing: 1.7 }, ticketStack: { gap: 18 },
  tierCard: { position: "relative", minHeight: 170, borderRadius: 22, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.84)", flexDirection: "row", alignItems: "center", gap: 14, padding: 16, shadowColor: "#13285f", shadowOpacity: 0.05, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 3 },
  tierCardSelected: { borderWidth: 2, borderColor: ACCENT, backgroundColor: "#ffffff" }, tierCardDisabled: { opacity: 0.62 }, tierIcon: { width: 72, height: 72, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tierCopy: { flex: 1, minWidth: 0, paddingRight: 88 }, tierTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 }, tierTitle: { flex: 1, color: TEXT, fontSize: 18, lineHeight: 23, fontWeight: "900" },
  tierDescription: { color: MUTED, fontSize: 13, lineHeight: 19, fontWeight: "700", marginTop: 8 }, tierPrice: { color: TEXT, fontSize: 22, lineHeight: 27, fontWeight: "900", marginTop: 15 },
  quantityBox: { position: "absolute", right: 14, bottom: 18, width: 108, height: 50, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 }, quantityBoxDisabled: { backgroundColor: "#f3f4f6" }, quantityButton: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }, quantityText: { color: TEXT, fontSize: 21, fontWeight: "900", minWidth: 22, textAlign: "center" },
  popularBadge: { position: "absolute", top: 0, right: 0, minHeight: 34, borderTopRightRadius: 20, borderBottomLeftRadius: 18, backgroundColor: ACCENT, justifyContent: "center", paddingHorizontal: 13 }, popularText: { color: "#ffffff", fontSize: 11, fontWeight: "900", letterSpacing: 0.7 },
  soldOutBadge: { position: "absolute", top: 0, right: 0, minHeight: 34, borderTopRightRadius: 20, borderBottomLeftRadius: 18, backgroundColor: "#e5e7eb", justifyContent: "center", paddingHorizontal: 13 }, soldOutText: { color: MUTED, fontSize: 11, fontWeight: "900", letterSpacing: 0.7 },
  summarySection: { gap: 12, marginTop: 8 }, summaryCard: { borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.84)", padding: 18, gap: 15 }, summaryLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 }, summaryTitle: { color: TEXT, fontSize: 16, fontWeight: "900" }, summaryMeta: { color: MUTED, fontSize: 13, fontWeight: "800", marginTop: 6 }, summaryPrice: { color: TEXT, fontSize: 15, fontWeight: "900" }, summaryLineMuted: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, summaryMutedText: { color: TEXT, fontSize: 13, fontWeight: "600" }, emptySummary: { color: MUTED, fontSize: 14, fontWeight: "700" }, summaryDivider: { height: 1, borderStyle: "dashed", borderWidth: 1, borderColor: BORDER }, totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 }, totalLabel: { color: TEXT, fontSize: 17, fontWeight: "900" }, totalAmount: { color: ACCENT, fontSize: 25, fontWeight: "900" },
  securityNotice: { minHeight: 58, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.66)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 }, securityText: { color: MUTED, fontSize: 13, fontWeight: "800" },
  checkoutOuter: { position: "absolute", left: 14, right: 14 }, checkoutBar: { minHeight: 104, borderRadius: 26, backgroundColor: "#ffffff", borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, shadowColor: "#13285f", shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 }, checkoutCopy: { minWidth: 96, paddingRight: 8, borderRightWidth: 1, borderRightColor: BORDER }, checkoutLabel: { color: MUTED, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 }, checkoutAmount: { color: TEXT, fontSize: 22, lineHeight: 27, fontWeight: "900", marginTop: 6 }, detailsButton: { minWidth: 78, alignItems: "center", justifyContent: "center" }, detailsText: { color: ACCENT, fontSize: 12, fontWeight: "900", textAlign: "center" }, checkoutButton: { flex: 1, minHeight: 64, borderRadius: 18, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 }, checkoutButtonDisabled: { backgroundColor: "#cfd4df" }, checkoutButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "900" }, pressed: { opacity: 0.72 },
});
