import React from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, CheckCircle2, Clock3, MapPin, RotateCcw, ShieldCheck, UserPlus, XCircle } from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import { listPendingAdminTicketEvents, reviewAdminTicketEvent, type AdminTicketReviewEvent } from "@/lib/adminTicketReviewApi";

const BG = "#f5f7fc";
const CARD = "#ffffff";
const TEXT = "#102a54";
const MUTED = "#6e7892";
const ACCENT = "#5e73dd";
const BORDER = "#e4e8f2";

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

  React.useEffect(() => {
    void load();
  }, [load]);

  const act = async (event: AdminTicketReviewEvent, action: "approve" | "request_changes" | "reject") => {
    const note = (notes[event.id] || "").trim();
    if ((action === "request_changes" || action === "reject") && !note) {
      Alert.alert("Review note required", "Explain what the organizer needs to change or why the event is rejected.");
      return;
    }
    const label = action === "approve" ? "Approve & publish" : action === "request_changes" ? "Request changes" : "Reject event";
    Alert.alert(label, action === "approve" ? `Publish ${event.title} to the customer ticket marketplace?` : `${label} for ${event.title}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: label,
        style: action === "reject" ? "destructive" : "default",
        onPress: async () => {
          try {
            setBusyId(event.id);
            await reviewAdminTicketEvent({ eventId: event.id, action, note });
            setEvents((current) => current.filter((row) => row.id !== event.id));
          } catch (e: any) {
            Alert.alert("Review failed", e?.message || "Could not review this event.");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={ACCENT} />}
      >
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}><ArrowLeft size={21} color={TEXT} /></Pressable>
          <View style={{ flex: 1 }}><Text style={styles.kicker}>EYA Admin</Text><Text style={styles.title}>Event review queue</Text></View>
          <View style={styles.countBadge}><Text style={styles.countText}>{events.length}</Text></View>
        </View>

        <View style={styles.securityNote}>
          <ShieldCheck size={19} color="#087443" />
          <Text style={styles.securityText}>Only an Admin approval can move an organizer submission into the published customer marketplace.</Text>
        </View>

        <Pressable style={styles.organizerAccessBtn} onPress={() => router.push("/admin/organizer-access" as any)}>
          <View style={styles.organizerAccessIcon}><UserPlus size={20} color={ACCENT} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.organizerAccessTitle}>Temporary organizer access</Text>
            <Text style={styles.organizerAccessSub}>Grant, renew, expire or revoke Event Studio access.</Text>
          </View>
        </Pressable>

        {loading ? <State><ActivityIndicator color={ACCENT} /><Text style={styles.stateText}>Loading submissions...</Text></State> : null}
        {!loading && error ? <State><Text style={styles.errorText}>{error}</Text><Pressable style={styles.retryBtn} onPress={() => void load()}><Text style={styles.retryText}>Try again</Text></Pressable></State> : null}
        {!loading && !error && !events.length ? <State><CheckCircle2 size={34} color="#087443" /><Text style={styles.emptyTitle}>Review queue is clear</Text><Text style={styles.stateText}>New organizer submissions will appear here.</Text></State> : null}

        {!loading && !error ? <View style={styles.list}>{events.map((event) => (
          <View key={event.id} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.meta}>{event.category} · {event.date_label}</Text>
              </View>
              <View style={styles.pendingBadge}><Clock3 size={12} color="#8a5a00" /><Text style={styles.pendingText}>Pending</Text></View>
            </View>

            <View style={styles.infoRow}><MapPin size={15} color={MUTED} /><Text style={styles.infoText}>{event.venue}, {event.city}</Text></View>
            <Text style={styles.description}>{event.description || "No event description provided."}</Text>

            <View style={styles.organizerBox}>
              <Text style={styles.boxLabel}>ORGANIZER</Text>
              <Text style={styles.organizerName}>{event.organizer?.full_name || event.organizer?.email || "EYA user"}</Text>
              {event.organizer?.email ? <Text style={styles.smallText}>{event.organizer.email}</Text> : null}
              {event.organizer?.phone ? <Text style={styles.smallText}>{event.organizer.phone}</Text> : null}
            </View>

            <View style={styles.tierList}>
              <Text style={styles.boxLabel}>TICKET TYPES</Text>
              {event.tiers.map((tier) => <View key={tier.id} style={styles.tierRow}><View style={{ flex: 1 }}><Text style={styles.tierName}>{tier.name}</Text><Text style={styles.smallText}>{tier.capacity_total.toLocaleString()} capacity</Text></View><Text style={styles.tierPrice}>{kwacha(tier.price_mwk)}</Text></View>)}
            </View>

            <View style={styles.noteWrap}>
              <Text style={styles.boxLabel}>REVIEW NOTE</Text>
              <TextInput
                value={notes[event.id] || ""}
                onChangeText={(text) => setNotes((current) => ({ ...current, [event.id]: text }))}
                placeholder="Required when requesting changes or rejecting"
                placeholderTextColor="#9aa3b8"
                multiline
                style={styles.noteInput}
              />
            </View>

            <View style={styles.actions}>
              <Pressable style={[styles.actionBtn, styles.changesBtn]} disabled={busyId === event.id} onPress={() => void act(event, "request_changes")}><RotateCcw size={16} color="#a35b00" /><Text style={styles.changesText}>Changes</Text></Pressable>
              <Pressable style={[styles.actionBtn, styles.rejectBtn]} disabled={busyId === event.id} onPress={() => void act(event, "reject")}><XCircle size={16} color="#a32929" /><Text style={styles.rejectText}>Reject</Text></Pressable>
              <Pressable style={[styles.actionBtn, styles.approveBtn]} disabled={busyId === event.id} onPress={() => void act(event, "approve")}>
                {busyId === event.id ? <ActivityIndicator size="small" color="#fff" /> : <CheckCircle2 size={16} color="#fff" />}<Text style={styles.approveText}>Approve</Text>
              </Pressable>
            </View>
          </View>
        ))}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function State({ children }: { children: React.ReactNode }) { return <View style={styles.state}>{children}</View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, content: { padding: 18, paddingBottom: 80, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 }, iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  kicker: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" }, title: { color: TEXT, fontSize: 25, fontWeight: "900", marginTop: 2 },
  countBadge: { minWidth: 42, height: 42, borderRadius: 21, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" }, countText: { color: ACCENT, fontSize: 16, fontWeight: "900" },
  securityNote: { borderRadius: 18, backgroundColor: "#e8f7ee", padding: 13, flexDirection: "row", alignItems: "center", gap: 9 }, securityText: { flex: 1, color: "#276346", fontSize: 12, lineHeight: 17, fontWeight: "800" },
  organizerAccessBtn: { minHeight: 72, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  organizerAccessIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  organizerAccessTitle: { color: TEXT, fontSize: 14, fontWeight: "900" },
  organizerAccessSub: { color: MUTED, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  state: { minHeight: 190, borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }, stateText: { color: MUTED, fontSize: 13, lineHeight: 18, fontWeight: "700", textAlign: "center" }, emptyTitle: { color: TEXT, fontSize: 19, fontWeight: "900" }, errorText: { color: "#a32929", fontWeight: "800", textAlign: "center" }, retryBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: "#eef1ff" }, retryText: { color: ACCENT, fontWeight: "900" },
  list: { gap: 14 }, card: { borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 13 }, cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, eventTitle: { color: TEXT, fontSize: 19, lineHeight: 23, fontWeight: "900" }, meta: { color: MUTED, fontSize: 12, fontWeight: "700", marginTop: 3 },
  pendingBadge: { borderRadius: 999, backgroundColor: "#fff4d9", paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }, pendingText: { color: "#8a5a00", fontSize: 10, fontWeight: "900" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 7 }, infoText: { color: MUTED, fontSize: 12, fontWeight: "800" }, description: { color: "#4f5d7a", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  organizerBox: { backgroundColor: "#f7f8fc", borderRadius: 16, padding: 12, gap: 3 }, boxLabel: { color: MUTED, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, organizerName: { color: TEXT, fontSize: 14, fontWeight: "900", marginTop: 2 }, smallText: { color: MUTED, fontSize: 11, fontWeight: "700" },
  tierList: { gap: 8 }, tierRow: { borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 11, flexDirection: "row", alignItems: "center", gap: 10 }, tierName: { color: TEXT, fontSize: 13, fontWeight: "900" }, tierPrice: { color: TEXT, fontSize: 13, fontWeight: "900" },
  noteWrap: { gap: 6 }, noteInput: { minHeight: 84, borderRadius: 15, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", padding: 12, color: TEXT, fontSize: 13, fontWeight: "700", textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 8 }, actionBtn: { flex: 1, minHeight: 45, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, changesBtn: { backgroundColor: "#fff4df" }, rejectBtn: { backgroundColor: "#fff0f0" }, approveBtn: { backgroundColor: "#087443" }, changesText: { color: "#a35b00", fontSize: 11, fontWeight: "900" }, rejectText: { color: "#a32929", fontSize: 11, fontWeight: "900" }, approveText: { color: "#fff", fontSize: 11, fontWeight: "900" },
});
