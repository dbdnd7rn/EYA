import React, { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { normalizeAppRole } from "@/lib/roleRouting";
import { ENV, isConfiguredAdminEmail } from "@/lib/env";
import { ensureProfileRoleFromAuthUser } from "@/lib/authProfile";
import { getFallbackWorkspaceRole, getWorkspaceHomeRoute, getWorkspaceStatuses } from "@/lib/workspaceAccess";
import EyaWordmark from "@/components/brand/EyaWordmark";

export default function RedirectPage() {
  const router = useRouter();
  const { user, role, activeRole, loading, setActiveRole } = useAuth();

  useEffect(() => {
    if (loading) return;

    const go = async () => {
      if (!user) {
        router.replace("/(auth)/login");
        return;
      }

      const normalizedRole = normalizeAppRole(role);
      const normalizedActiveRole = normalizeAppRole(activeRole);
      const canUseAdmin = ENV.DEV_AUTH_MODE || isConfiguredAdminEmail(user.email);
      const goToUserHome = async () => {
        await setActiveRole("student");
        router.replace(getWorkspaceHomeRoute("student") as any);
      };

      if (normalizedRole === "admin" && canUseAdmin) {
        await setActiveRole("admin");
        router.replace(getWorkspaceHomeRoute("admin") as any);
        return;
      }

      if (normalizedActiveRole) {
        if (normalizedActiveRole === "student" || normalizedActiveRole === "admin") {
          router.replace(getWorkspaceHomeRoute(normalizedActiveRole) as any);
          return;
        }

        const statuses = await getWorkspaceStatuses(user.id, user.email);
        const activeStatus = statuses.find((entry) => entry.role === normalizedActiveRole) ?? null;
        if (!activeStatus?.ready) {
          await goToUserHome();
          return;
        }

        router.replace(getWorkspaceHomeRoute(normalizedActiveRole) as any);
        return;
      }

      if (normalizedRole) {
        await setActiveRole(getFallbackWorkspaceRole(normalizedRole, user.email));
        router.replace(getWorkspaceHomeRoute(getFallbackWorkspaceRole(normalizedRole, user.email)) as any);
        return;
      }

      const recoveredRole = await ensureProfileRoleFromAuthUser(user);
      if (recoveredRole) {
        const fallbackRole =
          recoveredRole === "admin" && !canUseAdmin ? "student" : getFallbackWorkspaceRole(recoveredRole, user.email);
        await setActiveRole(fallbackRole);
        router.replace(getWorkspaceHomeRoute(fallbackRole) as any);
        return;
      }

      const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (error) {
        await goToUserHome();
        return;
      }
      const dbRole = normalizeAppRole(data?.role);
      const fallbackRole =
        dbRole === "admin" && !canUseAdmin ? "student" : getFallbackWorkspaceRole(dbRole, user.email);
      await setActiveRole(fallbackRole);
      router.replace(getWorkspaceHomeRoute(fallbackRole) as any);
    };

    void go().catch(async () => {
      try {
        await setActiveRole("student");
      } finally {
        router.replace(getWorkspaceHomeRoute("student") as any);
      }
    });
  }, [activeRole, loading, role, router, setActiveRole, user]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f7fb" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
        <EyaWordmark width={140} height={52} withTagline={false} />
        <ActivityIndicator size="large" color="#ff0f64" />
      </View>
    </SafeAreaView>
  );
}


