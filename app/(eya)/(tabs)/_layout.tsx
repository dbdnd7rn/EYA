import { Tabs } from "expo-router";
import { Search, Heart, MessageCircle } from "lucide-react-native";
import { createTabScreenOptions, renderAnimatedTabBar } from "@/components/AnimatedTabBar";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

const LIGHT_EYA_TAB_THEME = {
  activeColor: "#0f7a3a",
  inactiveColor: "#1b2433",
  backgroundColor: "rgba(255,255,255,0.76)",
  borderColor: "rgba(255,255,255,0.78)",
  indicatorColor: "rgba(15,122,58,0.10)",
  glowColor: "#0f7a3a",
  sceneBackgroundColor: "#f6f7fb",
  blurTint: "light" as const,
} as const;

export default function StudentTabs() {
  const { theme } = useStudentTheme();
  const tabTheme = theme.isDark
    ? {
        activeColor: "#ffffff",
        inactiveColor: "#9caac2",
        backgroundColor: "rgba(9,15,27,0.82)",
        borderColor: "rgba(69,88,120,0.72)",
        indicatorColor: "rgba(116,214,155,0.12)",
        glowColor: "#74d69b",
        sceneBackgroundColor: theme.background,
        blurTint: "dark" as const,
      }
    : LIGHT_EYA_TAB_THEME;

  return (
    <Tabs screenOptions={createTabScreenOptions(tabTheme)} tabBar={renderAnimatedTabBar(tabTheme)}>
      <Tabs.Screen name="rooms" options={{ title: "Rooms", tabBarIcon: ({ color }) => <Search color={color} /> }} />
      <Tabs.Screen name="saved" options={{ title: "Saved", tabBarIcon: ({ color }) => <Heart color={color} /> }} />
      <Tabs.Screen name="messages" options={{ title: "Messages", tabBarIcon: ({ color }) => <MessageCircle color={color} /> }} />
    </Tabs>
  );
}
