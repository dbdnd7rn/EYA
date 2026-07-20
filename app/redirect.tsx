import React, { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
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
  const { user, role, activeRole, loading, setActiveRole, syncSession } = useAuth();
  const routingStarted = useRef(false);

  useEffect(() => {
    if (loading || routingStarted.current) return;
    routingStarted.current = true;
    let active = true;

    const go = async () => {
      let resolvedUser = user;
      let recoveredSession = false;

      if (!resolvedUser) {
        resolvedUser = await syncSession().catch(() => null);
        recoveredSession = Boolean(resolvedUser);
      }

      if (!active) return;
      if (!resolvedUser) {
        router.replace("/(auth)/login");
        return;
      }

      // When the provider had to recover the session, use the stable User
      // workspace first instead of sending the person into a stale saved role.
      if (recoveredSession) {
        await setActiveRole("student");
        if (active) router.replace(getWorkspaceHomeRoute("student") as any);
        return;
      }

      const normalizedRole = normalizeAppRole(role);
      const normalizedActiveRole = normalizeAppRole(activeRole);
      const canUseAdmin = ENV.DEV_AUTH_MODE || isConfiguredAdminEmail(resolvedUser.email);
      const goToUserHome = async () => {
        await setActiveRole("student");
        if (active) router.replace(getWorkspaceHomeRoute("student") as any);
      };

      if (normalizedRole === "admin" && canUseAdmin) {
        await setActiveRole("admin");
        if (active) router.replace(getWorkspaceHomeRoute("admin") as any);
        return;
      }

      if (normalizedActiveRole) {
        if (normalizedActiveRole === "student" || normalizedActiveRole === "admin") {
          router.replace(getWorkspaceHomeRoute(normalizedActiveRole) as any);
          return;
        }

        const statuses = await getWorkspaceStatuses(resolvedUser.id, resolvedUser.email);
        const activeStatus = statuses.find((entry) => entry.role === normalizedActiveRole) ?? null;
        if (!activeStatus?.ready) {
          await goToUserHome();
          return;
        }

        if (active) router.replace(getWorkspaceHomeRoute(normalizedActiveRole) as any);
        return;
      }

      if (normalizedRole) {
        const fallbackRole = getFallbackWorkspaceRole(normalizedRole, resolvedUser.email);
        await setActiveRole(fallbackRole);
        if (active) router.replace(getWorkspaceHomeRoute(fallbackRole) as any);
        return;
      }

      const recoveredRole = await ensureProfileRoleFromAuthUser(resolvedUser);
      if (recoveredRole) {
        const fallbackRole =
          recoveredRole === "admin" && !canUseAdmin ? "student" : getFallbackWorkspaceRole(recoveredRole, resolvedUser.email);
        await setActiveRole(fallbackRole);
        if (active) router.replace(getWorkspaceHomeRoute(fallbackRole) as any);
        return;
      }

      const { data, error } = await supabase.from("profiles").select("role").eq("id", resolvedUser.id).maybeSingle();
      if (error) {
        await goToUserHome();
        return;
      }
      const dbRole = normalizeAppRole(data?.role);
      const fallbackRole =
        dbRole === "admin" && !canUseAdmin ? "student" : getFallbackWorkspaceRole(dbRole, resolvedUser.email);
      await setActiveRole(fallbackRole);
      if (active) router.replace(getWorkspaceHomeRoute(fallbackRole) as any);
    };

    void go().catch(async () => {
      try {
        await setActiveRole("student");
      } finally {
        if (active) router.replace(getWorkspaceHomeRoute("student") as any);
      }
    });

    return () => {
      active = false;
    };
  }, [activeRole, loading, role, router, setActiveRole, syncSession, user]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f7fb" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
        <EyaWordmark width={140} height={52} withTagline={false} />
        <ActivityIndicator size="large" color="#ff0f64" />
      </View>
    </SafeAreaView>
  );
}
