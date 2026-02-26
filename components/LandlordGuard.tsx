import React, { useEffect, useState } from "react";
import { ActivityIndicator, View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../providers/AuthProvider";
import { supabase } from "../lib/supabase";

export default function LandlordGuard({ children }: { children: React.ReactNode }) {
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

        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        const currentRole = ((data as any)?.role ?? role) as string | null;
        if (currentRole === "student") {
          router.replace("/(student)/(tabs)/rooms");
          return;
        }

        if (currentRole !== "landlord" && currentRole !== "admin") {
          router.replace("/onboarding");
          return;
        }
      } catch {
        router.replace("/onboarding");
      } finally {
        if (alive) setChecking(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [user, role, authLoading, router, refreshRole]);

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
