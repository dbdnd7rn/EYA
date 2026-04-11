import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase";
import { normalizeAppRole } from "@/lib/roleRouting";
import { ENV } from "@/lib/env";

export default function AgentGuard({ children }: { children: React.ReactNode }) {
  const { user, role, loading: authLoading, refreshRole } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        setChecking(true);

        if (authLoading) return;
        if (!user) {
          router.replace("/(auth)/login");
          return;
        }

        if (!role) {
          await refreshRole(user.id);
        }

        if (ENV.DEV_AUTH_MODE) {
          const currentRole = normalizeAppRole(role);
          if (currentRole === "student") {
            router.replace("/(student)/(tabs)/home");
            return;
          }
          if (currentRole === "vendor") {
            router.replace("/(market)/(tabs)/dashboard");
            return;
          }
          if (currentRole === "landlord" || currentRole === "admin") {
            router.replace("/(landlord)/(tabs)/dashboard");
            return;
          }
          if (currentRole !== "agent") {
            router.replace("/onboarding");
            return;
          }
          return;
        }

        const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        const currentRole = normalizeAppRole((data as any)?.role ?? role);

        if (currentRole === "student") {
          router.replace("/(student)/(tabs)/home");
          return;
        }
        if (currentRole === "vendor") {
          router.replace("/(market)/(tabs)/dashboard");
          return;
        }
        if (currentRole === "landlord" || currentRole === "admin") {
          router.replace("/(landlord)/(tabs)/dashboard");
          return;
        }
        if (currentRole !== "agent") {
          router.replace("/onboarding");
          return;
        }
      } catch {
        router.replace("/onboarding");
      } finally {
        if (alive) setChecking(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [authLoading, user, role, refreshRole, router]);

  if (authLoading || checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Checking access...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f6f7fb", padding: 20 },
  muted: { marginTop: 10, color: "#5f6b85", fontWeight: "700" },
});
