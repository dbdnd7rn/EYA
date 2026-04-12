import { Tabs } from "expo-router";
import { LayoutDashboard, ClipboardList, Package2, WalletCards } from "lucide-react-native";
import { createTabScreenOptions, renderAnimatedTabBar } from "@/components/AnimatedTabBar";

const theme = {
  activeColor: "#102a54",
  inactiveColor: "#7a87a5",
  backgroundColor: "rgba(255,255,255,0.96)",
  borderColor: "#dfe8f5",
  indicatorColor: "rgba(16,42,84,0.12)",
  glowColor: "#102a54",
  sceneBackgroundColor: "#f6f8fc",
} as const;

export default function MarketTabs() {
  return (
    <Tabs
      screenOptions={createTabScreenOptions(theme)}
      tabBar={renderAnimatedTabBar(theme, ["dashboard", "orders", "products", "account"])}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: ({ color }) => <LayoutDashboard color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", tabBarIcon: ({ color }) => <ClipboardList color={color} /> }} />
      <Tabs.Screen name="products" options={{ title: "Items", tabBarIcon: ({ color }) => <Package2 color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: "Payments", tabBarIcon: ({ color }) => <WalletCards color={color} /> }} />
      <Tabs.Screen name="marketplace" options={{ href: null }} />
    </Tabs>
  );
}
