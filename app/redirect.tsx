import React, { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { normalizeAppRole } from "@/lib/roleRouting";
import { ENV, isConfiguredAdminEmail } from "@/lib/env";
import { ensureProfileRoleFromAuthUser } from "@/lib/authProfile";
import { storeActiveWorkspace } from "@/lib/activeWorkspace";
import { getFallbackWorkspaceRole, getWorkspaceHomeRoute, getWorkspaceStatuses } from "@/lib/workspaceAccess";
import { getMyTicketOrganizerAccess } from "@/lib/ticketOrganizerAccess";
import { isTemporaryOrganizerUser } from "@/lib/temporaryOrganizerIdentity";
import EyaWordmark from "@/components/brand/EyaWordmark";

const REDIRECT_WATCHDOG_MS = 7000;
const REDIRECT_STEP_TIMEOUT_MS = 3500;

async function withRedirectTimeout<T>(promise: Promise<T>, ms = REDIRECT_STEP_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Startup routing step timed out.")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default function RedirectPage() {
  const router = useRouter();
  const { user, role, activeRole, loading, setActiveRole, syncSession, signOut } = useAuth();
  const routingStarted = useRef(false);

  useEffect(() => {
    if (loading || routingStarted.current) return;
    routingStarted.current = true;
    let active = true;
    let routed = false;

    const replaceOnce = (route: string) => {
      if (!active || routed) return;
      routed = true;
      router.replace(route as any);
    };

    const routeToUserHome = async () => {
      await withRedirectTimeout(setActiveRole("student"), 1800).catch(() => undefined);
      replaceOnce(getWorkspaceHomeRoute("student"));
    };

    const watchdog = setTimeout(() => {
      if (!active || routed) return;
      if (isTemporaryOrganizerUser(user)) {
        void signOut().catch(() => undefined);
        replaceOnce("/organizer-access-ended");
        return;
      }
      void setActiveRole("student").catch(() => undefined);
      void (user?.id ? storeActiveWorkspace(user.id, "student").catch(() => undefined) : Promise.resolve());
      replaceOnce(getWorkspaceHomeRoute("student"));
    }, REDIRECT_WATCHDOG_MS);

    const go = async () => {
      let resolvedUser = user;
      let recoveredSession = false;

      if (!resolvedUser) {
        resolvedUser = await withRedirectTimeout(syncSession()).catch(() => null);
        recoveredSession = Boolean(resolvedUser);
      }

      if (!active || routed) return;
      if (!resolvedUser) {
        replaceOnce("/(auth)/login");
        return;
      }

      // Temporary organizer identities never enter normal Roles & Workspaces.
      // The trusted app_metadata marker is set only by the invite claim service.
      if (isTemporaryOrganizerUser(resolvedUser)) {
        const access = await withRedirectTimeout(getMyTicketOrganizerAccess()).catch(() => null);
        if (!active || routed) return;
        if (access) {
          replaceOnce("/(organizer)/dashboard");
          return;
        }
        await withRedirectTimeout(signOut(), 1800).catch(() => undefined);
        replaceOnce("/organizer-access-ended");
        return;
      }

      if (recoveredSession) {
        await withRedirectTimeout(storeActiveWorkspace(resolvedUser.id, "student"), 1800).catch(() => undefined);
        await withRedirectTimeout(setActiveRole("student"), 1800).catch(() => undefined);
        replaceOnce(getWorkspaceHomeRoute("student"));
        return;
      }

      const normalizedRole = normalizeAppRole(role);
      const normalizedActiveRole = normalizeAppRole(activeRole);
      const canUseAdmin = ENV.DEV_AUTH_MODE || isConfiguredAdminEmail(resolvedUser.email);

      if (normalizedRole === "admin" && canUseAdmin) {
        await withRedirectTimeout(setActiveRole("admin"), 1800).catch(() => undefined);
        replaceOnce(getWorkspaceHomeRoute("admin"));
        return;
      }

      if (normalizedActiveRole) {
        if (normalizedActiveRole === "student" || normalizedActiveRole === "admin") {
          replaceOnce(getWorkspaceHomeRoute(normalizedActiveRole));
          return;
        }

        const statuses = await withRedirectTimeout(getWorkspaceStatuses(resolvedUser.id, resolvedUser.email));
        if (!active || routed) return;
        const activeStatus = statuses.find((entry) => entry.role === normalizedActiveRole) ?? null;
        if (!activeStatus?.ready) {
          await routeToUserHome();
          return;
        }

        replaceOnce(getWorkspaceHomeRoute(normalizedActiveRole));
        return;
      }

      if (normalizedRole) {
        const fallbackRole = getFallbackWorkspaceRole(normalizedRole, resolvedUser.email);
        await withRedirectTimeout(setActiveRole(fallbackRole), 1800).catch(() => undefined);
        replaceOnce(getWorkspaceHomeRoute(fallbackRole));
        return;
      }

      const recoveredRole = await withRedirectTimeout(ensureProfileRoleFromAuthUser(resolvedUser)).catch(() => null);
      if (!active || routed) return;
      if (recoveredRole) {
        const fallbackRole =
          recoveredRole === "admin" && !canUseAdmin ? "student" : getFallbackWorkspaceRole(recoveredRole, resolvedUser.email);
        await withRedirectTimeout(setActiveRole(fallbackRole), 1800).catch(() => undefined);
        replaceOnce(getWorkspaceHomeRoute(fallbackRole));
        return;
      }

      const profileLookup = supabase.from("profiles").select("role").eq("id", resolvedUser.id).maybeSingle();
      const { data, error } = await withRedirectTimeout(profileLookup);
      if (!active || routed) return;
      if (error) {
        await routeToUserHome();
        return;
      }
      const dbRole = normalizeAppRole(data?.role);
      const fallbackRole =
        dbRole === "admin" && !canUseAdmin ? "student" : getFallbackWorkspaceRole(dbRole, resolvedUser.email);
      await withRedirectTimeout(setActiveRole(fallbackRole), 1800).catch(() => undefined);
      replaceOnce(getWorkspaceHomeRoute(fallbackRole));
    };

    void go().catch(() => {
      if (isTemporaryOrganizerUser(user)) {
        void signOut().catch(() => undefined);
        replaceOnce("/organizer-access-ended");
        return;
      }
      void routeToUserHome();
    });

    return () => {
      active = false;
      clearTimeout(watchdog);
    };
  }, [activeRole, loading, role, router, setActiveRole, signOut, syncSession, user]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f7fb" }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
        <EyaWordmark width={140} height={52} withTagline={false} />
        <ActivityIndicator size="large" color="#ff0f64" />
      </View>
    </SafeAreaView>
  );
}
