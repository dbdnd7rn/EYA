import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, CircleEllipsis, Clock3, MapPin, MessageCircleMore, PackagePlus, ShoppingBag, Users } from "lucide-react-native";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import type { OrderItemRow, OrderRow, OrderStatus } from "@/lib/newApp/types";
import { getSellerStorefrontMeta } from "@/lib/sellerStorefront";
import { useAuth } from "@/providers/AuthProvider";

type StorefrontSnapshot = {
  avatarUrl: string | null;
};

type PreviewOrder = {
  id: string;
  title: string;
  place: string;
  status: OrderStatus;
  minsLeft: number;
  total_mwk: number;
  image_url: string | null;
};

const PREVIEW_ORDERS: PreviewOrder[] = [
  { id: "1023", title: "Burger + Chips", place: "MUST Campus", status: "preparing", minsLeft: 12, total_mwk: 12450, image_url: null },
  { id: "1022", title: "Fried Chicken + Salad", place: "Polytechnic", status: "accepted", minsLeft: 6, total_mwk: 9800, image_url: null },
  { id: "1021", title: "Fried Chicken + Salad", place: "Polytechnic", status: "accepted", minsLeft: 4, total_mwk: 11100, image_url: null },
];

function money(value: number) {
  return `MWK ${Math.round(value).toLocaleString()}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function statusBucket(status: OrderStatus) {
  if (status === "pending" || status === "preparing") return "preparing";
  if (status === "accepted") return "ready";
  if (status === "picked_up" || status === "on_the_way") return "delivering";
  if (status === "delivered") return "delivered";
  return "other";
}

function statusLabel(status: OrderStatus) {
  const bucket = statusBucket(status);
  if (bucket === "preparing") return "Preparing";
  if (bucket === "ready") return "Ready";
  if (bucket === "delivering") return "Delivering";
  if (bucket === "delivered") return "Delivered";
  return "New";
}

function nextStatus(status: OrderStatus) {
  if (status === "pending" || status === "preparing") return "accepted";
  if (status === "accepted" || status === "picked_up" || status === "on_the_way") return "delivered";
  return status;
}

function actionLabel(status: OrderStatus) {
  const bucket = statusBucket(status);
  if (bucket === "preparing") return "Mark Ready";
  if (bucket === "ready" || bucket === "delivering") return "Mark Delivered";
  return "View Order";
}

function prepMinutes(createdAt: string) {
  const elapsed = Math.max(1, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (elapsed <= 8) return 8;
  if (elapsed <= 12) return 12;
  if (elapsed <= 18) return 18;
  if (elapsed <= 24) return 24;
  return 30;
}

function minsLeftForOrder(order: OrderRow) {
  const bucket = statusBucket(order.status);
  if (bucket === "preparing") return Math.max(4, 18 - prepMinutes(order.created_at));
  if (bucket === "ready") return 6;
  if (bucket === "delivering") return 4;
  return 0;
}

function imageBadge(title: string) {
  const text = title.toLowerCase();
  if (text.includes("burger")) return "BG";
  if (text.includes("chicken")) return "CK";
  if (text.includes("salad")) return "SD";
  if (text.includes("pizza")) return "PZ";
  if (text.includes("rice")) return "RC";
  return "FD";
}

export default function SellerDashboardPage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { workspace, metrics, setOrderStatus } = useSellerWorkspace();
  const [storefront, setStorefront] = useState<StorefrontSnapshot>({ avatarUrl: null });

  const sellerName = workspace.vendor?.name || workspace.profile.displayName || "Chima's Kitchen";
  const todayRevenue = workspace.hasVendor
    ? workspace.orders
        .filter((row) => new Date(row.created_at).toDateString() === new Date().toDateString())
        .reduce((sum, row) => sum + Number(row.total_mwk), 0)
    : 35010;
  const todayOrders = workspace.hasVendor ? metrics.ordersToday : 12;

  const liveCards = useMemo(() => {
    if (!workspace.hasVendor) return PREVIEW_ORDERS;

    return workspace.orders
      .filter((row) => row.status !== "cancelled" && row.status !== "delivered")
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3)
      .map((order) => {
        const item: OrderItemRow | undefined = workspace.orderItemsByOrderId[order.id]?.[0];
        const customer = workspace.customersById[order.customer_id];
        const product = item ? workspace.products.find((row) => row.id === item.item_id) : null;
        return {
          id: order.id,
          title: item?.item_name_snapshot ?? "Order item",
          place: customer?.campus ?? customer?.area ?? workspace.vendor?.campus ?? "Campus",
          status: order.status,
          minsLeft: minsLeftForOrder(order),
          total_mwk: Number(order.total_mwk),
          image_url: product?.image_url ?? null,
        };
      });
  }, [workspace]);

  const preparingCount = workspace.hasVendor ? workspace.orders.filter((row) => statusBucket(row.status) === "preparing").length : 3;
  const readyCount = workspace.hasVendor ? workspace.orders.filter((row) => statusBucket(row.status) === "ready").length : 2;
  const deliveringCount = workspace.hasVendor ? workspace.orders.filter((row) => statusBucket(row.status) === "delivering").length : 2;
  const avgPrep = workspace.hasVendor
    ? Math.max(
        8,
        Math.round(
          (workspace.orders.filter((row) => row.status !== "cancelled").reduce((sum, row) => sum + prepMinutes(row.created_at), 0) || 0)
            / Math.max(workspace.orders.filter((row) => row.status !== "cancelled").length, 1),
        ),
      )
    : 18;

  const quickActions = [
    {
      label: "Add Item",
      badge: String(workspace.hasVendor ? Math.max(metrics.productsListed, 0) : 3),
      icon: <PackagePlus size={18} color="#435487" />,
      onPress: () => router.push("/(market)/add-product"),
    },
    {
      label: "Messages",
      badge: String(workspace.hasVendor ? workspace.conversations.length : 1),
      icon: <MessageCircleMore size={18} color="#435487" />,
      onPress: () => router.push("/(market)/messages"),
    },
    {
      label: "Customers",
      badge: String(workspace.hasVendor ? Object.keys(workspace.customersById).length : 2),
      icon: <Users size={18} color="#435487" />,
      onPress: () => router.push("/(market)/buyers"),
    },
    {
      label: "Orders",
      badge: String(workspace.hasVendor ? workspace.orders.filter((row) => row.status !== "cancelled").length : 2),
      icon: <ShoppingBag size={18} color="#435487" />,
      onPress: () => router.push("/(market)/(tabs)/orders"),
    },
  ];

  useEffect(() => {
    let active = true;
    const loadStorefront = async () => {
      if (!workspace.vendor?.id) {
        setStorefront({ avatarUrl: null });
        return;
      }
      const meta = await getSellerStorefrontMeta(workspace.vendor.id).catch(() => null);
      if (!active) return;
      setStorefront({ avatarUrl: meta?.avatarUrl ?? null });
    };
    void loadStorefront();
    return () => {
      active = false;
    };
  }, [workspace.vendor?.id]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroShell}>
          <View style={styles.heroTopRow}>
            <View style={styles.identityRow}>
              {storefront.avatarUrl ? (
                <Image source={{ uri: storefront.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{initials(sellerName) || "RK"}</Text>
                </View>
              )}
              <View style={styles.identityCopy}>
                <View style={styles.identityTitleRow}>
                  <Text style={styles.identityName}>{sellerName}</Text>
                  <View style={styles.onlineDot} />
                </View>
                <Text style={styles.identitySub}>Manage incoming orders</Text>
              </View>
            </View>

            <Pressable style={styles.menuBtn} onPress={() => router.push("/(market)/(tabs)/account")}>
              <CircleEllipsis size={22} color="#ffffff" />
            </Pressable>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroGradientOne} />
            <View style={styles.heroGradientTwo} />
            <Text style={styles.todayLabel}>TODAY</Text>
            <Text style={styles.heroValue}>{money(todayRevenue)}</Text>
            <View style={styles.heroMetaRow}>
              <View style={styles.heroMetaPill}>
                <ShoppingBag size={14} color="#ffffff" />
                <Text style={styles.heroMetaText}>{todayOrders} Orders</Text>
              </View>
              <View style={styles.heroMetaDot} />
              <View style={styles.heroMetaPill}>
                <Clock3 size={14} color="#ffffff" />
                <Text style={styles.heroMetaText}>Avg prep {avgPrep} mins</Text>
              </View>
            </View>

            <View style={styles.statusRail}>
              <StatusChip label="Preparing" value={preparingCount} tone="orange" />
              <StatusChip label="Ready" value={readyCount} tone="blue" />
              <StatusChip label="Delivering" value={deliveringCount} tone="dark" />
            </View>
          </View>
        </View>

        <View style={styles.ordersList}>
          {liveCards.map((order) => {
            const status = statusLabel(order.status);
            const cta = actionLabel(order.status);
            const next = nextStatus(order.status);
            const muted = next === order.status;

            return (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderCardGlow} />
                <View style={styles.orderHead}>
                  <Text style={styles.orderId}>Order #{String(order.id).slice(0, 4)}</Text>
                  <View
                    style={[
                      styles.orderStatusPill,
                      status === "Preparing"
                        ? styles.orderStatusPreparing
                        : status === "Ready"
                          ? styles.orderStatusReady
                          : styles.orderStatusDelivering,
                    ]}
                  >
                    <Text
                      style={[
                        styles.orderStatusText,
                        status === "Preparing"
                          ? styles.orderStatusTextPreparing
                          : status === "Ready"
                            ? styles.orderStatusTextReady
                            : styles.orderStatusTextDelivering,
                      ]}
                    >
                      {status}
                    </Text>
                  </View>
                </View>

                <View style={styles.orderBody}>
                  {order.image_url ? (
                    <Image source={{ uri: order.image_url }} style={styles.orderThumb} />
                  ) : (
                    <View style={styles.orderThumbFallback}>
                      <Text style={styles.orderThumbEmoji}>{imageBadge(order.title)}</Text>
                    </View>
                  )}

                  <View style={styles.orderCopy}>
                    <Text style={styles.orderTitle}>{order.title}</Text>
                    <View style={styles.orderMetaRow}>
                      <MapPin size={14} color="#55618a" />
                      <Text style={styles.orderMeta}>{order.place}</Text>
                    </View>
                    {order.minsLeft > 0 ? (
                      <View style={styles.orderMetaRow}>
                        <Clock3 size={14} color="#293560" />
                        <Text style={styles.orderTime}>{order.minsLeft} mins left</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.orderActions}>
                    <Pressable
                      style={[
                        styles.orderActionBtn,
                        status === "Preparing" ? styles.orderActionOrange : styles.orderActionGreen,
                        muted && styles.orderActionMuted,
                      ]}
                      onPress={() => {
                        if (muted) {
                          router.push("/(market)/(tabs)/orders");
                          return;
                        }
                        void setOrderStatus(order.id, next);
                      }}
                    >
                      <Text style={styles.orderActionText}>{cta}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.quickCard}>
          <Text style={styles.quickTitle}>Quick Actions</Text>
          <View style={styles.quickGrid}>
            {quickActions.map((action) => (
              <Pressable key={action.label} style={styles.quickItem} onPress={action.onPress}>
                <View style={styles.quickIconWrap}>{action.icon}</View>
                <Text style={styles.quickLabel}>{action.label}</Text>
                <View style={styles.quickBadge}>
                  <Text style={styles.quickBadgeText}>{action.badge}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.footerActions}>
          <Pressable style={styles.footerGhostBtn} onPress={() => router.push("/(market)/notifications")}>
            <Bell size={18} color="#31416f" />
            <Text style={styles.footerGhostText}>Notifications</Text>
          </Pressable>
          <Pressable
            style={styles.footerGhostBtn}
            onPress={() =>
              Alert.alert("Logout", "Leave the restaurant workspace?", [
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
          >
            <Text style={styles.footerGhostText}>Log out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "orange" | "blue" | "dark";
}) {
  return (
    <View
      style={[
        styles.statusChip,
        tone === "orange" ? styles.statusChipOrange : tone === "blue" ? styles.statusChipBlue : styles.statusChipDark,
      ]}
    >
      <Text style={styles.statusChipText}>
        {label} {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef1ff" },
  content: { padding: 16, paddingBottom: 120, gap: 18 },

  heroShell: {
    borderRadius: 36,
    padding: 16,
    gap: 16,
    backgroundColor: "#1b234e",
    shadowColor: "#182048",
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatarImage: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" },
  avatarFallback: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: { color: "#1b234e", fontSize: 20, fontWeight: "900" },
  identityCopy: { flex: 1 },
  identityTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  identityName: { color: "#ffffff", fontSize: 20, fontWeight: "900", flexShrink: 1 },
  onlineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#63d38a", borderWidth: 2, borderColor: "#dff4e6" },
  identitySub: { color: "#a8afd2", fontSize: 14, fontWeight: "600", marginTop: 4 },
  menuBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },

  heroCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    gap: 10,
  },
  heroGradientOne: {
    position: "absolute",
    left: -30,
    top: -18,
    width: 250,
    height: 180,
    borderRadius: 120,
    backgroundColor: "rgba(145,157,255,0.18)",
  },
  heroGradientTwo: {
    position: "absolute",
    right: -40,
    top: 8,
    width: 190,
    height: 160,
    borderRadius: 90,
    backgroundColor: "rgba(16,23,61,0.55)",
  },
  todayLabel: { color: "#ffffff", fontSize: 15, fontWeight: "800", letterSpacing: 0.6 },
  heroValue: { color: "#ffffff", fontSize: 32, fontWeight: "900" },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  heroMetaPill: { flexDirection: "row", alignItems: "center", gap: 6 },
  heroMetaText: { color: "#edf0ff", fontSize: 14, fontWeight: "700" },
  heroMetaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.44)" },
  statusRail: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  statusChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  statusChipOrange: { backgroundColor: "#d68038" },
  statusChipBlue: { backgroundColor: "#313d79" },
  statusChipDark: { backgroundColor: "#28335f" },
  statusChipText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },

  ordersList: { gap: 14 },
  orderCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#dde3f4",
    padding: 16,
    gap: 12,
    shadowColor: "#bcc5e6",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  orderCardGlow: {
    position: "absolute",
    right: -18,
    top: -10,
    width: 220,
    height: 120,
    borderRadius: 120,
    backgroundColor: "rgba(238,241,255,0.9)",
  },
  orderHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  orderId: { color: "#1a2552", fontSize: 18, fontWeight: "900" },
  orderStatusPill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  orderStatusPreparing: { backgroundColor: "#f7dcc8" },
  orderStatusReady: { backgroundColor: "#485f9b" },
  orderStatusDelivering: { backgroundColor: "#6c9374" },
  orderStatusText: { fontSize: 12, fontWeight: "900" },
  orderStatusTextPreparing: { color: "#8a4f28" },
  orderStatusTextReady: { color: "#ffffff" },
  orderStatusTextDelivering: { color: "#ffffff" },
  orderBody: { flexDirection: "row", alignItems: "center", gap: 12 },
  orderThumb: { width: 68, height: 68, borderRadius: 20, backgroundColor: "#edf2ff" },
  orderThumbFallback: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1ede7",
  },
  orderThumbEmoji: { fontSize: 22, fontWeight: "900", color: "#3d4672" },
  orderCopy: { flex: 1, gap: 6 },
  orderTitle: { color: "#1b2550", fontSize: 16, fontWeight: "900" },
  orderMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  orderMeta: { color: "#55618a", fontSize: 13, fontWeight: "600" },
  orderTime: { color: "#1d2652", fontSize: 13, fontWeight: "800" },
  orderActions: { justifyContent: "center" },
  orderActionBtn: {
    minWidth: 132,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  orderActionOrange: { backgroundColor: "#ff7d23" },
  orderActionGreen: { backgroundColor: "#688f71" },
  orderActionMuted: { backgroundColor: "#7f89a4" },
  orderActionText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },

  quickCard: {
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#dde3f4",
    padding: 16,
    gap: 14,
  },
  quickTitle: { color: "#1b2550", fontSize: 18, fontWeight: "900" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  quickItem: {
    width: "48%",
    borderRadius: 22,
    backgroundColor: "#f8f9ff",
    borderWidth: 1,
    borderColor: "#e4e8f5",
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  quickIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf1ff",
  },
  quickLabel: { flex: 1, color: "#27335f", fontSize: 14, fontWeight: "800" },
  quickBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4b5f98",
    paddingHorizontal: 8,
  },
  quickBadgeText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },

  footerActions: { flexDirection: "row", gap: 12 },
  footerGhostBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "#dde3f4",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  footerGhostText: { color: "#31416f", fontSize: 14, fontWeight: "800" },
});
