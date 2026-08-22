import React from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Banknote, CheckCircle2, LockKeyhole, RefreshCcw, ShieldCheck, TriangleAlert, XCircle } from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import {
  adminReviewTicketEventPayoutRequest,
  adminSetTicketEventFinanceControls,
  listAdminTicketEventFinanceEvents,
  listAdminTicketEventPayoutRequests,
  type AdminTicketEventFinanceEvent,
  type AdminTicketEventPayoutRequest,
} from "@/lib/ticketEventFinanceApi";

const BG = "#f5f7fc";
const CARD = "#ffffff";
const TEXT = "#102a54";
const MUTED = "#6e7892";
const ACCENT = "#5e73dd";
const BORDER = "#e4e8f2";

type ControlDraft = { reserve: string; fee: string; hold: string; note: string };

function whole(value: string) {
  const parsed = Number(value.replace(/,/g, "").trim() || "0");
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function AdminEventPayoutsScreen() {
  const router = useRouter();
  const [events, setEvents] = React.useState<AdminTicketEventFinanceEvent[]>([]);
  const [requests, setRequests] = React.useState<AdminTicketEventPayoutRequest[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, ControlDraft>>({});
  const [approvedAmounts, setApprovedAmounts] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      setError(null);
      const [nextEvents, nextRequests] = await Promise.all([
        listAdminTicketEventFinanceEvents(),
        listAdminTicketEventPayoutRequests(),
      ]);
      setEvents(nextEvents);
      setRequests(nextRequests);
      setDrafts((current) => {
        const next = { ...current };
        for (const row of nextEvents) {
          if (!next[row.event_id]) {
            next[row.event_id] = {
              reserve: String(row.finance.protected_refund_reserve_mwk || 0),
              fee: String(row.finance.platform_fee_mwk || 0),
              hold: String(row.finance.other_hold_mwk || 0),
              note: "",
            };
          }
        }
        return next;
      });
      setApprovedAmounts((current) => {
        const next = { ...current };
        for (const request of nextRequests) {
          if (next[request.id] == null) next[request.id] = String(request.requested_amount_mwk);
        }
        return next;
      });
    } catch (e: any) {
      setError(e?.message || "Could not load event payouts.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const saveControls = async (event: AdminTicketEventFinanceEvent, status: "open" | "frozen") => {
    const draft = drafts[event.event_id] || { reserve: "0", fee: "0", hold: "0", note: "" };
    const reserve = whole(draft.reserve);
    const fee = whole(draft.fee);
    const hold = whole(draft.hold);
    if (reserve == null || fee == null || hold == null) {
      Alert.alert("Invalid finance control", "Reserve, EYA fee and hold must be whole-MWK values of zero or more.");
      return;
    }
    try {
      setBusyId(event.event_id);
      await adminSetTicketEventFinanceControls({
        eventId: event.event_id,
        reserveRequiredMwk: reserve,
        platformFeeMwk: fee,
        otherHoldMwk: hold,
        status,
        note: draft.note,
      });
      await load(true);
    } catch (e: any) {
      Alert.alert("Could not update finance controls", e?.message || "Try again.");
    } finally { setBusyId(null); }
  };

  const review = async (request: AdminTicketEventPayoutRequest, action: "approve" | "decline") => {
    const note = (notes[request.id] || "").trim();
    if (action === "decline" && !note) {
      Alert.alert("Reason required", "Add a note explaining why this payout request is declined.");
      return;
    }
    const amount = whole(approvedAmounts[request.id] || "");
    if (action === "approve" && (amount == null || amount <= 0)) {
      Alert.alert("Approval amount required", "Enter a whole-MWK amount greater than zero.");
      return;
    }
    Alert.alert(
      action === "approve" ? "Approve payout request?" : "Decline payout request?",
      action === "approve"
        ? `${kwacha(amount || 0)} will be reserved as an approved organizer payout. This does not automatically send money from PayChangu yet.`
        : note,
      [
        { text: "Cancel", style: "cancel" },
        { text: action === "approve" ? "Approve" : "Decline", style: action === "decline" ? "destructive" : "default", onPress: async () => {
          try {
            setBusyId(request.id);
            await adminReviewTicketEventPayoutRequest({ requestId: request.id, action, approvedAmountMwk: action === "approve" ? amount : null, note });
            await load(true);
          } catch (e: any) {
            Alert.alert("Review failed", e?.message || "Could not review payout request.");
          } finally { setBusyId(null); }
        } },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={ACCENT} />}
      >
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}><ArrowLeft size={21} color={TEXT} /></Pressable>
          <View style={{ flex: 1 }}><Text style={styles.kicker}>EYA Admin</Text><Text style={styles.title}>Event finance</Text></View>
          <Pressable style={styles.iconBtn} onPress={() => void load(true)}><RefreshCcw size={19} color={ACCENT} /></Pressable>
        </View>

        <View style={styles.securityNote}><ShieldCheck size={20} color="#087443" /><Text style={styles.securityText}>Early payouts are event advances. Protected refund reserve, EYA fee, holds and prior payouts are deducted before an organizer can request money.</Text></View>

        {loading ? <State><ActivityIndicator color={ACCENT} /><Text style={styles.stateText}>Loading organizer event finance...</Text></State> : null}
        {!loading && error ? <State><TriangleAlert size={30} color="#a32929" /><Text style={styles.errorText}>{error}</Text></State> : null}

        {!loading && !error ? (
          <>
            <Text style={styles.sectionTitle}>Finance controls</Text>
            {!events.length ? <Text style={styles.emptyText}>No approved organizer events need finance controls yet.</Text> : events.map((event) => {
              const draft = drafts[event.event_id] || { reserve: "0", fee: "0", hold: "0", note: "" };
              const finance = event.finance;
              return (
                <View key={event.event_id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={{ flex: 1 }}><Text style={styles.eventTitle}>{event.event_title}</Text><Text style={styles.meta}>{event.organizer_name || event.organizer_email || "Organizer"} · {event.event_status}</Text></View>
                    <View style={[styles.statusBadge, finance.finance_status === "frozen" && styles.frozenBadge]}><Text style={[styles.statusText, finance.finance_status === "frozen" && styles.frozenText]}>{finance.finance_status}</Text></View>
                  </View>
                  <Text style={styles.meta}>Ends {dateLabel(event.ends_at || event.starts_at)}</Text>

                  <View style={styles.metricsRow}>
                    <MiniMetric label="Paid sales" value={finance.active_paid_ticket_sales_mwk} />
                    <MiniMetric label="Paid out" value={finance.paid_out_mwk} />
                    <MiniMetric label="Eligible" value={finance.available_for_payout_mwk} />
                  </View>

                  {finance.organizer_advance_liability_mwk > 0 ? <View style={styles.liability}><TriangleAlert size={17} color="#a32929" /><Text style={styles.liabilityText}>Advance liability: {kwacha(finance.organizer_advance_liability_mwk)}. Keep payouts blocked until resolved.</Text></View> : null}

                  <Text style={styles.label}>PROTECTED REFUND RESERVE (MWK)</Text>
                  <TextInput value={draft.reserve} onChangeText={(text) => setDrafts((s) => ({ ...s, [event.event_id]: { ...draft, reserve: text } }))} keyboardType="numeric" style={styles.input} />
                  <Text style={styles.label}>EYA / PLATFORM FEE (MWK)</Text>
                  <TextInput value={draft.fee} onChangeText={(text) => setDrafts((s) => ({ ...s, [event.event_id]: { ...draft, fee: text } }))} keyboardType="numeric" style={styles.input} />
                  <Text style={styles.label}>OTHER HOLD (MWK)</Text>
                  <TextInput value={draft.hold} onChangeText={(text) => setDrafts((s) => ({ ...s, [event.event_id]: { ...draft, hold: text } }))} keyboardType="numeric" style={styles.input} />
                  <TextInput value={draft.note} onChangeText={(text) => setDrafts((s) => ({ ...s, [event.event_id]: { ...draft, note: text } }))} placeholder="Admin finance note" placeholderTextColor="#9aa3b8" style={styles.input} />

                  <View style={styles.actions}>
                    <Pressable style={[styles.actionBtn, styles.freezeBtn]} disabled={busyId === event.event_id} onPress={() => void saveControls(event, "frozen")}><LockKeyhole size={16} color="#8a5a00" /><Text style={styles.freezeText}>Freeze</Text></Pressable>
                    <Pressable style={[styles.actionBtn, styles.openBtn]} disabled={busyId === event.event_id} onPress={() => void saveControls(event, "open")}>
                      {busyId === event.event_id ? <ActivityIndicator size="small" color="#fff" /> : <ShieldCheck size={16} color="#fff" />}<Text style={styles.openText}>Save & Open</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Payout requests</Text>
            {!requests.length ? <Text style={styles.emptyText}>No pending or approved organizer payout requests.</Text> : requests.map((request) => (
              <View key={request.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={{ flex: 1 }}><Text style={styles.eventTitle}>{request.event_title}</Text><Text style={styles.meta}>{request.organizer_name || request.organizer_email || "Organizer"}</Text></View>
                  <View style={styles.requestBadge}><Text style={styles.requestBadgeText}>{request.request_type === "early_payout" ? "Early payout" : "Final settlement"}</Text></View>
                </View>

                <View style={styles.requestAmountBox}><Text style={styles.requestLabel}>ORGANIZER REQUESTED</Text><Text style={styles.requestAmount}>{kwacha(request.requested_amount_mwk)}</Text></View>
                <View style={styles.metricsRow}>
                  <MiniMetric label="Currently eligible" value={request.finance.available_for_payout_mwk} />
                  <MiniMetric label="Refund reserve" value={request.finance.protected_refund_reserve_mwk} />
                  <MiniMetric label="Paid already" value={request.finance.paid_out_mwk} />
                </View>

                {request.status === "pending" ? (
                  <>
                    <Text style={styles.label}>APPROVE AMOUNT (MWK)</Text>
                    <TextInput value={approvedAmounts[request.id] || ""} onChangeText={(text) => setApprovedAmounts((s) => ({ ...s, [request.id]: text }))} keyboardType="numeric" style={styles.input} />
                    <TextInput value={notes[request.id] || ""} onChangeText={(text) => setNotes((s) => ({ ...s, [request.id]: text }))} placeholder="Review note" placeholderTextColor="#9aa3b8" style={styles.input} />
                    <View style={styles.actions}>
                      <Pressable style={[styles.actionBtn, styles.declineBtn]} disabled={busyId === request.id} onPress={() => void review(request, "decline")}><XCircle size={16} color="#a32929" /><Text style={styles.declineText}>Decline</Text></Pressable>
                      <Pressable style={[styles.actionBtn, styles.approveBtn]} disabled={busyId === request.id} onPress={() => void review(request, "approve")}>
                        {busyId === request.id ? <ActivityIndicator size="small" color="#fff" /> : <CheckCircle2 size={16} color="#fff" />}<Text style={styles.approveText}>Approve</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View style={styles.approvedBox}><Banknote size={18} color="#087443" /><Text style={styles.approvedText}>Approved for {kwacha(request.approved_amount_mwk || 0)}. Actual PayChangu payout execution is not connected yet, so this amount remains reserved and cannot be requested again.</Text></View>
                )}
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function State({ children }: { children: React.ReactNode }) { return <View style={styles.state}>{children}</View>; }
function MiniMetric({ label, value }: { label: string; value: number }) { return <View style={styles.miniMetric}><Text style={styles.miniLabel}>{label}</Text><Text style={styles.miniValue} numberOfLines={1}>{kwacha(value)}</Text></View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, content: { padding: 18, paddingBottom: 80, gap: 13 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 }, iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  kicker: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" }, title: { color: TEXT, fontSize: 25, fontWeight: "900", marginTop: 2 },
  securityNote: { borderRadius: 18, backgroundColor: "#e8f7ee", padding: 13, flexDirection: "row", alignItems: "flex-start", gap: 9 }, securityText: { flex: 1, color: "#276346", fontSize: 12, lineHeight: 17, fontWeight: "800" },
  state: { minHeight: 210, borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }, stateText: { color: MUTED, fontWeight: "800" }, errorText: { color: "#a32929", fontWeight: "800", textAlign: "center" },
  sectionTitle: { color: TEXT, fontSize: 19, fontWeight: "900" }, emptyText: { color: MUTED, fontSize: 12, fontWeight: "700" },
  card: { borderRadius: 23, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 15, gap: 10 }, cardHead: { flexDirection: "row", gap: 10, alignItems: "flex-start" }, eventTitle: { color: TEXT, fontSize: 17, fontWeight: "900" }, meta: { color: MUTED, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  statusBadge: { borderRadius: 999, backgroundColor: "#e8f7ee", paddingHorizontal: 8, paddingVertical: 5 }, statusText: { color: "#087443", fontSize: 9, fontWeight: "900", textTransform: "uppercase" }, frozenBadge: { backgroundColor: "#fff4df" }, frozenText: { color: "#8a5a00" }, requestBadge: { borderRadius: 999, backgroundColor: "#eef1ff", paddingHorizontal: 8, paddingVertical: 5 }, requestBadgeText: { color: ACCENT, fontSize: 9, fontWeight: "900" },
  metricsRow: { flexDirection: "row", gap: 7 }, miniMetric: { flex: 1, minWidth: 0, borderRadius: 14, backgroundColor: "#f7f8fc", padding: 9, gap: 4 }, miniLabel: { color: MUTED, fontSize: 8, fontWeight: "800" }, miniValue: { color: TEXT, fontSize: 10, fontWeight: "900" },
  liability: { borderRadius: 14, backgroundColor: "#fff0f0", padding: 10, flexDirection: "row", gap: 7, alignItems: "flex-start" }, liabilityText: { flex: 1, color: "#8a3e3e", fontSize: 10, lineHeight: 15, fontWeight: "800" },
  label: { color: MUTED, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 }, input: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", paddingHorizontal: 12, color: TEXT, fontSize: 13, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 8 }, actionBtn: { flex: 1, minHeight: 45, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, freezeBtn: { backgroundColor: "#fff4df" }, freezeText: { color: "#8a5a00", fontSize: 11, fontWeight: "900" }, openBtn: { backgroundColor: ACCENT }, openText: { color: "#fff", fontSize: 11, fontWeight: "900" }, declineBtn: { backgroundColor: "#fff0f0" }, declineText: { color: "#a32929", fontSize: 11, fontWeight: "900" }, approveBtn: { backgroundColor: "#087443" }, approveText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  requestAmountBox: { borderRadius: 16, backgroundColor: "#eef1ff", padding: 12 }, requestLabel: { color: ACCENT, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 }, requestAmount: { color: TEXT, fontSize: 23, fontWeight: "900", marginTop: 3 }, approvedBox: { borderRadius: 16, backgroundColor: "#e8f7ee", padding: 12, flexDirection: "row", gap: 8, alignItems: "flex-start" }, approvedText: { flex: 1, color: "#276346", fontSize: 11, lineHeight: 16, fontWeight: "800" },
});
