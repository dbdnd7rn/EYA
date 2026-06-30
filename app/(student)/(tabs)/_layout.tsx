import { Tabs } from "expo-router";
import { ClipboardList, House, MessageCircle, Ticket, UserRound } from "lucide-react-native";
import { AnimatedTabBar, createTabScreenOptions } from "@/components/AnimatedTabBar";
import { StudentBadgeProvider, useStudentBadges } from "@/providers/StudentBadgeProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

const STUDENT_VISIBLE_TABS = ["home", "tickets", "orders", "messages", "account"];
const SECTION_ONLY_TABS = new Set(["rooms", "saved", "room-messages", "marketplace", "food"]);

function StudentTabsNavigator() {
  const { messages, orders } = useStudentBadges();
  const { theme } = useStudentTheme();
  const tabTheme = theme.tabTheme;

  return (
    <Tabs
      screenOptions={createTabScreenOptions(tabTheme)}
      tabBar={(props) => {
        const activeRouteName = props.state.routes[props.state.index]?.name;
        if (activeRouteName && SECTION_ONLY_TABS.has(activeRouteName)) return null;
        return <AnimatedTabBar {...props} theme={tabTheme} visibleTabNames={STUDENT_VISIBLE_TABS} />;
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: ({ color }) => <House color={color} /> }} />
      <Tabs.Screen name="tickets" options={{ title: "Tickets", tabBarIcon: ({ color }) => <Ticket color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", tabBarIcon: ({ color }) => <ClipboardList color={color} />, tabBarBadge: orders || undefined }} />
      <Tabs.Screen name="messages" options={{ title: "Chats", tabBarIcon: ({ color }) => <MessageCircle color={color} />, tabBarBadge: messages || undefined }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: ({ color }) => <UserRound color={color} /> }} />

      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="rooms" options={{ href: null }} />
      <Tabs.Screen name="room-messages" options={{ href: null }} />
      <Tabs.Screen name="marketplace" options={{ href: null }} />
      <Tabs.Screen name="food" options={{ href: null }} />
      <Tabs.Screen name="saved" options={{ href: null }} />
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
