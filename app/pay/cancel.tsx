import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ChevronRight, CircleAlert } from "lucide-react-native";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

function pickString(value: string | string[] | undefined) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export default function PayCancelPage() {
  const params = useLocalSearchParams<{
    tx_ref?: string;
    reference?: string;
    status?: string;
    source?: string;
    mode?: string;
    title?: string;
    base?: string;
    delivery?: string;
    escrow?: string;
    item_id?: string;
    vendor_id?: string;
    channel?: string;
    delivery_mode?: string;
    quantity?: string;
  }>();
  const router = useRouter();
  const txRef = params.tx_ref || params.reference || null;
  const status = pickString(params.status);
  const resumeCheckoutParams = {
    mode: pickString(params.mode),
    title: pickString(params.title),
    base: pickString(params.base),
    delivery: pickString(params.delivery),
    escrow: pickString(params.escrow),
    item_id: pickString(params.item_id),
    vendor_id: pickString(params.vendor_id),
    channel: pickString(params.channel),
    delivery_mode: pickString(params.delivery_mode),
    quantity: pickString(params.quantity),
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.bgGlowOne} />
      <View style={styles.bgGlowTwo} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backBtn} onPress={() => router.replace("/(student)/(tabs)/home")}>
          <ArrowLeft size={18} color="#16315f" />
          <Text style={styles.backText}>Home</Text>
        </Pressable>

        <View style={styles.heroCard}>
          <View style={styles.alertBadge}>
            <CircleAlert size={20} color="#ffffff" />
          </View>
          <Text style={styles.heroTitle}>Payment cancelled</Text>
          <Text style={styles.heroSub}>
            {status ? `Current payment status: ${status}.` : "The payment was not completed, so your order has not been confirmed."}
          </Text>
          {txRef ? <Text style={styles.heroMeta}>Reference: {txRef}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>What would you like to do?</Text>
          <Text style={styles.sectionSub}>You can safely return home or go back and continue the same checkout.</Text>

          <Pressable style={styles.primaryBtn} onPress={() => router.replace("/(student)/(tabs)/home")}>
            <Text style={styles.primaryBtnText}>Return to home</Text>
            <ChevronRight size={18} color="#ffffff" />
          </Pressable>

          <Pressable
            style={styles.secondaryBtn}
            onPress={() => router.replace({ pathname: "/(student)/checkout", params: resumeCheckoutParams })}
          >
            <Text style={styles.secondaryBtnText}>Return to checkout</Text>
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
    left: -50,
    width: 240,
    height: 240,
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
    backgroundColor: "rgba(15,109,128,0.1)",
  },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  backBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d5e1e7",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backText: { color: "#16315f", fontWeight: "800", fontSize: 13 },
  heroCard: {
    borderRadius: 32,
    backgroundColor: "#16315f",
    borderWidth: 1,
    borderColor: "#274a72",
    padding: 22,
    gap: 12,
    shadowColor: "#16315f",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  alertBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#c24d67",
  },
  heroTitle: { color: "#ffffff", fontWeight: "900", fontSize: 30 },
  heroSub: { color: "#d3e6f3", fontWeight: "600", fontSize: 15, lineHeight: 22 },
  heroMeta: { color: "#9fd8e0", fontWeight: "800", fontSize: 13 },
  card: {
    borderRadius: 28,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    padding: 18,
    gap: 14,
  },
  sectionTitle: { color: "#16315f", fontWeight: "900", fontSize: 20 },
  sectionSub: { color: "#5b7380", fontWeight: "600", fontSize: 13, lineHeight: 19 },
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
  secondaryBtn: {
    borderRadius: 999,
    backgroundColor: "#eef6f8",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    paddingHorizontal: 18,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#16315f", fontWeight: "900", fontSize: 15 },
});
