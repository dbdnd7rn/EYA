import React from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, CalendarDays, CircleDollarSign, PencilLine, Plus, RefreshCw, ShieldAlert, Ticket, Users } from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import {
  listMyOrganizerEvents,
  startMyTicketEventRevision,
  type OrganizerTicketEventStatus,
  type OrganizerTicketEventSummary,
  type OrganizerTicketRevisionStatus,
} from "@/lib/organizerTicketingApi";
import { getMyTicketOrganizerAccess, type MyTicketOrganizerAccess } from "@/lib/ticketOrganizerAccess";

const BG = "#f5f7fc";
const CARD = "#ffffff";
const TEXT = "#102a54";
const MUTED = "#6e7892";
const ACCENT = "#5e73dd";
const BORDER = "#e4e8f2";

function statusLabel(status: OrganizerTicketEventStatus) {
  const labels: Record<OrganizerTicketEventStatus, string> = {
    draft: "Draft",
    pending_review: "Awaiting EYA review",
    changes_requested: "Changes requested",
    rejected: "Rejected",
    published: "Published",
    paused: "Paused",
    cancelled: "Cancelled",
    archived: "Archived",
  };
  return labels[status] ?? status;
}

function revisionLabel(status: OrganizerTicketRevisionStatus | null) {
  if (status === "draft") return "Revision draft";
  if (status === "pending_review") return "Revision under review";
  if (status === "changes_requested") return "Revision needs changes";
  return "Live revision";
}

function statusTone(status: OrganizerTicketEventStatus) {
  if (status === "published") return { bg: "#e4f7ec", text: "#087443" };
  if (status === "pending_review") return { bg: "#fff4d9", text: "#8a5a00" };
  if (status === "changes_requested") return { bg: "#fff0e5", text: "#a94b00" };
  if (status === "rejected" || status === "cancelled") return { bg: "#fff0f0", text: "#a32929" };
  return { bg: "#eef1ff", text: ACCENT };
}

function expiryLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function OrganizerEventsScreen() {
  const router = useRouter();
  const [access, setAccess] = React.useState<MyTicketOrganizerAccess | null>(null);
  const [events, setEvents] = React.useState<OrganizerTicketEventSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      setError(null);
      const currentAccess = await getMyTicketOrganizerAccess();
      setAccess(currentAccess);
      if (!currentAccess) {
        setEvents([]);
        return;
      }
      setEvents(await listMyOrganizerEvents());
    } catch (e: any) {
      setError(e?.message || "Could not load Organizer Workspace.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const totals = React.useMemo(() => events.reduce(
    (sum, event) => ({
      sold: sum.sold + event.tickets_sold,
      gross: sum.gross + event.gross_sales_mwk,
      live: sum.live + (event.status === "published" ? 1 : 0),
    }),
    { sold: 0, gross: 0, live: 0 },
  ), [events]);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={ACCENT} />}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}><ArrowLeft size={21} color={TEXT} /></Pressable>
          <View style={{ flex: 1 }}><Text style={styles.kicker}>Organizer workspace</Text><Text style={styles.title}>Event Studio</Text></View>
          {access ? <Pressable style={styles.addBtn} onPress={() => router.push("/(organizer)/event-create" as any)}><Plus size={19} color="#fff" /><Text style={styles.addText}>Create</Text></Pressable> : null}
        </View>

        {loading ? (
          <View style={styles.stateCard}><ActivityIndicator color={ACCENT} /><Text style={styles.stateText}>Checking organizer access...</Text></View>
        ) : error ? (
          <View style={styles.stateCard}><Text style={styles.errorText}>{error}</Text><Pressable style={styles.retryBtn} onPress={() => void load()}><Text style={styles.retryText}>Try again</Text></Pressable></View>
        ) : !access ? (
          <View style={styles.blockedCard}>
            <View style={styles.blockedIcon}><ShieldAlert size={31} color="#a35b00" /></View>
            <Text style={styles.blockedTitle}>Organizer access unavailable</Text>
            <Text style={styles.blockedText}>Event Studio is private and invite-only. EYA Admin must activate a temporary Organizer Workspace before this account can create or manage events.</Text>
            <Pressable style={styles.backHomeBtn} onPress={() => router.back()}><Text style={styles.backHomeText}>Return to EYA</Text></Pressable>
          </View>
        ) : (
          <>
            <View style={styles.accessCard}><Text style={styles.accessLabel}>TEMPORARY ORGANIZER ACCESS</Text><Text style={styles.accessName}>{access.organization_name}</Text><Text style={styles.accessExpiry}>Access expires {expiryLabel(access.expires_at)}</Text></View>
            <Text style={styles.intro}>Create events and submit them to EYA. Published event/ticket changes are proposed privately and do not affect customers until Admin approves the new version.</Text>
            <View style={styles.statsRow}>
              <StatCard icon={<Ticket size={19} color={ACCENT} />} label="Tickets sold" value={totals.sold.toLocaleString()} />
              <StatCard icon={<CircleDollarSign size={19} color={ACCENT} />} label="Gross sales" value={kwacha(totals.gross)} />
              <StatCard icon={<Users size={19} color={ACCENT} />} label="Live events" value={String(totals.live)} />
            </View>
            {!events.length ? (
              <View style={styles.emptyCard}><View style={styles.emptyIcon}><CalendarDays size={30} color={ACCENT} /></View><Text style={styles.emptyTitle}>Create your first event</Text><Text style={styles.emptySub}>Build the listing and ticket types, then submit it to EYA Admin. It appears to customers only after approval.</Text><Pressable style={styles.primaryBtn} onPress={() => router.push("/(organizer)/event-create" as any)}><Plus size={18} color="#fff" /><Text style={styles.primaryText}>Create event</Text></Pressable></View>
            ) : <View style={styles.list}>{events.map((event) => <EventCard key={event.id} event={event} onChanged={() => void load(true)} />)}</View>}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <View style={styles.statCard}><View style={styles.statIcon}>{icon}</View><Text style={styles.statValue} numberOfLines={1}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function EventCard({ event, onChanged }: { event: OrganizerTicketEventSummary; onChanged: () => void }) {
  const router = useRouter();
  const [starting, setStarting] = React.useState(false);
  const tone = statusTone(event.status);
  const soldPercent = event.capacity_total > 0 ? Math.min(100, Math.round((event.tickets_sold / event.capacity_total) * 100)) : 0;
  const canEditDraft = event.status === "draft" || event.status === "changes_requested";

  const openRevision = async () => {
    if (event.open_revision_id) {
      router.push({ pathname: "/(organizer)/event-revision", params: { revisionId: event.open_revision_id } } as any);
      return;
    }
    try {
      setStarting(true);
      const result = await startMyTicketEventRevision(event.id);
      onChanged();
      router.push({ pathname: "/(organizer)/event-revision", params: { revisionId: result.revision_id } } as any);
    } catch (e: any) {
      Alert.alert("Could not start revision", e?.message || "Try again.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={styles.eventCard}>
      <View style={styles.eventHead}>
        <View style={{ flex: 1 }}><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventMeta}>{event.date_label} · {event.venue}, {event.city}</Text></View>
        <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}><Text style={[styles.statusText, { color: tone.text }]}>{statusLabel(event.status)}</Text></View>
      </View>

      {event.approved_version_number ? <Text style={styles.versionText}>Customer version V{event.approved_version_number}</Text> : null}
      {event.review_note ? <View style={styles.reviewNote}><Text style={styles.reviewLabel}>EYA REVIEW NOTE</Text><Text style={styles.reviewText}>{event.review_note}</Text></View> : null}
      {event.open_revision_status ? <View style={styles.revisionBanner}><RefreshCw size={15} color="#735400" /><View style={{ flex: 1 }}><Text style={styles.revisionTitle}>{revisionLabel(event.open_revision_status)}</Text><Text style={styles.revisionCopy}>The live customer version remains unchanged until EYA Admin approves this revision.</Text></View></View> : null}

      <View style={styles.eventMetrics}>
        <View><Text style={styles.metricValue}>{event.tickets_sold.toLocaleString()}</Text><Text style={styles.metricLabel}>sold</Text></View>
        <View><Text style={styles.metricValue}>{kwacha(event.gross_sales_mwk)}</Text><Text style={styles.metricLabel}>gross</Text></View>
        <View><Text style={styles.metricValue}>{event.capacity_remaining.toLocaleString()}</Text><Text style={styles.metricLabel}>remaining</Text></View>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${soldPercent}%` }]} /></View>
      <View style={styles.eventFoot}>
        <Text style={styles.footText}>{soldPercent}% of capacity sold</Text>
        {canEditDraft ? (
          <Pressable style={styles.editBtn} onPress={() => router.push({ pathname: "/(organizer)/event-create", params: { eventId: event.id } } as any)}><PencilLine size={14} color={ACCENT} /><Text style={styles.editText}>{event.status === "changes_requested" ? "Fix & resubmit" : "Edit draft"}</Text></Pressable>
        ) : event.status === "published" ? (
          <Pressable style={[styles.editBtn, event.open_revision_status === "pending_review" && styles.pendingRevisionBtn]} disabled={starting} onPress={() => void openRevision()}>
            {starting ? <ActivityIndicator size="small" color={ACCENT} /> : <RefreshCw size={14} color={ACCENT} />}
            <Text style={styles.editText}>{event.open_revision_status === "pending_review" ? "View revision" : event.open_revision_id ? "Continue revision" : "Propose changes"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, content: { padding: 18, paddingBottom: 80, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 }, iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  kicker: { color: ACCENT, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.1 }, title: { color: TEXT, fontSize: 27, fontWeight: "900", marginTop: 2 },
  addBtn: { minHeight: 44, borderRadius: 22, backgroundColor: ACCENT, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6 }, addText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  intro: { color: MUTED, fontSize: 13, fontWeight: "700", lineHeight: 19 }, accessCard: { borderRadius: 20, backgroundColor: "#eef1ff", padding: 15, gap: 4 }, accessLabel: { color: ACCENT, fontSize: 9, fontWeight: "900", letterSpacing: 0.9 }, accessName: { color: TEXT, fontSize: 17, fontWeight: "900" }, accessExpiry: { color: "#56637d", fontSize: 11, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 10 }, statCard: { flex: 1, minWidth: 0, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 20, padding: 12, gap: 5 }, statIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" }, statValue: { color: TEXT, fontSize: 15, fontWeight: "900" }, statLabel: { color: MUTED, fontSize: 10, fontWeight: "800" },
  stateCard: { minHeight: 190, borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }, stateText: { color: MUTED, fontWeight: "800" }, errorText: { color: "#a32929", fontWeight: "800", textAlign: "center" }, retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18, backgroundColor: "#eef1ff" }, retryText: { color: ACCENT, fontWeight: "900" },
  blockedCard: { minHeight: 280, borderRadius: 28, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 24, alignItems: "center", justifyContent: "center", gap: 11 }, blockedIcon: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#fff4df", alignItems: "center", justifyContent: "center" }, blockedTitle: { color: TEXT, fontSize: 20, fontWeight: "900", textAlign: "center" }, blockedText: { color: MUTED, fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center", maxWidth: 360 }, backHomeBtn: { marginTop: 5, minHeight: 46, borderRadius: 23, backgroundColor: "#eef1ff", paddingHorizontal: 18, alignItems: "center", justifyContent: "center" }, backHomeText: { color: ACCENT, fontSize: 13, fontWeight: "900" },
  emptyCard: { borderRadius: 28, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 24, alignItems: "center", gap: 10 }, emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" }, emptyTitle: { color: TEXT, fontSize: 21, fontWeight: "900" }, emptySub: { color: MUTED, fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center" }, primaryBtn: { marginTop: 4, minHeight: 48, borderRadius: 24, backgroundColor: ACCENT, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 7 }, primaryText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  list: { gap: 12 }, eventCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 24, padding: 16, gap: 13 }, eventHead: { flexDirection: "row", gap: 10, alignItems: "flex-start" }, eventTitle: { color: TEXT, fontSize: 18, lineHeight: 22, fontWeight: "900" }, eventMeta: { color: MUTED, fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 4 }, statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, maxWidth: 132 }, statusText: { fontSize: 10, fontWeight: "900", textAlign: "center" }, versionText: { color: "#087443", fontSize: 10, fontWeight: "900" },
  reviewNote: { backgroundColor: "#fff8eb", borderRadius: 16, padding: 12, gap: 4 }, reviewLabel: { color: "#8a5a00", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, reviewText: { color: "#6b4b16", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  revisionBanner: { backgroundColor: "#fff7df", borderRadius: 16, padding: 12, flexDirection: "row", gap: 9, alignItems: "flex-start" }, revisionTitle: { color: "#735400", fontSize: 11, fontWeight: "900" }, revisionCopy: { color: "#806c37", fontSize: 10, lineHeight: 15, fontWeight: "700", marginTop: 2 },
  eventMetrics: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, metricValue: { color: TEXT, fontSize: 14, fontWeight: "900" }, metricLabel: { color: MUTED, fontSize: 10, fontWeight: "700", marginTop: 2 }, progressTrack: { height: 7, borderRadius: 999, backgroundColor: "#eef1f7", overflow: "hidden" }, progressFill: { height: "100%", backgroundColor: ACCENT, borderRadius: 999 }, eventFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }, footText: { color: MUTED, fontSize: 11, fontWeight: "800" }, editBtn: { minHeight: 36, borderRadius: 18, backgroundColor: "#eef1ff", paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 5 }, pendingRevisionBtn: { backgroundColor: "#f5f6fa" }, editText: { color: ACCENT, fontSize: 10, fontWeight: "900" },
});
