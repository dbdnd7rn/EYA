import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Bell, ChevronLeft, MessageCircle, Package2 } from "lucide-react-native";
import { useAuth } from "@/providers/AuthProvider";
import { listStudentMarketRequests, type MarketInterestRequest } from "@/lib/marketInterest";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

type Filter = "ongoing" | "completed" | "cancelled";

export default function StudentRequestsPage({ contentBottomPadding = 120 }: { contentBottomPadding?: number }) {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useStudentTheme();
  const [rows, setRows] = useState<MarketInterestRequest[]>([]);
  const [filter, setFilter] = useState<Filter>("ongoing");

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!user?.id) return;
      const next = await listStudentMarketRequests(user.id);
      if (active) setRows(next);
    };
    void run();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const filtered = useMemo(() => {
    if (filter === "ongoing") return rows.filter((row) => row.status === "discussing" || row.status === "arranged");
    if (filter === "completed") return rows.filter((row) => row.status === "completed");
    return rows.filter((row) => row.status === "cancelled");
  }, [filter, rows]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.back()}>
            <ChevronLeft size={22} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.heading }]}>My Requests</Text>
          <View style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Bell size={18} color={theme.text} />
          </View>
        </View>

        <View style={[styles.segmented, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          {(["ongoing", "completed", "cancelled"] as Filter[]).map((value) => {
            const active = filter === value;
            return (
              <Pressable key={value} style={[styles.segmentBtn, active && { backgroundColor: theme.accent }]} onPress={() => setFilter(value)}>
                <Text style={[styles.segmentText, { color: theme.textMuted }, active && styles.segmentTextActive]}>{value === "ongoing" ? `Ongoing ${filtered.length && active ? filtered.length : ""}`.trim() : value.charAt(0).toUpperCase() + value.slice(1)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.list}>
          {filtered.length ? (
            filtered.map((row) => (
              <View key={row.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.statusPill, row.status === "arranged" ? styles.statusWarm : row.status === "completed" ? styles.statusCool : styles.statusMuted]}>
                  {row.status === "arranged" ? "Arranged pickup" : row.status === "completed" ? "Pickup complete" : row.status === "cancelled" ? "Cancelled" : "Discussing pickup"}
                </Text>
                <View style={styles.cardBody}>
                  <Image source={{ uri: row.image }} style={styles.image} />
                  <View style={styles.meta}>
                    <Text style={[styles.itemName, { color: theme.text }]}>{row.itemName}</Text>
                    <Text style={[styles.price, { color: theme.text }]}>K{row.priceMwk.toLocaleString("en-MW")}</Text>
                    <Text style={[styles.vendor, { color: theme.textMuted }]}>{row.vendorName}</Text>
                    <Text style={[styles.sub, { color: theme.textSoft }]}>{row.pickupTimeLabel ? `${row.pickupTimeLabel} • ${row.pickupLocation}` : row.lastMessage}</Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <Pressable style={[styles.actionBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} onPress={() => router.push({ pathname: "/(student)/vendor-chat/[vendorId]", params: { vendorId: row.vendorId, requestId: row.id, itemId: row.itemId, itemName: row.itemName, image: row.image, price: String(row.priceMwk), category: row.category, vendorName: row.vendorName, subject: `About ${row.itemName}` } })}>
                    <MessageCircle size={16} color={theme.text} />
                    <Text style={[styles.actionText, { color: theme.text }]}>Open chat</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} onPress={() => router.push({ pathname: "/(student)/requests/[requestId]", params: { requestId: row.id } })}>
                    <Package2 size={16} color={theme.text} />
                    <Text style={[styles.actionText, { color: theme.text }]}>{row.status === "completed" ? "Leave feedback" : "View details"}</Text>
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No requests yet</Text>
              <Text style={[styles.emptySub, { color: theme.textMuted }]}>Mark items as interested or arrange pickup from seller chat to track them here.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  content: { padding: 18, gap: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e7ebf6", alignItems: "center", justifyContent: "center" },
  title: { color: "#102a54", fontSize: 26, fontWeight: "900" },
  segmented: { flexDirection: "row", borderRadius: 24, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e6ebf6", padding: 6 },
  segmentBtn: { flex: 1, borderRadius: 18, paddingVertical: 12, alignItems: "center" },
  segmentBtnActive: { backgroundColor: "#102a54" },
  segmentText: { color: "#60708f", fontWeight: "800", fontSize: 13 },
  segmentTextActive: { color: "#fff" },
  list: { gap: 14 },
  card: { borderRadius: 26, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e7ebf6", padding: 14, gap: 12 },
  statusPill: { alignSelf: "flex-start", borderRadius: 999, overflow: "hidden", paddingHorizontal: 14, paddingVertical: 8, fontSize: 12, fontWeight: "900" },
  statusWarm: { backgroundColor: "#fff1c8", color: "#8d6a00" },
  statusCool: { backgroundColor: "#eaf6ff", color: "#2e7098" },
  statusMuted: { backgroundColor: "#f4f6fb", color: "#6d7892" },
  cardBody: { flexDirection: "row", gap: 12 },
  image: { width: 96, height: 96, borderRadius: 18, backgroundColor: "#dde5f4" },
  meta: { flex: 1, gap: 4 },
  itemName: { color: "#102a54", fontSize: 18, fontWeight: "900" },
  price: { color: "#102a54", fontSize: 16, fontWeight: "900" },
  vendor: { color: "#49607f", fontSize: 14, fontWeight: "800" },
  sub: { color: "#7382a2", fontSize: 13, fontWeight: "700", lineHeight: 19 },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, borderRadius: 999, borderWidth: 1, borderColor: "#e4eaf7", backgroundColor: "#f8faff", paddingVertical: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  actionText: { color: "#102a54", fontWeight: "900", fontSize: 13 },
  emptyCard: { borderRadius: 24, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e7ebf6", padding: 20, gap: 8 },
  emptyTitle: { color: "#102a54", fontWeight: "900", fontSize: 18 },
  emptySub: { color: "#6f7f9c", fontWeight: "700", fontSize: 14, lineHeight: 20 },
});
