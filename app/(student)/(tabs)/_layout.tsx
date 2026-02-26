import { Tabs } from "expo-router";
import { Search, Heart, MessageCircle, User } from "lucide-react-native";
import { Platform } from "react-native";

export default function StudentTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#0f7a3a",
        tabBarInactiveTintColor: "#1b2433",
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
        tabBarItemStyle: {
          marginVertical: 8,
          marginHorizontal: 4,
          borderRadius: 26,
        },
        tabBarActiveBackgroundColor: "rgba(0,0,0,0.055)",
        tabBarStyle: {
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 12,
          height: 78,
          borderTopWidth: 0,
          borderRadius: 34,
          backgroundColor: "rgba(255,255,255,0.92)",
          paddingHorizontal: 10,
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
      <Tabs.Screen name="rooms" options={{ title: "Rooms", tabBarIcon: ({ color }) => <Search color={color} /> }} />
      <Tabs.Screen name="saved" options={{ title: "Saved", tabBarIcon: ({ color }) => <Heart color={color} /> }} />
      <Tabs.Screen name="messages" options={{ title: "Messages", tabBarIcon: ({ color }) => <MessageCircle color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color }) => <User color={color} /> }} />
    </Tabs>
  );
}
