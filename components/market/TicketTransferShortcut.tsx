import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { ArrowRightLeft } from "lucide-react-native";
import { EYA_ACCENT as ACCENT } from "@/components/market/ticketingUi";

export default function TicketTransferShortcut({ ticketId, bottom = 112 }: { ticketId?: string | null; bottom?: number }) {
  const router = useRouter();
  return (
    <Pressable
      style={[styles.button, { bottom }]}
      onPress={() => router.push({ pathname: "/(student)/market/ticket-transfers", params: ticketId ? { ticketId } : {} } as never)}
    >
      <ArrowRightLeft size={17} color="#ffffff" strokeWidth={2.5} />
      <Text style={styles.label}>{ticketId ? "Transfer" : "Transfers"}</Text>
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
    backgroundColor: ACCENT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#102a54",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  label: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
});
