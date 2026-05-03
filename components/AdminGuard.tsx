import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase";
import { normalizeAppRole } from "@/lib/roleRouting";
import { ENV, isConfiguredAdminEmail } from "@/lib/env";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, role, activeRole, loading: authLoading, refreshRole } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        setChecking(true);

        if (authLoading) return;
        if (!user) {
          router.replace({ pathname: "/(auth)/login", params: { redirectTo: "/admin" } } as any);
          return;
        }

        if (!ENV.DEV_AUTH_MODE && !isConfiguredAdminEmail(user.email)) {
          router.replace("/");
          return;
        }

        if (!role) {
          await refreshRole(user.id);
        }

        if (ENV.DEV_AUTH_MODE) {
          const currentRole = normalizeAppRole(role ?? activeRole ?? user.user_metadata?.role);
          if (currentRole !== "admin") {
            router.replace("/");
            return;
          }
          return;
        }

        const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        const currentRole = normalizeAppRole((data as any)?.role ?? role);
        if (currentRole !== "admin") {
          router.replace("/");
          return;
        }
      } catch {
        router.replace("/");
      } finally {
        if (alive) setChecking(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [authLoading, user, role, activeRole, refreshRole, router]);

  if (authLoading || checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Checking admin access...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f6f7fb", padding: 20 },
  muted: { marginTop: 10, color: "#5f6b85", fontWeight: "700" },
});
