import React, { useMemo, useState } from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LogOut, Plus, Search } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import type { OrderRow as SellerDbOrderRow, OrderStatus } from "@/lib/newApp/types";
import { useAuth } from "@/providers/AuthProvider";

type SellerOrderFilter = "all" | "pending" | "preparing" | "ready" | "delivered";

type PreviewOrder = {
  id: string;
  status: OrderStatus;
  total: number;
  title: string;
  campus: string;
  customer: string;
  image_url?: string | null;
};

const PREVIEW_ORDERS: PreviewOrder[] = [
  { id: "preview-1", status: "pending", total: 45000, title: "Study Chair", campus: "MUST Campus Hostel B", customer: "John Banda" },
  { id: "preview-2", status: "preparing", total: 18000, title: "Desk Lamp", campus: "MUST Campus Hostel B", customer: "Campus customer" },
  { id: "preview-3", status: "delivered", total: 5200, title: "Microwave", campus: "Off-campus flats", customer: "Recent customer" },
];

function money(value: number) {
  return `MWK ${Math.round(value).toLocaleString()}`;
}

function filterOrder(status: OrderStatus): SellerOrderFilter {
  if (status === "pending") return "pending";
  if (status === "accepted" || status === "picked_up" || status === "on_the_way") return "ready";
  if (status === "delivered") return "delivered";
  return "preparing";
}

function nextStatus(status: OrderStatus, deliveryMode: "pickup" | "doorstep"): OrderStatus {
  if (deliveryMode === "doorstep" && (status === "accepted" || status === "picked_up" || status === "on_the_way")) return status;
  if (status === "pending") return "preparing";
  if (status === "preparing") return "accepted";
  if (status === "accepted" || status === "picked_up" || status === "on_the_way") return "delivered";
  return status;
}

function statusLabel(status: OrderStatus) {
  if (status === "pending") return "New order";
  if (status === "preparing") return "Preparing";
  if (status === "accepted" || status === "picked_up" || status === "on_the_way") return "Ready";
  if (status === "delivered") return "Delivered";
  return "Cancelled";
}

function deliveryBadgeLabel(status: string | null | undefined) {
  if (!status) return "Awaiting rider";
  return status.replaceAll("_", " ");
}

export default function SellerOrdersPage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { workspace, setOrderStatus } = useSellerWorkspace();
  const [filter, setFilter] = useState<SellerOrderFilter>("all");

  const rows = useMemo(() => {
    const source = workspace.hasVendor ? workspace.orders : PREVIEW_ORDERS;
    return source.filter((row) => {
      if (row.status === "cancelled") return false;
      if (filter === "all") return true;
      return filterOrder(row.status) === filter;
    });
  }, [filter, workspace.hasVendor, workspace.orders]);

  const goToSetup = () => router.push("/(market)/setup");

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="orders" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Orders</Text>
          <View style={styles.headerActions}>
            <CircleIcon icon={<Search size={18} color="#0e2756" />} onPress={() => router.push("/(market)/(tabs)/products")} />
            <CircleIcon icon={<Plus size={18} color="#0e2756" />} onPress={() => (workspace.hasVendor ? router.push("/(market)/add-product") : goToSetup())} />
            <CircleIcon
              icon={<LogOut size={18} color="#0e2756" />}
              onPress={() =>
                Alert.alert("Logout", "Leave the seller workspace?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Logout",
                    style: "destructive",
                    onPress: async () => {
                      await signOut();
                      router.replace("/(auth)/login");
                    },
                  },
                ])
              }
            />
          </View>
        </View>

        <View style={styles.filterRow}>
          {(["all", "pending", "preparing", "ready", "delivered"] as SellerOrderFilter[]).map((value) => {
            const active = value === filter;
            return (
              <Pressable key={value} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(value)}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {value === "all" ? "All" : value === "pending" ? "Pending" : value === "preparing" ? "Preparing" : value === "ready" ? "Ready" : "Delivered"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {rows.length ? (
          <View style={styles.list}>
            {rows.map((order, index) => {
              const isReal = workspace.hasVendor;
              const realOrder = (isReal ? order : null) as SellerDbOrderRow | null;
              const firstItem = isReal ? workspace.orderItemsByOrderId[order.id]?.[0] : null;
              const product = isReal ? workspace.products.find((row) => row.id === firstItem?.item_id) : null;
              const customer = isReal ? workspace.customersById[(order as any).customer_id] : null;
              const image = product?.image_url ?? (isReal ? workspace.products[index % Math.max(workspace.products.length, 1)]?.image_url : null) ?? null;
              const title = isReal ? firstItem?.item_name_snapshot ?? "Order item" : (order as PreviewOrder).title;
              const total = isReal ? Number((order as any).total_mwk) : (order as PreviewOrder).total;
              const campus = isReal ? customer?.campus ?? customer?.area ?? "Campus pickup point" : (order as PreviewOrder).campus;
              const customerName = isReal ? customer?.name ?? "Campus customer" : (order as PreviewOrder).customer;
              const cardStatus = statusLabel(order.status);
              const delivery = isReal ? workspace.deliveriesByOrderId[order.id] : null;
              const handoff = isReal ? workspace.handoffsByOrderId[order.id] : null;
              const nextOrderStatus = realOrder ? nextStatus(realOrder.status, realOrder.delivery_mode) : null;
              const disableAdvance = Boolean(realOrder && nextOrderStatus === realOrder.status && realOrder.delivery_mode === "doorstep");

              return (
                <View key={order.id} style={styles.card}>
                  <View style={styles.cardGlow} />
                  <View style={styles.cardTop}>
                    <View style={styles.cardText}>
                      {order.status === "pending" ? <Text style={styles.newPill}>NEW ORDER</Text> : null}
                      <Text style={styles.itemName}>{title}</Text>
                      <Text style={styles.itemPrice}>{money(total)}</Text>
                      <Text style={styles.itemMeta}>{campus}</Text>
                      <Text style={styles.itemMeta}>Customer: {customerName}</Text>
                    </View>
                    {image ? <Image source={{ uri: image }} style={styles.productImage} /> : <View style={styles.productFallback} />}
                  </View>

                  <View style={styles.cardBottom}>
                    <Text style={styles.customerText}>Customer: {customerName}</Text>
                    {order.status === "pending" ? (
                      <Pressable
                        style={styles.softAction}
                        onPress={() =>
                          isReal
                            ? Alert.alert("Decline order", "Decline this seller order?", [
                                { text: "No", style: "cancel" },
                                { text: "Decline", style: "destructive", onPress: () => void setOrderStatus(order.id, "cancelled") },
                              ])
                            : goToSetup()
                        }
                      >
                        <Text style={styles.softActionText}>Decline</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.statusTag}>
                        <Text style={styles.statusTagText}>{cardStatus}</Text>
                      </View>
                    )}
                  </View>

                  {isReal ? (
                    <View style={styles.metaPillRow}>
                      <View style={styles.metaPill}>
                        <Text style={styles.metaPillLabel}>{realOrder?.delivery_mode === "doorstep" ? `Delivery ${deliveryBadgeLabel(delivery?.status)}` : "Pickup order"}</Text>
                      </View>
                      {handoff?.order_reference ? (
                        <View style={styles.metaPill}>
                          <Text style={styles.metaPillLabel}>{handoff.order_reference}</Text>
                        </View>
                      ) : null}
                      {handoff?.verified_at ? (
                        <View style={[styles.metaPill, styles.metaPillPositive]}>
                          <Text style={[styles.metaPillLabel, styles.metaPillLabelPositive]}>Handoff verified</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {order.status !== "delivered" && order.status !== "cancelled" ? (
                    <View style={styles.actionRow}>
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => (isReal ? router.push({ pathname: "/(market)/order/[id]", params: { id: order.id } }) : goToSetup())}
                      >
                        <Text style={styles.actionBtnText}>View</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionBtn, styles.actionBtnPrimary, disableAdvance && styles.actionBtnDisabled]}
                        onPress={() => {
                          if (!isReal) {
                            goToSetup();
                            return;
                          }
                          if (disableAdvance) return;
                          void setOrderStatus(order.id, nextOrderStatus as OrderStatus);
                        }}
                        disabled={disableAdvance}
                      >
                        <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>
                          {disableAdvance ? "Waiting for Rider" : order.status === "pending" ? "Accept" : order.status === "preparing" ? "Move to Ready" : "Mark Delivered"}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No orders here</Text>
            <Text style={styles.emptySub}>Orders will move across these lanes as you process them.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CircleIcon({ icon, onPress }: { icon: React.ReactNode; onPress: () => void }) {
  return <Pressable style={styles.circleIcon} onPress={onPress}>{icon}</Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f8fc" },
  content: { padding: 18, paddingBottom: 120, gap: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#0e2756", fontSize: 24, fontWeight: "500" },
  headerActions: { flexDirection: "row", gap: 10 },
  circleIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: "#dfe8f5", alignItems: "center", justifyContent: "center" },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.98)", borderWidth: 1, borderColor: "#dfe8f5" },
  filterChipActive: { backgroundColor: "#102a54", borderColor: "#102a54" },
  filterText: { color: "#6a7b98", fontSize: 14, fontWeight: "500" },
  filterTextActive: { color: "#fff" },
  list: { gap: 14 },
  card: { position: "relative", overflow: "hidden", borderRadius: 30, backgroundColor: "rgba(255,255,255,0.98)", borderWidth: 1, borderColor: "#dfe8f5", padding: 18, gap: 14 },
  cardGlow: { position: "absolute", right: -15, top: -16, width: 190, height: 120, borderRadius: 80, backgroundColor: "rgba(214,235,255,0.65)" },
  cardTop: { flexDirection: "row", gap: 14, alignItems: "center" },
  cardText: { flex: 1 },
  newPill: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#ffd7b0", color: "#9b5121", paddingHorizontal: 12, paddingVertical: 6, overflow: "hidden", fontSize: 12, fontWeight: "800", marginBottom: 10 },
  itemName: { color: "#0e2756", fontSize: 18, fontWeight: "700" },
  itemPrice: { color: "#1c3f76", fontSize: 16, fontWeight: "600", marginTop: 8 },
  itemMeta: { color: "#6b7c99", fontSize: 14, fontWeight: "500", marginTop: 6 },
  productImage: { width: 104, height: 104, borderRadius: 24, backgroundColor: "#edf4ff" },
  productFallback: { width: 104, height: 104, borderRadius: 24, backgroundColor: "#edf4ff" },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: "#e8eef8", paddingTop: 14 },
  customerText: { flex: 1, color: "#41567f", fontSize: 15, fontWeight: "500" },
  metaPillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaPill: { borderRadius: 999, backgroundColor: "#eef4ff", borderWidth: 1, borderColor: "#dfe8f5", paddingHorizontal: 12, paddingVertical: 8 },
  metaPillPositive: { backgroundColor: "#e8f7ee", borderColor: "#cfead9" },
  metaPillLabel: { color: "#23457b", fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  metaPillLabelPositive: { color: "#0d7b45" },
  softAction: { borderRadius: 999, backgroundColor: "rgba(255,255,255,0.98)", borderWidth: 1, borderColor: "#dfe8f5", paddingHorizontal: 18, paddingVertical: 12 },
  softActionText: { color: "#0e2756", fontSize: 15, fontWeight: "500" },
  statusTag: { borderRadius: 999, backgroundColor: "#eef4ff", paddingHorizontal: 16, paddingVertical: 10 },
  statusTagText: { color: "#23457b", fontSize: 14, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.98)", borderWidth: 1, borderColor: "#dfe8f5", alignItems: "center", paddingVertical: 12 },
  actionBtnPrimary: { backgroundColor: "#102a54", borderColor: "#102a54" },
  actionBtnDisabled: { backgroundColor: "#7d8aa8", borderColor: "#7d8aa8" },
  actionBtnText: { color: "#0e2756", fontSize: 14, fontWeight: "600" },
  actionBtnTextPrimary: { color: "#fff" },
  emptyCard: { borderRadius: 28, backgroundColor: "rgba(255,255,255,0.98)", borderWidth: 1, borderColor: "#dfe8f5", padding: 18, gap: 6 },
  emptyTitle: { color: "#0e2756", fontSize: 18, fontWeight: "700" },
  emptySub: { color: "#6b7c99", fontSize: 14, fontWeight: "500" },
});
