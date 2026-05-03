import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { normalizeAppRole } from "@/lib/roleRouting";
import { getWorkspaceHomeRoute } from "@/lib/workspaceAccess";
import { hasApprovedWorkspaceRole } from "@/lib/roleApplications";

export default function AgentGuard({ children }: { children: React.ReactNode }) {
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
          router.replace("/(auth)/login");
          return;
        }

        if (!role && !activeRole) {
          await refreshRole(user);
        }

        const currentRole = normalizeAppRole(activeRole ?? role) ?? "student";
        if (currentRole === "admin") {
          router.replace(getWorkspaceHomeRoute("admin") as any);
          return;
        }
        const approved = await hasApprovedWorkspaceRole(user.id, "agent");
        if (currentRole !== "agent") {
          router.replace(getWorkspaceHomeRoute(currentRole) as any);
          return;
        }
        if (!approved && normalizeAppRole(role) !== "agent") {
          router.replace("/onboarding" as any);
          return;
        }
      } catch {
        router.replace(getWorkspaceHomeRoute("student") as any);
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
