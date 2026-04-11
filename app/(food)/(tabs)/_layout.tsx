import { Tabs } from "expo-router";
import { ClipboardList, Soup } from "lucide-react-native";
import { createTabScreenOptions, renderAnimatedTabBar } from "@/components/AnimatedTabBar";

const theme = {
  activeColor: "#ff4b6e",
  inactiveColor: "#9fa8c0",
  backgroundColor: "rgba(13,16,26,0.98)",
  borderColor: "#293041",
  indicatorColor: "rgba(255,75,110,0.18)",
  glowColor: "#ff4b6e",
  sceneBackgroundColor: "#07090f",
  blurTint: "dark",
} as const;

export default function FoodTabs() {
  return (
    <Tabs screenOptions={createTabScreenOptions(theme)} tabBar={renderAnimatedTabBar(theme)}>
      <Tabs.Screen name="food" options={{ title: "Food", tabBarIcon: ({ color }) => <Soup color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", tabBarIcon: ({ color }) => <ClipboardList color={color} /> }} />
    </Tabs>
  );
}
