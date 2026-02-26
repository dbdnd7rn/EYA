import React, { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function RedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const go = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        router.replace("/(auth)/login");
        return;
      }

      const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (error || !data?.role) {
        router.replace("/onboarding");
        return;
      }

      if (data.role === "landlord") router.replace("/(landlord)/(tabs)/dashboard");
      else router.replace("/(student)/(tabs)/rooms");
    };

    go();
  }, [router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f7fb" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
        <Text style={{ fontSize: 34, fontWeight: "900" }}>
          <Text style={{ color: "#0e2756" }}>pa</Text>
          <Text style={{ color: "#ff0f64" }}>level</Text>
        </Text>
        <ActivityIndicator size="large" color="#ff0f64" />
      </View>
    </SafeAreaView>
  );
}
