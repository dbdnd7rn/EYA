import React from "react";
import { Animated, Easing, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, BellRing, Clock3, CreditCard, LockKeyhole, Smartphone, Sparkles, WalletCards } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

export default function StudentPaymentsComingSoonPage() {
  const router = useRouter();
  const { theme } = useStudentTheme();
  const pulse = React.useRef(new Animated.Value(0)).current;
  const float = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1300,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const floatAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 3600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 3600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    pulseAnim.start();
    floatAnim.start();
    return () => {
      pulseAnim.stop();
      floatAnim.stop();
    };
  }, [float, pulse]);

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  const floatY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
  const floatX = float.interpolate({ inputRange: [0, 1], outputRange: [-8, 10] });

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={[styles.circleBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} onPress={() => router.back()}>
            <ArrowLeft size={20} color={theme.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.heading }]}>Payments</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>A cleaner way to pay is on the way.</Text>
          </View>
        </View>

        <View style={[styles.stage, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Animated.View style={[styles.pulseRing, { opacity: pulseOpacity, transform: [{ scale: pulseScale }] }]} />
          <Animated.View style={[styles.floatChip, styles.floatChipTop, { transform: [{ translateY: floatY }] }]}>
            <LockKeyhole size={15} color="#ffffff" />
            <Text style={styles.floatChipText}>Secure</Text>
          </Animated.View>
          <Animated.View style={[styles.floatChip, styles.floatChipBottom, { transform: [{ translateX: floatX }] }]}>
            <WalletCards size={15} color="#ffffff" />
            <Text style={styles.floatChipText}>Wallet ready</Text>
          </Animated.View>

          <Animated.View style={[styles.phoneCard, { transform: [{ translateY: floatY }] }]}>
            <View style={styles.phoneNotch} />
            <View style={styles.phoneTop}>
              <CreditCard size={30} color="#102a54" />
              <View style={styles.cardLines}>
                <View style={styles.cardLineWide} />
                <View style={styles.cardLineShort} />
              </View>
            </View>
            <View style={styles.payAmount}>
              <Text style={styles.payAmountLabel}>Coming soon</Text>
              <Text style={styles.payAmountText}>Payment methods</Text>
            </View>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { transform: [{ scaleX: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1] }) }] }]} />
            </View>
          </Animated.View>
        </View>

        <View style={[styles.copyPanel, { backgroundColor: theme.shell, borderColor: theme.border }]}>
          <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
            <Sparkles size={15} color={theme.accent} />
            <Text style={[styles.badgeText, { color: theme.text }]}>Be on the lookout</Text>
          </View>
          <Text style={[styles.heroTitle, { color: theme.heading }]}>Card, wallet, and mobile money controls are being polished.</Text>
          <Text style={[styles.heroText, { color: theme.textMuted }]}>For now, keep using wallet top-up where available and checkout options shown inside orders.</Text>
        </View>

        <View style={styles.cardGrid}>
          <FeatureCard
            icon={<Smartphone size={20} color="#0f6d80" />}
            title="Mobile money"
            text="Airtel Money and TNM Mpamba controls will live here."
          />
          <FeatureCard
            icon={<CreditCard size={20} color="#5e73dd" />}
            title="Saved methods"
            text="Cards and preferred payment routes will be managed from one place."
          />
          <FeatureCard
            icon={<Clock3 size={20} color="#b67620" />}
            title="Activity"
            text="Receipts, failed attempts, and payment status will be easier to follow."
          />
        </View>

        <Pressable style={[styles.notifyBtn, { backgroundColor: theme.accent }]} onPress={() => router.push("/(student)/notifications")}>
          <BellRing size={18} color="#ffffff" />
          <Text style={styles.notifyBtnText}>Watch notifications</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureCard({ icon, text, title }: { icon: React.ReactNode; text: string; title: string }) {
  const { theme } = useStudentTheme();

  return (
    <View style={[styles.featureCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.featureIcon, { backgroundColor: theme.surfaceAlt }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.featureTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.featureText, { color: theme.textMuted }]}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 44, gap: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  circleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  title: { fontSize: 28, fontWeight: "900" },
  subtitle: { marginTop: 4, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  stage: {
    minHeight: 340,
    borderRadius: 34,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: 24,
  },
  pulseRing: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "#8fb7ff",
  },
  floatChip: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    backgroundColor: "#102a54",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  floatChipTop: { top: 30, right: 20 },
  floatChipBottom: { left: 20, bottom: 34, backgroundColor: "#0f6d80" },
  floatChipText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  phoneCard: {
    width: 210,
    borderRadius: 32,
    backgroundColor: "#102a54",
    padding: 16,
    gap: 16,
    shadowColor: "#102a54",
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  phoneNotch: { alignSelf: "center", width: 62, height: 7, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.25)" },
  phoneTop: {
    borderRadius: 22,
    backgroundColor: "#f3f7ff",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardLines: { flex: 1, gap: 8 },
  cardLineWide: { height: 9, borderRadius: 99, backgroundColor: "#bfd0ef" },
  cardLineShort: { width: "68%", height: 9, borderRadius: 99, backgroundColor: "#d9e4f8" },
  payAmount: { gap: 4 },
  payAmountLabel: { color: "#f7d980", fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  payAmountText: { color: "#ffffff", fontSize: 24, lineHeight: 28, fontWeight: "900" },
  progressTrack: { height: 10, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden" },
  progressFill: { width: "100%", height: "100%", borderRadius: 99, backgroundColor: "#f7d980" },
  copyPanel: { borderRadius: 28, borderWidth: 1, padding: 18, gap: 12 },
  badge: { alignSelf: "flex-start", borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  badgeText: { fontSize: 12, fontWeight: "900" },
  heroTitle: { fontSize: 24, lineHeight: 30, fontWeight: "900" },
  heroText: { fontSize: 14, lineHeight: 21, fontWeight: "600" },
  cardGrid: { gap: 12 },
  featureCard: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8edf7",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIcon: { width: 46, height: 46, borderRadius: 17, backgroundColor: "#f2f5fb", alignItems: "center", justifyContent: "center" },
  featureTitle: { color: "#102a54", fontSize: 16, fontWeight: "900" },
  featureText: { marginTop: 4, color: "#66708d", fontSize: 12, lineHeight: 17, fontWeight: "600" },
  notifyBtn: {
    minHeight: 60,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
  },
  notifyBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
});
