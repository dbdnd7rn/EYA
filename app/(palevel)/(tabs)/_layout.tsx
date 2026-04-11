import { Tabs } from "expo-router";
import { Search, Heart, MessageCircle, User } from "lucide-react-native";
import { createTabScreenOptions, renderAnimatedTabBar } from "@/components/AnimatedTabBar";

const theme = {
  activeColor: "#0f7a3a",
  inactiveColor: "#1b2433",
  backgroundColor: "rgba(255,255,255,0.95)",
  borderColor: "#e3ebdf",
  indicatorColor: "rgba(15,122,58,0.16)",
  glowColor: "#0f7a3a",
  sceneBackgroundColor: "#f6f7fb",
} as const;

export default function StudentTabs() {
  return (
    <Tabs screenOptions={createTabScreenOptions(theme)} tabBar={renderAnimatedTabBar(theme)}>
      <Tabs.Screen name="rooms" options={{ title: "Rooms", tabBarIcon: ({ color }) => <Search color={color} /> }} />
      <Tabs.Screen name="saved" options={{ title: "Saved", tabBarIcon: ({ color }) => <Heart color={color} /> }} />
      <Tabs.Screen name="messages" options={{ title: "Messages", tabBarIcon: ({ color }) => <MessageCircle color={color} /> }} />
    </Tabs>
  );
}
