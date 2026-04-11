import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CheckCircle2, ChevronRight, Clock3, MapPin, PackageOpen, Sparkles, Store, Truck } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { formatCacheTime, getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { supabase } from "@/lib/supabase";
import { supabaseNewApp } from "@/lib/supabaseNewApp";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";

type OrderFilter = "all" | "active" | "completed";
type DbOrderStatus = "pending" | "accepted" | "preparing" | "picked_up" | "on_the_way" | "delivered" | "cancelled";
type DeliveryStatus = "searching" | "assigned" | "picked_up" | "arriving" | "delivered" | "failed" | "cancelled";

type OrderRow = {
  id: string;
  vendor_id: string;
  channel: "market" | "food";
  status: DbOrderStatus;
  delivery_mode: "pickup" | "doorstep";
  dropoff_notes: string | null;
  total_mwk: number;
  delivery_fee_mwk: number;
  payment_status: string;
  created_at: string;
};

type OrderItemRow = {
  order_id: string;
  item_name_snapshot: string;
  quantity: number;
};

type DeliveryRow = {
  order_id: string;
  status: DeliveryStatus;
  eta_minutes: number | null;
};

type VendorRow = {
  id: string;
  name: string;
  area: string | null;
  campus: string | null;
};

type HandoffRow = {
  order_id: string;
  order_reference: string;
  verified_at: string | null;
};

type UiOrderRow = {
  id: string;
  mode: "market" | "food";
  statusLabel: string;
  isCompleted: boolean;
  isCancelled: boolean;
  isActive: boolean;
  dateLabel: string;
  from: string;
  to: string;
  title: string;
  itemSummary: string;
  amountLabel: string;
  etaLabel: string | null;
  deliveryStatus: DeliveryStatus | null;
  orderReference: string | null;
  handoffVerified: boolean;
};

function money(value: number) {
  return `MWK ${Math.round(value || 0).toLocaleString("en-MW")}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function humanizeStatus(order: OrderRow, delivery: DeliveryRow | undefined) {
  if (order.status === "cancelled") return "Cancelled";
  if (order.status === "delivered" || delivery?.status === "delivered") return "Completed";
  if (delivery?.status === "arriving" || order.status === "on_the_way") return "On the way";
  if (delivery?.status === "picked_up" || order.status === "picked_up") return "Picked up";
  if (order.status === "preparing") return "Preparing";
  if (order.status === "accepted" || delivery?.status === "assigned") return "Confirmed";
  return "Pending";
}

function isCompletedOrder(order: OrderRow, delivery: DeliveryRow | undefined) {
  return order.status === "delivered" || order.status === "cancelled" || delivery?.status === "delivered" || delivery?.status === "failed" || delivery?.status === "cancelled";
}

function buildItemSummary(items: OrderItemRow[]) {
  if (!items.length) return "Order items unavailable";
  return items.map((item) => `${item.quantity}x ${item.item_name_snapshot}`).join(" · ");
}

export default function OrdersScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { isOnline } = useNetwork();
  const [filter, setFilter] = useState<OrderFilter>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<UiOrderRow[]>([]);
  const [cacheTime, setCacheTime] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/(auth)/login");
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user?.id) return;

    let active = true;
    const cacheKey = `student_orders_${user.id}`;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const cached = await getCachedJson<UiOrderRow[]>(cacheKey);
        if (cached?.data?.length && active) {
          setRows(cached.data);
          setCacheTime(cached.ts);
          setLoading(false);
        }

        if (!isOnline) {
          if (active && !cached?.data?.length) {
            setError("Offline with no cached orders yet.");
          } else if (active) {
            setError("Offline mode: showing cached orders.");
          }
          return;
        }

        const { data: orderData, error: orderError } = await supabaseNewApp
          .from("orders")
          .select("id,vendor_id,channel,status,delivery_mode,dropoff_notes,total_mwk,delivery_fee_mwk,payment_status,created_at")
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false });
        if (orderError) throw orderError;

        const orders = ((orderData ?? []) as OrderRow[]).filter((row) => {
          const paymentStatus = String(row.payment_status || "").toLowerCase();
          return paymentStatus === "paid";
        });
        const orderIds = orders.map((row) => row.id);
        const vendorIds = [...new Set(orders.map((row) => row.vendor_id))];

        const [{ data: vendorData, error: vendorError }, { data: itemData, error: itemError }, { data: deliveryData, error: deliveryError }, { data: handoffData, error: handoffError }] = await Promise.all([
          vendorIds.length
            ? supabaseNewApp.from("vendors").select("id,name,area,campus").in("id", vendorIds)
            : Promise.resolve({ data: [], error: null }),
          orderIds.length
            ? supabaseNewApp.from("order_items").select("order_id,item_name_snapshot,quantity").in("order_id", orderIds).order("created_at", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          orderIds.length
            ? supabaseNewApp.from("deliveries").select("order_id,status,eta_minutes").in("order_id", orderIds)
            : Promise.resolve({ data: [], error: null }),
          orderIds.length
            ? supabaseNewApp.from("order_handoffs").select("order_id,order_reference,verified_at").in("order_id", orderIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (vendorError) throw vendorError;
        if (itemError) throw itemError;
        if (deliveryError) throw deliveryError;
        if (handoffError) throw handoffError;

        const vendorsById = new Map(((vendorData ?? []) as VendorRow[]).map((row) => [row.id, row]));
        const itemsByOrderId = new Map<string, OrderItemRow[]>();
        ((itemData ?? []) as OrderItemRow[]).forEach((row) => {
          const current = itemsByOrderId.get(row.order_id) ?? [];
          current.push(row);
          itemsByOrderId.set(row.order_id, current);
        });
        const deliveryByOrderId = new Map(((deliveryData ?? []) as DeliveryRow[]).map((row) => [row.order_id, row]));
        const handoffByOrderId = new Map(((handoffData ?? []) as HandoffRow[]).map((row) => [row.order_id, row]));

        const nextRows: UiOrderRow[] = orders.map((order) => {
          const vendor = vendorsById.get(order.vendor_id);
          const items = itemsByOrderId.get(order.id) ?? [];
          const delivery = deliveryByOrderId.get(order.id);
          const handoff = handoffByOrderId.get(order.id);
          const completed = isCompletedOrder(order, delivery);
          return {
            id: order.id,
            mode: order.channel,
            statusLabel: humanizeStatus(order, delivery),
            isCompleted: completed,
            isCancelled: order.status === "cancelled" || delivery?.status === "cancelled" || delivery?.status === "failed",
            isActive: !completed,
            dateLabel: formatDate(order.created_at),
            from: vendor?.name ?? "Campus vendor",
            to: order.dropoff_notes ?? (order.delivery_mode === "doorstep" ? "Campus delivery point" : "Pickup order"),
            title: items[0]?.item_name_snapshot ?? vendor?.name ?? "Order",
            itemSummary: buildItemSummary(items),
            amountLabel: money(Number(order.total_mwk || 0)),
            etaLabel: delivery?.eta_minutes ? `${delivery.eta_minutes} min away` : order.delivery_mode === "pickup" ? "Pickup ready soon" : null,
            deliveryStatus: delivery?.status ?? null,
            orderReference: handoff?.order_reference ?? null,
            handoffVerified: Boolean(handoff?.verified_at),
          };
        });

        if (!active) return;
        setRows(nextRows);
        setCacheTime(Date.now());
        await setCachedJson(cacheKey, nextRows);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message ?? "Failed to load your orders.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    const channel = supabase
      .channel(`student-orders-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_handoffs" }, () => void load())
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [isOnline, user?.id]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "active") return rows.filter((row) => row.isActive);
    return rows.filter((row) => row.isCompleted);
  }, [filter, rows]);

  const activeOrder = useMemo(() => rows.find((row) => row.isActive) ?? null, [rows]);
  const completedOrders = useMemo(() => rows.filter((row) => row.isCompleted), [rows]);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <SoftPageGlow topColor="rgba(170, 184, 255, 0.18)" middleColor="rgba(212, 199, 255, 0.16)" bottomColor="rgba(255, 223, 205, 0.12)" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2d3170" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow topColor="rgba(170, 184, 255, 0.18)" middleColor="rgba(212, 199, 255, 0.16)" bottomColor="rgba(255, 223, 205, 0.12)" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Your Orders</Text>

        <View style={styles.filterWrap}>
          {(["all", "active", "completed"] as OrderFilter[]).map((item) => {
            const active = item === filter;
            return (
              <Pressable key={item} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(item)}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {item === "all" ? "All" : item === "active" ? "Active" : "Completed"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}
        {cacheTime ? <Text style={styles.cacheMeta}>Orders cache: {formatCacheTime(cacheTime)}</Text> : null}

        {activeOrder && (filter === "all" || filter === "active") ? (
          <View style={styles.activeCard}>
            <View style={styles.activeTop}>
              <View style={styles.activeIconWrap}>
                {activeOrder.mode === "food" ? <Truck size={30} color="#5068db" /> : <PackageOpen size={30} color="#5068db" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeTitle}>{activeOrder.title}</Text>
                <Text style={styles.activeMeta}>{activeOrder.itemSummary}</Text>
                <View style={styles.statusRow}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>{activeOrder.statusLabel}</Text>
                </View>
                {activeOrder.etaLabel ? <Text style={styles.etaText}>{activeOrder.etaLabel}</Text> : null}
              </View>
            </View>

            <View style={styles.routeCard}>
              <View style={styles.routeRow}>
                <Store size={16} color="#5068db" />
                <Text style={styles.routeText}>{activeOrder.from}</Text>
              </View>
              <View style={styles.routeRow}>
                <MapPin size={16} color="#0d7b45" />
                <Text style={styles.routeText}>{activeOrder.to}</Text>
              </View>
            </View>

            <View style={styles.metaPills}>
              {activeOrder.orderReference ? <MetaPill label={`Ref ${activeOrder.orderReference}`} /> : null}
              <MetaPill label={activeOrder.amountLabel} />
              {activeOrder.handoffVerified ? <MetaPill label="Handoff verified" positive /> : null}
            </View>

            {activeOrder.deliveryStatus ? (
              <Pressable
                style={styles.trackBtn}
                onPress={() =>
                  router.push({
                    pathname: "/(student)/delivery/[orderId]",
                    params: {
                      orderId: activeOrder.id,
                      from: activeOrder.from,
                      to: activeOrder.to,
                      eta: activeOrder.etaLabel ?? "ETA pending",
                    },
                  })
                }
              >
                <Clock3 size={18} color="#ffffff" />
                <Text style={styles.trackBtnText}>Track live delivery</Text>
                <ChevronRight size={18} color="#ffffff" />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {completedOrders.length > 0 && (filter === "all" || filter === "completed") ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Completed Orders</Text>
              <ChevronRight size={22} color="#8c94ac" />
            </View>

            <View style={styles.completedList}>
              {completedOrders.map((row) => (
                <View key={row.id} style={styles.completedCard}>
                  <View style={styles.completedTop}>
                    <View style={styles.completedIconWrap}>
                      {row.mode === "food" ? <Truck size={26} color="#5068db" /> : <PackageOpen size={26} color="#5068db" />}
                    </View>
                    <View style={styles.completedCopy}>
                      <Text numberOfLines={1} style={styles.completedTitle}>{row.title}</Text>
                      <Text numberOfLines={2} style={styles.completedSub}>{row.itemSummary}</Text>
                      <View style={styles.completedMetaRow}>
                        <CheckCircle2 size={18} color={row.isCancelled ? "#b0003a" : "#86bd98"} fill={row.isCancelled ? "#fff0f6" : "#eaf8ef"} />
                        <Text style={styles.completedMetaText}>{row.statusLabel}</Text>
                      </View>
                      {row.orderReference ? <Text style={styles.referenceText}>Ref {row.orderReference}</Text> : null}
                    </View>
                    <View style={styles.completedRight}>
                      <Text style={styles.completedAmount}>{row.amountLabel}</Text>
                      <Text style={styles.completedDate}>{row.dateLabel}</Text>
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable style={styles.softBtn} onPress={() => router.push(row.mode === "food" ? "/(food)/(tabs)/food" : "/(student)/(tabs)/marketplace")}>
                      <Text style={styles.softBtnText}>Reorder</Text>
                    </Pressable>
                    {row.deliveryStatus ? (
                      <Pressable
                        style={styles.softBtn}
                        onPress={() =>
                          router.push({
                            pathname: "/(student)/delivery/[orderId]",
                            params: { orderId: row.id, from: row.from, to: row.to, eta: row.etaLabel ?? "Delivered" },
                          })
                        }
                      >
                        <Text style={styles.softBtnText}>View delivery</Text>
                      </Pressable>
                    ) : (
                      <Pressable style={styles.softBtn} onPress={() => router.push(row.mode === "food" ? "/(food)/(tabs)/food" : "/(student)/(tabs)/marketplace")}>
                        <Text style={styles.softBtnText}>View details</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {filteredRows.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyGlowLeft} />
            <View style={styles.emptyGlowRight} />
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <View style={styles.emptyActionRow}>
              <Pressable style={styles.emptyBtn} onPress={() => router.push("/(food)/(tabs)/food")}>
                <Text style={styles.emptyBtnText}>Order food</Text>
              </Pressable>
              <Pressable style={styles.emptyBtn} onPress={() => router.push("/(student)/(tabs)/marketplace")}>
                <Text style={styles.emptyBtnText}>Browse market</Text>
              </Pressable>
            </View>
            <View style={styles.emptyTray}>
              <Sparkles size={24} color="#f4bf56" />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaPill({ label, positive = false }: { label: string; positive?: boolean }) {
  return (
    <View style={[styles.metaPill, positive && styles.metaPillPositive]}>
      <Text style={[styles.metaPillText, positive && styles.metaPillTextPositive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 118, gap: 18 },
  title: { color: "#2d3170", fontSize: 28, fontWeight: "900" },
  filterWrap: {
    borderRadius: 999,
    backgroundColor: "#f2f4fb",
    padding: 5,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#e6eaf6",
  },
  filterChip: { flex: 1, minHeight: 56, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  filterChipActive: { backgroundColor: "#5e73dd" },
  filterText: { color: "#5d67a4", fontSize: 17, fontWeight: "700" },
  filterTextActive: { color: "#ffffff" },
  noticeCard: { borderRadius: 18, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd5e4", padding: 12 },
  noticeText: { color: "#b0003a", fontWeight: "800" },
  cacheMeta: { color: "#7e88a5", fontSize: 12, fontWeight: "700" },
  activeCard: {
    borderRadius: 30,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#eaedf8",
    padding: 18,
    gap: 14,
    shadowColor: "#98a2c9",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  activeTop: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  activeIconWrap: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: "#eef1fb",
    alignItems: "center",
    justifyContent: "center",
  },
  activeTitle: { color: "#2d3170", fontSize: 20, fontWeight: "900" },
  activeMeta: { color: "#6f79a3", fontSize: 13, fontWeight: "700", marginTop: 4 },
  statusRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#8cc7a1", borderWidth: 2, borderColor: "#5d9476" },
  statusText: { color: "#34406c", fontSize: 16, fontWeight: "700" },
  etaText: { marginTop: 6, color: "#7b84a2", fontSize: 14, fontWeight: "600" },
  routeCard: {
    borderRadius: 22,
    backgroundColor: "#f7f8fe",
    borderWidth: 1,
    borderColor: "#e7ebf6",
    padding: 14,
    gap: 10,
  },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeText: { color: "#2d3170", fontWeight: "700", fontSize: 14, flex: 1 },
  metaPills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaPill: {
    borderRadius: 999,
    backgroundColor: "#eef2fb",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metaPillPositive: { backgroundColor: "#e8f7ee" },
  metaPillText: { color: "#50608e", fontWeight: "800", fontSize: 12 },
  metaPillTextPositive: { color: "#0d7b45" },
  trackBtn: {
    alignSelf: "flex-end",
    borderRadius: 999,
    backgroundColor: "#5068db",
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trackBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: "#2d3170", fontSize: 24, fontWeight: "900" },
  completedList: { gap: 14 },
  completedCard: {
    borderRadius: 28,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#eaedf8",
    overflow: "hidden",
    shadowColor: "#98a2c9",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  completedTop: { padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  completedIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 22,
    backgroundColor: "#eef1fb",
    alignItems: "center",
    justifyContent: "center",
  },
  completedCopy: { flex: 1, gap: 6 },
  completedTitle: { color: "#2d3170", fontSize: 18, fontWeight: "900" },
  completedSub: { color: "#6b7494", fontSize: 13, fontWeight: "600", lineHeight: 18 },
  completedMetaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  completedMetaText: { color: "#6b7494", fontSize: 15, fontWeight: "600" },
  referenceText: { color: "#5d67a4", fontSize: 12, fontWeight: "800" },
  completedRight: { alignItems: "flex-end", gap: 8 },
  completedAmount: { color: "#2d3170", fontSize: 18, fontWeight: "900" },
  completedDate: { color: "#8b93ad", fontSize: 12, fontWeight: "700", textAlign: "right" },
  actionRow: { borderTopWidth: 1, borderTopColor: "#eef1f8", padding: 14, flexDirection: "row", gap: 10 },
  softBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: "#f8f8fe",
    borderWidth: 1,
    borderColor: "#e7eaf6",
    alignItems: "center",
    justifyContent: "center",
  },
  softBtnText: { color: "#5d67a4", fontSize: 16, fontWeight: "700" },
  emptyCard: {
    borderRadius: 32,
    backgroundColor: "#f7f5ff",
    borderWidth: 1,
    borderColor: "#ebe8fb",
    padding: 18,
    alignItems: "center",
    gap: 14,
    overflow: "hidden",
  },
  emptyGlowLeft: {
    position: "absolute",
    left: -28,
    bottom: -36,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,214,200,0.35)",
  },
  emptyGlowRight: {
    position: "absolute",
    right: -18,
    top: -24,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(197,215,255,0.45)",
  },
  emptyTitle: { color: "#2d3170", fontSize: 20, fontWeight: "900" },
  emptyActionRow: { flexDirection: "row", gap: 10 },
  emptyBtn: {
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7eaf6",
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  emptyBtnText: { color: "#50608e", fontSize: 16, fontWeight: "700" },
  emptyTray: {
    width: 88,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
});
