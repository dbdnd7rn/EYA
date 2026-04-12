import { Tabs } from "expo-router";
import { House, List, MessageCircle, Plus, User } from "lucide-react-native";
import { createTabScreenOptions, renderAnimatedTabBar } from "@/components/AnimatedTabBar";

const theme = {
  activeColor: "#22356c",
  inactiveColor: "#1f2f68",
  backgroundColor: "rgba(255,255,255,0.95)",
  borderColor: "#e8e4f6",
  indicatorColor: "rgba(34,53,108,0.1)",
  glowColor: "#b9b0df",
  sceneBackgroundColor: "#f8f5ff",
  floatingTabName: "create",
  floatingTabBackgroundColor: "#ff0f64",
  floatingTabIconColor: "#ffffff",
  floatingTabBorderColor: "rgba(255,255,255,0.94)",
  floatingTabShadowColor: "#ff63a2",
} as const;

export default function LandlordTabs() {
  return (
    <Tabs screenOptions={createTabScreenOptions(theme)} tabBar={renderAnimatedTabBar(theme)}>
      <Tabs.Screen name="dashboard" options={{ title: "Home", tabBarIcon: ({ color }) => <House color={color} /> }} />
      <Tabs.Screen name="listings" options={{ title: "Listings", tabBarIcon: ({ color }) => <List color={color} /> }} />
      <Tabs.Screen name="create" options={{ title: "Create", tabBarLabel: "", tabBarIcon: ({ color }) => <Plus color={color} strokeWidth={3.5} /> }} />
      <Tabs.Screen name="enquiries" options={{ title: "Enquiries", tabBarIcon: ({ color }) => <MessageCircle color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <User color={color} /> }} />
    </Tabs>
  );
}
