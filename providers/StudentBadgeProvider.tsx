import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import { ENV } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import { supabaseNewApp } from "@/lib/supabaseNewApp";
import { useAuth } from "@/providers/AuthProvider";

type BadgeSection = "orders" | "wallet" | "messages";

type BadgeState = {
  orders: number;
  wallet: number;
  messages: number;
};

type SeenState = {
  ordersAt: string | null;
  walletAt: string | null;
  messagesAt: string | null;
};

type StudentBadgeContextValue = BadgeState & {
  loading: boolean;
  refresh: () => Promise<void>;
  markSeen: (section: BadgeSection) => Promise<void>;
};

type OrderMini = {
  id: string;
  status: string;
  updated_at: string;
};

type WalletActivityMini = {
  id: string;
  created_at: string;
};

type MessageMini = {
  enquiry_id: string;
  sender_id: string | null;
  receiver_id: string | null;
  created_at: string;
};

const STORAGE_PREFIX = "student_badges_seen_v1";
const EMPTY_COUNTS: BadgeState = { orders: 0, wallet: 0, messages: 0 };
const EMPTY_SEEN: SeenState = { ordersAt: null, walletAt: null, messagesAt: null };
const StudentBadgeContext = createContext<StudentBadgeContextValue | null>(null);

function toEpoch(iso?: string | null) {
  return iso ? new Date(iso).getTime() : 0;
}

function isActiveOrder(status?: string | null) {
  const value = (status ?? "").toLowerCase();
  return value !== "delivered" && value !== "cancelled";
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function sectionForPath(pathname: string | null): BadgeSection | null {
  if (!pathname) return null;
  if (pathname === "/(student)/(tabs)/orders" || pathname.startsWith("/(student)/delivery/")) return "orders";
  if (pathname === "/(student)/(tabs)/wallet") return "wallet";
  if (
    pathname === "/(student)/(tabs)/messages" ||
    pathname === "/(student)/(tabs)/room-messages" ||
    pathname.startsWith("/(student)/chat/") ||
    pathname.startsWith("/(student)/vendor-chat/")
  ) {
    return "messages";
  }
  return null;
}

export function StudentBadgeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [counts, setCounts] = useState<BadgeState>(EMPTY_COUNTS);
  const [seen, setSeen] = useState<SeenState>(EMPTY_SEEN);
  const [loading, setLoading] = useState(true);

  const readSeen = async (userId: string) => {
    let raw: string | null = null;
    try {
      raw = await AsyncStorage.getItem(storageKey(userId));
    } catch (e) {
      console.warn("[StudentBadgeProvider] Failed to read seen state:", e);
      return EMPTY_SEEN;
    }
    if (!raw) return EMPTY_SEEN;

    try {
      return { ...EMPTY_SEEN, ...(JSON.parse(raw) as Partial<SeenState>) };
    } catch {
      return EMPTY_SEEN;
    }
  };

  const writeSeen = async (userId: string, next: SeenState) => {
    setSeen(next);
    try {
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch (e) {
      console.warn("[StudentBadgeProvider] Failed to persist seen state:", e);
    }
  };

  const markSeen = async (section: BadgeSection) => {
    if (!user?.id) return;
    try {
      const nowIso = new Date().toISOString();
      const next: SeenState = {
        ...seen,
        ordersAt: section === "orders" ? nowIso : seen.ordersAt,
        walletAt: section === "wallet" ? nowIso : seen.walletAt,
        messagesAt: section === "messages" ? nowIso : seen.messagesAt,
      };
      await writeSeen(user.id, next);
    } catch (e) {
      console.warn("[StudentBadgeProvider] Failed to mark section as seen:", e);
    }
  };

  const refresh = async () => {
    if (!user?.id) {
      setCounts(EMPTY_COUNTS);
      setLoading(false);
      return;
    }

    try {
      const [orderRes, walletRes, messageRes, vendorMessageRes] = await Promise.all([
        supabaseNewApp.from("orders").select("id,status,updated_at").eq("customer_id", user.id).order("updated_at", { ascending: false }).limit(120),
        supabase.from("wallet_activities").select("id,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(120),
        supabase
          .from("messages")
          .select("enquiry_id,sender_id,receiver_id,created_at")
          .eq("receiver_id", user.id)
          .order("created_at", { ascending: false })
          .limit(300),
        supabaseNewApp
          .from("vendor_messages")
          .select("conversation_id,sender_id,receiver_id,created_at")
          .eq("receiver_id", user.id)
          .order("created_at", { ascending: false })
          .limit(300),
      ]);

      const orders = ((orderRes.data ?? []) as OrderMini[]).filter((row) => isActiveOrder(row.status));
      const walletRows = (walletRes.data ?? []) as WalletActivityMini[];
      const messages = (messageRes.data ?? []) as MessageMini[];
      const vendorMessages = ((vendorMessageRes.data ?? []) as { conversation_id: string; sender_id: string | null; receiver_id: string | null; created_at: string }[]);

      const latestByEnquiry = new Map<string, MessageMini>();
      for (const row of messages) {
        if (!latestByEnquiry.has(row.enquiry_id)) latestByEnquiry.set(row.enquiry_id, row);
      }

      const latestVendorByConversation = new Map<string, { conversation_id: string; sender_id: string | null; receiver_id: string | null; created_at: string }>();
      for (const row of vendorMessages) {
        if (!latestVendorByConversation.has(row.conversation_id)) latestVendorByConversation.set(row.conversation_id, row);
      }

      const unreadHostelCount = Array.from(latestByEnquiry.values()).filter((row) => toEpoch(row.created_at) > toEpoch(seen.messagesAt)).length;
      const unreadVendorCount = Array.from(latestVendorByConversation.values()).filter((row) => toEpoch(row.created_at) > toEpoch(seen.messagesAt)).length;

      setCounts({
        orders: orders.filter((row) => toEpoch(row.updated_at) > toEpoch(seen.ordersAt)).length,
        wallet: walletRows.filter((row) => toEpoch(row.created_at) > toEpoch(seen.walletAt)).length,
        messages: unreadHostelCount + unreadVendorCount,
      });
    } catch (e) {
      console.warn("[StudentBadgeProvider] Failed to refresh badges:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const loadSeen = async () => {
      if (!user?.id) {
        setSeen(EMPTY_SEEN);
        setCounts(EMPTY_COUNTS);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const nextSeen = await readSeen(user.id);
        if (!active) return;
        setSeen(nextSeen);
      } catch (e) {
        console.warn("[StudentBadgeProvider] Failed to load seen state:", e);
        if (!active) return;
        setSeen(EMPTY_SEEN);
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadSeen();
    return () => {
      active = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void refresh();
  }, [seen, user?.id]);

  useEffect(() => {
    const section = sectionForPath(pathname);
    if (!section) return;
    void markSeen(section);
  }, [pathname, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const schema = "public";
    const ordersChannel = supabaseNewApp
      .channel(`student-badges-orders-${user.id}`)
      .on("postgres_changes", { event: "*", schema, table: "orders", filter: `customer_id=eq.${user.id}` }, () => {
        void refresh();
      })
      .subscribe();

    const walletChannel = supabase
      .channel(`student-badges-wallet-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_activities", filter: `user_id=eq.${user.id}` }, () => {
        void refresh();
      })
      .subscribe();

    const messageChannel = supabase
      .channel(`student-badges-messages-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${user.id}` }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `sender_id=eq.${user.id}` }, () => {
        void refresh();
      })
      .subscribe();

    const vendorMessageChannel = supabaseNewApp
      .channel(`student-badges-vendor-messages-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_messages", filter: `receiver_id=eq.${user.id}` }, () => {
        void refresh();
      })
      .subscribe();

    return () => {
      supabaseNewApp.removeChannel(ordersChannel);
      supabaseNewApp.removeChannel(vendorMessageChannel);
      supabase.removeChannel(walletChannel);
      supabase.removeChannel(messageChannel);
    };
  }, [user?.id, seen.ordersAt, seen.walletAt, seen.messagesAt]);

  const value = useMemo<StudentBadgeContextValue>(
    () => ({
      ...counts,
      loading,
      refresh,
      markSeen,
    }),
    [counts, loading],
  );

  return <StudentBadgeContext.Provider value={value}>{children}</StudentBadgeContext.Provider>;
}

export function useStudentBadges() {
  const value = useContext(StudentBadgeContext);
  if (!value) throw new Error("useStudentBadges must be used within StudentBadgeProvider");
  return value;
}
