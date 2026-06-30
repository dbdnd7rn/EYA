import React from "react";
import { useRouter } from "expo-router";
import { BedDouble, Heart, MessageCircle } from "lucide-react-native";
import { LiquidGlassBottomNav, type LiquidGlassNavItem } from "@/components/LiquidGlassBottomNav";

export type RoomsNavKey = "rooms" | "saved" | "chats";

export default function RoomsBottomNav({ active = "rooms" }: { active?: RoomsNavKey }) {
  const router = useRouter();

  const items: LiquidGlassNavItem[] = [
    {
      key: "rooms",
      label: "Rooms",
      onPress: () => router.replace("/(student)/(tabs)/rooms" as any),
      renderIcon: ({ color, size, strokeWidth }) => (
        <BedDouble color={color} size={size} strokeWidth={strokeWidth} />
      ),
    },
    {
      key: "saved",
      label: "Saved",
      onPress: () => router.replace("/(student)/(tabs)/saved" as any),
      renderIcon: ({ color, size, strokeWidth }) => (
        <Heart color={color} size={size} strokeWidth={strokeWidth} />
      ),
    },
    {
      key: "chats",
      label: "Chats",
      onPress: () => router.replace("/(student)/(tabs)/room-messages" as any),
      renderIcon: ({ color, size, strokeWidth }) => (
        <MessageCircle color={color} size={size} strokeWidth={strokeWidth} />
      ),
    },
  ];

  return <LiquidGlassBottomNav activeKey={active} items={items} />;
}
