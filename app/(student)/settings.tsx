import React from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { ArrowLeft, Check, MoonStar, SunMedium } from "lucide-react-native";
import { useRouter } from "expo-router";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

export default function StudentSettingsPage() {
  const router = useRouter();
  const { mode, ready, setMode, theme } = useStudentTheme();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={[styles.circleBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} onPress={() => router.back()}>
            <ArrowLeft size={20} color={theme.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.heading }]}>Settings</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Choose how EYA should feel across home, rooms, food, marketplace, orders, chats, account, and workspace tabs.</Text>
          </View>
        </View>

        <View style={[styles.panel, { backgroundColor: theme.shell, borderColor: theme.border }]}>
          <Text style={[styles.panelTitle, { color: theme.heading }]}>Theme</Text>
          <Text style={[styles.panelSub, { color: theme.textMuted }]}>Pick a full app look. The app remembers your choice on this account and applies it across sections.</Text>

          <Pressable
            style={[
              styles.optionCard,
              { backgroundColor: mode === "light" ? theme.surface : theme.surfaceAlt, borderColor: mode === "light" ? theme.accent : theme.border },
            ]}
            onPress={() => void setMode("light")}
          >
            <View style={[styles.optionIcon, { backgroundColor: mode === "light" ? theme.accentSoft : "#eef1fb" }]}>
              <SunMedium size={18} color={mode === "light" ? theme.accent : "#465d97"} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.heading }]}>Light Theme</Text>
              <Text style={[styles.optionText, { color: theme.textMuted }]}>Bright cards, soft glass surfaces, and clean daylight navigation.</Text>
            </View>
            {mode === "light" ? (
              <View style={[styles.check, { backgroundColor: theme.accent }]}>
                <Check size={14} color="#fff" />
              </View>
            ) : null}
          </Pressable>

          <Pressable
            style={[
              styles.optionCard,
              { backgroundColor: mode === "dark" ? theme.surface : theme.surfaceAlt, borderColor: mode === "dark" ? theme.accent : theme.border },
            ]}
            onPress={() => void setMode("dark")}
          >
            <View style={[styles.optionIcon, { backgroundColor: mode === "dark" ? theme.accentSoft : "#24365c" }]}>
              <MoonStar size={18} color="#dce6ff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionTitle, { color: theme.heading }]}>Dark Theme</Text>
              <Text style={[styles.optionText, { color: theme.textMuted }]}>Midnight surfaces, richer contrast, and darker navigation across the app.</Text>
            </View>
            {mode === "dark" ? (
              <View style={[styles.check, { backgroundColor: theme.accent }]}>
                <Check size={14} color="#fff" />
              </View>
            ) : null}
          </Pressable>
        </View>

        <View style={[styles.previewPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.previewEyebrow, { color: theme.textSoft }]}>{ready ? theme.name : "Loading theme..."}</Text>
          <Text style={[styles.previewTitle, { color: theme.heading }]}>App theme preview</Text>
          <View style={[styles.previewMock, { backgroundColor: theme.backgroundAlt, borderColor: theme.borderSoft }]}>
            <View style={styles.previewMockTop}>
              <View style={[styles.previewDot, { backgroundColor: theme.accent }]} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={[styles.previewLine, { backgroundColor: theme.textMuted, width: "62%" }]} />
                <View style={[styles.previewLine, { backgroundColor: theme.surfaceMuted, width: "44%" }]} />
              </View>
            </View>
            <View style={styles.previewRow}>
              <View style={[styles.previewSwatch, { backgroundColor: theme.shell }]} />
              <View style={[styles.previewSwatch, { backgroundColor: theme.surfaceAlt }]} />
              <View style={[styles.previewSwatch, { backgroundColor: theme.accent }]} />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 16 },
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
  subtitle: { fontSize: 14, fontWeight: "600", lineHeight: 20, marginTop: 4 },
  panel: { borderRadius: 26, borderWidth: 1, padding: 16, gap: 12 },
  panelTitle: { fontSize: 22, fontWeight: "900" },
  panelSub: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  optionCard: { borderRadius: 22, borderWidth: 1, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  optionIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  optionTitle: { fontSize: 17, fontWeight: "900" },
  optionText: { marginTop: 4, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  check: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  previewPanel: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 12 },
  previewEyebrow: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  previewTitle: { fontSize: 20, fontWeight: "900" },
  previewMock: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 14 },
  previewMockTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  previewDot: { width: 46, height: 46, borderRadius: 23 },
  previewLine: { height: 10, borderRadius: 999, opacity: 0.9 },
  previewRow: { flexDirection: "row", gap: 10 },
  previewSwatch: { flex: 1, height: 56, borderRadius: 18 },
});
