import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Lock, Minus, Plus, ShieldCheck, Ticket } from "lucide-react-native";
import type { TicketEvent, TicketTier } from "@/lib/tickets";
import { listTicketEventsSafe } from "@/lib/ticketEventsSafe";
import { EYA_ACCENT as ACCENT, EYA_BG as BG, EYA_BORDER as BORDER, EYA_MUTED as MUTED, EYA_TEXT as TEXT, availableQuantity, firstAvailableTier, money } from "@/components/market/ticketingUi";

export default function SelectTicketsFastScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const [event, setEvent] = React.useState<TicketEvent | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tierId, setTierId] = React.useState("");
  const [qty, setQty] = React.useState(1);

  React.useEffect(() => {
    let mounted = true;
    void listTicketEventsSafe().then((rows) => {
      const selected = typeof eventId === "string" ? rows.find((item) => item.id === eventId) ?? null : null;
      if (!mounted) return;
      setEvent(selected);
      const first = selected ? firstAvailableTier(selected) : null;
      setTierId(first?.id ?? "");
      setQty(first?.available ? 1 : 0);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [eventId]);

  const selectedTier = event?.tiers.find((tier) => tier.id === tierId) ?? null;
  const total = Number(selectedTier?.priceMwk || 0) * qty;

  const pick = (tier: TicketTier) => {
    if (!tier.available || availableQuantity(tier) <= 0) return;
    setTierId(tier.id);
    setQty(tierId === tier.id ? Math.max(1, qty) : 1);
  };

  const changeQty = (tier: TicketTier, delta: number) => {
    if (!tier.available || availableQuantity(tier) <= 0) return;
    if (tierId !== tier.id) {
      setTierId(tier.id);
      setQty(1);
      return;
    }
    setQty((current) => Math.max(0, Math.min(10, Math.min(availableQuantity(tier), current + delta))));
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={ACCENT} /><Text style={styles.muted}>Loading ticket options...</Text></View>;
  }

  if (!event) {
    return <View style={styles.center}><Ticket color={ACCENT} size={36} /><Text style={styles.title}>Event unavailable</Text><Text style={styles.muted}>This event could not be found or is no longer available.</Text></View>;
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable style={styles.roundBtn} onPress={() => router.back()}><ArrowLeft color={TEXT} size={24} /></Pressable>
          <Text style={styles.headerTitle}>Select Tickets</Text>
          <View style={styles.secure}><ShieldCheck color={ACCENT} size={18} /><Text style={styles.secureText}>Verified Checkout</Text></View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: Math.max(230, insets.bottom + 190) }]}>
          <Text style={styles.kicker}>CHOOSE YOUR TICKET</Text>
          {event.tiers.map((tier, index) => {
            const active = tier.id === tierId && qty > 0;
            const disabled = !tier.available || availableQuantity(tier) <= 0;
            return (
              <Pressable key={tier.id} disabled={disabled} onPress={() => pick(tier)} style={[styles.ticketCard, active && styles.ticketCardActive, disabled && styles.ticketCardOff]}>
                <View style={styles.glassTop} />
                <View style={styles.ticketIcon}><Ticket color={disabled ? MUTED : ACCENT} size={30} /></View>
                <View style={styles.ticketCopy}>
                  <View style={styles.ticketNameRow}><Text style={styles.ticketName} numberOfLines={1}>{tier.name}</Text>{index === 0 && !disabled ? <View style={styles.badge}><Text style={styles.badgeText}>POPULAR</Text></View> : null}</View>
                  <Text style={styles.ticketDesc} numberOfLines={2}>{tier.description || "Official EYA event ticket"}</Text>
                  <Text style={[styles.price, active && styles.priceActive]}>{money(tier.priceMwk)}</Text>
                </View>
                <View style={styles.qtyBox}>
                  <Pressable onPress={() => changeQty(tier, -1)}><Minus color={qty > 0 && active ? TEXT : MUTED} size={18} /></Pressable>
                  <Text style={styles.qty}>{active ? qty : 0}</Text>
                  <Pressable onPress={() => changeQty(tier, 1)}><Plus color={disabled ? MUTED : ACCENT} size={18} /></Pressable>
                </View>
              </Pressable>
            );
          })}
          <Text style={styles.kicker}>ORDER SUMMARY</Text>
          <View style={styles.summaryCard}>
            <View style={styles.row}><Text style={styles.summaryTitle}>{selectedTier?.name || "Select ticket"}</Text><Text style={styles.summaryTitle}>{money(total)}</Text></View>
            <Text style={styles.muted}>{selectedTier ? `${money(selectedTier.priceMwk)} × ${qty}` : "Choose a ticket type to continue"}</Text>
            <View style={styles.divider} />
            <View style={styles.row}><Text style={styles.totalLabel}>Total</Text><Text style={styles.total}>{money(total)}</Text></View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <View style={[styles.bottom, { bottom: Math.max(14, insets.bottom + 8) }]}>
        <View style={styles.bottomTop}><View><Text style={styles.bottomLabel}>TOTAL</Text><Text style={styles.bottomAmount}>{money(total)}</Text></View><Text style={styles.details}>View Details</Text></View>
        <Pressable disabled={!selectedTier || qty <= 0} style={[styles.checkout, (!selectedTier || qty <= 0) && styles.checkoutOff]} onPress={() => router.push({ pathname: "/(student)/market/mobile-money-payment", params: { eventId: event.id, tierId: selectedTier?.id, quantity: String(qty) } } as any)}><Text style={styles.checkoutText}>Proceed to Checkout</Text><Lock color="#fff" size={17} /></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, safe: { flex: 1 }, center: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }, muted: { color: MUTED, fontSize: 13, fontWeight: "700", textAlign: "center" }, title: { color: TEXT, fontSize: 22, fontWeight: "900" },
  header: { minHeight: 78, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12 }, roundBtn: { width: 48, height: 48, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.86)", borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" }, headerTitle: { flex: 1, color: TEXT, fontSize: 24, fontWeight: "900" }, secure: { flexDirection: "row", alignItems: "center", gap: 6 }, secureText: { color: ACCENT, fontSize: 12, fontWeight: "900" },
  content: { paddingHorizontal: 18, gap: 18 }, kicker: { color: TEXT, fontSize: 12, fontWeight: "900", letterSpacing: 1.7 },
  ticketCard: { minHeight: 178, borderRadius: 28, borderWidth: 1, borderColor: "rgba(105,119,216,0.28)", backgroundColor: "rgba(255,255,255,0.62)", flexDirection: "row", alignItems: "center", gap: 14, padding: 16, overflow: "hidden", shadowColor: "#13285f", shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 5 }, ticketCardActive: { borderWidth: 2, borderColor: ACCENT, backgroundColor: "rgba(255,255,255,0.94)" }, ticketCardOff: { opacity: 0.6 }, glassTop: { position: "absolute", left: 0, right: 0, top: 0, height: 74, backgroundColor: "rgba(255,255,255,0.42)" }, ticketIcon: { width: 72, height: 72, borderRadius: 22, backgroundColor: "rgba(238,241,255,0.95)", alignItems: "center", justifyContent: "center" }, ticketCopy: { flex: 1, minWidth: 0, paddingRight: 88 }, ticketNameRow: { flexDirection: "row", alignItems: "center", gap: 8 }, ticketName: { flex: 1, color: TEXT, fontSize: 18, fontWeight: "900" }, ticketDesc: { color: MUTED, fontSize: 13, lineHeight: 19, fontWeight: "700", marginTop: 8 }, price: { color: TEXT, fontSize: 22, fontWeight: "900", marginTop: 15 }, priceActive: { color: ACCENT }, badge: { borderRadius: 999, backgroundColor: ACCENT, paddingHorizontal: 8, paddingVertical: 5 }, badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" }, qtyBox: { position: "absolute", right: 14, bottom: 18, width: 112, height: 52, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 }, qty: { color: TEXT, fontSize: 21, fontWeight: "900" },
  summaryCard: { borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.86)", padding: 18, gap: 12 }, row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, summaryTitle: { color: TEXT, fontSize: 16, fontWeight: "900" }, divider: { height: 1, borderWidth: 1, borderColor: BORDER, borderStyle: "dashed" }, totalLabel: { color: TEXT, fontSize: 17, fontWeight: "900" }, total: { color: ACCENT, fontSize: 25, fontWeight: "900" },
  bottom: { position: "absolute", left: 14, right: 14, borderRadius: 28, backgroundColor: "#fff", borderWidth: 1, borderColor: BORDER, padding: 14, gap: 12, shadowColor: "#13285f", shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 16 }, bottomTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, bottomLabel: { color: MUTED, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 }, bottomAmount: { color: TEXT, fontSize: 24, fontWeight: "900", marginTop: 4 }, details: { color: ACCENT, fontSize: 12, fontWeight: "900" }, checkout: { minHeight: 58, borderRadius: 18, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }, checkoutOff: { backgroundColor: "#cfd4df" }, checkoutText: { color: "#fff", fontSize: 15, fontWeight: "900" },
});
