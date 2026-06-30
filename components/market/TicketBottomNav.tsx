import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Heart, Home, Ticket } from "lucide-react-native";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

type TicketNavKey = "home" | "my-tickets" | "favorites";

export default function TicketBottomNav({ active }: { active: TicketNavKey }) {
  const router = useRouter();
  const { theme } = useStudentTheme();
  const navItems = [
    { key: "home", label: "Home", Icon: Home, onPress: () => router.replace("/(student)/market/tickets" as any) },
    { key: "my-tickets", label: "My Tickets", Icon: Ticket, onPress: () => router.push("/(student)/market/my-tickets" as any) },
    { key: "favorites", label: "Favorites", Icon: Heart, onPress: () => undefined },
  ] as const;

  return (
    <View style={styles.ticketNavOuter}>
      <View style={[styles.ticketNav, { backgroundColor: theme.tabTheme.backgroundColor, borderColor: theme.border, shadowColor: theme.tabTheme.glowColor }]}>
        {navItems.map(({ key, label, Icon, onPress }) => {
          const isActive = active === key;
          const color = isActive ? theme.accent : theme.textMuted;
          return (
            <Pressable key={key} style={[styles.ticketNavItem, isActive && { backgroundColor: theme.accentSoft }]} onPress={onPress}>
              <Icon size={20} color={color} />
              <Text style={[styles.ticketNavText, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ticketNavOuter: { position: "absolute", left: 14, right: 14, bottom: 12 },
  ticketNav: {
    minHeight: 70,
    borderRadius: 26,
    borderWidth: 1,
    padding: 7,
    flexDirection: "row",
    justifyContent: "space-between",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  ticketNavItem: { flex: 1, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 4 },
  ticketNavText: { fontSize: 10, fontWeight: "900" },
});
