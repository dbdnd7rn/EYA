import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { Truck, User } from "lucide-react-native";
import { createTabScreenOptions, renderAnimatedTabBar } from "@/components/AnimatedTabBar";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

const LIGHT_AGENT_TAB_THEME = {
  activeColor: "#1d275f",
  inactiveColor: "#5e688f",
  backgroundColor: "rgba(255,255,255,0.94)",
  borderColor: "#e8e2f6",
  indicatorColor: "rgba(70,89,141,0.12)",
  glowColor: "#5562b4",
  sceneBackgroundColor: "#f3eefb",
  floatingTabName: "dashboard",
  floatingTabBackgroundColor: "#355f59",
  floatingTabBorderColor: "rgba(255,255,255,0.78)",
  floatingTabShadowColor: "#355f59",
} as const;

export default function AgentTabsLayout() {
  const { theme } = useStudentTheme();
  const tabTheme = theme.isDark
    ? {
        activeColor: "#ffffff",
        inactiveColor: "#9caac2",
        backgroundColor: "rgba(9,15,27,0.96)",
        borderColor: "#2a3d5c",
        indicatorColor: "rgba(116,214,155,0.18)",
        glowColor: "#74d69b",
        sceneBackgroundColor: theme.background,
        floatingTabName: "dashboard",
        floatingTabBackgroundColor: "#2c8a72",
        floatingTabBorderColor: "#0f1727",
        floatingTabShadowColor: "#2c8a72",
        blurTint: "dark" as const,
      }
    : LIGHT_AGENT_TAB_THEME;

  return (
    <Tabs screenOptions={createTabScreenOptions(tabTheme)} tabBar={renderAnimatedTabBar(tabTheme, ["deliveries", "dashboard", "profile"])}>
      <Tabs.Screen name="deliveries" options={{ title: "Deliveries", tabBarIcon: ({ color }) => <Truck color={color} /> }} />
      <Tabs.Screen name="dashboard" options={{ title: "Online", tabBarIcon: ({ focused }) => <OnlineTabIcon focused={focused} /> }} />
      <Tabs.Screen name="earnings" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <User color={color} /> }} />
    </Tabs>
  );
}

function OnlineTabIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.onlineIconWrap}>
      <View style={[styles.onlineDot, focused && styles.onlineDotFocused]} />
      <Text style={styles.onlineText}>ONLINE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  onlineIconWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  onlineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#7fe56b",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
  },
  onlineDotFocused: { backgroundColor: "#8dff78" },
  onlineText: { color: "#ffffff", fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
});
