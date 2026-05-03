import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ENV } from "@/lib/env";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { getUnreadNotificationCount, markAllNotificationsRead } from "@/lib/appNotifications";
import { useAuth } from "@/providers/AuthProvider";

type NotificationInboxContextValue = {
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationInboxContext = createContext<NotificationInboxContextValue | null>(null);

function cacheKey(userId: string) {
  return `notification_unread_count_${userId}`;
}

export function NotificationInboxProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user?.id) {
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const next = await getUnreadNotificationCount(user.id);
      setUnreadCount(next);
      await setCachedJson(cacheKey(user.id), { unreadCount: next });
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    if (!user?.id) return;
    setUnreadCount(0);
    try {
      await markAllNotificationsRead(user.id);
      await setCachedJson(cacheKey(user.id), { unreadCount: 0 });
    } catch {
      // Keep local read state even if the remote inbox is unavailable.
    }
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!user?.id) {
        setUnreadCount(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const cached = await getCachedJson<{ unreadCount?: number }>(cacheKey(user.id));
        if (active && typeof cached?.data?.unreadCount === "number") {
          setUnreadCount(cached.data.unreadCount);
        }
      } catch {
        // Ignore unread-count cache failures.
      }
      if (active) {
        await refresh().catch(() => {
          if (active) setLoading(false);
        });
      }
    };

    void load().catch(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || ENV.DEV_AUTH_MODE) return;

    const channel = supabase
      .channel(`notifications-inbox-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        void refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const value = useMemo<NotificationInboxContextValue>(
    () => ({
      unreadCount,
      loading,
      refresh,
      markAllRead,
    }),
    [unreadCount, loading],
  );

  return <NotificationInboxContext.Provider value={value}>{children}</NotificationInboxContext.Provider>;
}

export function useNotificationInbox() {
  const value = useContext(NotificationInboxContext);
  if (!value) throw new Error("useNotificationInbox must be used within NotificationInboxProvider");
  return value;
}
