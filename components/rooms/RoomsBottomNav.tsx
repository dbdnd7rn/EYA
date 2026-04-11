import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Heart, MessageCircle, Search } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type RoomsNavKey = "rooms" | "saved" | "messages";

export default function RoomsBottomNav({ active }: { active: RoomsNavKey }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const items: {
    key: RoomsNavKey;
    label: string;
    Icon: typeof Search;
    href: "/(student)/(tabs)/rooms" | "/(student)/(tabs)/saved" | "/(student)/(tabs)/messages";
  }[] = [
    { key: "rooms", label: "Rooms", Icon: Search, href: "/(student)/(tabs)/rooms" },
    { key: "saved", label: "Saved", Icon: Heart, href: "/(student)/(tabs)/saved" },
    { key: "messages", label: "Messages", Icon: MessageCircle, href: "/(student)/(tabs)/messages" },
  ];

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.wrap, { bottom: 12 + insets.bottom }]}>
        {items.map(({ key, label, Icon, href }) => {
          const isActive = key === active;
          const color = isActive ? "#2f7d32" : "#0e2756";
          return (
            <Pressable
              key={key}
              onPress={() => {
                if (isActive) return;
                router.replace(href);
              }}
              style={({ pressed }) => [
                styles.item,
                isActive && styles.itemActive,
                pressed && !isActive && { opacity: 0.85 },
              ]}
            >
              <Icon size={22} color={color} />
              <Text style={[styles.label, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#e8edf7",
    padding: 8,
    flexDirection: "row",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
  },
  item: {
    flex: 1,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 6,
  },
  itemActive: {
    backgroundColor: "rgba(74, 179, 91, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(74, 179, 91, 0.28)",
  },
  label: { fontSize: 13, fontWeight: "900" },
});
