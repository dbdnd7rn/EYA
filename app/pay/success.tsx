import React from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, BadgeCheck, ChevronRight, QrCode, Truck } from "lucide-react-native";
import { getOrderHandoffDetails, type OrderHandoffDetails } from "@/lib/orderHandoff";
import { useAuth } from "@/providers/AuthProvider";

const formatMwk = (value: string | number | null | undefined) => `MWK ${Number(value || 0).toLocaleString("en-MW")}`;

export default function PaySuccessPage() {
  const params = useLocalSearchParams<{
    tx_ref?: string;
    reference?: string;
    order_id?: string;
    mode?: string;
    title?: string;
    total?: string;
    delivery?: string;
    method?: string;
  }>();
  const router = useRouter();
  const { session } = useAuth();
  const txRef = params.tx_ref || params.reference || null;
  const orderId = typeof params.order_id === "string" ? params.order_id : null;
  const mode = params.mode === "food" ? "food" : params.mode === "market" ? "market" : "stay";
  const title = typeof params.title === "string" ? params.title : "Order";
  const total = typeof params.total === "string" ? params.total : null;
  const delivery = typeof params.delivery === "string" ? params.delivery : null;
  const method = typeof params.method === "string" ? params.method : null;
  const hasOrderHandoff = !!orderId && (mode === "market" || mode === "food");
  const [handoff, setHandoff] = React.useState<OrderHandoffDetails | null>(null);
  const [loading, setLoading] = React.useState(hasOrderHandoff);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!hasOrderHandoff || !orderId) {
      setLoading(false);
      return;
    }

    let active = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const next = await getOrderHandoffDetails(orderId, session?.access_token);
        if (!active) return;
        setHandoff(next);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? "Could not load the delivery QR code yet.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [hasOrderHandoff, orderId, session?.access_token]);

  const goToTracking = () => {
    if (orderId && mode === "food") {
      router.replace({ pathname: "/(food)/delivery/[orderId]", params: { orderId } });
      return;
    }
    if (orderId && mode === "market") {
      router.replace({ pathname: "/(student)/delivery/[orderId]", params: { orderId } });
      return;
    }
    router.replace(mode === "food" ? "/(food)/(tabs)/orders" : "/(student)/(tabs)/orders");
  };

  const goBackHome = () => {
    router.replace("/(student)/(tabs)/orders");
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.bgGlowOne} />
      <View style={styles.bgGlowTwo} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backBtn} onPress={goBackHome}>
          <ArrowLeft size={18} color="#16315f" />
          <Text style={styles.backText}>Close</Text>
        </Pressable>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Payment complete</Text>
          <Text style={styles.heroAmount}>{formatMwk(total)}</Text>
          <Text style={styles.heroSub}>
            {method === "wallet"
              ? "Wallet payment confirmed."
              : method === "cash"
                ? "Cash order confirmed. Pay the rider or restaurant during handoff."
                : "Your payment was confirmed and the order handoff is ready."}
          </Text>

          <View style={styles.heroStatus}>
            <BadgeCheck size={18} color="#0f6d80" />
            <Text style={styles.heroStatusText}>{handoff ? "Order found" : "Confirmed on backend"}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Item</Text>
            <Text style={styles.detailValue}>{handoff?.invoice.title ?? title}</Text>
          </View>
          {txRef ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{method === "cash" ? "Cash ref" : "Order ref"}</Text>
              <Text style={styles.detailValue}>{txRef}</Text>
            </View>
          ) : null}
          {delivery ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Delivery fee</Text>
              <Text style={styles.detailValue}>{formatMwk(delivery)}</Text>
            </View>
          ) : null}
          <View style={[styles.detailRow, styles.detailRowLast]}>
            <Text style={styles.detailLabel}>Total paid</Text>
            <Text style={styles.detailValueStrong}>{formatMwk(handoff?.invoice.amount_mwk ?? total)}</Text>
          </View>
        </View>

        {hasOrderHandoff ? (
          loading ? (
            <View style={styles.card}>
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color="#0f6d80" />
                <Text style={styles.loadingText}>Preparing your QR delivery pass...</Text>
              </View>
            </View>
          ) : handoff ? (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>QR handoff pass</Text>
                  <Text style={styles.sectionSub}>Show this code when the rider arrives.</Text>
                </View>
                <View style={styles.qrBadge}>
                  <QrCode size={18} color="#0f6d80" />
                </View>
              </View>

              <View style={styles.qrPanel}>
                {handoff.handoff.qr_data_url ? <Image source={{ uri: handoff.handoff.qr_data_url }} style={styles.qrImage} /> : null}
                <Text style={styles.qrCaption}>Scan to confirm delivery</Text>
              </View>

              <View style={styles.pinCard}>
                <Text style={styles.pinLabel}>Delivery PIN</Text>
                <Text style={styles.pinValue}>{handoff.handoff.delivery_pin ?? "------"}</Text>
                <Text style={styles.pinSub}>Only give this to the rider during handoff.</Text>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>QR handoff pass</Text>
              <Text style={styles.errorText}>{error ?? "The QR delivery pass is not available yet."}</Text>
            </View>
          )
        ) : null}

        <View style={styles.card}>
          <View style={styles.trackRow}>
            <View style={styles.trackIcon}>
              <Truck size={18} color="#0f6d80" />
            </View>
            <View style={styles.trackCopy}>
            <Text style={styles.sectionTitle}>{hasOrderHandoff ? "Track delivery" : "Continue"}</Text>
            <Text style={styles.sectionSub}>
              {hasOrderHandoff ? "Open the live order screen for rider updates and the same QR pass." : "Return to your orders and continue using the app."}
            </Text>
            </View>
          </View>

          <Pressable style={styles.primaryBtn} onPress={goToTracking}>
            <Text style={styles.primaryBtnText}>{hasOrderHandoff ? "Track delivery" : "Back to orders"}</Text>
            <ChevronRight size={18} color="#ffffff" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef6f8" },
  bgGlowOne: {
    position: "absolute",
    top: -80,
    left: -40,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: "rgba(185,223,232,0.6)",
  },
  bgGlowTwo: {
    position: "absolute",
    right: -50,
    top: 220,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: "rgba(15,109,128,0.12)",
  },
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  backBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d5e1e7",
  },
  backText: { color: "#16315f", fontWeight: "800", fontSize: 13 },
  heroCard: {
    borderRadius: 34,
    padding: 22,
    gap: 12,
    backgroundColor: "#16315f",
    borderWidth: 1,
    borderColor: "#264c75",
    shadowColor: "#16315f",
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  heroLabel: { color: "#9fd8e0", fontWeight: "800", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.8 },
  heroAmount: { color: "#ffffff", fontWeight: "900", fontSize: 42 },
  heroSub: { color: "#d3e6f3", fontWeight: "600", fontSize: 15, lineHeight: 22 },
  heroStatus: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(15,109,128,0.18)",
  },
  heroStatusText: { color: "#e7fbff", fontWeight: "800", fontSize: 13 },
  card: {
    borderRadius: 30,
    padding: 18,
    gap: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe6eb",
  },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  sectionTitle: { color: "#16315f", fontWeight: "900", fontSize: 20 },
  sectionSub: { color: "#5b7380", fontWeight: "600", fontSize: 13, lineHeight: 19 },
  qrBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9f7fa",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e7eef2",
  },
  detailRowLast: { paddingBottom: 0, borderBottomWidth: 0 },
  detailLabel: { color: "#62808f", fontWeight: "700", fontSize: 13 },
  detailValue: { color: "#16315f", fontWeight: "700", fontSize: 13, flex: 1, textAlign: "right" },
  detailValueStrong: { color: "#16315f", fontWeight: "900", fontSize: 18 },
  loadingWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 18, gap: 10 },
  loadingText: { color: "#5b7380", fontWeight: "700", fontSize: 13 },
  qrPanel: {
    borderRadius: 28,
    padding: 18,
    alignItems: "center",
    gap: 12,
    backgroundColor: "#f4fbfd",
    borderWidth: 1,
    borderColor: "#dcecf0",
  },
  qrImage: { width: 220, height: 220, borderRadius: 24, backgroundColor: "#ffffff" },
  qrCaption: { color: "#16315f", fontWeight: "800", fontSize: 14 },
  pinCard: {
    borderRadius: 24,
    padding: 16,
    gap: 6,
    backgroundColor: "#fff8ef",
    borderWidth: 1,
    borderColor: "#f1dfc0",
  },
  pinLabel: { color: "#8f6f3f", fontWeight: "800", fontSize: 11, textTransform: "uppercase" },
  pinValue: { color: "#16315f", fontWeight: "900", fontSize: 34, letterSpacing: 4 },
  pinSub: { color: "#6b6d70", fontWeight: "600", fontSize: 13, lineHeight: 19 },
  errorText: { color: "#5b7380", fontWeight: "700", fontSize: 13, lineHeight: 19 },
  trackRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  trackIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e9f7fa",
  },
  trackCopy: { flex: 1, gap: 4 },
  primaryBtn: {
    borderRadius: 999,
    backgroundColor: "#0f6d80",
    paddingHorizontal: 18,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: { color: "#ffffff", fontWeight: "900", fontSize: 15 },
});
