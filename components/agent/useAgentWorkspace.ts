import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { supabaseNewApp } from "@/lib/supabaseNewApp";
import type { DeliveryStatus } from "@/lib/newApp/types";
import { formatCacheTime, getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { scheduleLocalNotification } from "@/lib/notifications";
import { getAgentRiderProfile, setAgentRiderProfile } from "@/lib/agentRiderProfile";
import { assignDeliveryToSelf, listOpenDeliveryRequests, unassignDeliveryFromSelf, updateDeliveryStatusForAgent } from "@/lib/agentDeliveryApi";
import { clearDismissedAgentRequest, dismissAgentRequest, getDismissedAgentRequests } from "@/lib/agentRequestDismissals";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";

type DbOrderStatus = "pending" | "accepted" | "preparing" | "picked_up" | "on_the_way" | "delivered" | "cancelled";
type DeliveryRow = {
  id: string;
  order_id: string;
  driver_id: string | null;
  status: DeliveryStatus;
  eta_minutes: number | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

type OrderRow = {
  id: string;
  vendor_id: string;
  channel: "market" | "food";
  status: DbOrderStatus;
  delivery_mode: "pickup" | "doorstep";
  dropoff_notes: string | null;
  delivery_fee_mwk: number;
  total_mwk: number;
  payment_status: string;
  created_at: string;
  updated_at: string;
};

type OrderItemRow = {
  order_id: string;
  item_name_snapshot: string;
  quantity: number;
};

type VendorRow = {
  id: string;
  name: string;
  area: string | null;
  campus: string | null;
};

type HandoffRow = {
  order_id: string;
  order_reference: string | null;
  verification_method: string | null;
  verified_at: string | null;
};

type TrustScoreRow = {
  avg_rating: number | null;
};

type ProfileRow = {
  id?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  avatar_url?: string | null;
};

export type AgentJobCard = {
  id: string;
  orderId: string;
  channel: "market" | "food";
  title: string;
  itemSummary: string;
  vendorName: string;
  pickupLabel: string;
  dropoffLabel: string;
  payoutMwk: number;
  totalMwk: number;
  status: DeliveryStatus;
  etaMinutes: number | null;
  orderStatus: DbOrderStatus;
  orderReference: string | null;
  verificationMethod: string | null;
  handoffVerified: boolean;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
};

export type AgentRequestCard = {
  id: string;
  orderId: string;
  channel: "market" | "food";
  title: string;
  itemSummary: string;
  vendorName: string;
  pickupLabel: string;
  dropoffLabel: string;
  payoutMwk: number;
  totalMwk: number;
  status: DeliveryStatus;
  createdAt: string;
  updatedAt: string;
};

export type AgentWorkspace = {
  profile: {
    userId: string | null;
    fullName: string;
    firstName: string;
    email: string;
    phone: string;
    avatarUrl: string | null;
    vehicleType: string;
    isOnline: boolean;
  };
  openRequests: AgentRequestCard[];
  activeJobs: AgentJobCard[];
  completedJobs: AgentJobCard[];
  currentJob: AgentJobCard | null;
  cacheLabel: string | null;
  requestNotice: string | null;
  rating: number | null;
};

function emptyWorkspace(email?: string | null): AgentWorkspace {
  const rawName = email?.split("@")[0] || "Rider";
  return {
    profile: {
      userId: null,
      fullName: rawName,
      firstName: rawName,
      email: email || "",
      phone: "",
      avatarUrl: null,
      vehicleType: "Motorbike",
      isOnline: true,
    },
    openRequests: [],
    activeJobs: [],
    completedJobs: [],
    currentJob: null,
    cacheLabel: null,
    requestNotice: null,
    rating: null,
  };
}

function firstNameFromProfile(profile: ProfileRow | null, email?: string | null) {
  const full = profile?.full_name?.trim();
  if (full) return full.split(/\s+/)[0] ?? "Rider";
  const composed = `${profile?.first_name ?? ""} ${profile?.last_name ?? profile?.surname ?? ""}`.trim();
  if (composed) return composed.split(/\s+/)[0] ?? "Rider";
  return email?.split("@")[0] || "Rider";
}

function fullNameFromProfile(profile: ProfileRow | null, email?: string | null) {
  const full = profile?.full_name?.trim();
  if (full) return full;
  const composed = `${profile?.first_name ?? ""} ${profile?.last_name ?? profile?.surname ?? ""}`.trim();
  return composed || email?.split("@")[0] || "Rider";
}

function isCompletedStatus(status: DeliveryStatus) {
  return status === "delivered" || status === "failed" || status === "cancelled";
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function subtractDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toJobCard(input: {
  delivery: DeliveryRow;
  order: OrderRow | undefined;
  vendor: VendorRow | undefined;
  items: OrderItemRow[];
  handoff: HandoffRow | undefined;
}): AgentJobCard {
  const vendorName = input.vendor?.name ?? "Campus vendor";
  const title = input.items[0]?.item_name_snapshot ?? vendorName;
  return {
    id: input.delivery.id,
    orderId: input.delivery.order_id,
    channel: input.order?.channel ?? "market",
    title,
    itemSummary: input.items.length ? input.items.map((item) => `${item.quantity}x ${item.item_name_snapshot}`).join(", ") : "Order items unavailable",
    vendorName,
    pickupLabel: [input.vendor?.area, input.vendor?.campus].filter(Boolean).join(", ") || vendorName,
    dropoffLabel: input.order?.dropoff_notes ?? input.vendor?.campus ?? input.vendor?.area ?? "Campus delivery",
    payoutMwk: Number(input.order?.delivery_fee_mwk || 0),
    totalMwk: Number(input.order?.total_mwk || 0),
    status: input.delivery.status,
    etaMinutes: input.delivery.eta_minutes,
    orderStatus: input.order?.status ?? "pending",
    orderReference: input.handoff?.order_reference ?? null,
    verificationMethod: input.handoff?.verification_method ?? null,
    handoffVerified: Boolean(input.handoff?.verified_at),
    createdAt: input.delivery.created_at,
    updatedAt: input.delivery.updated_at,
    deliveredAt: input.delivery.delivered_at,
  };
}

async function readProfile(userId: string) {
  const attempts = [
    "id,full_name,first_name,last_name,surname,email,phone,role,avatar_url",
    "id,full_name,email,phone,role,avatar_url",
    "id,first_name,last_name,email,phone,role,avatar_url",
    "id,first_name,surname,email,phone,role,avatar_url",
  ];

  for (const clause of attempts) {
    const { data, error } = await supabase.from("profiles").select(clause).eq("id", userId).maybeSingle();
    if (!error) {
      return (data as ProfileRow | null) ?? null;
    }
  }

  return null;
}

async function loadWorkspaceSnapshot(input: {
  userId: string;
  email?: string | null;
  accessToken?: string | null;
  allowRequests: boolean;
}): Promise<AgentWorkspace> {
  const [profile, riderProfile, assignedDeliveriesRes, ratingRes, dismissed] = await Promise.all([
    readProfile(input.userId),
    getAgentRiderProfile(input.userId),
    supabaseNewApp
      .from("deliveries")
      .select("id,order_id,driver_id,status,eta_minutes,delivered_at,created_at,updated_at")
      .eq("driver_id", input.userId)
      .order("updated_at", { ascending: false }),
    supabaseNewApp
      .from("trust_scores")
      .select("avg_rating")
      .eq("entity_type", "driver")
      .eq("entity_id", input.userId)
      .maybeSingle(),
    getDismissedAgentRequests(input.userId),
  ]);

  if (assignedDeliveriesRes.error) throw assignedDeliveriesRes.error;
  if (ratingRes.error && !String(ratingRes.error.message || "").toLowerCase().includes("does not exist")) {
    throw ratingRes.error;
  }

  const deliveries = (assignedDeliveriesRes.data ?? []) as DeliveryRow[];
  const orderIds = deliveries.map((row) => row.order_id);

  const [{ data: orderData, error: orderError }, { data: itemData, error: itemError }, { data: handoffData, error: handoffError }] = await Promise.all([
    orderIds.length
      ? supabaseNewApp
          .from("orders")
          .select("id,vendor_id,channel,status,delivery_mode,dropoff_notes,delivery_fee_mwk,total_mwk,payment_status,created_at,updated_at")
          .in("id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabaseNewApp
          .from("order_items")
          .select("order_id,item_name_snapshot,quantity")
          .in("order_id", orderIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabaseNewApp
          .from("order_handoffs")
          .select("order_id,order_reference,verification_method,verified_at")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (orderError) throw orderError;
  if (itemError) throw itemError;
  if (handoffError) throw handoffError;

  const orders = (orderData ?? []) as OrderRow[];
  const vendorIds = [...new Set(orders.map((row) => row.vendor_id))];
  const { data: vendorData, error: vendorError } = vendorIds.length
    ? await supabaseNewApp.from("vendors").select("id,name,area,campus").in("id", vendorIds)
    : { data: [], error: null };
  if (vendorError) throw vendorError;

  const ordersById = new Map(orders.map((row) => [row.id, row]));
  const vendorsById = new Map(((vendorData ?? []) as VendorRow[]).map((row) => [row.id, row]));
  const itemsByOrderId = new Map<string, OrderItemRow[]>();
  ((itemData ?? []) as OrderItemRow[]).forEach((row) => {
    const current = itemsByOrderId.get(row.order_id) ?? [];
    current.push(row);
    itemsByOrderId.set(row.order_id, current);
  });
  const handoffsByOrderId = new Map(((handoffData ?? []) as HandoffRow[]).map((row) => [row.order_id, row]));

  const jobs = deliveries
    .filter((delivery) => String(ordersById.get(delivery.order_id)?.payment_status || "").toLowerCase() === "paid")
    .map((delivery) =>
      toJobCard({
        delivery,
        order: ordersById.get(delivery.order_id),
        vendor: vendorsById.get(ordersById.get(delivery.order_id)?.vendor_id || ""),
        items: itemsByOrderId.get(delivery.order_id) ?? [],
        handoff: handoffsByOrderId.get(delivery.order_id),
      }),
    );

  let openRequests: AgentRequestCard[] = [];
  let requestNotice: string | null = null;

  if (input.allowRequests && (riderProfile?.isOnline ?? true)) {
    try {
      const requestRows = await listOpenDeliveryRequests({ userId: input.userId, accessToken: input.accessToken });
      openRequests = requestRows
        .filter((row) => row.order && dismissed[row.order_id] !== row.updated_at)
        .map((row) => ({
          id: row.id,
          orderId: row.order_id,
          channel: row.order?.channel ?? "market",
          title: row.title,
          itemSummary: row.item_summary,
          vendorName: row.vendor?.name ?? "Campus vendor",
          pickupLabel: [row.vendor?.area, row.vendor?.campus].filter(Boolean).join(", ") || row.vendor?.name || "Vendor pickup",
          dropoffLabel: row.order?.dropoff_notes ?? row.vendor?.campus ?? row.vendor?.area ?? "Campus delivery",
          payoutMwk: Number(row.order?.delivery_fee_mwk || 0),
          totalMwk: Number(row.order?.total_mwk || 0),
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
    } catch (error: any) {
      requestNotice = error?.message ?? "Live delivery requests are unavailable right now.";
    }
  }

  const activeJobs = jobs.filter((row) => !isCompletedStatus(row.status));
  const completedJobs = jobs.filter((row) => isCompletedStatus(row.status));

  return {
    profile: {
      userId: input.userId,
      fullName: fullNameFromProfile(profile, input.email),
      firstName: firstNameFromProfile(profile, input.email),
      email: profile?.email ?? input.email ?? "",
      phone: profile?.phone ?? "",
      avatarUrl: riderProfile?.avatarUrl ?? profile?.avatar_url ?? null,
      vehicleType: riderProfile?.vehicleType ?? "Motorbike",
      isOnline: riderProfile?.isOnline ?? true,
    },
    openRequests,
    activeJobs,
    completedJobs,
    currentJob: activeJobs[0] ?? null,
    cacheLabel: null,
    requestNotice,
    rating: ((ratingRes.data as TrustScoreRow | null)?.avg_rating ?? null) as number | null,
  };
}

export function useAgentWorkspace() {
  const { user, session } = useAuth();
  const { isOnline: networkOnline } = useNetwork();
  const [workspace, setWorkspace] = useState<AgentWorkspace>(emptyWorkspace(user?.email ?? null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seenRequestKeys = useRef<Set<string>>(new Set());
  const seededRequestNotifications = useRef(false);
  const cacheKey = user?.id ? `agent_workspace_${user.id}` : null;

  const metrics = useMemo(() => {
    const deliveredJobs = workspace.completedJobs.filter((row) => row.status === "delivered");
    const today = startOfToday();
    const week = subtractDays(6);
    const month = subtractDays(29);

    const countSince = (date: Date) =>
      deliveredJobs.filter((row) => new Date(row.deliveredAt ?? row.updatedAt) >= date).length;
    const sumSince = (date: Date) =>
      deliveredJobs
        .filter((row) => new Date(row.deliveredAt ?? row.updatedAt) >= date)
        .reduce((sum, row) => sum + row.payoutMwk, 0);

    return {
      activeCount: workspace.activeJobs.length,
      completedCount: deliveredJobs.length,
      totalCount: workspace.activeJobs.length + workspace.completedJobs.length,
      todayCount: countSince(today),
      weekCount: countSince(week),
      monthCount: countSince(month),
      todayEarnings: sumSince(today),
      weekEarnings: sumSince(week),
      monthEarnings: sumSince(month),
      totalEarnings: deliveredJobs.reduce((sum, row) => sum + row.payoutMwk, 0),
    };
  }, [workspace.activeJobs.length, workspace.completedJobs]);

  useEffect(() => {
    let active = true;
    const loadCached = async () => {
      if (!cacheKey) return;
      const cached = await getCachedJson<AgentWorkspace>(cacheKey);
      if (!active || !cached?.data) return;
      setWorkspace({
        ...cached.data,
        cacheLabel: cached.ts ? formatCacheTime(cached.ts) : null,
      });
      setLoading(false);
    };

    void loadCached();
    return () => {
      active = false;
    };
  }, [cacheKey]);

  const writeWorkspace = async (next: AgentWorkspace | ((current: AgentWorkspace) => AgentWorkspace)) => {
    setWorkspace((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      void (cacheKey ? setCachedJson(cacheKey, resolved) : Promise.resolve());
      return resolved;
    });
  };

  const refresh = async (options?: { silent?: boolean }) => {
    if (!user?.id) {
      setWorkspace(emptyWorkspace(user?.email ?? null));
      setLoading(false);
      return;
    }

    if (!options?.silent) setLoading(true);
    setError(null);

    try {
      const next = await loadWorkspaceSnapshot({
        userId: user.id,
        email: user.email ?? null,
        accessToken: session?.access_token,
        allowRequests: networkOnline,
      });

      const withCache = {
        ...next,
        cacheLabel: null,
      };
      setWorkspace(withCache);
      if (cacheKey) {
        await setCachedJson(cacheKey, withCache);
        setWorkspace((current) => ({
          ...current,
          cacheLabel: formatCacheTime(Date.now()),
        }));
      }
    } catch (err: any) {
      const cached = cacheKey ? await getCachedJson<AgentWorkspace>(cacheKey) : null;
      if (cached?.data) {
        setWorkspace({
          ...cached.data,
          cacheLabel: cached.ts ? formatCacheTime(cached.ts) : null,
        });
        setError("Offline mode: showing cached agent workspace.");
      } else {
        setError(err?.message ?? "Failed to load agent workspace.");
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [networkOnline, session?.access_token, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`agent-workspace-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => void refresh({ silent: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void refresh({ silent: true }))
      .on("postgres_changes", { event: "*", schema: "public", table: "order_handoffs" }, () => void refresh({ silent: true }))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, session?.access_token, networkOnline]);

  useEffect(() => {
    if (!user?.id || !networkOnline || !workspace.profile.isOnline) return;

    const interval = setInterval(() => {
      void refresh({ silent: true });
    }, 20000);

    return () => clearInterval(interval);
  }, [networkOnline, session?.access_token, user?.id, workspace.profile.isOnline]);

  useEffect(() => {
    if (!workspace.profile.isOnline || !networkOnline) return;

    const nextKeys = new Set(workspace.openRequests.map((row) => `${row.orderId}:${row.updatedAt}`));
    if (!seededRequestNotifications.current) {
      seededRequestNotifications.current = true;
      seenRequestKeys.current = nextKeys;
      return;
    }

    const newest = workspace.openRequests.find((row) => !seenRequestKeys.current.has(`${row.orderId}:${row.updatedAt}`));
    seenRequestKeys.current = nextKeys;

    if (!newest) return;
    void scheduleLocalNotification({
      title: "New delivery request",
      body: `${newest.vendorName} needs a rider${newest.dropoffLabel ? ` to ${newest.dropoffLabel}` : ""}.`,
      data: { orderId: newest.orderId, role: "agent", event: "delivery_request" },
      playSound: true,
    });
  }, [networkOnline, workspace.openRequests, workspace.profile.isOnline]);

  const persistRiderExtras = async (input: { avatarUrl?: string | null; vehicleType?: string; isOnline?: boolean }) => {
    if (!user?.id) return;
    await setAgentRiderProfile({
      userId: user.id,
      avatarUrl: input.avatarUrl ?? workspace.profile.avatarUrl ?? null,
      vehicleType: input.vehicleType ?? workspace.profile.vehicleType,
      isOnline: input.isOnline ?? workspace.profile.isOnline,
    });
  };

  const saveProfile = async (input: { fullName: string; phone: string; vehicleType: string; avatarUrl?: string | null }) => {
    if (!user?.id) throw new Error("You must be signed in.");

    const cleanName = input.fullName.trim();
    const cleanPhone = input.phone.trim().replace(/\s+/g, "");

    if (cleanName.length < 2) throw new Error("Please enter your full name.");
    if (cleanPhone && !cleanPhone.startsWith("+265")) throw new Error("Phone should start with +265.");

    let updateError: string | null = null;
    const directUpdate = await supabase
      .from("profiles")
      .update({
        full_name: cleanName,
        phone: cleanPhone || null,
        avatar_url: input.avatarUrl ?? workspace.profile.avatarUrl ?? null,
      })
      .eq("id", user.id);

    if (directUpdate.error) {
      const parts = cleanName.split(/\s+/).filter(Boolean);
      const first = parts.shift() ?? cleanName;
      const rest = parts.join(" ") || null;
      const fallback = await supabase
        .from("profiles")
        .update({
          first_name: first,
          last_name: rest,
          surname: rest,
          phone: cleanPhone || null,
          avatar_url: input.avatarUrl ?? workspace.profile.avatarUrl ?? null,
        } as any)
        .eq("id", user.id);
      if (fallback.error) updateError = fallback.error.message;
    }

    if (updateError) throw new Error(updateError);

    await persistRiderExtras({
      vehicleType: input.vehicleType,
      avatarUrl: input.avatarUrl ?? workspace.profile.avatarUrl ?? null,
    });

    await writeWorkspace((current) => ({
      ...current,
      profile: {
        ...current.profile,
        fullName: cleanName,
        firstName: cleanName.split(/\s+/)[0] ?? cleanName,
        phone: cleanPhone,
        vehicleType: input.vehicleType,
        avatarUrl: input.avatarUrl ?? current.profile.avatarUrl ?? null,
      },
    }));
  };

  const setOnlineStatus = async (next: boolean) => {
    await persistRiderExtras({ isOnline: next });
    await writeWorkspace((current) => ({
      ...current,
      profile: {
        ...current.profile,
        isOnline: next,
      },
      openRequests: next ? current.openRequests : [],
      requestNotice: next ? current.requestNotice : null,
    }));
    if (next) {
      void refresh();
    }
  };

  const dismissRequest = async (orderId: string, updatedAt: string) => {
    if (!user?.id) return;
    await dismissAgentRequest(user.id, orderId, updatedAt);
    await writeWorkspace((current) => ({
      ...current,
      openRequests: current.openRequests.filter((row) => row.orderId !== orderId),
    }));
  };

  const acceptRequest = async (orderId: string) => {
    if (!user?.id) throw new Error("You must be signed in.");
    const result = await assignDeliveryToSelf({
      orderId,
      userId: user.id,
      accessToken: session?.access_token,
    });
    await clearDismissedAgentRequest(user.id, orderId);
    await refresh();
    return result;
  };

  const releaseJob = async (orderId: string) => {
    if (!user?.id) throw new Error("You must be signed in.");
    const result = await unassignDeliveryFromSelf({
      orderId,
      userId: user.id,
      accessToken: session?.access_token,
    });
    await refresh();
    return result;
  };

  const updateJobStatus = async (orderId: string, status: DeliveryStatus) => {
    if (!user?.id) throw new Error("You must be signed in.");
    const result = await updateDeliveryStatusForAgent({
      orderId,
      status,
      userId: user.id,
      accessToken: session?.access_token,
    });
    await refresh();
    return result;
  };

  return {
    workspace,
    metrics,
    loading,
    error,
    refresh,
    saveProfile,
    setOnlineStatus,
    dismissRequest,
    acceptRequest,
    releaseJob,
    updateJobStatus,
  };
}
