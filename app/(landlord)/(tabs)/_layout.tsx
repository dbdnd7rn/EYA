import { Tabs } from "expo-router";
import { House, List, MessageCircle, Plus, User } from "lucide-react-native";
import { createTabScreenOptions, renderAnimatedTabBar } from "@/components/AnimatedTabBar";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

const LIGHT_LANDLORD_TAB_THEME = {
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
  const { theme } = useStudentTheme();
  const tabTheme = theme.isDark
    ? {
        activeColor: "#ffffff",
        inactiveColor: "#9caac2",
        backgroundColor: "rgba(9,15,27,0.96)",
        borderColor: "#2a3d5c",
        indicatorColor: "rgba(124,147,255,0.22)",
        glowColor: "#7c93ff",
        sceneBackgroundColor: theme.background,
        floatingTabName: "create",
        floatingTabBackgroundColor: "#ff5f93",
        floatingTabIconColor: "#ffffff",
        floatingTabBorderColor: "#0f1727",
        floatingTabShadowColor: "#ff5f93",
        blurTint: "dark" as const,
      }
    : LIGHT_LANDLORD_TAB_THEME;

  return (
    <Tabs
      screenOptions={{
        ...createTabScreenOptions(tabTheme),
        lazy: true,
      }}
      tabBar={renderAnimatedTabBar(tabTheme)}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Home", tabBarIcon: ({ color }) => <House color={color} /> }} />
      <Tabs.Screen name="listings" options={{ title: "Listings", tabBarIcon: ({ color }) => <List color={color} /> }} />
      <Tabs.Screen name="create" options={{ title: "Create", tabBarLabel: "", tabBarIcon: ({ color }) => <Plus color={color} strokeWidth={3.5} /> }} />
      <Tabs.Screen name="enquiries" options={{ title: "Enquiries", tabBarIcon: ({ color }) => <MessageCircle color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <User color={color} /> }} />
    </Tabs>
  );
}
