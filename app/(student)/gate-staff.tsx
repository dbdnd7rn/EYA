import React from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, CalendarClock, CheckCircle2, QrCode, ShieldCheck, XCircle } from "lucide-react-native";
import {
  acceptGateStaffInvite,
  declineGateStaffInvite,
  getMyGateStaffAssignments,
  type GateStaffAssignment,
} from "@/lib/ticketGateStaff";

function formatWhen(value?: string | null) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(assignment: GateStaffAssignment) {
  switch (assignment.effective_status) {
    case "active": return "Active now";
    case "scheduled": return "Scheduled";
    case "expired": return "Expired";
    case "revoked": return "Revoked";
    case "declined": return "Declined";
    case "cancelled": return "Cancelled";
    default: return "Invitation";
  }
}

export default function GateStaffWorkspaceScreen() {
  const router = useRouter();
  const [assignments, setAssignments] = React.useState<GateStaffAssignment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [workingId, setWorkingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setAssignments(await getMyGateStaffAssignments());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Gate Staff assignments.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const respond = React.useCallback(async (assignment: GateStaffAssignment, action: "accept" | "decline") => {
    setWorkingId(assignment.id);
    try {
      if (action === "accept") await acceptGateStaffInvite(assignment.id);
      else await declineGateStaffInvite(assignment.id);
      await load(true);
    } catch (e) {
      Alert.alert("Gate Staff", e instanceof Error ? e.message : "Could not update the invitation.");
    } finally {
      setWorkingId(null);
    }
  }, [load]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><ArrowLeft size={20} color="#ffffff" /></Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>EYA GATE OPERATIONS</Text>
          <Text style={styles.title}>Gate Staff</Text>
        </View>
        <View style={styles.shield}><ShieldCheck size={20} color="#ffffff" /></View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Event-scoped access only</Text>
          <Text style={styles.introText}>A Gate Staff assignment never gives Admin, organizer, finance, payout, or event-edit access. Scanner controls open only for the assigned event and expire automatically.</Text>
        </View>

        {loading ? <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Loading assignments...</Text></View> : null}
        {!loading && error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>Could not load Gate Staff</Text><Text style={styles.errorText}>{error}</Text><Pressable style={styles.secondaryBtn} onPress={() => void load()}><Text style={styles.secondaryBtnText}>Try again</Text></Pressable></View> : null}
        {!loading && !error && assignments.length === 0 ? <View style={styles.emptyCard}><CalendarClock size={28} color="#5c6ee6" /><Text style={styles.emptyTitle}>No Gate Staff assignments</Text><Text style={styles.muted}>Event invitations and scheduled gate assignments will appear here.</Text></View> : null}

        {assignments.map((assignment) => {
          const working = workingId === assignment.id;
          return (
            <View key={assignment.id} style={styles.assignmentCard}>
              <View style={styles.assignmentTop}>
                <View style={styles.flexOne}>
                  <Text style={styles.eventTitle}>{assignment.event_title}</Text>
                  <Text style={styles.eventMeta}>{[assignment.venue, assignment.city].filter(Boolean).join(" · ") || "Event venue"}</Text>
                </View>
                <View style={[styles.statusPill, assignment.scan_enabled && styles.statusActive]}><Text style={[styles.statusText, assignment.scan_enabled && styles.statusActiveText]}>{statusLabel(assignment)}</Text></View>
              </View>

              <View style={styles.infoGrid}>
                <Info label="Gate" value={assignment.gate_label || "General admission"} />
                <Info label="Event starts" value={formatWhen(assignment.starts_at)} />
                <Info label="Scanner opens" value={formatWhen(assignment.scanner_opens_at)} />
                <Info label="Access expires" value={formatWhen(assignment.scanner_expires_at)} />
              </View>

              {assignment.effective_status === "invited" ? (
                <View style={styles.actionRow}>
                  <Pressable style={[styles.acceptBtn, working && styles.disabled]} disabled={working} onPress={() => void respond(assignment, "accept")}>
                    {working ? <ActivityIndicator size="small" color="#ffffff" /> : <CheckCircle2 size={17} color="#ffffff" />}
                    <Text style={styles.acceptText}>Accept</Text>
                  </Pressable>
                  <Pressable style={[styles.declineBtn, working && styles.disabled]} disabled={working} onPress={() => void respond(assignment, "decline")}>
                    <XCircle size={17} color="#b42318" /><Text style={styles.declineText}>Decline</Text>
                  </Pressable>
                </View>
              ) : null}

              {assignment.scan_enabled ? (
                <Pressable style={styles.scannerBtn} onPress={() => router.push({ pathname: "/gate-scanner" as never, params: { eventId: assignment.event_id } } as never)}>
                  <QrCode size={19} color="#ffffff" /><Text style={styles.scannerBtnText}>Open scanner</Text>
                </Pressable>
              ) : assignment.effective_status === "scheduled" ? (
                <Text style={styles.lockedText}>Scanner controls remain locked until the activation window opens.</Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.info}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#f5f7ff"},
  flexOne:{flex:1},
  header:{backgroundColor:"#102a54",paddingTop:52,paddingHorizontal:16,paddingBottom:20,flexDirection:"row",alignItems:"center",gap:12},
  back:{width:44,height:44,borderRadius:22,backgroundColor:"rgba(255,255,255,.13)",alignItems:"center",justifyContent:"center"},
  headerCopy:{flex:1},kicker:{color:"rgba(255,255,255,.62)",fontSize:10,fontWeight:"900",letterSpacing:1.2},title:{color:"#fff",fontSize:28,fontWeight:"900"},
  shield:{width:44,height:44,borderRadius:22,backgroundColor:"#5c6ee6",alignItems:"center",justifyContent:"center"},
  content:{padding:16,gap:14,paddingBottom:40},
  introCard:{backgroundColor:"#eef2ff",borderRadius:22,padding:16,borderWidth:1,borderColor:"#dce3ff"},introTitle:{color:"#153465",fontSize:16,fontWeight:"900"},introText:{color:"#66728c",fontSize:12,lineHeight:18,fontWeight:"700",marginTop:5},
  center:{padding:28,alignItems:"center",gap:10},muted:{color:"#6d7891",fontSize:12,lineHeight:18,fontWeight:"700",textAlign:"center"},
  errorCard:{backgroundColor:"#fff5f4",borderRadius:22,padding:18,borderWidth:1,borderColor:"#f2d0cc"},errorTitle:{color:"#b42318",fontSize:16,fontWeight:"900"},errorText:{color:"#7f4a45",fontSize:12,lineHeight:18,fontWeight:"700",marginTop:5},
  secondaryBtn:{alignSelf:"flex-start",marginTop:12,borderRadius:14,borderWidth:1,borderColor:"#d7deef",paddingHorizontal:14,paddingVertical:10},secondaryBtnText:{color:"#153465",fontWeight:"900",fontSize:12},
  emptyCard:{backgroundColor:"#fff",borderRadius:22,padding:24,borderWidth:1,borderColor:"#e3e8f7",alignItems:"center",gap:8},emptyTitle:{color:"#153465",fontSize:17,fontWeight:"900"},
  assignmentCard:{backgroundColor:"#fff",borderRadius:24,padding:16,borderWidth:1,borderColor:"#e3e8f7",gap:14},assignmentTop:{flexDirection:"row",alignItems:"flex-start",gap:10},eventTitle:{color:"#102a54",fontSize:18,fontWeight:"900"},eventMeta:{color:"#6d7891",fontSize:12,fontWeight:"700",marginTop:3},
  statusPill:{borderRadius:999,backgroundColor:"#eef1f6",paddingHorizontal:10,paddingVertical:6},statusText:{color:"#69758d",fontSize:10,fontWeight:"900",textTransform:"uppercase"},statusActive:{backgroundColor:"#dcf7e9"},statusActiveText:{color:"#087443"},
  infoGrid:{gap:8},info:{flexDirection:"row",justifyContent:"space-between",gap:14,borderTopWidth:1,borderTopColor:"#eef1f7",paddingTop:9},infoLabel:{color:"#8590a7",fontSize:11,fontWeight:"800"},infoValue:{flex:1,color:"#253957",fontSize:11,fontWeight:"900",textAlign:"right"},
  actionRow:{flexDirection:"row",gap:10},acceptBtn:{flex:1,minHeight:48,borderRadius:16,backgroundColor:"#087443",flexDirection:"row",gap:8,alignItems:"center",justifyContent:"center"},acceptText:{color:"#fff",fontWeight:"900",fontSize:13},declineBtn:{flex:1,minHeight:48,borderRadius:16,backgroundColor:"#fff5f4",borderWidth:1,borderColor:"#f2d0cc",flexDirection:"row",gap:8,alignItems:"center",justifyContent:"center"},declineText:{color:"#b42318",fontWeight:"900",fontSize:13},disabled:{opacity:.55},
  scannerBtn:{minHeight:52,borderRadius:17,backgroundColor:"#5c6ee6",flexDirection:"row",gap:9,alignItems:"center",justifyContent:"center"},scannerBtnText:{color:"#fff",fontSize:14,fontWeight:"900"},lockedText:{color:"#7c879d",fontSize:11,lineHeight:17,fontWeight:"800",textAlign:"center"},
});
