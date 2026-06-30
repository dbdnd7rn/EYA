import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, ArrowUpRight, CheckCircle2, CreditCard, History, Landmark, Smartphone, WalletCards, XCircle } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { fetchWalletSummary } from "@/lib/walletApi";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

type PaymentActivity = {
  id: string;
  label: string;
  amount_mwk: number;
  type: "topup" | "payment" | "reward";
  meta?: Record<string, unknown>;
  created_at: string;
};
type ActivityStatus = "Completed" | "Paid" | "Failed";

function money(value: number) {
  return `MWK ${Math.abs(Math.round(value || 0)).toLocaleString("en-MW")}`;
}

function signedMoney(value: number) {
  return `${value >= 0 ? "+" : "-"} ${money(value)}`;
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently";
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function activityStatus(row: PaymentActivity): ActivityStatus {
  const rawStatus = String(row.meta?.status ?? row.meta?.payment_status ?? "").toLowerCase();
  if (["failed", "cancelled", "error"].includes(rawStatus)) return "Failed";
  if (row.type === "topup" || row.type === "reward") return "Completed";
  return Number(row.amount_mwk) < 0 ? "Paid" : "Completed";
}

function activityMethod(row: PaymentActivity) {
  const meta = row.meta ?? {};
  const label = meta.payment_method_label || meta.payment_source || meta.payment_method;
  return typeof label === "string" && label.trim() ? label.trim() : row.type === "payment" ? "Wallet" : "Top-up";
}

function activityIcon(row: PaymentActivity) {
  const method = activityMethod(row).toLowerCase();
  if (method.includes("bank")) return Landmark;
  if (method.includes("airtel") || method.includes("mpamba") || method.includes("mobile")) return Smartphone;
  if (row.type === "payment") return CreditCard;
  return WalletCards;
}

export default function StudentPaymentsPage() {
  const router = useRouter();
  const { session } = useAuth();
  const { isOnline } = useNetwork();
  const { theme } = useStudentTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState(0);
  const [activities, setActivities] = useState<PaymentActivity[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setMessage(null);
    try {
      if (!session?.access_token) {
        setActivities([]);
        setBalance(0);
        setMessage("Log in again to load your payment activity.");
        return;
      }
      if (!isOnline) {
        setMessage("You are offline. Open Wallet to view the last cached wallet snapshot.");
        return;
      }

      const result = await fetchWalletSummary(session.access_token);
      setBalance(Number(result.account?.balance_mwk ?? 0));
      setActivities((result.activities ?? []) as PaymentActivity[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load payment activity.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOnline, session?.access_token]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const stats = useMemo(() => {
    const completed = activities.filter((row) => activityStatus(row) !== "Failed").length;
    const spent = activities.filter((row) => Number(row.amount_mwk) < 0).reduce((sum, row) => sum + Math.abs(Number(row.amount_mwk)), 0);
    const toppedUp = activities.filter((row) => Number(row.amount_mwk) > 0).reduce((sum, row) => sum + Number(row.amount_mwk), 0);
    return { completed, spent, toppedUp };
  }, [activities]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={theme.accent}
            onRefresh={() => {
              setRefreshing(true);
              void loadPayments();
            }}
          />
        }
      >
        <View style={styles.header}>
          <Pressable style={[styles.circleBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} onPress={() => router.back()}>
            <ArrowLeft size={20} color={theme.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: theme.heading }]}>Payments</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Wallet balance, top-ups, and payment history.</Text>
          </View>
        </View>

        <View style={[styles.balanceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.balanceTop}>
            <View>
              <Text style={[styles.balanceLabel, { color: theme.textMuted }]}>Wallet balance</Text>
              <Text style={[styles.balanceValue, { color: theme.text }]}>{money(balance)}</Text>
            </View>
            <View style={[styles.balanceIcon, { backgroundColor: theme.accent }]}>
              <WalletCards color="#ffffff" size={26} />
            </View>
          </View>
          <View style={styles.actionRow}>
            <Pressable style={[styles.primaryBtn, { backgroundColor: theme.accent }]} onPress={() => router.push("/(student)/(tabs)/wallet")}>
              <Text style={styles.primaryBtnText}>Top up wallet</Text>
              <ArrowUpRight color="#ffffff" size={18} />
            </Pressable>
            <Pressable style={[styles.secondaryBtn, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]} onPress={() => router.push("/(student)/(tabs)/orders")}>
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>View orders</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statGrid}>
          <StatCard label="Completed" value={String(stats.completed)} icon={CheckCircle2} color="#178754" />
          <StatCard label="Spent" value={money(stats.spent)} icon={CreditCard} color="#355fd5" />
          <StatCard label="Top-ups" value={money(stats.toppedUp)} icon={Smartphone} color="#d57818" />
        </View>

        <View style={[styles.methodsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Available payment methods</Text>
          <MethodRow icon={Smartphone} title="Airtel Money & TNM Mpamba" text="Start a mobile money checkout from cart or wallet top-up." />
          <MethodRow icon={Landmark} title="Bank transfer" text="Use provider bank details and confirm payment status in-app." />
          <MethodRow icon={WalletCards} title="EYA wallet" text="Top up once, then pay for supported orders from your balance." />
        </View>

        {message ? (
          <View style={[styles.noticeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.noticeText, { color: theme.text }]}>{message}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent activity</Text>
          <History color={theme.textSoft} size={20} />
        </View>

        <View style={styles.activityList}>
          {activities.length ? (
            activities.map((row) => <ActivityCard key={row.id} row={row} />)
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No payment activity yet</Text>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>Top-ups, wallet payments, and order payments will appear here.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ color, icon: Icon, label, value }: { color: string; icon: React.ComponentType<{ color?: string; size?: number }>; label: string; value: string }) {
  const { theme } = useStudentTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Icon color={color} size={21} />
      <Text numberOfLines={1} style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

function MethodRow({ icon: Icon, text, title }: { icon: React.ComponentType<{ color?: string; size?: number }>; text: string; title: string }) {
  const { theme } = useStudentTheme();
  return (
    <View style={styles.methodRow}>
      <View style={[styles.methodIcon, { backgroundColor: theme.surfaceAlt }]}>
        <Icon color={theme.accent} size={21} />
      </View>
      <View style={styles.methodCopy}>
        <Text style={[styles.methodTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.methodText, { color: theme.textMuted }]}>{text}</Text>
      </View>
    </View>
  );
}

function ActivityCard({ row }: { row: PaymentActivity }) {
  const { theme } = useStudentTheme();
  const Icon = activityIcon(row);
  const amount = Number(row.amount_mwk || 0);
  const status = activityStatus(row);
  const good = status !== "Failed";
  return (
    <View style={[styles.activityCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.activityIcon, { backgroundColor: theme.surfaceAlt }]}>
        <Icon color={theme.accent} size={22} />
      </View>
      <View style={styles.activityCopy}>
        <Text numberOfLines={1} style={[styles.activityTitle, { color: theme.text }]}>{row.label}</Text>
        <Text numberOfLines={1} style={[styles.activityMeta, { color: theme.textMuted }]}>{activityMethod(row)} · {relativeTime(row.created_at)}</Text>
      </View>
      <View style={styles.activityRight}>
        <Text style={[styles.activityAmount, { color: amount < 0 ? theme.text : "#178754" }]}>{signedMoney(amount)}</Text>
        <View style={[styles.statusPill, { backgroundColor: good ? "#e8f8ef" : "#ffe8ed" }]}>
          {good ? <CheckCircle2 color="#178754" size={13} /> : <XCircle color="#d72648" size={13} />}
          <Text style={[styles.statusText, { color: good ? "#178754" : "#d72648" }]}>{status}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 44, gap: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headerCopy: { flex: 1, minWidth: 0 },
  circleBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  title: { fontSize: 30, fontWeight: "900" },
  subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  balanceCard: { borderRadius: 30, borderWidth: 1, padding: 18, gap: 18 },
  balanceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  balanceLabel: { fontSize: 14, fontWeight: "800" },
  balanceValue: { marginTop: 6, fontSize: 32, lineHeight: 38, fontWeight: "900" },
  balanceIcon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  primaryBtn: { minHeight: 52, borderRadius: 999, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  secondaryBtn: { minHeight: 52, borderRadius: 999, borderWidth: 1, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  secondaryBtnText: { fontSize: 15, fontWeight: "900" },
  statGrid: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, minHeight: 104, borderRadius: 20, borderWidth: 1, padding: 12, justifyContent: "space-between" },
  statValue: { fontSize: 18, fontWeight: "900" },
  statLabel: { fontSize: 12, fontWeight: "800" },
  methodsCard: { borderRadius: 26, borderWidth: 1, padding: 16, gap: 14 },
  sectionTitle: { fontSize: 20, fontWeight: "900" },
  methodRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  methodIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  methodCopy: { flex: 1, minWidth: 0 },
  methodTitle: { fontSize: 15, fontWeight: "900" },
  methodText: { marginTop: 3, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  noticeCard: { borderRadius: 20, borderWidth: 1, padding: 14 },
  noticeText: { fontSize: 14, lineHeight: 20, fontWeight: "800" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  activityList: { gap: 10 },
  activityCard: { borderRadius: 22, borderWidth: 1, padding: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  activityIcon: { width: 50, height: 50, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  activityCopy: { flex: 1, minWidth: 0 },
  activityTitle: { fontSize: 15, fontWeight: "900" },
  activityMeta: { marginTop: 4, fontSize: 12, fontWeight: "700" },
  activityRight: { alignItems: "flex-end", gap: 7 },
  activityAmount: { fontSize: 14, fontWeight: "900" },
  statusPill: { minHeight: 24, borderRadius: 999, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  statusText: { fontSize: 11, fontWeight: "900" },
  emptyCard: { minHeight: 128, borderRadius: 24, borderWidth: 1, padding: 18, justifyContent: "center", gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: "900" },
  emptyText: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
});
