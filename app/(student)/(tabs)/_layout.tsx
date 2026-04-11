import { Tabs } from "expo-router";
import { ClipboardList, House, UserRound, Wallet2 } from "lucide-react-native";
import { createTabScreenOptions, renderAnimatedTabBar } from "@/components/AnimatedTabBar";
import { StudentBadgeProvider, useStudentBadges } from "@/providers/StudentBadgeProvider";

const theme = {
  activeColor: "#0e2756",
  inactiveColor: "#6e7892",
  backgroundColor: "rgba(255,255,255,0.96)",
  borderColor: "#e8edf7",
  indicatorColor: "rgba(14,39,86,0.14)",
  glowColor: "#0e2756",
  sceneBackgroundColor: "#f3f4f7",
} as const;

const STUDENT_VISIBLE_TABS = ["home", "orders", "wallet", "account"];

function StudentTabsNavigator() {
  const { messages, orders, wallet } = useStudentBadges();

  return (
    <Tabs screenOptions={createTabScreenOptions(theme)} tabBar={renderAnimatedTabBar(theme, STUDENT_VISIBLE_TABS)}>
      <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: ({ color }) => <House color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", tabBarIcon: ({ color }) => <ClipboardList color={color} />, tabBarBadge: orders || undefined }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet", tabBarIcon: ({ color }) => <Wallet2 color={color} />, tabBarBadge: wallet || undefined }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: ({ color }) => <UserRound color={color} />, tabBarBadge: messages || undefined }} />

      <Tabs.Screen name="rooms" options={{ href: null }} />
      <Tabs.Screen name="marketplace" options={{ href: null }} />
      <Tabs.Screen name="food" options={{ href: null }} />
      <Tabs.Screen name="saved" options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}

export default function StudentTabs() {
  return (
    <StudentBadgeProvider>
      <StudentTabsNavigator />
    </StudentBadgeProvider>
  );
}
