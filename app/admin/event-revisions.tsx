import React from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, CheckCircle2, Clock3, RotateCcw, ShieldCheck, XCircle } from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import { listPendingAdminTicketRevisions, reviewAdminTicketRevision, type AdminTicketRevisionReview, type AdminTicketRevisionTier } from "@/lib/adminTicketRevisionApi";

const BG = "#f5f7fc";
const CARD = "#fff";
const TEXT = "#102a54";
const MUTED = "#6e7892";
const ACCENT = "#5e73dd";
const BORDER = "#e4e8f2";

function same(a: unknown, b: unknown) {
  return String(a ?? "") === String(b ?? "");
}

function timeLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function DiffRow({ label, live, proposed }: { label: string; live: unknown; proposed: unknown }) {
  const changed = !same(live, proposed);
  return (
    <View style={[styles.diffRow, changed && styles.diffChanged]}>
      <Text style={styles.diffLabel}>{label}</Text>
      <View style={styles.diffColumns}>
        <View style={{ flex: 1 }}><Text style={styles.versionLabel}>CURRENT LIVE</Text><Text style={styles.diffValue}>{String(live ?? "—")}</Text></View>
        <View style={{ flex: 1 }}><Text style={styles.versionLabel}>PROPOSED</Text><Text style={[styles.diffValue, changed && styles.proposedValue]}>{String(proposed ?? "—")}</Text></View>
      </View>
    </View>
  );
}

function TicketDiff({ live, proposed }: { live?: AdminTicketRevisionTier; proposed: AdminTicketRevisionTier }) {
  return (
    <View style={styles.ticketCard}>
      <Text style={styles.ticketTitle}>{proposed.name}</Text>
      {!live ? <Text style={styles.newTier}>NEW TICKET TYPE</Text> : null}
      <DiffRow label="Price" live={live ? kwacha(live.price_mwk) : "—"} proposed={kwacha(proposed.price_mwk)} />
      <DiffRow label="Capacity" live={live?.capacity_total ?? "—"} proposed={proposed.capacity_total} />
      <DiffRow label="Available" live={live ? (live.available ? "Yes" : "No") : "—"} proposed={proposed.available ? "Yes" : "No"} />
      <DiffRow label="Sale starts" live={timeLabel(live?.sale_starts_at)} proposed={timeLabel(proposed.sale_starts_at)} />
      <DiffRow label="Sale ends" live={timeLabel(live?.sale_ends_at)} proposed={timeLabel(proposed.sale_ends_at)} />
      {live ? <Text style={styles.soldNote}>Already sold/reserved: {(live.capacity_sold ?? 0).toLocaleString()} / {(live.capacity_reserved ?? 0).toLocaleString()}</Text> : null}
    </View>
  );
}

export default function AdminEventRevisionsScreen() {
  const router = useRouter();
  const [rows, setRows] = React.useState<AdminTicketRevisionReview[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      setError(null);
      setRows(await listPendingAdminTicketRevisions());
    } catch (e: any) {
      setError(e?.message || "Could not load live event revisions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const act = (row: AdminTicketRevisionReview, action: "approve" | "request_changes" | "reject") => {
    const note = (notes[row.id] || "").trim();
    if ((action === "request_changes" || action === "reject") && !note) {
      Alert.alert("Review note required", "Explain what the organizer must change or why the revision is rejected.");
      return;
    }
    const label = action === "approve" ? "Approve proposed changes" : action === "request_changes" ? "Request changes" : "Reject revision";
    const body = action === "approve"
      ? "This atomically replaces the current live event and approved ticket terms. Customers keep seeing the current live event until this approval succeeds."
      : `${label} for ${row.revision_event.title}?`;
    Alert.alert(label, body, [
      { text: "Cancel", style: "cancel" },
      { text: label, style: action === "reject" ? "destructive" : "default", onPress: async () => {
        try {
          setBusy(row.id);
          await reviewAdminTicketRevision({ revisionId: row.id, action, note });
          setRows((current) => current.filter((item) => item.id !== row.id));
        } catch (e: any) {
          Alert.alert("Revision review failed", e?.message || "Try again.");
        } finally {
          setBusy(null);
        }
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={ACCENT} />}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}><ArrowLeft size={21} color={TEXT} /></Pressable>
          <View style={{ flex: 1 }}><Text style={styles.kicker}>EYA Admin</Text><Text style={styles.title}>Live revisions</Text></View>
          <View style={styles.count}><Text style={styles.countText}>{rows.length}</Text></View>
        </View>

        <View style={styles.securityNote}><ShieldCheck size={19} color="#087443" /><Text style={styles.securityText}>Customers continue buying the current approved event while these proposed changes wait for Admin approval.</Text></View>

        {loading ? <State><ActivityIndicator color={ACCENT} /><Text style={styles.stateText}>Loading revisions...</Text></State> : null}
        {!loading && error ? <State><Text style={styles.errorText}>{error}</Text><Pressable style={styles.retry} onPress={() => void load()}><Text style={styles.retryText}>Try again</Text></Pressable></State> : null}
        {!loading && !error && !rows.length ? <State><CheckCircle2 size={34} color="#087443" /><Text style={styles.emptyTitle}>No live changes waiting</Text><Text style={styles.stateText}>Published events remain on their current approved terms.</Text></State> : null}

        {!loading && !error ? rows.map((row) => {
          const liveTiers = new Map(row.live_tiers.map((tier) => [tier.id, tier]));
          return (
            <View key={row.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}><Text style={styles.eventTitle}>{row.revision_event.title}</Text><Text style={styles.meta}>Current live event → proposed changes</Text></View>
                <View style={styles.pending}><Clock3 size={12} color="#8a5a00" /><Text style={styles.pendingText}>Review</Text></View>
              </View>
              <Text style={styles.organizer}>{row.organizer?.full_name || row.organizer?.email || "Organizer"}</Text>
              <DiffRow label="Title" live={row.live_event.title} proposed={row.revision_event.title} />
              <DiffRow label="Venue" live={row.live_event.venue} proposed={row.revision_event.venue} />
              <DiffRow label="City" live={row.live_event.city} proposed={row.revision_event.city} />
              <DiffRow label="Display date" live={row.live_event.date_label} proposed={row.revision_event.date_label} />
              <DiffRow label="Start" live={timeLabel(row.live_event.starts_at)} proposed={timeLabel(row.revision_event.starts_at)} />
              <DiffRow label="End" live={timeLabel(row.live_event.ends_at)} proposed={timeLabel(row.revision_event.ends_at)} />

              <Text style={styles.sectionTitle}>Ticket changes</Text>
              {row.revision_tiers.map((tier) => <TicketDiff key={tier.id} proposed={tier} live={tier.source_tier_id ? liveTiers.get(tier.source_tier_id) : undefined} />)}

              <TextInput
                style={styles.note}
                multiline
                value={notes[row.id] || ""}
                onChangeText={(value) => setNotes((current) => ({ ...current, [row.id]: value }))}
                placeholder="Admin review note"
                placeholderTextColor="#9aa3b8"
              />
              <View style={styles.actions}>
                <Pressable style={[styles.action, styles.change]} disabled={busy === row.id} onPress={() => act(row, "request_changes")}><RotateCcw size={15} color="#a35b00" /><Text style={styles.changeText}>Changes</Text></Pressable>
                <Pressable style={[styles.action, styles.reject]} disabled={busy === row.id} onPress={() => act(row, "reject")}><XCircle size={15} color="#a32929" /><Text style={styles.rejectText}>Reject</Text></Pressable>
                <Pressable style={[styles.action, styles.approve]} disabled={busy === row.id} onPress={() => act(row, "approve")}>{busy === row.id ? <ActivityIndicator size="small" color="#fff" /> : <CheckCircle2 size={15} color="#fff" />}<Text style={styles.approveText}>Approve changes</Text></Pressable>
              </View>
            </View>
          );
        }) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function State({ children }: { children: React.ReactNode }) { return <View style={styles.state}>{children}</View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, content: { padding: 18, paddingBottom: 90, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 }, iconBtn: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", justifyContent: "center" },
  kicker: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1 }, title: { color: TEXT, fontSize: 26, fontWeight: "900" }, count: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" }, countText: { color: ACCENT, fontWeight: "900" },
  securityNote: { borderRadius: 18, backgroundColor: "#e8f7ee", padding: 13, flexDirection: "row", gap: 9, alignItems: "center" }, securityText: { flex: 1, color: "#276346", fontSize: 12, lineHeight: 17, fontWeight: "800" },
  state: { minHeight: 180, borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", gap: 10, padding: 22 }, stateText: { color: MUTED, fontSize: 12, fontWeight: "700", textAlign: "center" }, errorText: { color: "#a32929", fontWeight: "800" }, retry: { padding: 10 }, retryText: { color: ACCENT, fontWeight: "900" }, emptyTitle: { color: TEXT, fontSize: 18, fontWeight: "900" },
  card: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 24, padding: 16, gap: 12 }, cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 }, eventTitle: { color: TEXT, fontSize: 19, fontWeight: "900" }, meta: { color: MUTED, fontSize: 11, fontWeight: "800", marginTop: 3 }, organizer: { color: "#4f5d7a", fontSize: 12, fontWeight: "800" }, pending: { backgroundColor: "#fff4d9", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, flexDirection: "row", gap: 4, alignItems: "center" }, pendingText: { color: "#8a5a00", fontSize: 10, fontWeight: "900" },
  diffRow: { borderRadius: 15, borderWidth: 1, borderColor: BORDER, padding: 10, gap: 7 }, diffChanged: { backgroundColor: "#fffaf0", borderColor: "#f1dca8" }, diffLabel: { color: MUTED, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 }, diffColumns: { flexDirection: "row", gap: 12 }, versionLabel: { color: MUTED, fontSize: 8, fontWeight: "900" }, diffValue: { color: TEXT, fontSize: 11, lineHeight: 16, fontWeight: "800", marginTop: 2 }, proposedValue: { color: "#875600" },
  sectionTitle: { color: TEXT, fontSize: 16, fontWeight: "900", marginTop: 4 }, ticketCard: { borderRadius: 18, backgroundColor: "#f8f9fc", padding: 12, gap: 8 }, ticketTitle: { color: TEXT, fontSize: 14, fontWeight: "900" }, newTier: { color: ACCENT, fontSize: 9, fontWeight: "900" }, soldNote: { color: MUTED, fontSize: 10, fontWeight: "700" },
  note: { minHeight: 78, borderRadius: 15, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", padding: 12, color: TEXT, fontSize: 12, fontWeight: "700", textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 7 }, action: { flex: 1, minHeight: 44, borderRadius: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }, change: { backgroundColor: "#fff4df" }, reject: { backgroundColor: "#fff0f0" }, approve: { backgroundColor: "#087443" }, changeText: { color: "#a35b00", fontSize: 10, fontWeight: "900" }, rejectText: { color: "#a32929", fontSize: 10, fontWeight: "900" }, approveText: { color: "#fff", fontSize: 10, fontWeight: "900" },
});
