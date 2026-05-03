import React, { useMemo, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CirclePlus, Clock3, MapPin, Truck } from "lucide-react-native";
import type { OrderStatus } from "@/lib/newApp/types";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import { getRestaurantSessionConfig, getRestaurantSessionStatus, listRestaurantSessionOrders, type RestaurantSession } from "@/lib/restaurantSessions";

type SessionLane = "summary" | "cooking" | "pickup";
type SessionParam = RestaurantSession;

type PreviewOrder = {
  id: string;
  status: OrderStatus;
  created_at: string;
  total_mwk: number;
  customerName: string;
  place: string;
  title: string;
  delivery_mode: "pickup" | "doorstep";
};

const PREVIEW_ORDERS: PreviewOrder[] = [
  {
    id: "preview-1",
    status: "pending",
    created_at: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    total_mwk: 8500,
    customerName: "Mphatso",
    place: "MUST Campus",
    title: "Burger Combo",
    delivery_mode: "pickup",
  },
  {
    id: "preview-2",
    status: "preparing",
    created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    total_mwk: 6200,
    customerName: "Gondwe",
    place: "Soche",
    title: "Chicken Wrap",
    delivery_mode: "doorstep",
  },
  {
    id: "preview-3",
    status: "accepted",
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    total_mwk: 7200,
    customerName: "Tembo",
    place: "MUST Hostels",
    title: "Veggie Salad",
    delivery_mode: "pickup",
  },
];

function money(value: number) {
  return `MWK ${Math.round(value).toLocaleString()}`;
}

function prepProgress(createdAt: string) {
  const elapsed = Math.max(1, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  return Math.max(8, Math.min(100, Math.round((elapsed / 24) * 100)));
}

function formatDelivery(status: string | null | undefined) {
  if (!status) return "waiting";
  return status.replaceAll("_", " ");
}

function laneFromStatus(status: OrderStatus): SessionLane {
  if (status === "pending" || status === "preparing") return "cooking";
  if (status === "accepted" || status === "picked_up" || status === "on_the_way") return "pickup";
  return "summary";
}

export default function RestaurantSessionPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ session?: SessionParam }>();
  const { workspace, metrics, setOrderStatus } = useSellerWorkspace("food");
  const [lane, setLane] = useState<SessionLane>("summary");
  const session = params.session === "dinner" ? "dinner" : "lunch";
  const sessionConfig = getRestaurantSessionConfig(session);
  const sessionStatus = getRestaurantSessionStatus(session);

  const realRows = listRestaurantSessionOrders(
    workspace.orders
      .filter((row) => row.status !== "cancelled"),
    session,
  )
    .slice()
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  const rows = workspace.hasVendor ? realRows : PREVIEW_ORDERS;
  const cookingRows = rows.filter((row) => laneFromStatus(row.status) === "cooking");
  const pickupRows = rows.filter((row) => laneFromStatus(row.status) === "pickup");
  const deliveredCount = rows.filter((row) => row.status === "delivered").length;
  const revenue = rows.reduce((sum, row) => sum + Number((row as any).total_mwk ?? 0), 0);

  const moveOrderToReady = async (orderId: string) => {
    if (!workspace.hasVendor) {
      router.push("/(market)/setup");
      return;
    }
    try {
      await setOrderStatus(orderId, "accepted");
    } catch (err: any) {
      Alert.alert("Update failed", err?.message ?? "Could not move order to ready.");
    }
  };

  const declineOrder = async (orderId: string) => {
    if (!workspace.hasVendor) {
      router.push("/(market)/setup");
      return;
    }
    Alert.alert("Decline order", "Decline this order?", [
      { text: "Cancel", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: () => void setOrderStatus(orderId, "cancelled") },
    ]);
  };

  const completeOrder = async (orderId: string) => {
    if (!workspace.hasVendor) {
      router.push("/(market)/setup");
      return;
    }
    try {
      await setOrderStatus(orderId, "delivered");
    } catch (err: any) {
      Alert.alert("Update failed", err?.message ?? "Could not complete this order.");
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{sessionConfig.title}</Text>
            <Text style={styles.headerSub}>{sessionStatus.label}</Text>
          </View>
          <Pressable style={styles.addBtn} onPress={() => router.push("/(market)/add-product")}>
            <CirclePlus size={20} color="#232c54" />
          </Pressable>
        </View>

        <View style={styles.segment}>
          {(["summary", "cooking", "pickup"] as SessionLane[]).map((value) => {
            const active = lane === value;
            return (
              <Pressable key={value} style={[styles.segmentBtn, active && styles.segmentBtnActive]} onPress={() => setLane(value)}>
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {value === "summary" ? "Summary" : value === "cooking" ? "Cooking" : "Pickup"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {lane === "summary" ? (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.heroValue}>{rows.length} orders</Text>
              <Text style={styles.heroSub}>{sessionStatus.nextWindowLabel}</Text>
              <Text style={styles.heroHint}>
                Orders move to delivery only when you mark each meal as ready.
              </Text>
            </View>
            <View style={styles.statsRow}>
              <StatCard label="Cooking" value={String(cookingRows.length)} />
              <StatCard label="Ready" value={String(pickupRows.length)} />
              <StatCard label="Delivered" value={String(deliveredCount)} />
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Session totals</Text>
              <Text style={styles.summaryLine}>Revenue: {money(revenue)}</Text>
              <Text style={styles.summaryLine}>Orders in this session: {rows.length}</Text>
              <Text style={styles.summaryLine}>Average prep: {Math.max(8, Math.round(metrics.readyCount ? rows.length * 3.5 : 16))} min</Text>
            </View>
          </>
        ) : null}

        {lane === "cooking" ? (
          <View style={styles.list}>
            {cookingRows.length ? (
              cookingRows.map((order) => {
                const realOrder = workspace.hasVendor ? workspace.orders.find((row) => row.id === order.id) : null;
                const item = realOrder ? workspace.orderItemsByOrderId[order.id]?.[0] : null;
                const customer = realOrder ? workspace.customersById[realOrder.customer_id] : null;
                const title = item?.item_name_snapshot ?? (order as PreviewOrder).title ?? "Order item";
                const place = customer?.campus ?? customer?.area ?? (order as PreviewOrder).place ?? "Campus";
                const progress = prepProgress(order.created_at);

                return (
                  <View key={order.id} style={styles.orderCard}>
                    <View style={styles.orderTop}>
                      <Text style={styles.orderTitle}>{title}</Text>
                      <Text style={styles.orderPrice}>{money(Number((order as any).total_mwk ?? 0))}</Text>
                    </View>
                    <View style={styles.metaRow}>
                      <MapPin size={14} color="#6f789d" />
                      <Text style={styles.metaText}>{place}</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progress}%` }]} />
                    </View>
                    <View style={styles.actionRow}>
                      <Pressable style={styles.ghostBtn} onPress={() => void declineOrder(order.id)}>
                        <Text style={styles.ghostBtnText}>Decline</Text>
                      </Pressable>
                      <Pressable style={styles.primaryBtn} onPress={() => void moveOrderToReady(order.id)}>
                        <Text style={styles.primaryBtnText}>Ready for delivery</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            ) : (
              <EmptyCard text="No active cooking orders right now." />
            )}
          </View>
        ) : null}

        {lane === "pickup" ? (
          <View style={styles.list}>
            {pickupRows.length ? (
              pickupRows.map((order) => {
                const realOrder = workspace.hasVendor ? workspace.orders.find((row) => row.id === order.id) : null;
                const delivery = realOrder ? workspace.deliveriesByOrderId[order.id] : null;
                const label = realOrder?.delivery_mode === "doorstep" ? `Rider ${formatDelivery(delivery?.status)}` : "Pickup counter";
                const waitingForRider = Boolean(realOrder?.delivery_mode === "doorstep" && order.status !== "delivered");

                return (
                  <View key={order.id} style={styles.orderCard}>
                    <View style={styles.orderTop}>
                      <Text style={styles.orderTitle}>Order #{order.id.slice(0, 6)}</Text>
                      <Text style={styles.orderPrice}>{money(Number((order as any).total_mwk ?? 0))}</Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Truck size={14} color="#6f789d" />
                      <Text style={styles.metaText}>{label}</Text>
                    </View>
                    <View style={styles.actionRow}>
                      <Pressable style={styles.ghostBtn} onPress={() => router.push({ pathname: "/(market)/order/[id]", params: { id: order.id } })}>
                        <Text style={styles.ghostBtnText}>Details</Text>
                      </Pressable>
                      <Pressable style={[styles.primaryBtn, waitingForRider && styles.primaryBtnMuted]} onPress={() => void completeOrder(order.id)} disabled={waitingForRider}>
                        <Text style={styles.primaryBtnText}>{waitingForRider ? "Waiting Rider" : "Complete"}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            ) : (
              <EmptyCard text="No pickup or delivery handoffs yet." />
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={styles.emptyCard}>
      <Clock3 size={18} color="#7b84aa" />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1eff9" },
  content: { padding: 18, paddingBottom: 126, gap: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#232c54", fontSize: 35, fontWeight: "900" },
  headerSub: { color: "#7a84aa", fontSize: 13, fontWeight: "800", marginTop: 2 },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#dde0f2",
  },
  segment: {
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#dde0f2",
    padding: 6,
    flexDirection: "row",
    gap: 6,
  },
  segmentBtn: { flex: 1, borderRadius: 14, alignItems: "center", paddingVertical: 10 },
  segmentBtnActive: { backgroundColor: "#283a6b" },
  segmentText: { color: "#697399", fontWeight: "900", fontSize: 13 },
  segmentTextActive: { color: "#fff" },
  heroCard: {
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#dde0f2",
    padding: 16,
    gap: 10,
  },
  heroValue: { color: "#232c54", fontSize: 42, fontWeight: "900" },
  heroSub: { color: "#697399", fontSize: 16, fontWeight: "700" },
  heroHint: { color: "#697399", fontSize: 14, fontWeight: "700", lineHeight: 20, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#dde0f2",
    alignItems: "center",
    paddingVertical: 12,
    gap: 2,
  },
  statValue: { color: "#232c54", fontSize: 20, fontWeight: "900" },
  statLabel: { color: "#7480a3", fontSize: 12, fontWeight: "700" },
  summaryCard: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#dde0f2",
    padding: 16,
    gap: 8,
  },
  summaryTitle: { color: "#232c54", fontSize: 18, fontWeight: "900" },
  summaryLine: { color: "#657195", fontSize: 14, fontWeight: "700" },
  list: { gap: 12 },
  orderCard: {
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#dde0f2",
    padding: 14,
    gap: 10,
  },
  orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  orderTitle: { color: "#232c54", fontSize: 17, fontWeight: "900", flex: 1 },
  orderPrice: { color: "#405484", fontSize: 14, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { color: "#6f789d", fontSize: 13, fontWeight: "700", textTransform: "capitalize" },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "#eceff9",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#6278b5",
  },
  actionRow: { flexDirection: "row", gap: 10 },
  primaryBtn: { flex: 1, borderRadius: 12, backgroundColor: "#2c3f74", alignItems: "center", paddingVertical: 11 },
  primaryBtnMuted: { backgroundColor: "#8d93ae" },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  ghostBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9deef",
    backgroundColor: "#f8f9ff",
    alignItems: "center",
    paddingVertical: 11,
  },
  ghostBtnText: { color: "#374978", fontWeight: "900", fontSize: 14 },
  emptyCard: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#dde0f2",
    paddingVertical: 18,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: { color: "#7b84aa", fontSize: 14, fontWeight: "700" },
});
