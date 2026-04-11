import React from "react";
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  BadgeCheck,
  Bike,
  ChevronRight,
  Clock3,
  MapPin,
  Phone,
  Store,
} from "lucide-react-native";
import { goBackOrFallback } from "@/lib/navigation";
import { getOrderHandoffDetails, type OrderHandoffDetails } from "@/lib/orderHandoff";
import { useAuth } from "@/providers/AuthProvider";

type Props = {
  fallbackRoute: "/(food)/(tabs)/orders" | "/(student)/(tabs)/orders";
};

export default function FoodDeliveryTrackingScreen({ fallbackRoute }: Props) {
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ orderId?: string; from?: string; to?: string; eta?: string }>();
  const [handoff, setHandoff] = React.useState<OrderHandoffDetails | null>(null);
  const [handoffLoading, setHandoffLoading] = React.useState(true);
  const [handoffError, setHandoffError] = React.useState<string | null>(null);

  const orderId = params.orderId ?? "ORD-1001";
  const from = params.from ?? "Vendor pickup";
  const to = params.to ?? "Campus residence";
  const eta = params.eta ?? "18 min";

  const progress = [
    { title: "Order confirmed", note: "Kitchen received your order and started prep.", done: true },
    { title: "Rider assigned", note: "A nearby rider has accepted the trip.", done: true },
    { title: "Picked up", note: "Meal collected and packed for delivery.", done: true },
    { title: "On the way", note: "Rider is heading to your drop-off point.", done: true, active: true },
    { title: "Delivered", note: "Final handoff at your selected location.", done: false },
  ];

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      setHandoffLoading(true);
      setHandoffError(null);
      try {
        const next = await getOrderHandoffDetails(orderId, session?.access_token);
        if (!active) return;
        setHandoff(next);
      } catch (e: any) {
        if (!active) return;
        setHandoffError(e?.message ?? "Could not load delivery pass.");
      } finally {
        if (active) setHandoffLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [orderId, session?.access_token]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.bgGlowOne} />
      <View style={styles.bgGlowTwo} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backBtn} onPress={() => goBackOrFallback(router, fallbackRoute)}>
          <ArrowLeft size={18} color="#16315f" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>Live delivery</Text>
              <Text style={styles.heroTitle}>Order {orderId}</Text>
            </View>
            <View style={styles.etaBadge}>
              <Clock3 size={14} color="#ffffff" />
              <Text style={styles.etaText}>ETA {eta}</Text>
            </View>
          </View>

          <Text style={styles.heroSub}>Your rider is already on the road. Route updates and the final drop-off are shown below.</Text>

          <View style={styles.routeShell}>
            <View style={styles.routeLine} />
            <View style={styles.routeStop}>
              <View style={styles.routeIconStart}>
                <Store size={16} color="#16315f" />
              </View>
              <View style={styles.routeCopy}>
                <Text style={styles.routeLabel}>Pickup</Text>
                <Text style={styles.routeText}>{from}</Text>
              </View>
            </View>
            <View style={styles.routeStop}>
              <View style={styles.routeIconActive}>
                <Bike size={16} color="#ffffff" />
              </View>
              <View style={styles.routeCopy}>
                <Text style={styles.routeLabel}>Current status</Text>
                <Text style={styles.routeText}>Rider is on the way to you</Text>
              </View>
            </View>
            <View style={styles.routeStop}>
              <View style={styles.routeIconEnd}>
                <MapPin size={16} color="#0f6d80" />
              </View>
              <View style={styles.routeCopy}>
                <Text style={styles.routeLabel}>Drop-off</Text>
                <Text style={styles.routeText}>{to}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery pass</Text>
          <Text style={styles.sectionSub}>Show this invoice, QR, or PIN to the rider to confirm the handoff goes to the right person.</Text>

          {handoffLoading ? (
            <View style={styles.securityLoading}>
              <ActivityIndicator size="small" color="#0f6d80" />
              <Text style={styles.securityLoadingText}>Loading delivery pass...</Text>
            </View>
          ) : handoff ? (
            <>
              <View style={styles.invoiceCard}>
                <View style={styles.invoiceTop}>
                  <View>
                    <Text style={styles.invoiceLabel}>Invoice Ref</Text>
                    <Text style={styles.invoiceRef}>{handoff.invoice.order_reference ?? orderId}</Text>
                  </View>
                  <View style={styles.paidPill}>
                    <Text style={styles.paidPillText}>Paid</Text>
                  </View>
                </View>

                <Text style={styles.invoiceTitle}>{handoff.invoice.title ?? "Food order"}</Text>
                <Text style={styles.invoiceMeta}>
                  {handoff.invoice.line_items.map((line) => `${line.quantity}x ${line.item_name_snapshot}`).join(" · ") || "Delivery order"}
                </Text>
                <Text style={styles.invoiceMeta}>{handoff.invoice.delivery_address ?? to}</Text>
              </View>

              <View style={styles.securityRow}>
                <View style={styles.pinCard}>
                  <Text style={styles.pinLabel}>Delivery PIN</Text>
                  <Text style={styles.pinValue}>{handoff.handoff.delivery_pin ?? "------"}</Text>
                  <Text style={styles.pinSub}>Give this only when the rider reaches you.</Text>
                </View>

                <View style={styles.qrCard}>
                  {handoff.handoff.qr_data_url ? <Image source={{ uri: handoff.handoff.qr_data_url }} style={styles.qrImage} /> : null}
                  <Text style={styles.qrLabel}>QR handoff pass</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Delivery pass unavailable</Text>
              <Text style={styles.noticeSub}>{handoffError ?? "The handoff pass could not be loaded yet."}</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery timeline</Text>
          <View style={styles.timelineList}>
            {progress.map((step, index) => (
              <View key={step.title} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, step.done && styles.timelineDotDone, step.active && styles.timelineDotActive]} />
                  {index < progress.length - 1 ? <View style={[styles.timelineStem, step.done && styles.timelineStemDone]} /> : null}
                </View>
                <View style={[styles.timelineCard, step.active && styles.timelineCardActive]}>
                  <Text style={[styles.timelineTitle, step.active && styles.timelineTitleActive]}>{step.title}</Text>
                  <Text style={[styles.timelineNote, step.active && styles.timelineNoteActive]}>{step.note}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.riderHeader}>
            <View style={styles.riderBadge}>
              <BadgeCheck size={18} color="#0f6d80" />
            </View>
            <View style={styles.riderCopy}>
              <Text style={styles.sectionTitle}>Rider details</Text>
              <Text style={styles.riderSub}>Mphatso Banda | Bike | PB 2331</Text>
            </View>
          </View>

          <View style={styles.riderMetaRow}>
            <MetaTile label="Pickup" value={from} />
            <MetaTile label="Destination" value={to} />
          </View>

          <Pressable style={styles.callBtn}>
            <Phone size={16} color="#ffffff" />
            <Text style={styles.callBtnText}>Call rider</Text>
            <ChevronRight size={18} color="#ffffff" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaTile}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef6f8" },
  bgGlowOne: {
    position: "absolute",
    top: -70,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(185,223,232,0.6)",
  },
  bgGlowTwo: {
    position: "absolute",
    right: -60,
    top: 250,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: "rgba(15,109,128,0.1)",
  },
  content: { padding: 16, paddingBottom: 118, gap: 16 },
  backBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d5e1e7",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backText: { color: "#16315f", fontWeight: "800", fontSize: 13 },
  heroCard: {
    borderRadius: 30,
    backgroundColor: "#16315f",
    borderWidth: 1,
    borderColor: "#274a72",
    padding: 20,
    gap: 16,
    shadowColor: "#16315f",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 16 },
  heroLabel: { color: "#9fd8e0", fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  heroTitle: { color: "#ffffff", fontWeight: "900", fontSize: 30, marginTop: 4 },
  etaBadge: {
    borderRadius: 999,
    backgroundColor: "#0f6d80",
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  etaText: { color: "#ffffff", fontWeight: "900", fontSize: 12 },
  heroSub: { color: "#d3e6f3", fontWeight: "700", fontSize: 14, lineHeight: 21 },
  routeShell: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.9)",
    padding: 16,
    gap: 14,
    position: "relative",
    overflow: "hidden",
  },
  routeLine: {
    position: "absolute",
    left: 35,
    top: 26,
    bottom: 26,
    width: 2,
    backgroundColor: "#c1d7de",
  },
  routeStop: { flexDirection: "row", alignItems: "center", gap: 12 },
  routeIconStart: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  routeIconActive: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "#16315f",
    alignItems: "center",
    justifyContent: "center",
  },
  routeIconEnd: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "#e6f7fa",
    alignItems: "center",
    justifyContent: "center",
  },
  routeCopy: { flex: 1 },
  routeLabel: { color: "#62808f", fontWeight: "700", fontSize: 11, textTransform: "uppercase" },
  routeText: { color: "#16315f", fontWeight: "900", fontSize: 14, marginTop: 2 },
  card: {
    borderRadius: 30,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    padding: 18,
    gap: 14,
    shadowColor: "#b6cbd3",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  sectionTitle: { color: "#16315f", fontWeight: "900", fontSize: 20 },
  sectionSub: { color: "#5b7380", fontWeight: "600", fontSize: 13, lineHeight: 19 },
  securityLoading: { borderRadius: 22, backgroundColor: "#f5fafb", borderWidth: 1, borderColor: "#dbe6eb", padding: 18, alignItems: "center", gap: 8 },
  securityLoadingText: { color: "#5b7380", fontWeight: "700", fontSize: 13 },
  invoiceCard: {
    borderRadius: 24,
    backgroundColor: "#16315f",
    borderWidth: 1,
    borderColor: "#274a72",
    padding: 16,
    gap: 8,
  },
  invoiceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  invoiceLabel: { color: "#b8c9f1", fontWeight: "700", fontSize: 11, textTransform: "uppercase" },
  invoiceRef: { color: "#ffffff", fontWeight: "900", fontSize: 18, marginTop: 2 },
  paidPill: { borderRadius: 999, backgroundColor: "#0f6d80", paddingHorizontal: 12, paddingVertical: 7 },
  paidPillText: { color: "#ffffff", fontWeight: "900", fontSize: 11 },
  invoiceTitle: { color: "#ffffff", fontWeight: "900", fontSize: 20 },
  invoiceMeta: { color: "#d7e9ff", fontWeight: "700", fontSize: 13, lineHeight: 19 },
  securityRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  pinCard: {
    flex: 1,
    minWidth: 150,
    borderRadius: 24,
    backgroundColor: "#fff8ef",
    borderWidth: 1,
    borderColor: "#f1dfc0",
    padding: 16,
    gap: 6,
  },
  pinLabel: { color: "#8f6f3f", fontWeight: "800", fontSize: 11, textTransform: "uppercase" },
  pinValue: { color: "#16315f", fontWeight: "900", fontSize: 32, letterSpacing: 2 },
  pinSub: { color: "#6b6d70", fontWeight: "600", fontSize: 12, lineHeight: 18 },
  qrCard: {
    width: 160,
    borderRadius: 24,
    backgroundColor: "#f4fbfd",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    padding: 12,
    alignItems: "center",
    gap: 8,
  },
  qrImage: { width: 124, height: 124, borderRadius: 12, backgroundColor: "#ffffff" },
  qrLabel: { color: "#16315f", fontWeight: "800", fontSize: 12, textAlign: "center" },
  noticeCard: { borderRadius: 22, backgroundColor: "#f5fafb", borderWidth: 1, borderColor: "#dbe6eb", padding: 16, gap: 6 },
  noticeTitle: { color: "#16315f", fontWeight: "900", fontSize: 15 },
  noticeSub: { color: "#5b7380", fontWeight: "600", fontSize: 13, lineHeight: 19 },
  timelineList: { gap: 8 },
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineRail: { width: 22, alignItems: "center" },
  timelineDot: { width: 12, height: 12, borderRadius: 999, backgroundColor: "#c5d5dc", marginTop: 12 },
  timelineDotDone: { backgroundColor: "#9cc8d2" },
  timelineDotActive: { backgroundColor: "#0f6d80", width: 14, height: 14 },
  timelineStem: { width: 2, flex: 1, backgroundColor: "#d8e6ea", marginTop: 4 },
  timelineStemDone: { backgroundColor: "#b7d6dd" },
  timelineCard: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: "#f5fafb",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    padding: 14,
    gap: 4,
  },
  timelineCardActive: { backgroundColor: "#16315f", borderColor: "#16315f", shadowColor: "#16315f", shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  timelineTitle: { color: "#16315f", fontWeight: "900", fontSize: 15 },
  timelineTitleActive: { color: "#ffffff" },
  timelineNote: { color: "#5b7380", fontWeight: "600", fontSize: 13, lineHeight: 19 },
  timelineNoteActive: { color: "#d7e9ff" },
  riderHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  riderBadge: { width: 42, height: 42, borderRadius: 15, backgroundColor: "#e9f7fa", alignItems: "center", justifyContent: "center" },
  riderCopy: { flex: 1 },
  riderSub: { color: "#5b7380", fontWeight: "700", fontSize: 13, marginTop: 2 },
  riderMetaRow: { gap: 10 },
  metaTile: {
    borderRadius: 22,
    backgroundColor: "#f5fafb",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    padding: 14,
    gap: 4,
  },
  metaLabel: { color: "#62808f", fontWeight: "700", fontSize: 11, textTransform: "uppercase" },
  metaValue: { color: "#16315f", fontWeight: "800", fontSize: 14 },
  callBtn: {
    borderRadius: 999,
    backgroundColor: "#0f6d80",
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  callBtnText: { color: "#ffffff", fontWeight: "900", fontSize: 14 },
});
