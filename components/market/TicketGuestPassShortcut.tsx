import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { Send } from "lucide-react-native";
import { EYA_ACCENT as ACCENT } from "@/components/market/ticketingUi";

export default function TicketGuestPassShortcut({ ticketId, bottom = 166 }: { ticketId?: string | null; bottom?: number }) {
  const router = useRouter();
  return (
    <Pressable
      style={[styles.button, { bottom }]}
      onPress={() => router.push({ pathname: "/(student)/market/ticket-guest-pass", params: ticketId ? { ticketId } : {} } as never)}
    >
      <Send size={17} color="#ffffff" strokeWidth={2.5} />
      <Text style={styles.label}>{ticketId ? "Guest Pass" : "Share Ticket"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: 18,
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: "#102a54",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: ACCENT,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  label: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
});
