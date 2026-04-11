import React, { useMemo } from "react";
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, LogOut, MessageCircleMore, Plus, Store, WalletCards } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import { useAuth } from "@/providers/AuthProvider";
import { useNotificationInbox } from "@/providers/NotificationInboxProvider";
import { createSellerWithdrawal, listSellerWithdrawals } from "@/lib/sellerWallet";

function money(value: number) {
  return `MWK ${Math.round(value).toLocaleString()}`;
}

export default function SellerWalletPage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { unreadCount } = useNotificationInbox();
  const { workspace, metrics } = useSellerWorkspace();
  const [withdrawOpen, setWithdrawOpen] = React.useState(false);
  const [withdrawAmount, setWithdrawAmount] = React.useState("10000");
  const [withdrawDestination, setWithdrawDestination] = React.useState("+265 99 123 4567");
  const [withdrawNote, setWithdrawNote] = React.useState("");
  const [withdrawals, setWithdrawals] = React.useState<Array<{ id: string; amountMwk: number; createdAt: string; destination: string; status: "processing" | "paid" }>>([]);
  const [submittingWithdrawal, setSubmittingWithdrawal] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      if (!workspace.vendor?.id) {
        if (active) setWithdrawals([]);
        return;
      }
      const rows = await listSellerWithdrawals(workspace.vendor.id);
      if (active) setWithdrawals(rows);
    };
    void run();
    return () => {
      active = false;
    };
  }, [workspace.vendor?.id]);

  const bars = useMemo(
    () => (workspace.hasVendor ? metrics.weeklyBars.map((item) => item.value) : [15, 12, 18, 26, 14, 32, 44]),
    [metrics.weeklyBars, workspace.hasVendor],
  );
  const maxBar = Math.max(...bars, 1);
  const payoutRows = workspace.hasVendor
    ? [
        ...withdrawals.map((row) => ({
          id: row.id,
          amountMwk: row.amountMwk,
          createdAt: row.createdAt,
          kind: "withdrawal" as const,
          label: `Withdrawal to ${row.destination}`,
          status: row.status,
        })),
        ...metrics.payoutHistory.map((row) => ({
          id: row.id,
          amountMwk: row.amountMwk,
          createdAt: row.createdAt,
          kind: "payout" as const,
          label: row.label,
          status: row.status,
        })),
      ].slice(0, 6)
    : [
        { id: "preview-1", amountMwk: 45000, createdAt: new Date().toISOString(), kind: "payout" as const, label: "Food order payout", status: "paid" as const },
        { id: "preview-2", amountMwk: 18000, createdAt: new Date(Date.now() - 540000).toISOString(), kind: "payout" as const, label: "Market order payout", status: "processing" as const },
        { id: "preview-3", amountMwk: 5000, createdAt: new Date(Date.now() - 1080000).toISOString(), kind: "withdrawal" as const, label: "Withdrawal to Airtel Money", status: "processing" as const },
      ];
  const revenueValue = workspace.hasVendor ? metrics.thisWeekRevenue : 87500;
  const goToSetup = () => router.push("/(market)/setup");

  const submitWithdrawal = async () => {
    if (!workspace.vendor?.id) {
      goToSetup();
      return;
    }
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Enter a valid withdrawal amount.");
      return;
    }
    if (!withdrawDestination.trim() || withdrawDestination.trim().length < 5) {
      Alert.alert("Missing destination", "Enter where the money should be sent.");
      return;
    }

    setSubmittingWithdrawal(true);
    try {
      const created = await createSellerWithdrawal({
        vendorId: workspace.vendor.id,
        amountMwk: amount,
        destination: withdrawDestination,
        note: withdrawNote,
      });
      setWithdrawals((current) => [created, ...current]);
      setWithdrawOpen(false);
      setWithdrawNote("");
      Alert.alert("Withdrawal requested", `We started a withdrawal of ${money(amount)} to ${withdrawDestination.trim()}.`);
    } catch (err: any) {
      Alert.alert("Withdrawal failed", err?.message ?? "Could not create the withdrawal request.");
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="account" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Wallet</Text>
          <View style={styles.headerActions}>
            <View style={styles.headerActionWrap}>
              <CircleIcon icon={<Bell size={18} color="#0e2756" />} onPress={() => router.push("/(market)/notifications")} />
              {unreadCount ? (
                <View style={styles.dotBadge}>
                  <Text style={styles.dotBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                </View>
              ) : null}
            </View>
            <CircleIcon icon={<MessageCircleMore size={18} color="#0e2756" />} onPress={() => (workspace.hasVendor ? router.push("/(market)/messages") : goToSetup())} />
            <CircleIcon icon={<Plus size={18} color="#0e2756" />} onPress={() => (workspace.hasVendor ? router.push("../shop-settings") : goToSetup())} />
            <CircleIcon
              icon={<LogOut size={18} color="#0e2756" />}
              onPress={() =>
                Alert.alert("Sign out", "Log out of this seller account?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Sign out",
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

        <View style={styles.heroCard}>
          <View style={styles.heroGlowOne} />
          <View style={styles.heroGlowTwo} />
          <Text style={styles.heroValue}>{money(revenueValue)}</Text>

          <View style={styles.chartRow}>
            {bars.map((value, index) => (
              <View key={index} style={styles.chartColumnWrap}>
                <View style={[styles.chartColumn, { height: `${Math.max(18, (value / maxBar) * 100)}%` }]} />
                <Text style={styles.chartLabel}>
                  {workspace.hasVendor ? metrics.weeklyBars[index]?.label ?? "-" : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.transactionsCard}>
          <Text style={styles.sectionTitle}>Transactions</Text>
          <View style={styles.transactionList}>
            {payoutRows.map((row, index) => (
              <View key={row.id} style={styles.transactionRow}>
                <View style={styles.transactionLeft}>
                  <Text style={styles.transactionIcon}>{row.kind === "withdrawal" ? "-" : index % 2 === 0 ? "+" : "^"}</Text>
                  <View>
                    <Text style={styles.transactionAmount}>{money(row.amountMwk)}</Text>
                    <Text style={styles.transactionLabel}>{row.label}</Text>
                  </View>
                </View>
                <Text style={styles.transactionTime}>
                  {new Date(row.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.withdrawBtn} onPress={() => (workspace.hasVendor ? setWithdrawOpen(true) : goToSetup())}>
            <Text style={styles.withdrawBtnText}>Withdraw money</Text>
          </Pressable>
        </View>

        <View style={styles.utilityGrid}>
          <Pressable style={styles.utilityCard} onPress={() => (workspace.hasVendor ? router.push("../shop-settings") : goToSetup())}>
            <Store size={18} color="#102a54" />
            <Text style={styles.utilityTitle}>Shop</Text>
            <Text style={styles.utilityText}>Manage storefront</Text>
          </Pressable>

          <Pressable style={styles.utilityCard} onPress={() => router.push("/(market)/(tabs)/products")}>
            <WalletCards size={18} color="#102a54" />
            <Text style={styles.utilityTitle}>Products</Text>
            <Text style={styles.utilityText}>{workspace.hasVendor ? metrics.productsListed : 12} active listings</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.logoutBtn}
          onPress={() =>
            Alert.alert("Sign out", "Log out of this seller account?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Sign out",
                style: "destructive",
                onPress: async () => {
                  await signOut();
                  router.replace("/(auth)/login");
                },
              },
            ])
          }
        >
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={withdrawOpen} transparent animationType="fade" onRequestClose={() => setWithdrawOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Withdraw money</Text>
            <Text style={styles.modalSub}>Send part of your seller balance to mobile money or bank.</Text>
            <TextInput value={withdrawAmount} onChangeText={setWithdrawAmount} keyboardType="numeric" placeholder="Amount (MWK)" placeholderTextColor="#98a3bd" style={styles.modalInput} />
            <TextInput value={withdrawDestination} onChangeText={setWithdrawDestination} placeholder="Destination account or number" placeholderTextColor="#98a3bd" style={styles.modalInput} />
            <TextInput value={withdrawNote} onChangeText={setWithdrawNote} placeholder="Note (optional)" placeholderTextColor="#98a3bd" style={[styles.modalInput, styles.modalInputArea]} multiline textAlignVertical="top" />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setWithdrawOpen(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalSubmit, submittingWithdrawal && styles.modalSubmitDisabled]} onPress={() => void submitWithdrawal()} disabled={submittingWithdrawal}>
                <Text style={styles.modalSubmitText}>{submittingWithdrawal ? "Submitting..." : "Continue"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  headerActionWrap: { position: "relative" },
  dotBadge: {
    position: "absolute",
    right: -4,
    top: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#ff0f64",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  dotBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  circleIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: "#dfe8f5", alignItems: "center", justifyContent: "center" },
  heroCard: { position: "relative", overflow: "hidden", borderRadius: 30, backgroundColor: "#102a54", borderWidth: 1, borderColor: "#102a54", padding: 18, gap: 18 },
  heroGlowOne: { position: "absolute", left: -10, top: 0, width: 240, height: 150, borderBottomRightRadius: 120, backgroundColor: "rgba(124,191,255,0.4)" },
  heroGlowTwo: { position: "absolute", right: -20, bottom: -30, width: 220, height: 180, borderRadius: 90, backgroundColor: "rgba(255,15,100,0.22)" },
  heroValue: { color: "#ffffff", fontSize: 28, fontWeight: "900" },
  chartRow: { marginTop: 20, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8, height: 120 },
  chartColumnWrap: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 8 },
  chartColumn: { width: "100%", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.78)", minHeight: 18 },
  chartLabel: { color: "#fff", fontSize: 12, fontWeight: "700" },
  transactionsCard: { borderRadius: 30, backgroundColor: "rgba(255,255,255,0.98)", borderWidth: 1, borderColor: "#dfe8f5", padding: 18, gap: 14 },
  sectionTitle: { color: "#0e2756", fontSize: 18, fontWeight: "700" },
  transactionList: { gap: 12 },
  transactionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#e8eef8", paddingBottom: 10 },
  transactionLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  transactionIcon: { color: "#ff0f64", fontSize: 18, fontWeight: "700" },
  transactionAmount: { color: "#1c3f76", fontSize: 16, fontWeight: "700" },
  transactionLabel: { color: "#7a8ba8", fontSize: 12, fontWeight: "500", marginTop: 2 },
  transactionTime: { color: "#7a8ba8", fontSize: 13, fontWeight: "500" },
  withdrawBtn: { borderRadius: 999, backgroundColor: "#102a54", borderWidth: 1, borderColor: "#102a54", alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  withdrawBtnText: { color: "#ffffff", fontSize: 18, fontWeight: "600" },
  utilityGrid: { flexDirection: "row", gap: 12 },
  utilityCard: { flex: 1, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.98)", borderWidth: 1, borderColor: "#dfe8f5", padding: 16, gap: 8 },
  utilityTitle: { color: "#0e2756", fontSize: 16, fontWeight: "600" },
  utilityText: { color: "#6f7f9d", fontSize: 13, fontWeight: "500" },
  logoutBtn: { borderRadius: 22, backgroundColor: "#fff3f7", borderWidth: 1, borderColor: "#ffd7e4", alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  logoutText: { color: "#ff0f64", fontSize: 16, fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(9,19,41,0.34)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", borderRadius: 28, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dfe8f5", padding: 18, gap: 12 },
  modalTitle: { color: "#0e2756", fontSize: 22, fontWeight: "800" },
  modalSub: { color: "#6f7f9d", fontSize: 14, fontWeight: "500", lineHeight: 20 },
  modalInput: { borderRadius: 18, backgroundColor: "#f8fbff", borderWidth: 1, borderColor: "#dfe8f5", paddingHorizontal: 14, paddingVertical: 14, color: "#0e2756", fontWeight: "600" },
  modalInputArea: { minHeight: 92 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalCancel: { flex: 1, borderRadius: 18, borderWidth: 1, borderColor: "#dfe8f5", backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  modalCancelText: { color: "#0e2756", fontSize: 15, fontWeight: "700" },
  modalSubmit: { flex: 1, borderRadius: 18, backgroundColor: "#102a54", alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  modalSubmitDisabled: { opacity: 0.7 },
  modalSubmitText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
});
