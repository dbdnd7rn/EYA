import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Bell, CircleHelp, MessageCircle, Plus, ShieldCheck } from "lucide-react-native";
import TopNav from "@/components/TopNav";
import { useNotificationInbox } from "@/providers/NotificationInboxProvider";

function ActionCard({
  copy,
  icon,
  title,
  onPress,
}: {
  copy: string;
  icon: React.ReactNode;
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]} onPress={onPress}>
      <View style={styles.actionIcon}>{icon}</View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionCopy}>{copy}</Text>
    </Pressable>
  );
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { unreadCount } = useNotificationInbox();

  return (
    <SafeAreaView style={styles.root}>
      <TopNav title="Landlord Access" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.statusPill}>
            <ShieldCheck size={14} color="#0b6b3d" />
            <Text style={styles.statusText}>Free access is active</Text>
          </View>
          <Text style={styles.title}>Your landlord workspace is fully open.</Text>
          <Text style={styles.sub}>
            Create listings, manage enquiries, and keep conversations moving without subscription restrictions.
          </Text>
        </View>

        <View style={styles.grid}>
          <ActionCard
            icon={<Plus size={18} color="#ff0f64" />}
            title="Create listing"
            copy="Publish another room or bedsitter."
            onPress={() => router.push("/(landlord)/(tabs)/create")}
          />
          <ActionCard
            icon={<MessageCircle size={18} color="#1f2f68" />}
            title="Open enquiries"
            copy="Reply to students and keep leads warm."
            onPress={() => router.push("/(landlord)/(tabs)/enquiries")}
          />
          <ActionCard
            icon={<Bell size={18} color="#1f2f68" />}
            title={unreadCount > 0 ? `Notifications (${unreadCount > 99 ? "99+" : unreadCount})` : "Notifications"}
            copy="Check landlord alerts and message activity."
            onPress={() => router.push("/(landlord)/notifications")}
          />
          <ActionCard
            icon={<CircleHelp size={18} color="#1f2f68" />}
            title="Support"
            copy="Get help with account access or listing issues."
            onPress={() =>
              router.push({
                pathname: "/support",
                params: {
                  type: "message_us",
                  subject: "Landlord support",
                  prefill: "I need help with my landlord workspace.",
                },
              } as any)
            }
          />
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Payments and payout note</Text>
          <Text style={styles.noteCopy}>
            Landlord listings stay free. If you need help with escrow, payment issues, or account verification, use the
            support action above so the team can trace the exact case.
          </Text>
          <Pressable style={styles.softBtn} onPress={() => router.push("/(landlord)/(tabs)/dashboard")}>
            <Text style={styles.softBtnText}>Back to dashboard</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8f5ff" },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  heroCard: {
    backgroundColor: "#1f2f68",
    borderRadius: 28,
    padding: 18,
    gap: 10,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  title: { color: "#fff", fontSize: 24, fontWeight: "900", lineHeight: 30 },
  sub: { color: "rgba(255,255,255,0.78)", fontWeight: "700", lineHeight: 21 },
  grid: { gap: 12 },
  actionCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#ebe7fb",
    padding: 16,
    gap: 8,
  },
  actionCardPressed: { opacity: 0.9 },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff0f6",
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { color: "#1f2f68", fontSize: 16, fontWeight: "900" },
  actionCopy: { color: "#677399", fontWeight: "700", lineHeight: 20 },
  noteCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "#ebe7fb",
  },
  noteTitle: { color: "#1f2f68", fontSize: 17, fontWeight: "900" },
  noteCopy: { color: "#5f6b85", fontWeight: "700", lineHeight: 20 },
  softBtn: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e1e4ef",
    backgroundColor: "#f8f7ff",
    paddingVertical: 12,
    alignItems: "center",
  },
  softBtnText: { color: "#1f2f68", fontWeight: "900" },
});
