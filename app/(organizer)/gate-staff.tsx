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
import { ArrowLeft, Clock3, QrCode, ShieldCheck, UserPlus, Users, XCircle } from "lucide-react-native";
import {
  getOrganizerGateCheckInActivity,
  getOrganizerGateStaff,
  inviteGateStaff,
  revokeGateStaffAssignment,
  type GateCheckInActivity,
  type OrganizerGateStaffMember,
  type OrganizerGateStaffResponse,
} from "@/lib/ticketGateStaff";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatWhen(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function OrganizerGateStaffScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = one(params.eventId);
  const [staff, setStaff] = React.useState<OrganizerGateStaffResponse | null>(null);
  const [activity, setActivity] = React.useState<GateCheckInActivity | null>(null);
  const [email, setEmail] = React.useState("");
  const [gateLabel, setGateLabel] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (refresh = false) => {
    if (!eventId) {
      setError("Event is required.");
      setLoading(false);
      return;
    }
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [staffData, activityData] = await Promise.all([
        getOrganizerGateStaff(eventId),
        getOrganizerGateCheckInActivity(eventId, 100),
      ]);
      setStaff(staffData);
      setActivity(activityData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Gate Operations.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  React.useEffect(() => { void load(); }, [load]);

  const sendInvite = React.useCallback(async () => {
    if (!eventId || !email.trim()) return;
    setWorking(true);
    try {
      await inviteGateStaff({ eventId, email: email.trim(), gateLabel: gateLabel.trim() || null });
      setEmail("");
      setGateLabel("");
      await load(true);
    } catch (e) {
      Alert.alert("Gate Staff", e instanceof Error ? e.message : "Could not send Gate Staff invitation.");
    } finally {
      setWorking(false);
    }
  }, [email, eventId, gateLabel, load]);

  const revoke = React.useCallback((member: OrganizerGateStaffMember) => {
    Alert.alert(
      "Revoke Gate Staff access?",
      `${member.staff_name || member.invited_email} will immediately lose scanner access for this event.`,
      [
        { text: "Keep access", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => void (async () => {
            setWorking(true);
            try {
              await revokeGateStaffAssignment(member.id, "Revoked by organizer from Gate Operations");
              await load(true);
            } catch (e) {
              Alert.alert("Gate Staff", e instanceof Error ? e.message : "Could not revoke Gate Staff access.");
            } finally {
              setWorking(false);
            }
          })(),
        },
      ],
    );
  }, [load]);

  const summary = activity?.summary;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}><ArrowLeft size={20} color="#ffffff" /></Pressable>
        <View style={styles.flexOne}><Text style={styles.kicker}>TICKET MANAGEMENT</Text><Text style={styles.title}>Gate Operations</Text></View>
        <View style={styles.shield}><ShieldCheck size={20} color="#ffffff" /></View>
      </View>

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}>
        {loading ? <View style={styles.center}><ActivityIndicator /><Text style={styles.muted}>Loading Gate Operations...</Text></View> : null}
        {!loading && error ? <View style={styles.errorCard}><Text style={styles.errorTitle}>Gate Operations unavailable</Text><Text style={styles.errorText}>{error}</Text></View> : null}

        {!loading && !error && staff ? (
          <>
            <View style={styles.eventCard}>
              <Text style={styles.eventTitle}>{staff.event_title}</Text>
              <View style={styles.windowRow}><Clock3 size={16} color="#5c6ee6" /><Text style={styles.windowText}>Scanner opens {formatWhen(staff.scanner_opens_at)} · expires {formatWhen(staff.scanner_expires_at)}</Text></View>
            </View>

            <View style={styles.metricsRow}>
              <Metric label="Issued" value={summary?.tickets_issued ?? 0} />
              <Metric label="Checked in" value={summary?.checked_in ?? 0} />
              <Metric label="Remaining" value={summary?.remaining_to_check_in ?? 0} />
            </View>
            <View style={styles.metricsRow}>
              <Metric label="Last 15 min" value={summary?.checkins_last_15_minutes ?? 0} />
              <Metric label="Active staff" value={summary?.active_gate_staff ?? 0} />
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHead}><UserPlus size={19} color="#153465" /><View><Text style={styles.sectionTitle}>Invite Gate Staff</Text><Text style={styles.sectionSub}>One EYA account · this event only</Text></View></View>
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="EYA account email" placeholderTextColor="#8d99b3" style={styles.input} />
              <TextInput value={gateLabel} onChangeText={setGateLabel} placeholder="Gate / station label (optional)" placeholderTextColor="#8d99b3" style={styles.input} />
              <Pressable style={[styles.primaryBtn, (!email.trim() || working) && styles.disabled]} disabled={!email.trim() || working} onPress={() => void sendInvite()}>
                {working ? <ActivityIndicator size="small" color="#ffffff" /> : <UserPlus size={18} color="#ffffff" />}<Text style={styles.primaryText}>Send invitation</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHead}><Users size={19} color="#153465" /><View><Text style={styles.sectionTitle}>Gate Staff</Text><Text style={styles.sectionSub}>Access, gate assignment and scan totals</Text></View></View>
              {staff.staff.length === 0 ? <Text style={styles.muted}>No Gate Staff assigned yet.</Text> : staff.staff.map((member) => <StaffRow key={member.id} member={member} disabled={working} onRevoke={() => revoke(member)} />)}
            </View>

            <View style={styles.card}>
              <View style={styles.sectionHead}><QrCode size={19} color="#153465" /><View><Text style={styles.sectionTitle}>Check-in activity</Text><Text style={styles.sectionSub}>Successful admissions only · no raw QR or manual credentials stored</Text></View></View>
              {!activity || activity.activity.length === 0 ? <Text style={styles.muted}>No successful check-ins yet.</Text> : activity.activity.map((row) => (
                <View key={row.checkin_id} style={styles.activityRow}>
                  <View style={styles.flexOne}>
                    <Text style={styles.activityTitle}>{row.ticket_reference} · {row.ticket_type || "Ticket"}</Text>
                    <Text style={styles.activityMeta}>{row.scanner_name} · {row.gate_label || "General admission"}</Text>
                    <Text style={styles.activityMeta}>{row.credential_kind || "EYA pass"} · {row.method}</Text>
                  </View>
                  <Text style={styles.activityTime}>{formatWhen(row.checked_in_at)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value.toLocaleString()}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function StaffRow({ member, disabled, onRevoke }: { member: OrganizerGateStaffMember; disabled: boolean; onRevoke: () => void }) {
  const canRevoke = member.assignment_status === "invited" || member.assignment_status === "accepted";
  return (
    <View style={styles.staffRow}>
      <View style={styles.flexOne}>
        <Text style={styles.staffName}>{member.staff_name || member.invited_email}</Text>
        <Text style={styles.staffMeta}>{member.gate_label || "General admission"} · {member.effective_status}</Text>
        <Text style={styles.staffMeta}>{member.scan_count.toLocaleString()} scans{member.last_scan_at ? ` · last ${formatWhen(member.last_scan_at)}` : ""}</Text>
      </View>
      {canRevoke ? <Pressable style={[styles.revokeBtn, disabled && styles.disabled]} disabled={disabled} onPress={onRevoke}><XCircle size={16} color="#b42318" /><Text style={styles.revokeText}>Revoke</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#f5f7ff"},flexOne:{flex:1},header:{backgroundColor:"#102a54",paddingTop:52,paddingHorizontal:16,paddingBottom:20,flexDirection:"row",alignItems:"center",gap:12},back:{width:44,height:44,borderRadius:22,backgroundColor:"rgba(255,255,255,.13)",alignItems:"center",justifyContent:"center"},kicker:{color:"rgba(255,255,255,.62)",fontSize:10,fontWeight:"900",letterSpacing:1.1},title:{color:"#fff",fontSize:27,fontWeight:"900"},shield:{width:44,height:44,borderRadius:22,backgroundColor:"#5c6ee6",alignItems:"center",justifyContent:"center"},
  content:{padding:16,gap:14,paddingBottom:44},center:{padding:30,alignItems:"center",gap:10},muted:{color:"#6d7891",fontSize:12,lineHeight:18,fontWeight:"700",textAlign:"center"},errorCard:{backgroundColor:"#fff5f4",borderRadius:20,borderWidth:1,borderColor:"#f2d0cc",padding:18},errorTitle:{color:"#b42318",fontSize:16,fontWeight:"900"},errorText:{color:"#7f4a45",fontSize:12,lineHeight:18,fontWeight:"700",marginTop:4},
  eventCard:{backgroundColor:"#eef2ff",borderRadius:22,borderWidth:1,borderColor:"#dce3ff",padding:16},eventTitle:{color:"#153465",fontSize:19,fontWeight:"900"},windowRow:{flexDirection:"row",alignItems:"center",gap:8,marginTop:8},windowText:{flex:1,color:"#66728c",fontSize:11,lineHeight:17,fontWeight:"800"},metricsRow:{flexDirection:"row",gap:10},metric:{flex:1,backgroundColor:"#fff",borderRadius:18,borderWidth:1,borderColor:"#e3e8f7",padding:13},metricValue:{color:"#102a54",fontSize:20,fontWeight:"900"},metricLabel:{color:"#7b879e",fontSize:10,fontWeight:"900",textTransform:"uppercase",marginTop:2},
  card:{backgroundColor:"#fff",borderRadius:24,borderWidth:1,borderColor:"#e3e8f7",padding:15,gap:12},sectionHead:{flexDirection:"row",alignItems:"center",gap:10},sectionTitle:{color:"#153465",fontSize:16,fontWeight:"900"},sectionSub:{color:"#7b879e",fontSize:10,fontWeight:"700",marginTop:2},input:{minHeight:50,borderRadius:16,borderWidth:1,borderColor:"#dfe5f4",paddingHorizontal:13,color:"#102a54",fontSize:13,fontWeight:"800",backgroundColor:"#fbfcff"},primaryBtn:{minHeight:50,borderRadius:16,backgroundColor:"#5c6ee6",flexDirection:"row",gap:8,alignItems:"center",justifyContent:"center"},primaryText:{color:"#fff",fontSize:13,fontWeight:"900"},disabled:{opacity:.5},
  staffRow:{borderTopWidth:1,borderTopColor:"#eef1f7",paddingTop:12,flexDirection:"row",alignItems:"center",gap:10},staffName:{color:"#203856",fontSize:13,fontWeight:"900"},staffMeta:{color:"#78849b",fontSize:10,lineHeight:16,fontWeight:"700",marginTop:2},revokeBtn:{borderRadius:13,backgroundColor:"#fff5f4",borderWidth:1,borderColor:"#f2d0cc",paddingHorizontal:10,paddingVertical:8,flexDirection:"row",alignItems:"center",gap:5},revokeText:{color:"#b42318",fontSize:10,fontWeight:"900"},
  activityRow:{borderTopWidth:1,borderTopColor:"#eef1f7",paddingTop:12,flexDirection:"row",alignItems:"flex-start",gap:12},activityTitle:{color:"#203856",fontSize:12,fontWeight:"900"},activityMeta:{color:"#7b879e",fontSize:10,lineHeight:15,fontWeight:"700",marginTop:2},activityTime:{color:"#65738d",fontSize:9,fontWeight:"900",textAlign:"right",maxWidth:90},
});
