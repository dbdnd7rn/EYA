import React, { useEffect, useState } from "react";
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, ChevronLeft, MessageCircleMore } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import { listVendorMarketRequests, type MarketInterestRequest } from "@/lib/marketInterest";

export default function SellerBuyersPage() {
  const router = useRouter();
  const { workspace } = useSellerWorkspace();
  const [rows, setRows] = useState<MarketInterestRequest[]>([]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!workspace.vendor?.id) return;
      const next = await listVendorMarketRequests(workspace.vendor.id);
      if (active) setRows(next);
    };
    void run();
    return () => {
      active = false;
    };
  }, [workspace.vendor?.id]);

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="account" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={22} color="#102a54" />
          </Pressable>
          <Text style={styles.title}>Buyers Interested</Text>
          <View style={styles.iconBtn}>
            <Bell size={18} color="#102a54" />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Interested buyers ({rows.length})</Text>
          {rows.length ? rows.map((row) => (
            <View key={row.id} style={styles.row}>
              <Image source={{ uri: row.image }} style={styles.image} />
              <View style={styles.meta}>
                <Text style={styles.name}>{row.customerName}</Text>
                <Text style={styles.item}>{row.itemName}</Text>
                <Text style={styles.sub}>{row.status === "arranged" ? `${row.pickupTimeLabel} • ${row.pickupLocation}` : row.lastMessage}</Text>
              </View>
              <Pressable
                style={styles.messageBtn}
                onPress={() => router.push("/(market)/messages")}
              >
                <MessageCircleMore size={16} color="#102a54" />
                <Text style={styles.messageText}>Message</Text>
              </Pressable>
            </View>
          )) : <Text style={styles.empty}>No buyer interest yet. Student requests will appear here once they start chats or pickups.</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f1fb" },
  content: { padding: 18, paddingBottom: 42, gap: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  title: { color: "#102a54", fontSize: 26, fontWeight: "900" },
  card: { borderRadius: 28, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#ece9fb", padding: 16, gap: 12 },
  cardTitle: { color: "#102a54", fontSize: 20, fontWeight: "900" },
  row: { flexDirection: "row", gap: 12, alignItems: "center", borderRadius: 20, backgroundColor: "#f8faff", borderWidth: 1, borderColor: "#e8edf8", padding: 12 },
  image: { width: 76, height: 76, borderRadius: 18, backgroundColor: "#dde5f4" },
  meta: { flex: 1, gap: 4 },
  name: { color: "#102a54", fontSize: 18, fontWeight: "900" },
  item: { color: "#425b80", fontSize: 15, fontWeight: "800" },
  sub: { color: "#7482a0", fontSize: 13, fontWeight: "700", lineHeight: 19 },
  messageBtn: { borderRadius: 999, borderWidth: 1, borderColor: "#dce4f6", backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center", gap: 6 },
  messageText: { color: "#102a54", fontWeight: "900", fontSize: 12 },
  empty: { color: "#7482a0", fontSize: 14, fontWeight: "700", lineHeight: 20 },
});
