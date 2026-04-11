import React, { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { normalizeAppRole } from "@/lib/roleRouting";
import { ENV } from "@/lib/env";
import { ensureProfileRoleFromAuthUser } from "@/lib/authProfile";
import EyaWordmark from "@/components/brand/EyaWordmark";

export default function RedirectPage() {
  const router = useRouter();
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    const go = async () => {
      if (!user) {
        router.replace("/(auth)/login");
        return;
      }

      const normalizedRole = normalizeAppRole(role);

      if (normalizedRole === "landlord") {
        router.replace("/(landlord)/(tabs)/dashboard");
        return;
      }
      if (normalizedRole === "vendor") {
        router.replace("/(market)/(tabs)/dashboard");
        return;
      }
      if (normalizedRole === "agent") {
        router.replace("/(agent)/(tabs)/dashboard");
        return;
      }
      if (normalizedRole === "student" || normalizedRole === "admin") {
        router.replace("/(student)/(tabs)/home");
        return;
      }

      if (ENV.DEV_AUTH_MODE) {
        router.replace("/onboarding");
        return;
      }

      const recoveredRole = await ensureProfileRoleFromAuthUser(user);
      if (recoveredRole === "landlord") {
        router.replace("/(landlord)/(tabs)/dashboard");
        return;
      }
      if (recoveredRole === "vendor") {
        router.replace("/(market)/(tabs)/dashboard");
        return;
      }
      if (recoveredRole === "agent") {
        router.replace("/(agent)/(tabs)/dashboard");
        return;
      }
      if (recoveredRole === "student" || recoveredRole === "admin") {
        router.replace("/(student)/(tabs)/home");
        return;
      }

      const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (error) {
        router.replace("/(student)/(tabs)/home");
        return;
      }
      const dbRole = normalizeAppRole(data?.role);
      if (!dbRole) {
        router.replace("/onboarding");
        return;
      }
      if (dbRole === "landlord") router.replace("/(landlord)/(tabs)/dashboard");
      else if (dbRole === "vendor") router.replace("/(market)/(tabs)/dashboard");
      else if (dbRole === "agent") router.replace("/(agent)/(tabs)/dashboard");
      else router.replace("/(student)/(tabs)/home");
    };

    void go();
  }, [loading, user, role, router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f7fb" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
        <EyaWordmark width={140} height={52} withTagline={false} />
        <ActivityIndicator size="large" color="#ff0f64" />
      </View>
    </SafeAreaView>
  );
}


