import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f7fb" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
        <Text style={{ color: "#0e2756", fontSize: 30, fontWeight: "900" }}>Page Not Found</Text>
        <Text style={{ color: "#5f6b85", textAlign: "center" }}>The page you requested does not exist in this app route.</Text>
        <Pressable onPress={() => router.replace("/")} style={{ borderRadius: 12, backgroundColor: "#ff0f64", paddingHorizontal: 18, paddingVertical: 12 }}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>Go Home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
