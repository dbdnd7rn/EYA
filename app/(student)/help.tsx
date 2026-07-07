import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Bell, ChevronRight, Home, LifeBuoy, MapPin, MessageCircle, ShieldCheck, ShoppingBag, UtensilsCrossed } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

type HelpTopic = {
  title: string;
  text: string;
  subject: string;
  prefill: string;
  icon: React.ReactNode;
  tint: string;
};

const helpTopics: HelpTopic[] = [
  {
    title: "Orders and delivery",
    text: "Late delivery, wrong item, handoff code, refund question, or tracking problem.",
    subject: "Order or delivery help",
    prefill: "I need help with an order or delivery. Order ID if available: ",
    icon: <ShoppingBag size={21} color="#7c5517" />,
    tint: "#fff1d8",
  },
  {
    title: "Rooms and listings",
    text: "Room details, suspicious listing, landlord contact, viewing issue, or saved rooms.",
    subject: "Room or listing help",
    prefill: "I need help with a room or listing. Listing name or link: ",
    icon: <Home size={21} color="#315d91" />,
    tint: "#e6f0ff",
  },
  {
    title: "Food and marketplace",
    text: "Restaurant menu, seller chat, product quality, pricing, or pickup arrangement.",
    subject: "Food or marketplace help",
    prefill: "I need help with food or marketplace. Vendor or item name: ",
    icon: <UtensilsCrossed size={21} color="#8a4358" />,
    tint: "#ffe7ee",
  },
  {
    title: "Account and safety",
    text: "Login, profile, notifications, safety report, blocked account, or role access.",
    subject: "Account or safety help",
    prefill: "I need help with my account or safety. What happened: ",
    icon: <ShieldCheck size={21} color="#276149" />,
    tint: "#e4f6ec",
  },
];

export default function StudentHelpPage() {
  const router = useRouter();
  const { theme } = useStudentTheme();

  const openSupport = React.useCallback(
    (topic: HelpTopic) => {
      router.push({
        pathname: "/support",
        params: {
          type: "message_us",
          subject: topic.subject,
          prefill: topic.prefill,
        },
      } as any);
    },
    [router],
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={[styles.circleBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} onPress={() => router.back()}>
            <ArrowLeft size={20} color={theme.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.heading }]}>Help Center</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Choose the issue and send the right details to support.</Text>
          </View>
        </View>

        <View style={[styles.hero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.heroTop}>
            <View style={[styles.heroIcon, { backgroundColor: theme.accentSoft }]}>
              <LifeBuoy size={28} color={theme.accent} />
            </View>
            <View style={[styles.livePill, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSoft }]}>
              <Bell size={14} color={theme.textMuted} />
              <Text style={[styles.livePillText, { color: theme.text }]}>Support queue</Text>
            </View>
          </View>
          <Text style={[styles.heroTitle, { color: theme.heading }]}>Tell us what is blocking you.</Text>
          <Text style={[styles.heroText, { color: theme.textMuted }]}>Attach names, order IDs, screenshots, or the seller or landlord name when you submit a ticket.</Text>
        </View>

        <View style={styles.quickRow}>
          <QuickAction
            label="Message support"
            icon={<MessageCircle size={18} color="#ffffff" />}
            color={theme.accent}
            onPress={() => openSupport(helpTopics[0])}
          />
          <QuickAction
            label="Set address"
            icon={<MapPin size={18} color="#ffffff" />}
            color="#0f6d80"
            onPress={() => router.push("/(student)/address")}
          />
        </View>

        <View style={styles.topicList}>
          {helpTopics.map((topic) => (
            <Pressable key={topic.title} style={[styles.topicCard, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => openSupport(topic)}>
              <View style={[styles.topicIcon, { backgroundColor: topic.tint }]}>{topic.icon}</View>
              <View style={styles.topicCopy}>
                <Text style={[styles.topicTitle, { color: theme.text }]}>{topic.title}</Text>
                <Text style={[styles.topicText, { color: theme.textMuted }]}>{topic.text}</Text>
              </View>
              <ChevronRight size={19} color={theme.textSoft} />
            </Pressable>
          ))}
        </View>

        <View style={[styles.flowPanel, { backgroundColor: theme.shell, borderColor: theme.border }]}>
          <Text style={[styles.flowTitle, { color: theme.heading }]}>How support works</Text>
          <FlowStep index="1" title="Pick a topic" text="The ticket opens with the right subject already filled in." />
          <FlowStep index="2" title="Add proof" text="Include an order ID, vendor name, listing name, or screenshot details." />
          <FlowStep index="3" title="Watch notifications" text="Replies and status changes show in your notification inbox." />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ color, icon, label, onPress }: { color: string; icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.quickAction, { backgroundColor: color }]} onPress={onPress}>
      {icon}
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

function FlowStep({ index, text, title }: { index: string; text: string; title: string }) {
  const { theme } = useStudentTheme();

  return (
    <View style={styles.flowStep}>
      <View style={styles.flowNumber}>
        <Text style={styles.flowNumberText}>{index}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.flowStepTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.flowStepText, { color: theme.textMuted }]}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 42, gap: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  circleBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  title: { fontSize: 28, fontWeight: "900" },
  subtitle: { marginTop: 4, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  hero: {
    borderRadius: 30,
    borderWidth: 1,
    padding: 18,
    gap: 14,
    overflow: "hidden",
    shadowColor: "#8a99c1",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  heroIcon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  livePillText: { fontSize: 12, fontWeight: "900" },
  heroTitle: { fontSize: 25, lineHeight: 30, fontWeight: "900" },
  heroText: { fontSize: 14, lineHeight: 21, fontWeight: "600" },
  quickRow: { flexDirection: "row", gap: 12 },
  quickAction: {
    flex: 1,
    minHeight: 58,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 14,
  },
  quickActionText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  topicList: { gap: 12 },
  topicCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  topicIcon: { width: 48, height: 48, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  topicCopy: { flex: 1, gap: 4 },
  topicTitle: { fontSize: 16, fontWeight: "900" },
  topicText: { fontSize: 12, fontWeight: "600", lineHeight: 17 },
  flowPanel: { borderRadius: 26, borderWidth: 1, padding: 16, gap: 13 },
  flowTitle: { fontSize: 20, fontWeight: "900" },
  flowStep: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  flowNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#0f6d80", alignItems: "center", justifyContent: "center" },
  flowNumberText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  flowStepTitle: { color: "#0e2756", fontSize: 15, fontWeight: "900" },
  flowStepText: { marginTop: 3, color: "#6e7892", fontSize: 12, fontWeight: "600", lineHeight: 17 },
});
