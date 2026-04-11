import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, House, ShoppingBag, UtensilsCrossed } from "lucide-react-native";
import PublicFooter from "@/components/PublicFooter";
import { useAuth } from "@/providers/AuthProvider";
import EyaWordmark from "@/components/brand/EyaWordmark";

const featureCards = [
  {
    id: "rooms",
    title: "Find Rooms",
    subtitle: "Compare, request, move in",
    Icon: House,
    tint: "#d6ebff",
    iconColor: "#3e81e0",
  },
  {
    id: "market",
    title: "Shop Market",
    subtitle: "Buy essentials near campus",
    Icon: ShoppingBag,
    tint: "#ffe0ee",
    iconColor: "#ff4b8d",
  },
  {
    id: "food",
    title: "Order Food",
    subtitle: "Fast delivery to your door",
    Icon: UtensilsCrossed,
    tint: "#ffe7d8",
    iconColor: "#f28b34",
  },
] as const;

const trustPoints = ["Verified listings", "Real-time delivery tracking", "Built for campus life"];

export default function IndexPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  React.useEffect(() => {
    if (!loading && user) {
      router.replace("/redirect");
    }
  }, [loading, user, router]);

  if (loading) {
    return <SafeAreaView style={styles.loadingRoot} />;
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.bgOrbTop} />
        <View style={styles.bgOrbMiddle} />
        <View style={styles.bgOrbBottom} />

        <View style={styles.shell}>
          <View style={styles.brandBlock}>
            <EyaWordmark width={250} height={84} withTagline />
          </View>

          <View style={styles.heroBlock}>
            <Text style={styles.heroTitle}>One app for campus life</Text>
            <Text style={styles.heroSub}>Rooms • Market • Food</Text>
          </View>

          <View style={styles.cardsStack}>
            {featureCards.map(({ id, title, subtitle, Icon, tint, iconColor }) => (
              <Pressable key={id} style={styles.featureCard} onPress={() => router.push("/(auth)/signup")}>
                <View style={[styles.featureIconWrap, { backgroundColor: tint }]}>
                  <Icon size={42} color={iconColor} />
                </View>
                <View style={styles.featureCopy}>
                  <Text style={styles.featureTitle}>{title}</Text>
                  <Text style={styles.featureSub}>{subtitle}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          <View style={styles.trustList}>
            {trustPoints.map((item) => (
              <View key={item} style={styles.trustRow}>
                <View style={styles.trustCheck}>
                  <Check size={18} color="#ffffff" />
                </View>
                <Text style={styles.trustText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.ctaBlock}>
            <Text style={styles.ctaTitle}>Start using EYA</Text>
            <View style={styles.ctaRow}>
              <Pressable style={styles.signupBtn} onPress={() => router.push("/(auth)/signup")}>
                <Text style={styles.signupBtnText}>Sign Up</Text>
              </Pressable>
              <Pressable style={styles.loginBtn} onPress={() => router.push("/(auth)/login")}>
                <Text style={styles.loginBtnText}>Login</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <PublicFooter />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f4fb" },
  loadingRoot: { flex: 1, backgroundColor: "#f5f4fb" },
  content: { paddingBottom: 36 },
  shell: {
    width: "100%",
    maxWidth: 980,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 28,
  },
  bgOrbTop: {
    position: "absolute",
    top: -120,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 999,
    backgroundColor: "rgba(201, 218, 255, 0.38)",
  },
  bgOrbMiddle: {
    position: "absolute",
    top: 360,
    right: -130,
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: "rgba(205, 226, 255, 0.44)",
  },
  bgOrbBottom: {
    position: "absolute",
    bottom: 140,
    left: -110,
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: "rgba(217, 228, 255, 0.3)",
  },
  brandBlock: {
    alignItems: "center",
    marginTop: 16,
  },
  heroBlock: {
    alignItems: "center",
    marginTop: 24,
    marginBottom: 34,
    gap: 10,
  },
  heroTitle: {
    color: "#132a66",
    fontSize: 38,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -1,
  },
  heroSub: {
    color: "#667294",
    fontSize: 18,
    fontWeight: "500",
    textAlign: "center",
  },
  cardsStack: {
    gap: 16,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "#eef1f8",
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: "#9aa7cf",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  featureIconWrap: {
    width: 92,
    height: 92,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  featureCopy: { flex: 1, minWidth: 0 },
  featureTitle: {
    color: "#132a66",
    fontSize: 24,
    fontWeight: "900",
  },
  featureSub: {
    marginTop: 6,
    color: "#54627f",
    fontSize: 16,
    fontWeight: "500",
  },
  trustList: {
    marginTop: 28,
    gap: 14,
    paddingHorizontal: 6,
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  trustCheck: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#57bf8d",
    alignItems: "center",
    justifyContent: "center",
  },
  trustText: {
    color: "#2f3f6e",
    fontSize: 18,
    fontWeight: "500",
  },
  ctaBlock: {
    marginTop: 40,
    alignItems: "center",
  },
  ctaTitle: {
    color: "#132a66",
    fontSize: 32,
    fontWeight: "900",
    textAlign: "center",
  },
  ctaRow: {
    marginTop: 26,
    width: "100%",
    flexDirection: "row",
    gap: 14,
  },
  signupBtn: {
    flex: 1,
    minHeight: 70,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2b6ed8",
    shadowColor: "#4d73d9",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  signupBtnText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },
  loginBtn: {
    flex: 1,
    minHeight: 70,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "#e4e8f2",
    shadowColor: "#b0bad7",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  loginBtnText: {
    color: "#132a66",
    fontSize: 20,
    fontWeight: "900",
  },
});
