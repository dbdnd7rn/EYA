import { useEffect, useMemo, useRef, useState } from "react";
import { getOrderItems, listOrdersForVendorOwner, updateOrderStatus } from "@/lib/newApp/orders";
import { createCatalogItem, deleteCatalogItem, listCatalogItems, updateCatalogItem } from "@/lib/newApp/catalog";
import { createVendor, listMyVendors, updateVendor } from "@/lib/newApp/vendors";
import { listVendorConversationsForOwner, listVendorMessages } from "@/lib/newApp/vendorMessages";
import { supabaseNewApp } from "@/lib/supabaseNewApp";
import { supabase } from "@/lib/supabase";
import { scheduleLocalNotification } from "@/lib/notifications";
import { getSellerShopMeta } from "@/lib/sellerEnhancements";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import {
  applyOutboxToSellerWorkspace,
  enqueueSellerOrderStatus,
  enqueueSellerProductActive,
  enqueueSellerProductArchive,
  enqueueSellerProductSave,
} from "@/lib/mutationOutbox";
import { ENV } from "@/lib/env";
import type { CatalogItemRow, OrderItemRow, OrderRow, OrderStatus, SalesChannel, VendorRow, VendorUpdateInput } from "@/lib/newApp/types";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";

type SellerProfile = {
  displayName: string;
  phone: string | null;
};

export type SellerCustomerProfile = {
  id: string;
  name: string;
  phone: string | null;
  campus: string | null;
  area: string | null;
};

export type SellerConversation = {
  id: string;
  customerId: string;
  name: string;
  subject: string | null;
  catalogItemId: string | null;
  phone: string | null;
  campus: string | null;
  area: string | null;
  preview: string;
  timeLabel: string;
  lastMessageAt: string;
  accent: string;
};

export type SellerPayoutRow = {
  id: string;
  orderId: string;
  customerName: string;
  amountMwk: number;
  status: "pending" | "processing" | "paid";
  createdAt: string;
  label: string;
};

export type SellerDeliveryRow = {
  id: string;
  order_id: string;
  driver_id: string | null;
  status: "searching" | "assigned" | "picked_up" | "arriving" | "delivered" | "failed" | "cancelled";
  eta_minutes: number | null;
  delivered_at: string | null;
  updated_at: string;
};

export type SellerHandoffRow = {
  order_id: string;
  order_reference: string;
  verification_method: string | null;
  verified_at: string | null;
};

export type SellerWorkspace = {
  vendor: VendorRow | null;
  profile: SellerProfile;
  products: CatalogItemRow[];
  orders: OrderRow[];
  orderItemsByOrderId: Record<string, OrderItemRow[]>;
  deliveriesByOrderId: Record<string, SellerDeliveryRow>;
  handoffsByOrderId: Record<string, SellerHandoffRow>;
  customersById: Record<string, SellerCustomerProfile>;
  conversations: SellerConversation[];
  hasVendor: boolean;
};

type SellerProductInput = {
  itemId?: string | null;
  name: string;
  price_mwk: number;
  description?: string | null;
  stock_qty?: number | null;
  channel: SalesChannel;
  image_url?: string | null;
};

function buildEmptyWorkspace(email?: string | null): SellerWorkspace {
  return {
    vendor: null,
    profile: {
      displayName: email?.split("@")[0] || "Seller",
      phone: null,
    },
    products: [],
    orders: [],
    orderItemsByOrderId: {},
    deliveriesByOrderId: {},
    handoffsByOrderId: {},
    customersById: {},
    conversations: [],
    hasVendor: false,
  };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function buildDefaultSellerName(email?: string | null) {
  const raw = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "My Shop";
  return raw
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function loadWorkspace(ownerId: string | null | undefined, email?: string | null): Promise<SellerWorkspace> {
  if (!ownerId) return buildEmptyWorkspace(email);

  let [vendors, orders, profileRes, conversationRows] = await Promise.all([
    listMyVendors(ownerId),
    listOrdersForVendorOwner(ownerId),
    supabase.from("profiles").select("full_name,phone").eq("id", ownerId).maybeSingle(),
    listVendorConversationsForOwner(ownerId).catch(() => []),
  ]);

  let autoCreatedVendor = false;
  if (!vendors.length) {
    const createdVendor = await createVendor(ownerId, {
      name: buildDefaultSellerName(email),
      description: "Campus seller storefront",
      supports_market: true,
      supports_food: false,
      campus: "MUST",
      area: "Soche",
      city: "Blantyre",
    });
    vendors = [createdVendor];
    autoCreatedVendor = true;
  }

  const vendor = vendors.find((row) => row.supports_market) ?? vendors[0] ?? null;
  const profile = {
    displayName: ((profileRes.data as { full_name?: string | null; phone?: string | null } | null)?.full_name?.trim()
      || vendor?.name
      || email?.split("@")[0]
      || "Seller") as string,
    phone: ((profileRes.data as { phone?: string | null } | null)?.phone ?? null) as string | null,
  };

  if (!vendor) {
    return {
      ...buildEmptyWorkspace(email),
      profile,
    };
  }

  let products = await listCatalogItems({ vendorId: vendor.id, isActiveOnly: false });
  if (autoCreatedVendor && !products.length) {
    await Promise.all([
      createCatalogItem({
        vendor_id: vendor.id,
        channel: "market",
        name: "Study Chair",
        description: "Comfortable hostel study chair",
        price_mwk: 45000,
        stock_qty: 3,
        image_url: null,
      }),
      createCatalogItem({
        vendor_id: vendor.id,
        channel: "market",
        name: "Desk Lamp",
        description: "Soft light for late reading",
        price_mwk: 18000,
        stock_qty: 8,
        image_url: null,
      }),
      createCatalogItem({
        vendor_id: vendor.id,
        channel: "market",
        name: "Microwave",
        description: "Quick hostel kitchen essential",
        price_mwk: 5200,
        stock_qty: 2,
        image_url: null,
      }),
    ]);
    products = await listCatalogItems({ vendorId: vendor.id, isActiveOnly: false });
  }
  const vendorOrders = orders.filter((row) => row.vendor_id === vendor.id);
  const orderIds = vendorOrders.map((row) => row.id);
  const orderItemsEntries = await Promise.all(vendorOrders.slice(0, 12).map(async (row) => [row.id, await getOrderItems(row.id)] as const));
  const orderItemsByOrderId = Object.fromEntries(orderItemsEntries);
  const [{ data: deliveryRows, error: deliveryError }, { data: handoffRows, error: handoffError }] = await Promise.all([
    orderIds.length
      ? supabaseNewApp
          .from("deliveries")
          .select("id,order_id,driver_id,status,eta_minutes,delivered_at,updated_at")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabaseNewApp
          .from("order_handoffs")
          .select("order_id,order_reference,verification_method,verified_at")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (deliveryError) throw deliveryError;
  if (handoffError) throw handoffError;
  const deliveriesByOrderId = Object.fromEntries(
    ((deliveryRows ?? []) as SellerDeliveryRow[]).map((row) => [row.order_id, row]),
  ) as Record<string, SellerDeliveryRow>;
  const handoffsByOrderId = Object.fromEntries(
    ((handoffRows ?? []) as SellerHandoffRow[]).map((row) => [row.order_id, row]),
  ) as Record<string, SellerHandoffRow>;

  const customerIds = Array.from(new Set([...conversationRows.map((row) => row.customer_id), ...vendorOrders.map((row) => row.customer_id)]));
  const [{ data: profileRows }, latestMessages] = await Promise.all([
    customerIds.length ? supabase.from("profiles").select("id,full_name,phone,campus,area").in("id", customerIds) : Promise.resolve({ data: [] }),
    Promise.all(
      conversationRows.map(async (conversation) => {
        const messages = await listVendorMessages(conversation.id).catch(() => []);
        return [conversation.id, messages[messages.length - 1] ?? null] as const;
      }),
    ),
  ]);

  const customersById = Object.fromEntries(
    (profileRows ?? []).map((row: any) => [
      row.id,
      {
        id: row.id,
        name: row.full_name || "Customer",
        phone: row.phone ?? null,
        campus: row.campus ?? null,
        area: row.area ?? null,
      } satisfies SellerCustomerProfile,
    ]),
  ) as Record<string, SellerCustomerProfile>;
  const latestMessageMap = new Map(latestMessages);
  const conversations: SellerConversation[] = conversationRows.map((row, index) => {
    const latest = latestMessageMap.get(row.id);
    const customer = customersById[row.customer_id];
    return {
      id: row.id,
      customerId: row.customer_id,
      name: customer?.name ?? `Customer ${index + 1}`,
      subject: row.subject ?? null,
      catalogItemId: row.catalog_item_id ?? null,
      phone: customer?.phone ?? null,
      campus: customer?.campus ?? null,
      area: customer?.area ?? null,
      preview: latest?.content?.trim() || (latest?.message_type === "image" ? "Sent an image" : row.subject || "Started a conversation"),
      timeLabel: timeAgo(row.last_message_at || row.updated_at),
      lastMessageAt: row.last_message_at || row.updated_at,
      accent: ["#102a54", "#ff0f64", "#7cb6ff", "#ff7d59"][index % 4],
    };
  });

  return {
    vendor,
    profile,
    products,
    orders: vendorOrders,
    orderItemsByOrderId,
    deliveriesByOrderId,
    handoffsByOrderId,
    customersById,
    conversations,
    hasVendor: true,
  };
}

export function useSellerWorkspace() {
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const [workspace, setWorkspace] = useState<SellerWorkspace>(buildEmptyWorkspace(user?.email ?? null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastAlertedOrderId = useRef<string | null>(null);
  const lastDeliveredNoticeKey = useRef<string | null>(null);
  const lastHandoffNoticeKey = useRef<string | null>(null);
  const hasSeededOrderNotifications = useRef(false);
  const hasSeededDeliveryNotifications = useRef(false);

  const cacheKey = user?.id ? `seller_workspace_${user.id}` : null;

  useEffect(() => {
    let active = true;
    const loadCached = async () => {
      if (!cacheKey) return;
      const cached = await getCachedJson<SellerWorkspace>(cacheKey);
      if (!active || !cached?.data) return;
      const projected = user?.id ? await applyOutboxToSellerWorkspace(user.id, cached.data) : cached.data;
      setWorkspace(projected);
      setLoading(false);
    };
    void loadCached();
    return () => {
      active = false;
    };
  }, [cacheKey]);

  const updateWorkspaceState = async (next: SellerWorkspace | ((current: SellerWorkspace) => SellerWorkspace)) => {
    const resolved = typeof next === "function" ? next(workspace) : next;
    setWorkspace((current) => {
      const computed = typeof next === "function" ? next(current) : next;
      void (cacheKey ? setCachedJson(cacheKey, computed) : Promise.resolve());
      return computed;
    });
    return resolved;
  };

  const refresh = async () => {
    if (!user?.id) {
      setWorkspace(buildEmptyWorkspace(user?.email ?? null));
      setLoading(false);
      return;
    }

    if (!isOnline) {
      if (cacheKey) {
        const cached = await getCachedJson<SellerWorkspace>(cacheKey);
        if (cached?.data) {
          const projected = await applyOutboxToSellerWorkspace(user.id, cached.data);
          setWorkspace(projected);
        }
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await loadWorkspace(user?.id, user?.email ?? null);
      const projected = await applyOutboxToSellerWorkspace(user.id, next);
      setWorkspace(projected);
      if (cacheKey) await setCachedJson(cacheKey, projected);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load seller workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [isOnline, user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`seller-workspace-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_handoffs" }, () => void refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!workspace.vendor?.id || !workspace.orders.length) return;
      const latestPending = workspace.orders
        .filter((row) => row.status === "pending")
        .slice()
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];
      if (!hasSeededOrderNotifications.current) {
        hasSeededOrderNotifications.current = true;
        lastAlertedOrderId.current = latestPending?.id ?? null;
        return;
      }
      if (!latestPending || latestPending.id === lastAlertedOrderId.current) return;
      const meta = await getSellerShopMeta(workspace.vendor.id);
      if (!active) return;
      if (!meta?.pushNotificationsEnabled && !meta?.soundAlertsEnabled) return;
      lastAlertedOrderId.current = latestPending.id;
      await scheduleLocalNotification({
        title: "New seller order",
        body: "A customer placed a new order in your shop.",
        data: { orderId: latestPending.id, role: "seller" },
        playSound: meta?.soundAlertsEnabled ?? true,
      });
    };
    void run();
    return () => {
      active = false;
    };
  }, [workspace.orders, workspace.vendor?.id]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!workspace.vendor?.id) return;
      const meta = await getSellerShopMeta(workspace.vendor.id);
      if (!active) return;
      if (!meta?.pushNotificationsEnabled && !meta?.soundAlertsEnabled) return;

      const latestDelivered = workspace.orders
        .filter((row) => row.status === "delivered")
        .slice()
        .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))[0];
      const latestVerifiedHandoff = Object.values(workspace.handoffsByOrderId)
        .filter((row) => Boolean(row.verified_at))
        .slice()
        .sort((a, b) => +new Date(b.verified_at || 0) - +new Date(a.verified_at || 0))[0];

      if (!hasSeededDeliveryNotifications.current) {
        hasSeededDeliveryNotifications.current = true;
        lastDeliveredNoticeKey.current = latestDelivered ? `${latestDelivered.id}:${latestDelivered.updated_at}` : null;
        lastHandoffNoticeKey.current = latestVerifiedHandoff?.verified_at ? `${latestVerifiedHandoff.order_id}:${latestVerifiedHandoff.verified_at}` : null;
        return;
      }

      if (latestDelivered) {
        const deliveredKey = `${latestDelivered.id}:${latestDelivered.updated_at}`;
        if (lastDeliveredNoticeKey.current !== deliveredKey) {
          lastDeliveredNoticeKey.current = deliveredKey;
          await scheduleLocalNotification({
            title: "Delivery completed",
            body: "A customer order was marked delivered.",
            data: { orderId: latestDelivered.id, role: "seller", event: "delivery_completed" },
            playSound: meta?.soundAlertsEnabled ?? true,
          });
        }
      }

      if (latestVerifiedHandoff?.verified_at) {
        const handoffKey = `${latestVerifiedHandoff.order_id}:${latestVerifiedHandoff.verified_at}`;
        if (lastHandoffNoticeKey.current !== handoffKey) {
          lastHandoffNoticeKey.current = handoffKey;
          await scheduleLocalNotification({
            title: "Customer handoff verified",
            body: `Order ${latestVerifiedHandoff.order_reference} was confirmed with ${latestVerifiedHandoff.verification_method || "delivery verification"}.`,
            data: { orderId: latestVerifiedHandoff.order_id, role: "seller", event: "handoff_verified" },
            playSound: false,
          });
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [workspace.handoffsByOrderId, workspace.orders, workspace.vendor?.id]);

  const saveProduct = async (input: SellerProductInput) => {
    if (!workspace.vendor) throw new Error("Create your seller shop first.");

    if (!isOnline && user?.id) {
      const queued = await enqueueSellerProductSave({
        ownerUserId: user.id,
        vendorId: workspace.vendor.id,
        itemId: input.itemId ?? null,
        name: input.name,
        price_mwk: input.price_mwk,
        description: input.description ?? null,
        stock_qty: input.stock_qty ?? null,
        channel: input.channel,
        image_url: input.image_url ?? null,
      });
      const optimistic: CatalogItemRow = {
        id: input.itemId ?? queued.payload.localItemId ?? `local-product:${Date.now()}`,
        vendor_id: workspace.vendor.id,
        channel: input.channel,
        name: input.name,
        description: input.description ?? null,
        price_mwk: input.price_mwk,
        stock_qty: input.stock_qty ?? null,
        image_url: input.image_url ?? null,
        is_active: true,
        created_at: new Date(queued.queuedAt).toISOString(),
        updated_at: new Date(queued.queuedAt).toISOString(),
      };
      await updateWorkspaceState((current) => ({
        ...current,
        products: current.products.some((row) => row.id === optimistic.id)
          ? current.products.map((row) => (row.id === optimistic.id ? optimistic : row))
          : [optimistic, ...current.products],
      }));
      return optimistic;
    }

    const saved = input.itemId
      ? await updateCatalogItem(input.itemId, {
          name: input.name,
          description: input.description ?? null,
          price_mwk: input.price_mwk,
          stock_qty: input.stock_qty ?? null,
          image_url: input.image_url ?? null,
        })
      : await createCatalogItem({
          vendor_id: workspace.vendor.id,
          channel: input.channel,
          name: input.name,
          description: input.description ?? null,
          price_mwk: input.price_mwk,
          stock_qty: input.stock_qty ?? null,
          image_url: input.image_url ?? null,
        });

    await refresh();
    return saved;
  };

  const archiveProduct = async (itemId: string) => {
    if (!workspace.vendor) throw new Error("Create your seller shop first.");
    if (!isOnline && user?.id) {
      await enqueueSellerProductArchive(user.id, itemId);
      await updateWorkspaceState((current) => ({
        ...current,
        products: current.products.filter((row) => row.id !== itemId),
      }));
      return;
    }
    await deleteCatalogItem(itemId);
    await refresh();
  };

  const setProductActive = async (itemId: string, isActive: boolean) => {
    if (!workspace.vendor) throw new Error("Create your seller shop first.");
    if (!isOnline && user?.id) {
      await enqueueSellerProductActive(user.id, itemId, isActive);
      await updateWorkspaceState((current) => ({
        ...current,
        products: current.products.map((row) => (row.id === itemId ? { ...row, is_active: isActive } : row)),
      }));
      return;
    }
    await updateCatalogItem(itemId, { is_active: isActive });
    await refresh();
  };

  const updateVendorProfile = async (input: VendorUpdateInput) => {
    if (!workspace.vendor) throw new Error("Create your seller shop first.");
    const saved = await updateVendor(workspace.vendor.id, input);
    await refresh();
    return saved;
  };

  const setOrderStatus = async (orderId: string, status: OrderStatus) => {
    if (!workspace.vendor) throw new Error("Create your seller shop first.");
    if (!isOnline && user?.id) {
      await enqueueSellerOrderStatus(user.id, orderId, status);
      await updateWorkspaceState((current) => ({
        ...current,
        orders: current.orders.map((row) =>
          row.id === orderId ? { ...row, status, updated_at: new Date().toISOString() } : row,
        ),
      }));
      return;
    }
    await updateOrderStatus(orderId, status);
    await refresh();
  };

  const metrics = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const weekOrders = workspace.orders.filter((row) => new Date(row.created_at) >= weekStart);
    const thisWeekRevenue = weekOrders.reduce((sum, row) => sum + Number(row.total_mwk), 0);
    const ordersToday = workspace.orders.filter((row) => new Date(row.created_at).toDateString() === now.toDateString()).length;
    const readyCount = workspace.orders.filter((row) => row.status === "accepted" || row.status === "preparing").length;
    const deliveredCount = workspace.orders.filter((row) => row.status === "delivered").length;
    const activeOrders = workspace.orders.filter((row) => row.status !== "delivered" && row.status !== "cancelled");
    const lowStockCount = workspace.products.filter((row) => row.is_active && row.stock_qty != null && row.stock_qty > 0 && row.stock_qty <= 5).length;
    const outOfStockCount = workspace.products.filter((row) => row.is_active && (row.stock_qty ?? 0) <= 0).length;
    const payoutHistory: SellerPayoutRow[] = workspace.orders
      .filter((row) => row.status === "delivered")
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((row, index) => {
        const customer = workspace.customersById[row.customer_id];
        const netAmount = Math.max(0, Number(row.total_mwk) - Number(row.service_fee_mwk ?? 0));
        return {
          id: `payout-${row.id}`,
          orderId: row.id,
          customerName: customer?.name ?? "Customer",
          amountMwk: netAmount,
          status: index === 0 ? "processing" : index < 4 ? "paid" : "pending",
          createdAt: row.created_at,
          label: row.channel === "food" ? "Food order payout" : "Market order payout",
        };
      });

    const weeklyBars = Array.from({ length: 7 }).map((_, index) => {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + index);
      const total = workspace.orders
        .filter((row) => new Date(row.created_at).toDateString() === day.toDateString())
        .reduce((sum, row) => sum + Number(row.total_mwk), 0);
      return {
        label: day.toLocaleDateString("en-US", { weekday: "short" }).charAt(0),
        value: total,
      };
    });

    return {
      thisWeekRevenue,
      ordersToday,
      readyCount,
      deliveredCount,
      activeOrders,
      productsListed: workspace.products.filter((row) => row.is_active).length,
      lowStockCount,
      outOfStockCount,
      payoutHistory,
      weeklyBars,
    };
  }, [workspace.customersById, workspace.orders, workspace.products]);

  return {
    workspace,
    loading,
    error,
    refresh,
    saveProduct,
    archiveProduct,
    setProductActive,
    updateVendorProfile,
    setOrderStatus,
    metrics,
  };
}
