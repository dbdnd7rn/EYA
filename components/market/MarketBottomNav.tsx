import React from "react";
import { useRouter } from "expo-router";
import { ClipboardList, MessageCircle, ShoppingBag } from "lucide-react-native";
import { LiquidGlassBottomNav, type LiquidGlassNavItem } from "@/components/LiquidGlassBottomNav";

export type MarketNavKey = "market" | "requests" | "messages";

export default function MarketBottomNav({ active }: { active: MarketNavKey }) {
  const router = useRouter();

  const items: LiquidGlassNavItem[] = [
    {
      key: "market",
      label: "Market",
      onPress: () => router.replace("/(student)/market" as any),
      renderIcon: ({ color, size, strokeWidth }) => (
        <ShoppingBag color={color} size={size} strokeWidth={strokeWidth} />
      ),
    },
    {
      key: "requests",
      label: "Requests",
      onPress: () => router.replace("/(student)/market/requests" as any),
      renderIcon: ({ color, size, strokeWidth }) => (
        <ClipboardList color={color} size={size} strokeWidth={strokeWidth} />
      ),
    },
    {
      key: "messages",
      label: "Chats",
      onPress: () => router.replace("/(student)/market/messages" as any),
      renderIcon: ({ color, size, strokeWidth }) => (
        <MessageCircle color={color} size={size} strokeWidth={strokeWidth} />
      ),
    },
  ];

  return <LiquidGlassBottomNav activeKey={active} items={items} />;
}
