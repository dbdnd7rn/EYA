import { Tabs } from "expo-router";
import { LayoutDashboard, List, PlusSquare, MessageCircle, User } from "lucide-react-native";
import { Platform } from "react-native";

export default function LandlordTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0f7a3a",
        tabBarInactiveTintColor: "#1b2433",
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
          marginTop: 1,
        },
        tabBarIconStyle: {
          marginTop: 3,
        },
        tabBarItemStyle: {
          marginVertical: 8,
          marginHorizontal: 2,
          borderRadius: 24,
        },
        tabBarActiveBackgroundColor: "rgba(0,0,0,0.055)",
        tabBarStyle: {
          position: "absolute",
          left: 10,
          right: 10,
          bottom: 12,
          height: 82,
          borderTopWidth: 0,
          borderRadius: 34,
          backgroundColor: "rgba(255,255,255,0.92)",
          paddingHorizontal: 8,
          paddingTop: 6,
          paddingBottom: Platform.OS === "ios" ? 10 : 8,
          shadowColor: "#101828",
          shadowOpacity: 0.08,
          shadowRadius: 18,
          elevation: 6,
        },
        sceneStyle: {
          backgroundColor: "#f6f7fb",
        },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: ({ color }) => <LayoutDashboard color={color} /> }} />
      <Tabs.Screen name="listings" options={{ title: "Listings", tabBarIcon: ({ color }) => <List color={color} /> }} />
      <Tabs.Screen name="create" options={{ title: "Create", tabBarIcon: ({ color }) => <PlusSquare color={color} /> }} />
      <Tabs.Screen name="enquiries" options={{ title: "Enquiries", tabBarIcon: ({ color }) => <MessageCircle color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <User color={color} /> }} />
    </Tabs>
  );
}
