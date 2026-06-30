import React, { useEffect, useState } from "react";
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CalendarClock, CheckCircle2, ChevronLeft, MapPin, MessageCircle, XCircle } from "lucide-react-native";
import { getMarketRequestById, setMarketRequestStatus, type MarketInterestRequest } from "@/lib/marketInterest";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

export default function StudentRequestDetailPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const { theme } = useStudentTheme();
  const [request, setRequest] = useState<MarketInterestRequest | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!params.requestId) return;
      const next = await getMarketRequestById(params.requestId);
      if (active) setRequest(next);
    };
    void run();
    return () => {
      active = false;
    };
  }, [params.requestId]);

  if (!request) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={styles.center}><Text style={[styles.title, { color: theme.heading }]}>Request not found</Text></View>
      </SafeAreaView>
    );
  }

  const complete = async () => {
    const next = await setMarketRequestStatus(request.id, "completed", {
      completedAt: new Date().toISOString(),
      lastMessage: "Pickup completed successfully",
    });
    if (next) router.replace({ pathname: "/(student)/feedback/[requestId]", params: { requestId: next.id } });
  };

  const cancel = async () => {
    const next = await setMarketRequestStatus(request.id, "cancelled", { lastMessage: "Request cancelled" });
    if (next) setRequest(next);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.back()}>
            <ChevronLeft size={22} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.heading }]}>{request.status === "completed" ? "Pickup Confirmed" : "Pickup Details"}</Text>
          <View style={[styles.iconBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} />
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.heroRow}>
            <Image source={{ uri: request.image }} style={styles.image} />
            <View style={styles.meta}>
              <Text style={[styles.itemName, { color: theme.text }]}>{request.itemName}</Text>
              <Text style={[styles.price, { color: theme.text }]}>K{request.priceMwk.toLocaleString("en-MW")}</Text>
              <Text style={[styles.vendor, { color: theme.textMuted }]}>{request.vendorName}</Text>
              <Text style={[styles.sub, { color: theme.textSoft }]}>{request.category} • {request.condition}</Text>
            </View>
          </View>
          <Text style={[styles.banner, request.status === "completed" ? styles.bannerCool : styles.bannerWarm]}>
            {request.status === "completed" ? "Pickup successfully completed" : request.status === "arranged" ? "Pickup arranged for today" : "Discussing pickup"}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Pickup details</Text>
          <InfoRow icon={<CalendarClock size={16} color={theme.text} />} label={request.pickupTimeLabel || "Tomorrow at 11:00 AM"} />
          <InfoRow icon={<MapPin size={16} color={theme.text} />} label={request.pickupLocation || "Campus Library Entrance"} />
          <Text style={[styles.note, { color: theme.textMuted }]}>{request.pickupNote || "Keep the meetup simple. Use chat if you need to reschedule."}</Text>
          <View style={styles.actions}>
            <Pressable style={[styles.actionBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} onPress={() => router.push({ pathname: "/(student)/vendor-chat/[vendorId]", params: { vendorId: request.vendorId, requestId: request.id, itemId: request.itemId, itemName: request.itemName, image: request.image, price: String(request.priceMwk), category: request.category, vendorName: request.vendorName, subject: `Pickup for ${request.itemName}` } })}>
              <MessageCircle size={16} color={theme.text} />
              <Text style={[styles.actionText, { color: theme.text }]}>Open chat</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} onPress={() => router.push({ pathname: "/(student)/market/[id]", params: { id: request.itemId } })}>
              <Text style={[styles.actionText, { color: theme.text }]}>View product</Text>
            </Pressable>
          </View>
        </View>

        {request.status !== "completed" ? (
          <View style={styles.actions}>
            <Pressable style={[styles.primaryBtn, { backgroundColor: theme.accent }]} onPress={complete}>
              <CheckCircle2 size={18} color="#fff" />
              <Text style={styles.primaryText}>Mark as complete</Text>
            </Pressable>
            <Pressable style={[styles.secondaryBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={cancel}>
              <XCircle size={18} color="#b5485f" />
              <Text style={styles.secondaryText}>Cancel pickup</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={[styles.primaryWideBtn, { backgroundColor: theme.accent }]} onPress={() => router.replace({ pathname: "/(student)/feedback/[requestId]", params: { requestId: request.id } })}>
            <Text style={styles.primaryText}>Leave feedback</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label }: { icon: React.ReactNode; label: string }) {
  const { theme } = useStudentTheme();
  return <View style={styles.infoRow}>{icon}<Text style={[styles.infoText, { color: theme.textMuted }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  content: { padding: 18, paddingBottom: 40, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e7ebf6", alignItems: "center", justifyContent: "center" },
  title: { color: "#102a54", fontWeight: "900", fontSize: 24 },
  card: { borderRadius: 26, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e7ebf6", padding: 14, gap: 12 },
  heroRow: { flexDirection: "row", gap: 12 },
  image: { width: 104, height: 104, borderRadius: 20, backgroundColor: "#dde5f4" },
  meta: { flex: 1, gap: 4 },
  itemName: { color: "#102a54", fontSize: 22, fontWeight: "900" },
  price: { color: "#102a54", fontSize: 18, fontWeight: "900" },
  vendor: { color: "#4f6786", fontSize: 15, fontWeight: "800" },
  sub: { color: "#7d8ba7", fontSize: 13, fontWeight: "700" },
  banner: { borderRadius: 999, overflow: "hidden", paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, fontWeight: "900" },
  bannerWarm: { backgroundColor: "#fff3ce", color: "#8d6a00" },
  bannerCool: { backgroundColor: "#e9f7ff", color: "#2e7098" },
  sectionTitle: { color: "#102a54", fontSize: 18, fontWeight: "900" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoText: { color: "#425c7b", fontSize: 15, fontWeight: "700" },
  note: { color: "#7382a2", fontSize: 13, fontWeight: "700", lineHeight: 20 },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, borderRadius: 999, borderWidth: 1, borderColor: "#e3e8f5", backgroundColor: "#f8faff", paddingVertical: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  actionText: { color: "#102a54", fontWeight: "900", fontSize: 13 },
  primaryBtn: { flex: 1, borderRadius: 999, backgroundColor: "#102a54", paddingVertical: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryWideBtn: { borderRadius: 999, backgroundColor: "#102a54", paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  secondaryBtn: { flex: 1, borderRadius: 999, borderWidth: 1, borderColor: "#f0cfd7", backgroundColor: "#fff", paddingVertical: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  secondaryText: { color: "#b5485f", fontWeight: "900", fontSize: 15 },
});
