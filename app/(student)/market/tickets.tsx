import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import TicketsHomeScreenSafe from "@/components/market/TicketsHomeScreenSafe";

export default function StudentTicketsPage() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <TicketsHomeScreenSafe />
      <Pressable style={styles.hostBtn} onPress={() => router.push("/(student)/organizer-events" as any)}>
        <Plus size={17} color="#ffffff" />
        <Text style={styles.hostText}>Host event</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hostBtn: {
    position: "absolute",
    right: 24,
    bottom: 124,
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: "#102a54",
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    shadowColor: "#102a54",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 7,
  },
  hostText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
});
