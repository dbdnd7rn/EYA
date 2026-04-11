import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { normalizeAppRole } from "@/lib/roleRouting";
import { ENV } from "@/lib/env";
import { clearDevAuthRecord, getDevAuthRecord, recordToUser, setDevAuthRecord } from "@/lib/devAuth";
import { ensureProfileRoleFromAuthUser } from "@/lib/authProfile";

type Role = "student" | "landlord" | "agent" | "vendor" | "admin" | null;

type AuthCtx = {
  user: User | null;
  session: Session | null;
  role: Role;
  loading: boolean;
  signOut: () => Promise<void>;
  signInDev: (input: { email: string; role: Exclude<Role, null> }) => Promise<void>;
  refreshRole: (userRef?: string | User | null) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  const signInDev = async (input: { email: string; role: Exclude<Role, null> }) => {
    const record = await setDevAuthRecord(input);
    setSession(null);
    setUser(recordToUser(record));
    setRole(normalizeAppRole(record.role));
  };

  const refreshRole = async (userRef?: string | User | null) => {
    const userId = typeof userRef === "string" ? userRef : userRef?.id;
    const authUser = typeof userRef === "string" ? null : userRef ?? null;

    if (!userId) {
      setRole(null);
      return;
    }

    if (ENV.DEV_AUTH_MODE) {
      const record = await getDevAuthRecord();
      setRole(normalizeAppRole(record?.role));
      return;
    }

    if (authUser) {
      const recoveredRole = await ensureProfileRoleFromAuthUser(authUser);
      setRole(recoveredRole);
      return;
    }

    const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (error) {
      setRole(null);
      return;
    }

    setRole(normalizeAppRole(data?.role));
  };

  useEffect(() => {
    let alive = true;

    const init = async () => {
      try {
        setLoading(true);

        if (ENV.DEV_AUTH_MODE) {
          const record = await getDevAuthRecord();
          if (!alive) return;
          setSession(null);
          setUser(record ? recordToUser(record) : null);
          setRole(normalizeAppRole(record?.role));
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        await refreshRole(data.session?.user ?? null);
      } finally {
        if (alive) setLoading(false);
      }
    };

    init();

    if (ENV.DEV_AUTH_MODE) {
      return () => {
        alive = false;
      };
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);
      setLoading(false);

      // Avoid awaiting Supabase queries inside auth state callbacks.
      // It can block auth methods (e.g. signInWithPassword) from resolving.
      void refreshRole(newSession?.user ?? null);
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
          return;
        }

        await supabase.auth.signOut();
        setRole(null);
      },
      signInDev,
      refreshRole,
    }),
    [user, session, role, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
