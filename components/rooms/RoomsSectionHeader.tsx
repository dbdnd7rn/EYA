import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Home } from "lucide-react-native";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

export default function RoomsSectionHeader() {
  const router = useRouter();
  const { theme } = useStudentTheme();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to home"
        hitSlop={10}
        style={styles.backHomeBtn}
        onPress={() => router.replace("/(student)/(tabs)/home" as any)}
      >
        <View style={[styles.backHomeTrail, { backgroundColor: theme.isDark ? "rgba(55,210,199,0.24)" : "#d8eef1" }]} />
        <View style={[styles.backHomeCore, { backgroundColor: theme.accent, borderColor: theme.surface, shadowColor: theme.accent }]}>
          <ArrowLeft size={19} color="#ffffff" strokeWidth={3} />
        </View>
        <View style={[styles.backHomeBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Home size={12} color={theme.isDark ? theme.success : "#0e6f83"} strokeWidth={3} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  backHomeBtn: {
    width: 58,
    height: 50,
    justifyContent: "center",
  },
  backHomeTrail: {
    position: "absolute",
    left: 22,
    width: 30,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#d8eef1",
  },
  backHomeCore: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#0e2756",
    borderWidth: 3,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0e2756",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  backHomeBadge: {
    position: "absolute",
    right: 0,
    bottom: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#f5fdff",
    borderWidth: 1,
    borderColor: "#cde3e8",
    alignItems: "center",
    justifyContent: "center",
  },
});
