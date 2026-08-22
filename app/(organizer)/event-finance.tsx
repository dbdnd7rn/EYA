import React from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Banknote, Clock3, LockKeyhole, RefreshCcw, ShieldCheck, TriangleAlert, WalletCards, XCircle } from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import {
  cancelMyTicketEventPayoutRequest,
  getMyTicketEventFinance,
  requestMyTicketEventPayout,
  type TicketEventFinance,
  type TicketEventPayoutRequest,
} from "@/lib/ticketEventFinanceApi";

const BG = "#f5f7fc";
const CARD = "#ffffff";
const TEXT = "#102a54";
const MUTED = "#6e7892";
const ACCENT = "#5e73dd";
const BORDER = "#e4e8f2";

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function statusLabel(request: TicketEventPayoutRequest) {
  if (request.status === "pending") return "Under EYA review";
  if (request.status === "approved") return "Approved · awaiting payout";
  if (request.status === "declined") return "Declined";
  if (request.status === "cancelled") return "Cancelled";
  return "Paid";
}

export default function OrganizerEventFinanceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string; accessStatus?: string }>();
  const eventId = String(params.eventId || "");
  const [finance, setFinance] = React.useState<TicketEventFinance | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (refresh = false) => {
    if (!eventId) {
      setError("Event is missing.");
      setLoading(false);
      return;
    }
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      setError(null);
      setFinance(await getMyTicketEventFinance(eventId));
    } catch (e: any) {
      setError(e?.message || "Could not load event finance.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  React.useEffect(() => { void load(); }, [load]);

  const submitEarly = async () => {
    const parsed = Number(amount.replace(/,/g, "").trim());
    if (!Number.isInteger(parsed) || parsed <= 0) {
      Alert.alert("Enter an amount", "Use a whole-MWK amount greater than zero.");
      return;
    }
    if (!finance || parsed > finance.available_for_payout_mwk) {
      Alert.alert("Amount too high", "The request cannot exceed the currently eligible early payout amount.");
      return;
    }
    Alert.alert(
      "Request early payout?",
      `${kwacha(parsed)} will be submitted to EYA as an advance against this event. It is not final settlement.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Request", onPress: async () => {
          try {
            setBusy(true);
            await requestMyTicketEventPayout({ eventId, requestType: "early_payout", amountMwk: parsed });
            setAmount("");
            await load(true);
            Alert.alert("Request submitted", "EYA will review the early payout request.");
          } catch (e: any) {
            Alert.alert("Request failed", e?.message || "Could not request early payout.");
          } finally { setBusy(false); }
        } },
      ],
    );
  };

  const submitFinal = () => {
    if (!finance) return;
    Alert.alert(
      "Request final settlement?",
      `EYA will review the remaining ${kwacha(finance.available_for_payout_mwk)} currently eligible after reconciliation.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Request settlement", onPress: async () => {
          try {
            setBusy(true);
            await requestMyTicketEventPayout({ eventId, requestType: "final_settlement" });
            await load(true);
            Alert.alert("Settlement requested", "Your final-settlement request is now with EYA.");
          } catch (e: any) {
            Alert.alert("Request failed", e?.message || "Could not request final settlement.");
          } finally { setBusy(false); }
        } },
      ],
    );
  };

  const cancelRequest = (request: TicketEventPayoutRequest) => {
    Alert.alert("Cancel request?", "This removes the pending request. You can submit another request later if the event remains eligible.", [
      { text: "Keep", style: "cancel" },
      { text: "Cancel request", style: "destructive", onPress: async () => {
        try {
          setBusy(true);
          await cancelMyTicketEventPayoutRequest(request.id);
          await load(true);
        } catch (e: any) {
          Alert.alert("Could not cancel", e?.message || "Try again.");
        } finally { setBusy(false); }
      } },
    ]);
  };

  const openRequest = finance?.requests.some((row) => row.status === "pending" || row.status === "approved") ?? false;
  const accessSuspended = params.accessStatus === "suspended" || finance?.finance_entitlement_status === "suspended";
  const canEarly = Boolean(finance && !accessSuspended && finance.payouts_configured && finance.finance_status === "open" && !finance.event_finished && finance.available_for_payout_mwk > 0 && finance.organizer_advance_liability_mwk === 0 && !openRequest);
  const canFinal = Boolean(finance && !accessSuspended && finance.final_settlement_ready && finance.available_for_payout_mwk > 0 && !openRequest);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={ACCENT} />}
      >
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}><ArrowLeft size={21} color={TEXT} /></Pressable>
          <View style={{ flex: 1 }}><Text style={styles.kicker}>Organizer finance</Text><Text style={styles.title}>Event payouts</Text></View>
          <Pressable style={styles.iconBtn} onPress={() => void load(true)}><RefreshCcw size={19} color={ACCENT} /></Pressable>
        </View>

        {loading ? <State><ActivityIndicator color={ACCENT} /><Text style={styles.stateText}>Loading event finance...</Text></State> : null}
        {!loading && error ? <State><TriangleAlert size={30} color="#a32929" /><Text style={styles.errorText}>{error}</Text></State> : null}

        {!loading && !error && finance ? (
          <>
            <View style={styles.eventCard}>
              <Text style={styles.eventTitle}>{finance.event_title}</Text>
              <Text style={styles.eventMeta}>{finance.event_finished ? "Event completed" : `Event ends ${dateLabel(finance.ends_at || finance.starts_at)}`}</Text>
            </View>

            {accessSuspended ? <View style={styles.waitCard}><LockKeyhole size={20} color="#8a5a00" /><Text style={styles.waitText}>Finance access is suspended. Statements remain available, but new payout requests and cancellations are disabled.</Text></View> : null}

            <View style={styles.grid}>
              <Metric label="Ticket sales" value={kwacha(finance.gross_ticket_sales_mwk)} />
              <Metric label="Refunded" value={kwacha(finance.refunded_ticket_sales_mwk)} />
              <Metric label="Paid to you" value={kwacha(finance.paid_out_mwk)} />
              <Metric label="Available now" value={kwacha(finance.available_for_payout_mwk)} strong />
            </View>

            <View style={styles.reserveCard}>
              <View style={styles.reserveHead}><ShieldCheck size={20} color="#087443" /><Text style={styles.reserveTitle}>Protected event funds</Text></View>
              <FinanceRow label="Refund reserve" value={finance.protected_refund_reserve_mwk} />
              <FinanceRow label="EYA/platform fee" value={finance.platform_fee_mwk} />
              <FinanceRow label="Other hold" value={finance.other_hold_mwk} />
              <Text style={styles.reserveText}>Protected funds are excluded from early-payout eligibility. EYA can release the reserve only after refund/risk reconciliation.</Text>
            </View>

            {finance.organizer_advance_liability_mwk > 0 ? (
              <View style={styles.liabilityCard}>
                <TriangleAlert size={20} color="#a32929" />
                <View style={{ flex: 1 }}><Text style={styles.liabilityTitle}>Settlement hold</Text><Text style={styles.liabilityValue}>{kwacha(finance.organizer_advance_liability_mwk)}</Text><Text style={styles.liabilityText}>Refunds or adjustments have reduced the event balance below money already advanced. Further payouts are blocked until this is resolved.</Text></View>
              </View>
            ) : null}

            {!finance.payouts_configured ? (
              <View style={styles.waitCard}><LockKeyhole size={20} color="#8a5a00" /><Text style={styles.waitText}>EYA has not configured this event's payout reserve yet. No organizer payout can be requested until that protection is set.</Text></View>
            ) : finance.finance_status === "frozen" ? (
              <View style={styles.waitCard}><LockKeyhole size={20} color="#8a5a00" /><Text style={styles.waitText}>Payouts for this event are temporarily frozen by EYA.</Text></View>
            ) : finance.finance_status === "settled" ? (
              <View style={styles.doneCard}><ShieldCheck size={20} color="#087443" /><Text style={styles.doneText}>This event's organizer settlement is complete.</Text></View>
            ) : null}

            {!finance.event_finished ? (
              <View style={styles.actionCard}>
                <View style={styles.actionHead}><WalletCards size={21} color={ACCENT} /><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Early payout</Text><Text style={styles.actionSub}>Request an advance from eligible event proceeds before the event.</Text></View></View>
                <Text style={styles.availableLabel}>ELIGIBLE NOW</Text>
                <Text style={styles.availableValue}>{kwacha(finance.available_for_payout_mwk)}</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholder="Amount in MWK"
                  placeholderTextColor="#9aa3b8"
                  style={styles.input}
                />
                <Pressable style={[styles.primaryBtn, (!canEarly || busy) && styles.disabled]} disabled={!canEarly || busy} onPress={() => void submitEarly()}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Banknote size={18} color="#fff" />}
                  <Text style={styles.primaryText}>Request Early Payout</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.actionCard}>
                <View style={styles.actionHead}><Banknote size={21} color={ACCENT} /><View style={{ flex: 1 }}><Text style={styles.actionTitle}>Final settlement</Text><Text style={styles.actionSub}>Available only after EYA clears the refund reserve and any remaining hold.</Text></View></View>
                <Text style={styles.availableLabel}>CURRENTLY ELIGIBLE</Text>
                <Text style={styles.availableValue}>{kwacha(finance.available_for_payout_mwk)}</Text>
                {!finance.final_settlement_ready ? <Text style={styles.pendingSettlement}>Final reconciliation is still in progress.</Text> : null}
                <Pressable style={[styles.primaryBtn, (!canFinal || busy) && styles.disabled]} disabled={!canFinal || busy} onPress={submitFinal}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Banknote size={18} color="#fff" />}
                  <Text style={styles.primaryText}>Request Final Settlement</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.historyWrap}>
              <Text style={styles.sectionTitle}>Payout history</Text>
              {!finance.requests.length ? <Text style={styles.emptyText}>No payout requests yet.</Text> : finance.requests.map((request) => (
                <View key={request.id} style={styles.requestCard}>
                  <View style={styles.requestHead}>
                    <View style={{ flex: 1 }}><Text style={styles.requestTitle}>{request.request_type === "early_payout" ? "Early payout" : "Final settlement"}</Text><Text style={styles.requestDate}>{dateLabel(request.requested_at)}</Text></View>
                    <Text style={styles.requestAmount}>{kwacha(request.approved_amount_mwk ?? request.requested_amount_mwk)}</Text>
                  </View>
                  <View style={styles.statusRow}><Clock3 size={14} color={MUTED} /><Text style={styles.statusText}>{statusLabel(request)}</Text></View>
                  {request.review_note ? <Text style={styles.noteText}>{request.review_note}</Text> : null}
                  {request.status === "pending" && !accessSuspended ? <Pressable style={styles.cancelBtn} disabled={busy} onPress={() => cancelRequest(request)}><XCircle size={15} color="#a32929" /><Text style={styles.cancelText}>Cancel request</Text></Pressable> : null}
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function State({ children }: { children: React.ReactNode }) { return <View style={styles.state}>{children}</View>; }
function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, strong && { color: ACCENT }]} numberOfLines={1}>{value}</Text></View>; }
function FinanceRow({ label, value }: { label: string; value: number }) { return <View style={styles.financeRow}><Text style={styles.financeLabel}>{label}</Text><Text style={styles.financeValue}>{kwacha(value)}</Text></View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, content: { padding: 18, paddingBottom: 80, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 }, iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  kicker: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" }, title: { color: TEXT, fontSize: 25, fontWeight: "900", marginTop: 2 },
  state: { minHeight: 220, borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }, stateText: { color: MUTED, fontWeight: "800" }, errorText: { color: "#a32929", fontWeight: "800", textAlign: "center" },
  eventCard: { borderRadius: 22, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 16 }, eventTitle: { color: TEXT, fontSize: 20, fontWeight: "900" }, eventMeta: { color: MUTED, fontSize: 12, fontWeight: "700", marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, metric: { width: "48%", minHeight: 82, borderRadius: 18, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 12, justifyContent: "space-between" }, metricLabel: { color: MUTED, fontSize: 10, fontWeight: "800" }, metricValue: { color: TEXT, fontSize: 16, fontWeight: "900" },
  reserveCard: { borderRadius: 22, backgroundColor: "#e8f7ee", padding: 15, gap: 8 }, reserveHead: { flexDirection: "row", alignItems: "center", gap: 8 }, reserveTitle: { color: "#276346", fontSize: 15, fontWeight: "900" }, financeRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, financeLabel: { color: "#4f6c5d", fontSize: 12, fontWeight: "700" }, financeValue: { color: "#276346", fontSize: 12, fontWeight: "900" }, reserveText: { color: "#4f6c5d", fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  liabilityCard: { borderRadius: 20, backgroundColor: "#fff0f0", padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 }, liabilityTitle: { color: "#a32929", fontSize: 13, fontWeight: "900" }, liabilityValue: { color: "#a32929", fontSize: 20, fontWeight: "900", marginTop: 2 }, liabilityText: { color: "#7f3f3f", fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 3 },
  waitCard: { borderRadius: 18, backgroundColor: "#fff4df", padding: 13, flexDirection: "row", gap: 9, alignItems: "flex-start" }, waitText: { flex: 1, color: "#7a5519", fontSize: 12, lineHeight: 17, fontWeight: "800" }, doneCard: { borderRadius: 18, backgroundColor: "#e8f7ee", padding: 13, flexDirection: "row", gap: 9 }, doneText: { flex: 1, color: "#276346", fontSize: 12, fontWeight: "800" },
  actionCard: { borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 10 }, actionHead: { flexDirection: "row", alignItems: "flex-start", gap: 9 }, actionTitle: { color: TEXT, fontSize: 17, fontWeight: "900" }, actionSub: { color: MUTED, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 }, availableLabel: { color: MUTED, fontSize: 9, fontWeight: "900", letterSpacing: 0.8, marginTop: 4 }, availableValue: { color: TEXT, fontSize: 27, fontWeight: "900" }, input: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", paddingHorizontal: 14, color: TEXT, fontSize: 15, fontWeight: "800" }, primaryBtn: { minHeight: 50, borderRadius: 18, backgroundColor: ACCENT, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" }, disabled: { opacity: 0.45 }, primaryText: { color: "#fff", fontSize: 13, fontWeight: "900" }, pendingSettlement: { color: "#8a5a00", fontSize: 11, fontWeight: "800" },
  historyWrap: { gap: 9 }, sectionTitle: { color: TEXT, fontSize: 18, fontWeight: "900" }, emptyText: { color: MUTED, fontSize: 12, fontWeight: "700" }, requestCard: { borderRadius: 19, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 14, gap: 7 }, requestHead: { flexDirection: "row", gap: 10 }, requestTitle: { color: TEXT, fontSize: 14, fontWeight: "900" }, requestDate: { color: MUTED, fontSize: 10, fontWeight: "700", marginTop: 2 }, requestAmount: { color: TEXT, fontSize: 14, fontWeight: "900" }, statusRow: { flexDirection: "row", gap: 6, alignItems: "center" }, statusText: { color: MUTED, fontSize: 11, fontWeight: "800" }, noteText: { color: "#5c6780", fontSize: 11, lineHeight: 16, fontWeight: "700" }, cancelBtn: { alignSelf: "flex-start", minHeight: 34, borderRadius: 17, backgroundColor: "#fff0f0", paddingHorizontal: 10, flexDirection: "row", gap: 5, alignItems: "center" }, cancelText: { color: "#a32929", fontSize: 10, fontWeight: "900" },
});
