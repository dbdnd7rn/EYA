import { Tabs } from "expo-router";
import { LayoutDashboard, Truck, Wallet, User } from "lucide-react-native";
import { createTabScreenOptions, renderAnimatedTabBar } from "@/components/AnimatedTabBar";

const theme = {
  activeColor: "#0e2756",
  inactiveColor: "#6e7892",
  backgroundColor: "rgba(255,255,255,0.96)",
  borderColor: "#e8edf7",
  indicatorColor: "rgba(14,39,86,0.14)",
  glowColor: "#0e2756",
  sceneBackgroundColor: "#f3f4f7",
} as const;

export default function AgentTabsLayout() {
  return (
    <Tabs screenOptions={createTabScreenOptions(theme)} tabBar={renderAnimatedTabBar(theme)}>
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: ({ color }) => <LayoutDashboard color={color} /> }} />
      <Tabs.Screen name="deliveries" options={{ title: "Deliveries", tabBarIcon: ({ color }) => <Truck color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: "Earnings", tabBarIcon: ({ color }) => <Wallet color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <User color={color} /> }} />
    </Tabs>
  );
}
