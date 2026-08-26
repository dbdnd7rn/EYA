import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Ticket } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

export default function NonTicketCheckoutDisabledScreen() {
  const router = useRouter();
  const { theme } = useStudentTheme();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <View style={styles.wrap}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
          <View style={[styles.iconWrap, { backgroundColor: theme.surfaceMuted }]}>
            <Ticket size={28} color={theme.accent} />
          </View>

          <Text style={[styles.title, { color: theme.heading }]}>Checkout is for Tickets only</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>
            EYA does not process checkout or payments for Rooms, Marketplace, or other non-ticket listings.
          </Text>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.accent }]}
            onPress={() => router.replace("/(student)/(tabs)/tickets" as any)}
          >
            <Ticket size={18} color={theme.accentContrast} />
            <Text style={[styles.primaryText, { color: theme.accentContrast }]}>Open Tickets</Text>
          </Pressable>

          <Pressable
            style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
            onPress={() => router.replace("/(student)/(tabs)/home" as any)}
          >
            <ArrowLeft size={17} color={theme.text} />
            <Text style={[styles.secondaryText, { color: theme.text }]}>Back to Home</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  wrap: { flex: 1, padding: 20, alignItems: "center", justifyContent: "center" },
  card: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    gap: 14,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "900", textAlign: "center" },
  body: { fontSize: 14, lineHeight: 21, fontWeight: "600", textAlign: "center", maxWidth: 410 },
  primaryButton: {
    width: "100%",
    minHeight: 54,
    marginTop: 4,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 18,
  },
  primaryText: { fontSize: 15, fontWeight: "900" },
  secondaryButton: {
    width: "100%",
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
  },
  secondaryText: { fontSize: 14, fontWeight: "800" },
});
