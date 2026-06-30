import { Tabs } from "expo-router";
import { ClipboardList, Soup } from "lucide-react-native";
import { createTabScreenOptions, renderAnimatedTabBar } from "@/components/AnimatedTabBar";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

const LIGHT_FOOD_TAB_THEME = {
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
  const { theme } = useStudentTheme();
  const tabTheme = theme.isDark
    ? {
        activeColor: "#ffffff",
        inactiveColor: "#9eaec8",
        backgroundColor: "rgba(9,15,27,0.96)",
        borderColor: "#2a3d5c",
        indicatorColor: "rgba(255,102,137,0.22)",
        glowColor: "#ff6689",
        sceneBackgroundColor: theme.background,
        blurTint: "dark" as const,
      }
    : LIGHT_FOOD_TAB_THEME;

  return (
    <Tabs screenOptions={createTabScreenOptions(tabTheme)} tabBar={renderAnimatedTabBar(tabTheme)}>
      <Tabs.Screen name="food" options={{ title: "Food", tabBarIcon: ({ color }) => <Soup color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", tabBarIcon: ({ color }) => <ClipboardList color={color} /> }} />
    </Tabs>
  );
}
