import { Tabs } from "expo-router";
import { LayoutDashboard, List, PlusSquare, MessageCircle, User } from "lucide-react-native";
import { createTabScreenOptions, renderAnimatedTabBar } from "@/components/AnimatedTabBar";

const theme = {
  activeColor: "#0f7a3a",
  inactiveColor: "#1b2433",
  backgroundColor: "rgba(255,255,255,0.95)",
  borderColor: "#e1e9df",
  indicatorColor: "rgba(15,122,58,0.16)",
  glowColor: "#0f7a3a",
  sceneBackgroundColor: "#f6f7fb",
} as const;

export default function LandlordTabs() {
  return (
    <Tabs screenOptions={createTabScreenOptions(theme)} tabBar={renderAnimatedTabBar(theme)}>
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: ({ color }) => <LayoutDashboard color={color} /> }} />
      <Tabs.Screen name="listings" options={{ title: "Listings", tabBarIcon: ({ color }) => <List color={color} /> }} />
      <Tabs.Screen name="create" options={{ title: "Create", tabBarIcon: ({ color }) => <PlusSquare color={color} /> }} />
      <Tabs.Screen name="enquiries" options={{ title: "Enquiries", tabBarIcon: ({ color }) => <MessageCircle color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <User color={color} /> }} />
    </Tabs>
  );
}
