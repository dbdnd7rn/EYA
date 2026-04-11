/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, ChevronRight, Clock3, MapPin, PackageOpen, Search, ShieldCheck, Truck } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { formatCacheTime, getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { supabase } from "@/lib/supabase";
import { supabaseNewApp } from "@/lib/supabaseNewApp";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useRouter } from "expo-router";

type DeliveryStatus = "searching" | "assigned" | "picked_up" | "arriving" | "delivered" | "failed" | "cancelled";
type DbOrderStatus = "pending" | "accepted" | "preparing" | "picked_up" | "on_the_way" | "delivered" | "cancelled";

type DeliveryRow = {
  id: string;
  order_id: string;
  status: DeliveryStatus;
  created_at: string;
  updated_at: string;
  eta_minutes: number | null;
};

type OrderRow = {
  id: string;
  customer_id: string;
  vendor_id: string;
  channel: "market" | "food";
  status: DbOrderStatus;
  dropoff_notes: string | null;
  delivery_fee_mwk: number;
  total_mwk: number;
  payment_status: string;
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
  order_reference: string;
  verified_at: string | null;
};

type UiDeliveryRow = {
  id: string;
  orderId: string;
  vendorName: string;
  routeLabel: string;
  title: string;
  summary: string;
  payoutLabel: string;
  etaLabel: string;
  status: DeliveryStatus;
  orderStatus: DbOrderStatus;
  orderReference: string | null;
  handoffVerified: boolean;
  updatedLabel: string;
};

const FILTERS: Array<{ id: "all" | DeliveryStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "assigned", label: "Assigned" },
  { id: "picked_up", label: "Picked Up" },
  { id: "arriving", label: "Arriving" },
  { id: "delivered", label: "Delivered" },
];

function money(value: number) {
  return `MWK ${Math.round(value || 0).toLocaleString("en-MW")}`;
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function etaLabel(status: DeliveryStatus, etaMinutes: number | null) {
  if (status === "delivered") return "Delivered";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (etaMinutes) return `${etaMinutes} min`;
  return "ETA pending";
}

function statusPillStyle(status: DeliveryStatus) {
  if (status === "delivered") return { bg: "#e8f7ee", fg: "#0d7b45" };
  if (status === "picked_up") return { bg: "#ede3fb", fg: "#6a35af" };
  if (status === "arriving") return { bg: "#fff2da", fg: "#8a611a" };
  if (status === "failed" || status === "cancelled") return { bg: "#fff0f6", fg: "#b0003a" };
  return { bg: "#202554", fg: "#ffffff" };
}

function buildItemSummary(items: OrderItemRow[]) {
  if (!items.length) return "Order items unavailable";
  return items.map((item) => `${item.quantity}x ${item.item_name_snapshot}`).join(" · ");
}

export default function AgentDeliveriesScreen() {
  const { user, loading: authLoading } = useAuth();
  const { isOnline } = useNetwork();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<UiDeliveryRow[]>([]);
  const [filter, setFilter] = useState<"all" | DeliveryStatus>("all");
  const [cacheTime, setCacheTime] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user?.id) return;

    let active = true;
    const load = async () => {
      const cacheKey = `agent_deliveries_${user.id}`;
      setLoading(true);
      setErr(null);
      try {
        if (!isOnline) {
          const cached = await getCachedJson<UiDeliveryRow[]>(cacheKey);
          if (!active) return;
          setRows(cached?.data ?? []);
          setCacheTime(cached?.ts ?? null);
          setErr(cached?.data ? "Offline mode: showing cached deliveries." : "Offline with no cached deliveries yet.");
          return;
        }

        const { data: deliveryData, error: deliveryError } = await supabaseNewApp
          .from("deliveries")
          .select("id,order_id,status,created_at,updated_at,eta_minutes")
          .eq("driver_id", user.id)
          .order("updated_at", { ascending: false });
        if (deliveryError) throw deliveryError;

        const deliveries = (deliveryData ?? []) as DeliveryRow[];
        const orderIds = deliveries.map((row) => row.order_id);

        const [{ data: orderData, error: orderError }, { data: itemData, error: itemError }, { data: handoffData, error: handoffError }] = await Promise.all([
          orderIds.length
            ? supabaseNewApp.from("orders").select("id,customer_id,vendor_id,channel,status,dropoff_notes,delivery_fee_mwk,total_mwk,payment_status").in("id", orderIds)
            : Promise.resolve({ data: [], error: null }),
          orderIds.length
            ? supabaseNewApp.from("order_items").select("order_id,item_name_snapshot,quantity").in("order_id", orderIds).order("created_at", { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          orderIds.length
            ? supabaseNewApp.from("order_handoffs").select("order_id,order_reference,verified_at").in("order_id", orderIds)
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

        const paidOrders = orders.filter((row) => String(row.payment_status || "").toLowerCase() === "paid");
        const paidOrderIds = new Set(paidOrders.map((row) => row.id));
        const ordersById = new Map(paidOrders.map((row) => [row.id, row]));
        const vendorsById = new Map(((vendorData ?? []) as VendorRow[]).map((row) => [row.id, row]));
        const itemsByOrderId = new Map<string, OrderItemRow[]>();
        ((itemData ?? []) as OrderItemRow[]).forEach((row) => {
          const current = itemsByOrderId.get(row.order_id) ?? [];
          current.push(row);
          itemsByOrderId.set(row.order_id, current);
        });
        const handoffByOrderId = new Map(((handoffData ?? []) as HandoffRow[]).map((row) => [row.order_id, row]));

        const nextRows: UiDeliveryRow[] = deliveries.filter((delivery) => paidOrderIds.has(delivery.order_id)).map((delivery) => {
          const order = ordersById.get(delivery.order_id);
          const vendor = order ? vendorsById.get(order.vendor_id) : null;
          const items = itemsByOrderId.get(delivery.order_id) ?? [];
          const handoff = handoffByOrderId.get(delivery.order_id);
          return {
            id: delivery.id,
            orderId: delivery.order_id,
            vendorName: vendor?.name ?? "Campus vendor",
            routeLabel: order?.dropoff_notes ?? vendor?.campus ?? vendor?.area ?? "Campus delivery",
            title: items[0]?.item_name_snapshot ?? vendor?.name ?? "Delivery order",
            summary: buildItemSummary(items),
            payoutLabel: money(Number(order?.delivery_fee_mwk || 0)),
            etaLabel: etaLabel(delivery.status, delivery.eta_minutes),
            status: delivery.status,
            orderStatus: order?.status ?? "pending",
            orderReference: handoff?.order_reference ?? null,
            handoffVerified: Boolean(handoff?.verified_at),
            updatedLabel: timeLabel(delivery.updated_at),
          };
        });

        if (!active) return;
        setRows(nextRows);
        await setCachedJson(cacheKey, nextRows);
        setCacheTime(Date.now());
      } catch (e: any) {
        if (!active) return;
        const cached = await getCachedJson<UiDeliveryRow[]>(`agent_deliveries_${user.id}`);
        if (cached?.data) {
          setRows(cached.data);
          setCacheTime(cached.ts ?? null);
          setErr("Offline mode: showing cached deliveries.");
        } else {
          setErr(e?.message ?? "Failed to load deliveries.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    const channel = supabase
      .channel(`agent-deliveries-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_handoffs" }, () => void load())
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [isOnline, user?.id]);

  const filtered = useMemo(() => (filter === "all" ? rows : rows.filter((row) => row.status === filter)), [rows, filter]);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <SoftPageGlow variant="orders" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0e2756" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="orders" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Deliveries</Text>
          <View style={styles.headerButtons}>
            <CircleIcon icon={<Search size={18} color="#0e2756" />} />
          </View>
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = f.id === filter;
            return (
              <Pressable key={f.id} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(f.id)}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {err ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{err}</Text>
          </View>
        ) : null}
        {cacheTime ? <Text style={styles.cacheMeta}>Deliveries cache: {formatCacheTime(cacheTime)}</Text> : null}

        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No deliveries</Text>
            <Text style={styles.emptySub}>Assigned rider jobs will appear here once available.</Text>
          </View>
        ) : (
          filtered.map((row) => {
            const pill = statusPillStyle(row.status);
            return (
              <Pressable key={row.id} style={styles.deliveryCard} onPress={() => router.push({ pathname: "/delivery/[orderId]", params: { orderId: row.orderId } })}>
                <View style={styles.deliveryGlow} />
                <View style={styles.deliveryTop}>
                  <View style={styles.deliveryIconWrap}>
                    {row.status === "delivered" ? <CheckCircle2 size={26} color="#0d7b45" /> : <Truck size={26} color="#202554" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deliveryStore}>{row.vendorName}</Text>
                    <Text style={styles.deliveryTitle}>{row.title}</Text>
                    <Text style={styles.deliverySummary}>{row.summary}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: pill.bg }]}>
                    <Text style={[styles.statusPillText, { color: pill.fg }]}>{row.status.replaceAll("_", " ")}</Text>
                  </View>
                </View>

                <View style={styles.infoGrid}>
                  <InfoPill icon={<MapPin size={14} color="#5d67a4" />} label={row.routeLabel} />
                  <InfoPill icon={<Clock3 size={14} color="#5d67a4" />} label={row.etaLabel} />
                  {row.orderReference ? <InfoPill icon={<PackageOpen size={14} color="#5d67a4" />} label={row.orderReference} /> : null}
                  <InfoPill icon={<Truck size={14} color="#5d67a4" />} label={`Fee ${row.payoutLabel}`} />
                  {row.handoffVerified ? <InfoPill icon={<ShieldCheck size={14} color="#0d7b45" />} label="Handoff verified" positive /> : null}
                </View>

                <View style={styles.deliveryBottom}>
                  <Text style={styles.deliveryMeta}>Updated {row.updatedLabel}</Text>
                  <ChevronRight size={20} color="#706d86" />
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CircleIcon({ icon }: { icon: React.ReactNode }) {
  return <View style={styles.circleIcon}>{icon}</View>;
}

function InfoPill({ icon, label, positive = false }: { icon: React.ReactNode; label: string; positive?: boolean }) {
  return (
    <View style={[styles.infoPill, positive && styles.infoPillPositive]}>
      {icon}
      <Text style={[styles.infoPillText, positive && styles.infoPillTextPositive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 120, gap: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#2a2d63", fontSize: 24, fontWeight: "700" },
  headerButtons: { flexDirection: "row", gap: 10 },
  circleIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.84)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#eeeaf8" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChip: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "#efe9f8" },
  filterChipActive: { backgroundColor: "#202554", borderColor: "#202554" },
  filterChipText: { color: "#4e4b67", fontSize: 13, fontWeight: "600" },
  filterChipTextActive: { color: "#fff" },
  noticeCard: { borderRadius: 18, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd5e4", padding: 12 },
  noticeText: { color: "#b0003a", fontWeight: "800" },
  cacheMeta: { color: "#706d86", fontSize: 12, fontWeight: "700" },
  emptyCard: { borderRadius: 26, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: "#eee8f7", padding: 18, gap: 6 },
  emptyTitle: { color: "#202554", fontWeight: "900", fontSize: 18 },
  emptySub: { color: "#6f6c84", fontWeight: "600", fontSize: 13 },
  deliveryCard: { overflow: "hidden", borderRadius: 28, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: "#eee8f7", padding: 18, gap: 16 },
  deliveryGlow: { position: "absolute", right: -10, top: -12, width: 180, height: 120, borderRadius: 80, backgroundColor: "rgba(255,218,196,0.32)" },
  deliveryTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  deliveryIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#f2f5ff",
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryStore: { color: "#2a2d63", fontSize: 18, fontWeight: "800" },
  deliveryTitle: { marginTop: 4, color: "#202554", fontSize: 16, fontWeight: "800" },
  deliverySummary: { marginTop: 4, color: "#706d86", fontSize: 13, fontWeight: "600", lineHeight: 18 },
  statusPill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  statusPillText: { fontSize: 13, fontWeight: "700", textTransform: "capitalize" },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  infoPill: {
    borderRadius: 999,
    backgroundColor: "#f4f6fc",
    borderWidth: 1,
    borderColor: "#e7ebf6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoPillPositive: { backgroundColor: "#e8f7ee", borderColor: "#d4eddc" },
  infoPillText: { color: "#5d67a4", fontSize: 12, fontWeight: "700" },
  infoPillTextPositive: { color: "#0d7b45" },
  deliveryBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  deliveryMeta: { color: "#706d86", fontSize: 13, fontWeight: "600" },
});
