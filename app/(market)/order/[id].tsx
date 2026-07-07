import React, { useMemo } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import type { OrderStatus } from "@/lib/newApp/types";

function money(value: number) {
  return `MWK ${Math.round(value).toLocaleString()}`;
}

function formatOrderTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function nextSellerOrderStatus(status: OrderStatus, deliveryMode: "pickup" | "doorstep") {
  if (deliveryMode === "doorstep" && (status === "accepted" || status === "picked_up" || status === "on_the_way")) return status;
  if (status === "pending" || status === "preparing") return "accepted";
  if (status === "accepted") return "picked_up";
  if (status === "picked_up" || status === "on_the_way") return "delivered";
  return status;
}

function sellerOrderActionLabel(status: OrderStatus, deliveryMode: "pickup" | "doorstep") {
  if (deliveryMode === "doorstep" && (status === "accepted" || status === "picked_up" || status === "on_the_way")) return "Waiting for rider";
  if (status === "pending" || status === "preparing") return "Accept order";
  if (status === "accepted") return "Mark picked up";
  if (status === "picked_up" || status === "on_the_way") return "Mark delivered";
  if (status === "delivered") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Update order";
}

function formatDeliveryStatus(status: string | null | undefined) {
  if (!status) return "Awaiting rider";
  return status.replaceAll("_", " ");
}

export default function SellerOrderDetailsPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { workspace, setOrderStatus } = useSellerWorkspace("food");

  const order = useMemo(() => workspace.orders.find((row) => row.id === params.id), [params.id, workspace.orders]);
  const items = order ? workspace.orderItemsByOrderId[order.id] ?? [] : [];
  const firstProduct = items[0] ? workspace.products.find((row) => row.id === items[0].item_id) : null;
  const firstProductImage = firstProduct?.image_urls?.[0] ?? firstProduct?.image_url;
  const customer = order ? workspace.customersById[order.customer_id] : null;
  const delivery = order ? workspace.deliveriesByOrderId[order.id] : null;
  const handoff = order ? workspace.handoffsByOrderId[order.id] : null;
  const nextStatus = nextSellerOrderStatus(order?.status ?? "pending", order?.delivery_mode ?? "pickup");
  const statusActionDisabled = Boolean(order && nextStatus === order.status && order.delivery_mode === "doorstep");

  if (!order) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="orders" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ChevronLeft size={22} color="#102a54" />
          </Pressable>
          <Text style={styles.title}>Order Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.orderNo}>Order #{order.id.slice(0, 6)}</Text>
            <View style={[styles.statusPill, order.status === "cancelled" ? styles.statusPillCancelled : order.status === "delivered" ? styles.statusPillDelivered : styles.statusPillPreparing]}>
              <Text style={[styles.statusPillText, order.status === "cancelled" ? styles.statusTextCancelled : order.status === "delivered" ? styles.statusTextDelivered : styles.statusTextPreparing]}>
                {order.status.replaceAll("_", " ")}
              </Text>
            </View>
          </View>
          <Text style={styles.timestampText}>Placed {formatOrderTime(order.created_at)}</Text>

          <View style={styles.itemRow}>
            {firstProductImage ? <Image source={{ uri: firstProductImage }} style={styles.image} /> : <View style={styles.imageFallback} />}
            <View style={styles.itemMeta}>
              <Text style={styles.itemName}>{items[0]?.item_name_snapshot ?? "Order item"}</Text>
              <Text style={styles.itemPrice}>{money(Number(order.total_mwk))} | x{items[0]?.quantity ?? 1}</Text>
            </View>
          </View>

          {items.length > 1 ? (
            <View style={styles.itemList}>
              {items.map((item) => (
                <View key={item.id} style={styles.itemLine}>
                  <Text style={styles.itemLineName}>{item.item_name_snapshot}</Text>
                  <Text style={styles.itemLineMeta}>x{item.quantity} | {money(Number(item.line_total_mwk))}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.divider} />
          <Text style={styles.total}>Total: {money(Number(order.total_mwk))}</Text>

          <View style={styles.metaGroup}>
            <Text style={styles.groupTitle}>Customer Info</Text>
            <Text style={styles.groupLine}>{customer?.name ?? "Campus customer"}</Text>
            {customer?.phone ? <Text style={styles.groupLine}>{customer.phone}</Text> : null}
            <Text style={styles.groupLine}>{customer?.campus ?? customer?.area ?? "Campus"}</Text>
            <Text style={styles.groupLine}>{order.dropoff_notes ?? order.pickup_notes ?? "Delivery location will appear here."}</Text>
          </View>

          <View style={styles.metaGroup}>
            <Text style={styles.groupTitle}>Delivery Address</Text>
            <Text style={styles.groupLine}>{order.dropoff_notes ?? "Pickup order"}</Text>
            <Text style={styles.groupLine}>{workspace.vendor?.area ?? workspace.vendor?.campus ?? "Blantyre"}</Text>
          </View>

          <View style={styles.metaGroup}>
            <Text style={styles.groupTitle}>Delivery Tracking</Text>
            <Text style={styles.groupLine}>{order.delivery_mode === "doorstep" ? `Rider status: ${formatDeliveryStatus(delivery?.status)}` : "Customer pickup order"}</Text>
            {handoff?.order_reference ? <Text style={styles.groupLine}>Reference: {handoff.order_reference}</Text> : null}
            {delivery?.delivered_at ? <Text style={styles.groupLine}>Delivered: {formatOrderTime(delivery.delivered_at)}</Text> : null}
            {handoff?.verified_at ? (
              <Text style={styles.groupLine}>
                Handoff confirmed via {handoff.verification_method?.replaceAll("_", " ") ?? "verification"} at {formatOrderTime(handoff.verified_at)}
              </Text>
            ) : (
              <Text style={styles.groupLine}>Handoff not verified yet.</Text>
            )}
          </View>

          {order.status !== "cancelled" ? (
            <View style={styles.actionRow}>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() =>
                  Alert.alert("Cancel order", "Cancel this order from the seller workspace?", [
                    { text: "No", style: "cancel" },
                    { text: "Cancel order", style: "destructive", onPress: () => void setOrderStatus(order.id, "cancelled") },
                  ])
                }
              >
                <Text style={styles.secondaryBtnText}>Cancel order</Text>
              </Pressable>

              <Pressable
                style={[styles.primaryBtn, statusActionDisabled && styles.primaryBtnMuted]}
                onPress={() => {
                  if (statusActionDisabled) return;
                  void setOrderStatus(order.id, nextStatus);
                }}
                disabled={statusActionDisabled}
              >
                <Text style={styles.primaryBtnText}>{sellerOrderActionLabel(order.status, order.delivery_mode)}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.cancelledCard}>
              <Text style={styles.cancelledText}>This order has been cancelled.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f1fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 42, gap: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  title: { color: "#102a54", fontSize: 26, fontWeight: "900" },
  headerSpacer: { width: 42, height: 42 },
  emptyTitle: { color: "#102a54", fontSize: 22, fontWeight: "900" },
  card: {
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 18,
    gap: 16,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  orderNo: { color: "#102a54", fontWeight: "900", fontSize: 20 },
  timestampText: { color: "#6d7a99", fontWeight: "700", fontSize: 13 },
  statusPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  statusPillPreparing: { backgroundColor: "#e6eeff" },
  statusPillDelivered: { backgroundColor: "#dff7eb" },
  statusPillCancelled: { backgroundColor: "#fff2f7" },
  statusPillText: { fontWeight: "900", fontSize: 12, textTransform: "capitalize" },
  statusTextPreparing: { color: "#4869a1" },
  statusTextDelivered: { color: "#0d7b45" },
  statusTextCancelled: { color: "#ff0f64" },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  image: { width: 82, height: 82, borderRadius: 20, backgroundColor: "#eef3ff" },
  imageFallback: { width: 82, height: 82, borderRadius: 20, backgroundColor: "#eef3ff" },
  itemMeta: { flex: 1, gap: 5 },
  itemName: { color: "#102a54", fontWeight: "900", fontSize: 22 },
  itemPrice: { color: "#6d7a99", fontWeight: "800", fontSize: 15 },
  itemList: { gap: 10 },
  itemLine: {
    borderRadius: 16,
    backgroundColor: "#f7f8fe",
    borderWidth: 1,
    borderColor: "#e8ecf8",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  itemLineName: { color: "#102a54", fontWeight: "800", fontSize: 15 },
  itemLineMeta: { color: "#6d7a99", fontWeight: "700", fontSize: 13 },
  divider: { borderTopWidth: 1, borderTopColor: "#edf0fa" },
  total: { color: "#102a54", fontWeight: "900", fontSize: 22 },
  metaGroup: { gap: 5 },
  groupTitle: { color: "#102a54", fontWeight: "900", fontSize: 16 },
  groupLine: { color: "#6d7a99", fontWeight: "700", fontSize: 14 },
  actionRow: { flexDirection: "row", gap: 10 },
  primaryBtn: { flex: 1, borderRadius: 18, backgroundColor: "#102a54", alignItems: "center", paddingVertical: 16 },
  primaryBtnMuted: { backgroundColor: "#7d8aa8" },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  secondaryBtn: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "#fff2f7",
    borderWidth: 1,
    borderColor: "#ffd6e4",
    alignItems: "center",
    paddingVertical: 16,
  },
  secondaryBtnText: { color: "#ff0f64", fontWeight: "900", fontSize: 16 },
  cancelledCard: {
    borderRadius: 18,
    backgroundColor: "#f5f7fd",
    borderWidth: 1,
    borderColor: "#e7ebf6",
    alignItems: "center",
    paddingVertical: 16,
  },
  cancelledText: { color: "#6d7a99", fontWeight: "800", fontSize: 15 },
});
