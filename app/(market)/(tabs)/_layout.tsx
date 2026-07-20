import { Tabs } from "expo-router";
import { CalendarDays, ClipboardList, UserRound, UtensilsCrossed, WalletCards } from "lucide-react-native";
import { createTabScreenOptions, renderAnimatedTabBar } from "@/components/AnimatedTabBar";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

const LIGHT_MARKET_TAB_THEME = {
  activeColor: "#1f2e55",
  inactiveColor: "#7e84a8",
  backgroundColor: "rgba(255,255,255,0.94)",
  borderColor: "#dde0f2",
  indicatorColor: "rgba(96,102,168,0.14)",
  glowColor: "#1f2e55",
  sceneBackgroundColor: "#f1eff9",
  floatingTabName: "orders",
  floatingTabBackgroundColor: "#d74f84",
  floatingTabIconColor: "#ffffff",
  floatingTabBorderColor: "#f8f4ff",
  floatingTabShadowColor: "#ce5b8d",
} as const;

export default function MarketTabs() {
  const { theme } = useStudentTheme();
  const tabTheme = theme.isDark
    ? {
        activeColor: "#ffffff",
        inactiveColor: "#9facbf",
        backgroundColor: "rgba(9,15,27,0.96)",
        borderColor: "#2a3d5c",
        indicatorColor: "rgba(124,147,255,0.22)",
        glowColor: "#7c93ff",
        sceneBackgroundColor: theme.background,
        floatingTabName: "orders",
        floatingTabBackgroundColor: "#ff6d9d",
        floatingTabIconColor: "#ffffff",
        floatingTabBorderColor: "#0f1727",
        floatingTabShadowColor: "#ff6d9d",
        blurTint: "dark" as const,
      }
    : LIGHT_MARKET_TAB_THEME;

  return (
    <Tabs
      screenOptions={{
        ...createTabScreenOptions(tabTheme),
        lazy: true,
      }}
      tabBar={renderAnimatedTabBar(tabTheme, ["dashboard", "products", "orders", "earnings", "account"])}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Sessions", tabBarIcon: ({ color }) => <CalendarDays color={color} /> }} />
      <Tabs.Screen name="products" options={{ title: "Menu", tabBarIcon: ({ color }) => <UtensilsCrossed color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "Session", tabBarIcon: ({ color }) => <ClipboardList color={color} /> }} />
      <Tabs.Screen name="earnings" options={{ title: "Earnings", tabBarIcon: ({ color }) => <WalletCards color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: "Profile", tabBarIcon: ({ color }) => <UserRound color={color} /> }} />
      <Tabs.Screen name="marketplace" options={{ href: null }} />
    </Tabs>
  );
}
