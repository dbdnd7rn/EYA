import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  clearSupabaseAuthStorage,
  isInvalidRefreshTokenError,
  isNetworkUnavailableError,
  supabase,
} from "../lib/supabase";
import { normalizeAppRole } from "@/lib/roleRouting";
import { ENV, isConfiguredAdminEmail } from "@/lib/env";
import { clearDevAuthRecord, getDevAuthRecord, recordToUser, setDevAuthRecord } from "@/lib/devAuth";
import { ensureProfileRoleFromAuthUser } from "@/lib/authProfile";
import { readStoredActiveWorkspace, storeActiveWorkspace } from "@/lib/activeWorkspace";
import { getFallbackWorkspaceRole } from "@/lib/workspaceAccess";
import { hasWorkspaceAccess } from "@/lib/workspaceAuthorization";

type Role = "student" | "landlord" | "agent" | "vendor" | "admin" | null;

type AuthCtx = {
  user: User | null;
  session: Session | null;
  role: Role;
  activeRole: Role;
  loading: boolean;
  signOut: () => Promise<void>;
  signInDev: (input: { email: string; role: Exclude<Role, null> }) => Promise<void>;
  refreshRole: (userRef?: string | User | null) => Promise<void>;
  setActiveRole: (role: Exclude<Role, null>) => Promise<void>;
  syncSession: () => Promise<User | null>;
};

const Ctx = createContext<AuthCtx | null>(null);
const AUTH_STARTUP_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function sanitizeRole(role: Role, email?: string | null): Role {
  if (ENV.DEV_AUTH_MODE) return role;
  if (role === "admin" && !isConfiguredAdminEmail(email)) return null;
  return role;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [activeRole, setActiveRoleState] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  const clearAuthState = async () => {
    await clearSupabaseAuthStorage();
    setSession(null);
    setUser(null);
    setRole(null);
    setActiveRoleState(null);
  };

  const hydrateActiveRole = async (nextUser: User | null, nextRole: Role) => {
    if (!nextUser?.id) {
      setActiveRoleState(null);
      return null;
    }

    const normalizedRole = sanitizeRole(normalizeAppRole(nextRole), nextUser.email);
    if (normalizedRole === "admin") {
      setActiveRoleState("admin");
      await storeActiveWorkspace(nextUser.id, "admin");
      return "admin";
    }

    const stored = sanitizeRole(await readStoredActiveWorkspace(nextUser.id), nextUser.email);
    const resolved = stored && stored !== "admin" ? stored : getFallbackWorkspaceRole(normalizedRole, nextUser.email);
    setActiveRoleState(resolved);
    return resolved;
  };

  const signInDev = async (input: { email: string; role: Exclude<Role, null> }) => {
    const record = await setDevAuthRecord(input);
    const nextUser = recordToUser(record);
    const nextRole = sanitizeRole(normalizeAppRole(record.role), record.email);
    setSession(null);
    setUser(nextUser);
    setRole(nextRole);
    await hydrateActiveRole(nextUser, nextRole);
  };

  const setActiveRole = async (nextRole: Exclude<Role, null>) => {
    const resolved = sanitizeRole(normalizeAppRole(nextRole), user?.email ?? null);
    if (!resolved) return;
    const isAdminAccount = normalizeAppRole(role) === "admin";
    if (resolved === "admin" && !isAdminAccount) return;
    if (resolved !== "student" && resolved !== "admin" && !isAdminAccount) {
      const approved = user?.id ? await hasWorkspaceAccess(user.id, resolved) : false;
      const ownsRole = normalizeAppRole(role) === resolved;
      if (!approved && !ownsRole) return;
    }
    setActiveRoleState(resolved);
    if (user?.id) {
      await storeActiveWorkspace(user.id, resolved);
    }
  };

  const refreshRole = async (userRef?: string | User | null) => {
    const userId = typeof userRef === "string" ? userRef : userRef?.id;
    const authUser = typeof userRef === "string" ? null : userRef ?? null;

    if (!userId) {
      setRole(null);
      setActiveRoleState(null);
      return;
    }

    if (ENV.DEV_AUTH_MODE) {
      const record = await getDevAuthRecord();
      const nextRole = sanitizeRole(normalizeAppRole(record?.role), record?.email);
      setRole(nextRole);
      await hydrateActiveRole(authUser ?? user, nextRole);
      return;
    }

    if (authUser) {
      const recoveredRole = await ensureProfileRoleFromAuthUser(authUser);
      setRole(sanitizeRole(recoveredRole, authUser.email));
      await hydrateActiveRole(authUser, sanitizeRole(recoveredRole, authUser.email));
      return;
    }

    const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (error) {
      setRole(null);
      await hydrateActiveRole(user, null);
      return;
    }

    const nextRole = sanitizeRole(normalizeAppRole(data?.role), user?.email ?? null);
    setRole(nextRole);
    await hydrateActiveRole(user, nextRole);
  };

  const syncSession = async () => {
    if (ENV.DEV_AUTH_MODE) {
      const record = await getDevAuthRecord();
      const nextUser = record ? recordToUser(record) : null;
      const nextRole = sanitizeRole(normalizeAppRole(record?.role), record?.email);
      setSession(null);
      setUser(nextUser);
      setRole(nextRole);
      await hydrateActiveRole(nextUser, nextRole);
      return nextUser;
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (isInvalidRefreshTokenError(error)) await clearAuthState();
      throw error;
    }

    const nextSession = data.session ?? null;
    const nextUser = nextSession?.user ?? null;
    setSession(nextSession);
    setUser(nextUser);
    await refreshRole(nextUser);
    return nextUser;
  };

  useEffect(() => {
    let alive = true;

    const init = async () => {
      try {
        setLoading(true);

        if (ENV.DEV_AUTH_MODE) {
          const record = await getDevAuthRecord();
          if (!alive) return;
          const nextUser = record ? recordToUser(record) : null;
          const nextRole = sanitizeRole(normalizeAppRole(record?.role), record?.email);
          setSession(null);
          setUser(nextUser);
          setRole(nextRole);
          await hydrateActiveRole(nextUser, nextRole);
          return;
        }

        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_STARTUP_TIMEOUT_MS,
          "Auth session lookup timed out.",
        );
        if (!alive) return;
        if (error) {
          if (isInvalidRefreshTokenError(error)) {
            await clearAuthState();
            return;
          }
          if (isNetworkUnavailableError(error)) {
            setSession(data.session ?? null);
            setUser(data.session?.user ?? null);
            if (data.session?.user) {
              await refreshRole(data.session.user).catch(() => undefined);
            }
            return;
          }
          throw error;
        }
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        await withTimeout(
          refreshRole(data.session?.user ?? null),
          AUTH_STARTUP_TIMEOUT_MS,
          "Auth role lookup timed out.",
        );
      } finally {
        if (alive) setLoading(false);
      }
    };

    void init().catch(async (error) => {
      if (!alive) return;
      if (isInvalidRefreshTokenError(error)) {
        await clearAuthState();
      }
      setLoading(false);
    });

    if (ENV.DEV_AUTH_MODE) {
      return () => {
        alive = false;
      };
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);
      setLoading(false);
      if (!newSession?.user) {
        setRole(null);
        setActiveRoleState(null);
        return;
      }

      // A fresh login always lands safely in the user workspace. The person can
      // switch into an approved workspace after the auth state has fully settled.
      if (event === "SIGNED_IN") {
        setActiveRoleState("student");
        void storeActiveWorkspace(newSession.user.id, "student")
          .then(() => refreshRole(newSession.user))
          .catch(() => refreshRole(newSession.user))
          .catch(() => {
            setRole("student");
            setActiveRoleState("student");
          });
        return;
      }

      // Avoid awaiting Supabase queries inside auth state callbacks.
      // It can block auth methods (e.g. signInWithPassword) from resolving.
      void refreshRole(newSession.user).catch(() => {
        setRole(null);
        setActiveRoleState("student");
      });
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      session,
      role,
      loading,
      signOut: async () => {
        if (ENV.DEV_AUTH_MODE) {
          await clearDevAuthRecord();
          setSession(null);
          setUser(null);
          setRole(null);
          setActiveRoleState(null);
          return;
        }

        const { error } = await supabase.auth.signOut();
        if (error && !isInvalidRefreshTokenError(error)) throw error;
        if (error) await clearSupabaseAuthStorage();
        setSession(null);
        setUser(null);
        setRole(null);
        setActiveRoleState(null);
      },
      signInDev,
      refreshRole,
      activeRole,
      setActiveRole,
      syncSession,
    }),
    [user, session, role, activeRole, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
