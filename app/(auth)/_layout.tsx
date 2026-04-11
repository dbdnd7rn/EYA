import React, { useEffect } from "react";
import { Stack, router } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/providers/AuthProvider";

export default function AuthLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/redirect");
    }
  }, [loading, user]);

  if (loading || user) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f6f7fb" }}>
        <ActivityIndicator size="large" color="#ff0f64" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
