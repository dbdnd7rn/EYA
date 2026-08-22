import React from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Banknote, CheckCircle2, Clock3, GitCompareArrows, MapPin, RotateCcw, ShieldCheck, UserPlus, XCircle } from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import { listPendingAdminTicketEvents, reviewAdminTicketEvent, type AdminTicketReviewEvent } from "@/lib/adminTicketReviewApi";

const BG = "#f5f7fc";
const CARD = "#ffffff";
const TEXT = "#102a54";
const MUTED = "#6e7892";
const ACCENT = "#5e73dd";
const BORDER = "#e4e8f2";

function dateTimeLabel(value: string | null) {
  if (!value) return "Not restricted";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function saleWindowLabel(startsAt: string | null, endsAt: string | null) {
  if (!startsAt && !endsAt) return "Sale window: event default";
  if (startsAt && endsAt) return `Sale: ${dateTimeLabel(startsAt)} → ${dateTimeLabel(endsAt)}`;
  if (startsAt) return `Sale starts: ${dateTimeLabel(startsAt)}`;
  return `Sale ends: ${dateTimeLabel(endsAt)}`;
}

export default function AdminEventReviewsScreen() {
  const router = useRouter();
  const [events, setEvents] = React.useState<AdminTicketReviewEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      setError(null);
      setEvents(await listPendingAdminTicketEvents());
    } catch (e: any) {
      setError(e?.message || "Could not load review queue.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const act = async (event: AdminTicketReviewEvent, action: "approve" | "request_changes" | "reject") => {
    const note = (notes[event.id] || "").trim();
    if ((action === "request_changes" || action === "reject") && !note) {
      Alert.alert("Review note required", "Explain what the organizer needs to change or why the event is rejected.");
      return;
    }
    const approve = action === "approve";
    const label = approve ? "Approve Event + Tickets" : action === "request_changes" ? "Request changes" : "Reject event";
    const capacity = event.tiers.reduce((sum, tier) => sum + tier.capacity_total, 0);
    const message = approve
      ? `Publish ${event.title} with ${event.tiers.length} ticket type${event.tiers.length === 1 ? "" : "s"} and ${capacity.toLocaleString()} total capacity?\n\nThis approval locks the submitted event details plus each ticket price, capacity, availability and sale window into an EYA approval version.`
      : `${label} for ${event.title}?`;

    Alert.alert(label, message, [
      { text: "Cancel", style: "cancel" },
      { text: approve ? "Approve + Publish" : label, style: action === "reject" ? "destructive" : "default", onPress: async () => {
        try {
          setBusyId(event.id);
          const result = await reviewAdminTicketEvent({ eventId: event.id, action, note });
          setEvents((current) => current.filter((row) => row.id !== event.id));
          if (approve) Alert.alert("Event + tickets approved", `Published successfully${result.approved_version_number ? ` as EYA approval version ${result.approved_version_number}` : ""}. Any material event or ticket change must return through EYA review.`);
        } catch (e: any) {
          Alert.alert("Review failed", e?.message || "Could not review this event.");
        } finally {
          setBusyId(null);
        }
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={ACCENT} />}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}><ArrowLeft size={21} color={TEXT} /></Pressable>
          <View style={{ flex: 1 }}><Text style={styles.kicker}>EYA Admin</Text><Text style={styles.title}>Event review queue</Text></View>
          <View style={styles.countBadge}><Text style={styles.countText}>{events.length}</Text></View>
        </View>

        <View style={styles.securityNote}><ShieldCheck size={19} color="#087443" /><Text style={styles.securityText}>Admin approves the event and the exact ticket configuration together. Organizer submissions are never public or purchasable before this approval.</Text></View>

        <Pressable style={styles.organizerAccessBtn} onPress={() => router.push("/admin/organizer-access" as any)}>
          <View style={styles.organizerAccessIcon}><UserPlus size={20} color={ACCENT} /></View>
          <View style={{ flex: 1 }}><Text style={styles.organizerAccessTitle}>Temporary organizer access</Text><Text style={styles.organizerAccessSub}>Invite, renew, expire, revoke or re-enable Organizer Workspace access.</Text></View>
        </Pressable>

        <Pressable style={styles.organizerAccessBtn} onPress={() => router.push("/admin/event-revisions" as any)}>
          <View style={styles.organizerAccessIcon}><GitCompareArrows size={20} color={ACCENT} /></View>
          <View style={{ flex: 1 }}><Text style={styles.organizerAccessTitle}>Live event revisions</Text><Text style={styles.organizerAccessSub}>Compare the currently approved customer version against proposed organizer changes before replacing it.</Text></View>
        </Pressable>

        <Pressable style={styles.organizerAccessBtn} onPress={() => router.push("/admin/event-payouts" as any)}>
          <View style={styles.organizerAccessIcon}><Banknote size={20} color={ACCENT} /></View>
          <View style={{ flex: 1 }}><Text style={styles.organizerAccessTitle}>Event finance & payouts</Text><Text style={styles.organizerAccessSub}>Configure refund reserves and review organizer Early Payout / Final Settlement requests.</Text></View>
        </Pressable>

        {loading ? <State><ActivityIndicator color={ACCENT} /><Text style={styles.stateText}>Loading submissions...</Text></State> : null}
        {!loading && error ? <State><Text style={styles.errorText}>{error}</Text><Pressable style={styles.retryBtn} onPress={() => void load()}><Text style={styles.retryText}>Try again</Text></Pressable></State> : null}
        {!loading && !error && !events.length ? <State><CheckCircle2 size={34} color="#087443" /><Text style={styles.emptyTitle}>Review queue is clear</Text><Text style={styles.stateText}>New organizer event + ticket submissions will appear here.</Text></State> : null}

        {!loading && !error ? <View style={styles.list}>{events.map((event) => {
          const totalCapacity = event.tiers.reduce((sum, tier) => sum + tier.capacity_total, 0);
          return (
            <View key={event.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.meta}>{event.category} · {event.date_label}</Text></View>
                <View style={styles.pendingBadge}><Clock3 size={12} color="#8a5a00" /><Text style={styles.pendingText}>Pending</Text></View>
              </View>
              <View style={styles.infoRow}><MapPin size={15} color={MUTED} /><Text style={styles.infoText}>{event.venue}, {event.city}</Text></View>
              <Text style={styles.description}>{event.description || "No event description provided."}</Text>
              <View style={styles.organizerBox}><Text style={styles.boxLabel}>ORGANIZER</Text><Text style={styles.organizerName}>{event.organizer?.full_name || event.organizer?.email || "Temporary organizer"}</Text>{event.organizer?.email ? <Text style={styles.smallText}>{event.organizer.email}</Text> : null}{event.organizer?.phone ? <Text style={styles.smallText}>{event.organizer.phone}</Text> : null}</View>

              <View style={styles.tierList}>
                <View style={styles.ticketSectionHead}><View><Text style={styles.boxLabel}>TICKETS TO APPROVE</Text><Text style={styles.ticketSummary}>{event.tiers.length} type{event.tiers.length === 1 ? "" : "s"} · {totalCapacity.toLocaleString()} total capacity</Text></View></View>
                {event.tiers.map((tier) => (
                  <View key={tier.id} style={styles.tierRow}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <View style={styles.tierTitleRow}><Text style={styles.tierName}>{tier.name}</Text><View style={[styles.availabilityBadge, !tier.available && styles.unavailableBadge]}><Text style={[styles.availabilityText, !tier.available && styles.unavailableText]}>{tier.available ? "Available" : "Disabled"}</Text></View></View>
                      {tier.description ? <Text style={styles.smallText}>{tier.description}</Text> : null}
                      <Text style={styles.smallText}>{tier.capacity_total.toLocaleString()} capacity · {tier.capacity_sold.toLocaleString()} already sold · {tier.capacity_reserved.toLocaleString()} reserved</Text>
                      <Text style={styles.saleText}>{saleWindowLabel(tier.sale_starts_at, tier.sale_ends_at)}</Text>
                    </View>
                    <Text style={styles.tierPrice}>{kwacha(tier.price_mwk)}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.approvalLockBox}><ShieldCheck size={18} color="#087443" /><Text style={styles.approvalLockText}>Approval creates an immutable EYA version of these event and ticket terms. Price, capacity, venue, date, ticket availability or sale-window changes cannot silently reuse this approval.</Text></View>
              <View style={styles.noteWrap}><Text style={styles.boxLabel}>REVIEW NOTE</Text><TextInput value={notes[event.id] || ""} onChangeText={(text) => setNotes((current) => ({ ...current, [event.id]: text }))} placeholder="Required when requesting changes or rejecting" placeholderTextColor="#9aa3b8" multiline style={styles.noteInput} /></View>
              <View style={styles.actions}>
                <Pressable style={[styles.actionBtn, styles.changesBtn]} disabled={busyId === event.id} onPress={() => void act(event, "request_changes")}><RotateCcw size={16} color="#a35b00" /><Text style={styles.changesText}>Changes</Text></Pressable>
                <Pressable style={[styles.actionBtn, styles.rejectBtn]} disabled={busyId === event.id} onPress={() => void act(event, "reject")}><XCircle size={16} color="#a32929" /><Text style={styles.rejectText}>Reject</Text></Pressable>
                <Pressable style={[styles.actionBtn, styles.approveBtn]} disabled={busyId === event.id} onPress={() => void act(event, "approve")}>{busyId === event.id ? <ActivityIndicator size="small" color="#fff" /> : <CheckCircle2 size={16} color="#fff" />}<Text style={styles.approveText}>Approve Event + Tickets</Text></Pressable>
              </View>
            </View>
          );
        })}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function State({ children }: { children: React.ReactNode }) { return <View style={styles.state}>{children}</View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, content: { padding: 18, paddingBottom: 80, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 }, iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  kicker: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" }, title: { color: TEXT, fontSize: 25, fontWeight: "900", marginTop: 2 }, countBadge: { minWidth: 42, height: 42, borderRadius: 21, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" }, countText: { color: ACCENT, fontSize: 16, fontWeight: "900" },
  securityNote: { borderRadius: 18, backgroundColor: "#e8f7ee", padding: 13, flexDirection: "row", alignItems: "center", gap: 9 }, securityText: { flex: 1, color: "#276346", fontSize: 12, lineHeight: 17, fontWeight: "800" },
  organizerAccessBtn: { minHeight: 72, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 11 }, organizerAccessIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" }, organizerAccessTitle: { color: TEXT, fontSize: 14, fontWeight: "900" }, organizerAccessSub: { color: MUTED, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  state: { minHeight: 190, borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }, stateText: { color: MUTED, fontSize: 13, lineHeight: 18, fontWeight: "700", textAlign: "center" }, emptyTitle: { color: TEXT, fontSize: 19, fontWeight: "900" }, errorText: { color: "#a32929", fontWeight: "800", textAlign: "center" }, retryBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: "#eef1ff" }, retryText: { color: ACCENT, fontWeight: "900" },
  list: { gap: 14 }, card: { borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 13 }, cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, eventTitle: { color: TEXT, fontSize: 19, lineHeight: 23, fontWeight: "900" }, meta: { color: MUTED, fontSize: 12, fontWeight: "700", marginTop: 3 }, pendingBadge: { borderRadius: 999, backgroundColor: "#fff4d9", paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }, pendingText: { color: "#8a5a00", fontSize: 10, fontWeight: "900" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 7 }, infoText: { color: MUTED, fontSize: 12, fontWeight: "800" }, description: { color: "#4f5d7a", fontSize: 13, lineHeight: 19, fontWeight: "700" }, organizerBox: { backgroundColor: "#f7f8fc", borderRadius: 16, padding: 12, gap: 3 }, boxLabel: { color: MUTED, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, organizerName: { color: TEXT, fontSize: 14, fontWeight: "900", marginTop: 2 }, smallText: { color: MUTED, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  tierList: { gap: 8 }, ticketSectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, ticketSummary: { color: TEXT, fontSize: 12, fontWeight: "900", marginTop: 3 }, tierRow: { borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 11, flexDirection: "row", alignItems: "flex-start", gap: 10 }, tierTitleRow: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }, tierName: { color: TEXT, fontSize: 13, fontWeight: "900" }, tierPrice: { color: TEXT, fontSize: 13, fontWeight: "900", paddingTop: 2 },
  availabilityBadge: { borderRadius: 999, backgroundColor: "#e4f7ec", paddingHorizontal: 7, paddingVertical: 3 }, availabilityText: { color: "#087443", fontSize: 8, fontWeight: "900" }, unavailableBadge: { backgroundColor: "#fff0f0" }, unavailableText: { color: "#a32929" }, saleText: { color: "#53617d", fontSize: 10, lineHeight: 15, fontWeight: "800" }, approvalLockBox: { borderRadius: 16, backgroundColor: "#e8f7ee", padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 9 }, approvalLockText: { flex: 1, color: "#276346", fontSize: 11, lineHeight: 17, fontWeight: "800" },
  noteWrap: { gap: 6 }, noteInput: { minHeight: 84, borderRadius: 15, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", padding: 12, color: TEXT, fontSize: 13, fontWeight: "700", textAlignVertical: "top" }, actions: { flexDirection: "row", gap: 8 }, actionBtn: { flex: 1, minHeight: 48, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 6 }, changesBtn: { backgroundColor: "#fff4df" }, rejectBtn: { backgroundColor: "#fff0f0" }, approveBtn: { backgroundColor: "#087443", flex: 1.45 }, changesText: { color: "#a35b00", fontSize: 11, fontWeight: "900" }, rejectText: { color: "#a32929", fontSize: 11, fontWeight: "900" }, approveText: { color: "#fff", fontSize: 9, lineHeight: 12, fontWeight: "900", textAlign: "center" },
});
