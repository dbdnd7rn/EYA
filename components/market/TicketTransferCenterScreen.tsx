import React from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  ArrowRightLeft,
  Check,
  ChevronRight,
  Clock3,
  Mail,
  Send,
  Ticket,
  X,
} from "lucide-react-native";
import { listMyTickets, type IssuedTicket } from "@/lib/tickets";
import {
  acceptTicketTransfer,
  cancelTicketTransfer,
  declineTicketTransfer,
  listMyTicketTransfers,
  requestTicketTransfer,
  type TicketTransfer,
  type TicketTransferLists,
} from "@/lib/ticketTransfers";
import { useAuth } from "@/providers/AuthProvider";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as BG,
  EYA_BORDER as BORDER,
  EYA_CARD as CARD,
  EYA_MUTED as MUTED,
  EYA_SUCCESS as SUCCESS,
  EYA_TEXT as TEXT,
  eventDateLabel,
  eventLocation,
} from "@/components/market/ticketingUi";

function transferStatusLabel(status: string) {
  switch (status) {
    case "accepted": return "Accepted";
    case "declined": return "Declined";
    case "cancelled": return "Cancelled";
    case "expired": return "Expired";
    default: return "Pending";
  }
}

function transferDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function isTransferable(ticket: IssuedTicket) {
  return String(ticket.status || "").toLowerCase() === "active" && !ticket.checked_in_at;
}

export default function TicketTransferCenterScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId?: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [tickets, setTickets] = React.useState<IssuedTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = React.useState(String(ticketId || ""));
  const [recipientEmail, setRecipientEmail] = React.useState("");
  const [transfers, setTransfers] = React.useState<TicketTransferLists>({ incoming: [], outgoing: [] });
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [working, setWorking] = React.useState<string | null>(null);

  const load = React.useCallback(async (refresh = false) => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const [myTickets, transferLists] = await Promise.all([
        listMyTickets(session.access_token),
        listMyTicketTransfers(),
      ]);
      const transferable = myTickets.filter(isTransferable);
      setTickets(transferable);
      setTransfers(transferLists);
      setSelectedTicketId((current) => {
        if (current && transferable.some((ticket) => ticket.id === current)) return current;
        return transferable[0]?.id || "";
      });
    } catch (error) {
      Alert.alert("Ticket transfers", error instanceof Error ? error.message : "Could not load transfers.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.access_token]);

  React.useEffect(() => { void load(); }, [load]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  async function sendTransfer() {
    if (!selectedTicketId) {
      Alert.alert("Choose a ticket", "Select the ticket you want to transfer.");
      return;
    }
    if (!recipientEmail.trim()) {
      Alert.alert("Recipient email", "Enter the email used on the recipient's EYA account.");
      return;
    }
    try {
      setWorking("send");
      const result = await requestTicketTransfer(selectedTicketId, recipientEmail);
      setRecipientEmail("");
      await load(true);
      Alert.alert(
        "Transfer request sent",
        `${result?.recipient_name || "The recipient"} must accept inside EYA. Your live ticket remains valid until acceptance.`,
      );
    } catch (error) {
      Alert.alert("Could not transfer", error instanceof Error ? error.message : "Could not send ticket transfer.");
    } finally {
      setWorking(null);
    }
  }

  async function act(kind: "accept" | "decline" | "cancel", transfer: TicketTransfer) {
    try {
      setWorking(`${kind}:${transfer.id}`);
      if (kind === "accept") {
        await acceptTicketTransfer(transfer.id);
        Alert.alert("Ticket received", "Ownership moved to your EYA account. The sender's previous live QR is now invalid.");
      } else if (kind === "decline") {
        await declineTicketTransfer(transfer.id);
      } else {
        await cancelTicketTransfer(transfer.id);
      }
      await load(true);
    } catch (error) {
      Alert.alert("Ticket transfer", error instanceof Error ? error.message : "Could not update this transfer.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => router.back()}><ArrowLeft size={22} color={TEXT} /></Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>OWNERSHIP</Text>
            <Text style={styles.title}>Ticket Transfers</Text>
          </View>
          <View style={styles.headerIcon}><ArrowRightLeft size={20} color={ACCENT} /></View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={ACCENT} />}
          contentContainerStyle={styles.content}
        >
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Secure account transfer</Text>
            <Text style={styles.infoText}>The sender keeps control while a request is pending. When the recipient accepts, ownership moves atomically and every old live QR is revoked.</Text>
          </View>

          {loading ? (
            <View style={styles.loadingCard}><ActivityIndicator color={ACCENT} /><Text style={styles.mutedText}>Loading your transferable tickets...</Text></View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>SEND A TICKET</Text>
              {tickets.length ? (
                <View style={styles.card}>
                  <Text style={styles.fieldLabel}>CHOOSE TICKET</Text>
                  <View style={styles.ticketList}>
                    {tickets.map((ticket) => {
                      const active = ticket.id === selectedTicketId;
                      const event = ticket.event as any;
                      const tier = ticket.tier as any;
                      return (
                        <Pressable key={ticket.id} style={[styles.ticketChoice, active && styles.ticketChoiceActive]} onPress={() => setSelectedTicketId(ticket.id)}>
                          <View style={[styles.ticketIcon, active && styles.ticketIconActive]}><Ticket size={18} color={active ? "#ffffff" : ACCENT} /></View>
                          <View style={styles.flexOne}>
                            <Text style={styles.ticketTitle} numberOfLines={1}>{event?.title || "EYA Ticket"}</Text>
                            <Text style={styles.ticketMeta} numberOfLines={1}>{tier?.name || "Ticket"} · {eventDateLabel(event)}</Text>
                            <Text style={styles.ticketRef}>{ticket.ticket_code}</Text>
                          </View>
                          {active ? <Check size={19} color={SUCCESS} /> : <ChevronRight size={18} color={MUTED} />}
                        </Pressable>
                      );
                    })}
                  </View>

                  {selectedTicket ? (
                    <View style={styles.selectedNote}>
                      <Text style={styles.selectedNoteText}>{eventLocation(selectedTicket.event as any)}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.fieldLabel}>RECIPIENT EYA EMAIL</Text>
                  <View style={styles.inputWrap}>
                    <Mail size={18} color={MUTED} />
                    <TextInput
                      value={recipientEmail}
                      onChangeText={setRecipientEmail}
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      placeholder="friend@example.com"
                      placeholderTextColor={MUTED}
                    />
                  </View>
                  <Text style={styles.helper}>Phase 1 transfers to an existing EYA account. Guest links, WhatsApp and printable passes come next.</Text>
                  <Pressable style={[styles.primary, (!selectedTicketId || !recipientEmail.trim() || working === "send") && styles.disabled]} disabled={!selectedTicketId || !recipientEmail.trim() || working === "send"} onPress={() => void sendTransfer()}>
                    {working === "send" ? <ActivityIndicator color="#ffffff" /> : <><Send size={18} color="#ffffff" /><Text style={styles.primaryText}>Send Transfer Request</Text></>}
                  </Pressable>
                </View>
              ) : (
                <View style={styles.emptyCard}><Ticket size={24} color={MUTED} /><Text style={styles.emptyTitle}>No transferable ticket</Text><Text style={styles.mutedText}>Used, cancelled or unavailable tickets cannot be transferred.</Text></View>
              )}

              <TransferSection
                title="INCOMING"
                empty="No tickets waiting for you."
                transfers={transfers.incoming}
                working={working}
                incoming
                onAct={act}
              />
              <TransferSection
                title="OUTGOING"
                empty="You have not sent any transfers yet."
                transfers={transfers.outgoing}
                working={working}
                onAct={act}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function TransferSection({
  title,
  empty,
  transfers,
  incoming = false,
  working,
  onAct,
}: {
  title: string;
  empty: string;
  transfers: TicketTransfer[];
  incoming?: boolean;
  working: string | null;
  onAct: (kind: "accept" | "decline" | "cancel", transfer: TicketTransfer) => Promise<void>;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!transfers.length ? <View style={styles.emptyCard}><Clock3 size={22} color={MUTED} /><Text style={styles.mutedText}>{empty}</Text></View> : null}
      {transfers.map((transfer) => {
        const pending = transfer.status === "pending";
        const busy = Boolean(working?.endsWith(transfer.id));
        return (
          <View key={transfer.id} style={styles.transferCard}>
            <View style={styles.transferTop}>
              <View style={styles.flexOne}>
                <Text style={styles.transferEvent}>{transfer.event_title}</Text>
                <Text style={styles.transferRef}>{transfer.ticket_code}</Text>
              </View>
              <View style={[styles.statusPill, pending && styles.statusPending]}><Text style={[styles.statusText, pending && styles.statusTextPending]}>{transferStatusLabel(transfer.status)}</Text></View>
            </View>
            <Text style={styles.transferPerson}>{incoming ? `From ${transfer.sender_name || "EYA user"}` : `To ${transfer.recipient_name || transfer.recipient_email}`}</Text>
            <Text style={styles.transferTime}>Requested {transferDate(transfer.requested_at)} · expires {transferDate(transfer.expires_at)}</Text>
            {pending ? (
              incoming ? (
                <View style={styles.actionRow}>
                  <Pressable disabled={busy} style={[styles.secondary, busy && styles.disabled]} onPress={() => void onAct("decline", transfer)}><X size={17} color={TEXT} /><Text style={styles.secondaryText}>Decline</Text></Pressable>
                  <Pressable disabled={busy} style={[styles.primarySmall, busy && styles.disabled]} onPress={() => void onAct("accept", transfer)}>{busy ? <ActivityIndicator color="#ffffff" /> : <><Check size={17} color="#ffffff" /><Text style={styles.primaryText}>Accept</Text></>}</Pressable>
                </View>
              ) : (
                <Pressable disabled={busy} style={[styles.secondaryWide, busy && styles.disabled]} onPress={() => void onAct("cancel", transfer)}>{busy ? <ActivityIndicator color={ACCENT} /> : <><X size={17} color={ACCENT} /><Text style={styles.cancelText}>Cancel transfer</Text></>}</Pressable>
              )
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safe: { flex: 1 },
  header: { minHeight: 76, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { color: ACCENT, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: TEXT, fontSize: 22, fontWeight: "900", marginTop: 2 },
  headerIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: "#edf0ff", alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 18, paddingBottom: 54, gap: 16 },
  infoCard: { borderRadius: 20, borderWidth: 1, borderColor: "#d8e0ff", backgroundColor: "#f0f3ff", padding: 15 },
  infoTitle: { color: TEXT, fontSize: 14, fontWeight: "900" },
  infoText: { color: MUTED, fontSize: 11, lineHeight: 17, fontWeight: "700", marginTop: 5 },
  loadingCard: { minHeight: 130, borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", gap: 10 },
  section: { gap: 9 },
  sectionTitle: { color: TEXT, fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  card: { borderRadius: 22, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 14, gap: 12 },
  fieldLabel: { color: MUTED, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  ticketList: { gap: 8 },
  ticketChoice: { minHeight: 78, borderRadius: 17, borderWidth: 1, borderColor: BORDER, padding: 10, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: BG },
  ticketChoiceActive: { borderColor: ACCENT, backgroundColor: "#f1f3ff" },
  ticketIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  ticketIconActive: { backgroundColor: ACCENT },
  ticketTitle: { color: TEXT, fontSize: 12, fontWeight: "900" },
  ticketMeta: { color: MUTED, fontSize: 9, fontWeight: "700", marginTop: 3 },
  ticketRef: { color: ACCENT, fontSize: 8, fontWeight: "900", marginTop: 4 },
  selectedNote: { borderRadius: 13, backgroundColor: BG, paddingHorizontal: 11, paddingVertical: 8 },
  selectedNoteText: { color: MUTED, fontSize: 9, fontWeight: "800" },
  inputWrap: { height: 50, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: BG, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13 },
  input: { flex: 1, color: TEXT, fontSize: 13, fontWeight: "700" },
  helper: { color: MUTED, fontSize: 9, lineHeight: 14, fontWeight: "700" },
  primary: { minHeight: 50, borderRadius: 16, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primarySmall: { flex: 1, minHeight: 44, borderRadius: 14, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  primaryText: { color: "#ffffff", fontSize: 11, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  emptyCard: { minHeight: 82, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center", gap: 7, padding: 14 },
  emptyTitle: { color: TEXT, fontSize: 12, fontWeight: "900" },
  mutedText: { color: MUTED, fontSize: 10, lineHeight: 15, fontWeight: "700", textAlign: "center" },
  transferCard: { borderRadius: 19, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 13, gap: 7 },
  transferTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  transferEvent: { color: TEXT, fontSize: 13, fontWeight: "900" },
  transferRef: { color: MUTED, fontSize: 8, fontWeight: "800", marginTop: 3 },
  transferPerson: { color: TEXT, fontSize: 10, fontWeight: "800" },
  transferTime: { color: MUTED, fontSize: 8, fontWeight: "700" },
  statusPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: BG },
  statusPending: { backgroundColor: "#fff4d8" },
  statusText: { color: MUTED, fontSize: 7, fontWeight: "900", textTransform: "uppercase" },
  statusTextPending: { color: "#9a6900" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  secondary: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  secondaryText: { color: TEXT, fontSize: 10, fontWeight: "900" },
  secondaryWide: { minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: "#d9e1ff", backgroundColor: "#f3f5ff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 4 },
  cancelText: { color: ACCENT, fontSize: 10, fontWeight: "900" },
  flexOne: { flex: 1, minWidth: 0 },
});
