import React from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Clock3, ShieldCheck, ShoppingBag, Sparkles, Store, WalletCards } from "lucide-react-native";
import EyaWordmark from "@/components/brand/EyaWordmark";
import SoftPageGlow from "@/components/SoftPageGlow";

type Action = {
  label: string;
  onPress: () => void;
};

type Props = {
  audience: "buyer" | "seller";
  primaryAction: Action;
  secondaryAction?: Action;
};

const COPY = {
  buyer: {
    kicker: "Market payments paused",
    title: "Checkout Is Brewing",
    subtitle: "We turned off Market payments for now while we shape a cleaner, safer way to pay on EYA.",
    currentTitle: "What you can do now",
    currentItems: ["Browse fresh products", "Chat sellers directly", "Arrange pickup first"],
    futureTitle: "What is coming next",
    futureItems: ["Secure checkout", "Cleaner receipts", "Safer release flow"],
    note: "No card, wallet, bank or mobile money payments are active in Market yet.",
  },
  seller: {
    kicker: "Seller payments paused",
    title: "Payouts Are Coming Soon",
    subtitle: "Keep your shop active while we finish the first version of seller payments, balances and withdrawals.",
    currentTitle: "What still works",
    currentItems: ["Manage listings", "Track incoming orders", "Update your storefront"],
    futureTitle: "What is on the way",
    futureItems: ["Seller payouts", "Payment activity", "Withdrawal tools"],
    note: "Market payment tools stay off until the rollout is ready end to end.",
  },
} as const;

function FloatingChip({
  icon,
  label,
  tone,
  style,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "navy" | "teal" | "sand";
  style?: any;
}) {
  return (
    <Animated.View
      style={[
        styles.chip,
        tone === "navy" ? styles.chipNavy : tone === "teal" ? styles.chipTeal : styles.chipSand,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.chipText, tone === "sand" && styles.chipTextDark]}>{label}</Text>
    </Animated.View>
  );
}

export default function MarketPaymentsComingSoonScreen({ audience, primaryAction, secondaryAction }: Props) {
  const content = COPY[audience];
  const drift = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 4200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 4200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [drift]);

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="account" topColor="rgba(121, 199, 226, 0.22)" middleColor="rgba(169, 180, 255, 0.18)" bottomColor="rgba(255, 211, 180, 0.14)" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.brandRow}>
          <EyaWordmark width={108} height={40} withTagline={false} />
          <View style={styles.kickerPill}>
            <Clock3 size={14} color="#0f6d80" />
            <Text style={styles.kickerText}>{content.kicker}</Text>
          </View>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.heroTitle}>{content.title}</Text>
          <Text style={styles.heroSub}>{content.subtitle}</Text>
        </View>

        <View style={styles.stageWrap}>
          <Animated.View
            style={[
              styles.stageGlowA,
              {
                transform: [
                  {
                    translateX: drift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-10, 18],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.stageGlowB,
              {
                transform: [
                  {
                    translateY: drift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, -12],
                    }),
                  },
                ],
              },
            ]}
          />

          <FloatingChip
            icon={<ShieldCheck size={15} color="#ffffff" />}
            label="Secure flow"
            tone="navy"
            style={{
              top: 18,
              right: 6,
              transform: [
                {
                  translateY: drift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -8],
                  }),
                },
              ],
            }}
          />
          <FloatingChip
            icon={<ShoppingBag size={15} color="#0f6d80" />}
            label={audience === "buyer" ? "Browse first" : "Sell first"}
            tone="sand"
            style={{
              left: 10,
              bottom: 28,
              transform: [
                {
                  translateX: drift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 8],
                  }),
                },
              ],
            }}
          />
          <FloatingChip
            icon={<WalletCards size={15} color="#ffffff" />}
            label={audience === "buyer" ? "Wallet later" : "Payouts later"}
            tone="teal"
            style={{
              right: 26,
              bottom: 12,
              transform: [
                {
                  translateY: drift.interpolate({
                    inputRange: [0, 1],
                    outputRange: [6, -4],
                  }),
                },
              ],
            }}
          />

          <Animated.View
            style={[
              styles.stageCard,
              {
                transform: [
                  {
                    translateY: drift.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -6],
                    }),
                  },
                  {
                    rotate: drift.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["-1deg", "1deg"],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.stageBadge}>
              <Sparkles size={16} color="#102a54" />
              <Text style={styles.stageBadgeText}>Coming soon</Text>
            </View>

            <View style={styles.stageIconRing}>
              {audience === "buyer" ? <ShoppingBag size={42} color="#102a54" /> : <Store size={42} color="#102a54" />}
            </View>

            <Text style={styles.stageTitle}>Market Payments</Text>
            <Text style={styles.stageText}>
              {audience === "buyer"
                ? "We are polishing the first checkout release before it goes live."
                : "We are finishing the payout layer before money tools show up here."}
            </Text>
          </Animated.View>
        </View>

        <View style={styles.grid}>
          <View style={[styles.infoCard, styles.infoCardPrimary]}>
            <Text style={styles.infoTitle}>{content.currentTitle}</Text>
            {content.currentItems.map((item) => (
              <View key={item} style={styles.infoRow}>
                <View style={styles.infoDot} />
                <Text style={styles.infoText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.infoCard, styles.infoCardSoft]}>
            <Text style={styles.infoTitle}>{content.futureTitle}</Text>
            {content.futureItems.map((item) => (
              <View key={item} style={styles.infoRow}>
                <View style={[styles.infoDot, styles.infoDotSoft]} />
                <Text style={styles.infoText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteText}>{content.note}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.primaryBtn} onPress={primaryAction.onPress}>
            <Text style={styles.primaryBtnText}>{primaryAction.label}</Text>
          </Pressable>

          {secondaryAction ? (
            <Pressable style={styles.secondaryBtn} onPress={secondaryAction.onPress}>
              <Text style={styles.secondaryBtnText}>{secondaryAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f8ff" },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 36, gap: 18 },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  kickerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "#dbe7f5",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  kickerText: { color: "#0f6d80", fontSize: 12, fontWeight: "900" },
  heroBlock: { gap: 8, paddingTop: 6 },
  heroTitle: { color: "#102a54", fontSize: 36, fontWeight: "900", letterSpacing: -1.1 },
  heroSub: { color: "#5f6f91", fontSize: 16, fontWeight: "700", lineHeight: 24, maxWidth: 560 },
  stageWrap: {
    minHeight: 356,
    borderRadius: 34,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#dde7f5",
    backgroundColor: "rgba(255,255,255,0.82)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  stageGlowA: {
    position: "absolute",
    left: -34,
    top: -30,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: "rgba(121, 199, 226, 0.24)",
  },
  stageGlowB: {
    position: "absolute",
    right: -26,
    bottom: -24,
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: "rgba(255, 203, 176, 0.28)",
  },
  stageCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 28,
    backgroundColor: "#102a54",
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: "center",
    gap: 12,
    shadowColor: "#102a54",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 7,
  },
  stageBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#f7d980",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stageBadgeText: { color: "#102a54", fontSize: 12, fontWeight: "900" },
  stageIconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#eef4ff",
    alignItems: "center",
    justifyContent: "center",
  },
  stageTitle: { color: "#ffffff", fontSize: 28, fontWeight: "900", letterSpacing: -0.8 },
  stageText: { color: "#dbe7ff", fontSize: 14, fontWeight: "700", lineHeight: 21, textAlign: "center" },
  chip: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  chipNavy: { backgroundColor: "#102a54", borderColor: "#18376c" },
  chipTeal: { backgroundColor: "#0f6d80", borderColor: "#1d8a9f" },
  chipSand: { backgroundColor: "#fff3d6", borderColor: "#f3ddb0" },
  chipText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  chipTextDark: { color: "#102a54" },
  grid: { gap: 14 },
  infoCard: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  infoCardPrimary: { backgroundColor: "rgba(255,255,255,0.95)", borderColor: "#dde7f5" },
  infoCardSoft: { backgroundColor: "#f8fbff", borderColor: "#e5edf8" },
  infoTitle: { color: "#102a54", fontSize: 18, fontWeight: "900" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#0f6d80" },
  infoDotSoft: { backgroundColor: "#f0ae28" },
  infoText: { flex: 1, color: "#46597b", fontSize: 14, fontWeight: "700" },
  noteCard: {
    borderRadius: 24,
    backgroundColor: "#fff7df",
    borderWidth: 1,
    borderColor: "#f0dfaf",
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  noteText: { color: "#7c5e17", fontSize: 14, fontWeight: "800", lineHeight: 21 },
  actions: { gap: 12 },
  primaryBtn: {
    minHeight: 58,
    borderRadius: 999,
    backgroundColor: "#102a54",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  primaryBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  secondaryBtn: {
    minHeight: 56,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#dce6f4",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  secondaryBtnText: { color: "#102a54", fontSize: 15, fontWeight: "900" },
});
