import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Camera, CheckCircle2, Keyboard, QrCode, RotateCcw, ShieldCheck, Ticket, XCircle } from "lucide-react-native";
import type { AdminTicketCheckInResult } from "@/lib/adminControlApi";
import {
  checkInLiveTicketCredential,
  normalizeTicketEntryCredential,
  ticketEntryCredentialKind,
  type LiveTicketGateMethod,
} from "@/lib/ticketGateApi";
import { getMyGateStaffAssignments, type GateStaffAssignment } from "@/lib/ticketGateStaff";

type ScanPayload = AdminTicketCheckInResult & {
  credential_kind?: string;
  scanner_access_kind?: string;
  scanner_assignment_id?: string | null;
  gate_label?: string | null;
  guest_pass?: { guest_name?: string | null; mode?: string | null } | null;
};

type ScanResult =
  | { state: "idle" }
  | { state: "accepted"; data: ScanPayload; credentialLabel: string }
  | { state: "rejected"; message: string; code: string };

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function GateStaffScannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = one(params.eventId);
  const [permission, requestPermission] = useCameraPermissions();
  const [assignment, setAssignment] = React.useState<GateStaffAssignment | null>(null);
  const [loadingAccess, setLoadingAccess] = React.useState(true);
  const [accessError, setAccessError] = React.useState<string | null>(null);
  const [manualCode, setManualCode] = React.useState("");
  const [working, setWorking] = React.useState(false);
  const [scanPaused, setScanPaused] = React.useState(false);
  const [lastCredential, setLastCredential] = React.useState("");
  const [result, setResult] = React.useState<ScanResult>({ state: "idle" });

  React.useEffect(() => {
    let active = true;
    (async () => {
      setLoadingAccess(true);
      setAccessError(null);
      try {
        if (!eventId) throw new Error("Event assignment is required.");
        const rows = await getMyGateStaffAssignments();
        const found = rows.find((row) => row.event_id === eventId) ?? null;
        if (!found) throw new Error("Gate Staff assignment not found for this event.");
        if (!found.scan_enabled) throw new Error("Scanner access is not active for this event yet.");
        if (active) setAssignment(found);
      } catch (e) {
        if (active) setAccessError(e instanceof Error ? e.message : "Gate Staff access could not be verified.");
      } finally {
        if (active) setLoadingAccess(false);
      }
    })();
    return () => { active = false; };
  }, [eventId]);

  const runCheckIn = React.useCallback(async (rawValue: string, method: LiveTicketGateMethod) => {
    if (working || !eventId || !assignment?.scan_enabled) return;
    const credential = normalizeTicketEntryCredential(rawValue, method);
    if (!credential) {
      setScanPaused(true);
      setResult({
        state: "rejected",
        message: method === "manual"
          ? "Use a current LIVE-, GUEST-, or OFF- backup code. Permanent ticket references are not accepted."
          : "Invalid EYA entry QR. Ask the holder to show a current EYA admission pass.",
        code: "INVALID PASS",
      });
      return;
    }

    setLastCredential(credential);
    if (method === "manual") setManualCode(credential);
    setScanPaused(true);
    setWorking(true);
    try {
      const data = await checkInLiveTicketCredential({
        credential,
        method,
        eventId,
        deviceLabel: assignment.gate_label ? `EYA Gate Staff · ${assignment.gate_label}` : "EYA Gate Staff",
      });
      setResult({ state: "accepted", data: data as ScanPayload, credentialLabel: ticketEntryCredentialKind(credential) });
    } catch (e) {
      setResult({ state: "rejected", message: e instanceof Error ? e.message : "Ticket rejected.", code: ticketEntryCredentialKind(credential) });
    } finally {
      setWorking(false);
    }
  }, [assignment, eventId, working]);

  const reset = React.useCallback(() => {
    setManualCode("");
    setLastCredential("");
    setResult({ state: "idle" });
    setScanPaused(false);
  }, []);

  if (loadingAccess) {
    return <View style={styles.centerPage}><ActivityIndicator /><Text style={styles.centerText}>Verifying Gate Staff assignment...</Text></View>;
  }

  if (!assignment || accessError) {
    return (
      <View style={styles.centerPage}>
        <ShieldCheck size={34} color="#9b2c2c" />
        <Text style={styles.lockedTitle}>Scanner unavailable</Text>
        <Text style={styles.centerText}>{accessError || "Gate Staff access is not active."}</Text>
        <Pressable style={styles.backAction} onPress={() => router.back()}><Text style={styles.backActionText}>Back to Gate Staff</Text></Pressable>
      </View>
    );
  }

  const hasCamera = permission?.granted;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topBand}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}><ArrowLeft size={20} color="#ffffff" /></Pressable>
          <View style={styles.flexOne}>
            <Text style={styles.kicker}>GATE STAFF · {assignment.gate_label || "GENERAL ADMISSION"}</Text>
            <Text style={styles.title}>{assignment.event_title}</Text>
          </View>
          <View style={styles.securityBadge}><ShieldCheck size={19} color="#ffffff" /></View>
        </View>

        <View style={styles.cameraShell}>
          {hasCamera ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => {
                if (scanPaused || working) return;
                const credential = normalizeTicketEntryCredential(data, "qr");
                if (!credential) {
                  setScanPaused(true);
                  setResult({ state: "rejected", message: "Invalid EYA entry QR. Permanent ticket references are not accepted.", code: "INVALID QR" });
                  return;
                }
                if (credential === lastCredential) return;
                void runCheckIn(credential, "qr");
              }}
            />
          ) : (
            <View style={styles.cameraFallback}>
              <Camera size={34} color="#153465" />
              <Text style={styles.cameraFallbackTitle}>Camera access needed</Text>
              <Text style={styles.centerText}>Allow camera access to scan EYA admission passes.</Text>
              <Pressable style={styles.permissionBtn} onPress={() => void requestPermission()}><Text style={styles.permissionBtnText}>Allow Camera</Text></Pressable>
            </View>
          )}
          {working ? <View style={styles.scanOverlay}><ActivityIndicator color="#ffffff" /><Text style={styles.scanOverlayText}>Validating ticket...</Text></View> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.noticeCard}>
          <ShieldCheck size={18} color="#087443" />
          <Text style={styles.noticeText}>This scanner is locked to {assignment.event_title}. Tickets for another event are rejected by the server.</Text>
        </View>

        <View style={styles.manualCard}>
          <View style={styles.manualHead}><Keyboard size={18} color="#153465" /><Text style={styles.cardTitle}>Backup entry code</Text></View>
          <View style={styles.inputRow}>
            <TextInput value={manualCode} onChangeText={(value) => setManualCode(value.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="LIVE- / GUEST- / OFF-" placeholderTextColor="#8d99b3" style={styles.input} />
            <Pressable style={[styles.checkBtn, working && styles.disabled]} onPress={() => void runCheckIn(manualCode, "manual")} disabled={working}>
              <QrCode size={18} color="#ffffff" /><Text style={styles.checkBtnText}>Check</Text>
            </Pressable>
          </View>
        </View>

        <ResultCard result={result} gateLabel={assignment.gate_label} onReset={reset} />
      </ScrollView>
    </View>
  );
}

function ResultCard({ result, gateLabel, onReset }: { result: ScanResult; gateLabel?: string | null; onReset: () => void }) {
  if (result.state === "idle") {
    return <View style={styles.waitingCard}><Ticket size={28} color="#5c6ee6" /><Text style={styles.waitingTitle}>Ready for the next pass</Text><Text style={styles.centerText}>Only live EYA admission credentials are accepted. Every successful check-in is recorded against your Gate Staff assignment.</Text></View>;
  }
  if (result.state === "rejected") {
    return <View style={styles.rejectedCard}><XCircle size={34} color="#b42318" /><Text style={styles.rejectedTitle}>Do not admit</Text><Text style={styles.centerText}>{result.message}</Text><Text style={styles.resultCode}>{result.code}</Text><Pressable style={styles.resetBtn} onPress={onReset}><RotateCcw size={17} color="#153465" /><Text style={styles.resetText}>Scan another ticket</Text></Pressable></View>;
  }

  const ticket = result.data.ticket;
  return (
    <View style={styles.acceptedCard}>
      <CheckCircle2 size={36} color="#087443" />
      <Text style={styles.acceptedTitle}>Admit</Text>
      <Text style={styles.centerText}>{result.credentialLabel}</Text>
      <View style={styles.details}>
        <Detail label="Ticket reference" value={ticket.ticket_code} />
        <Detail label="Event" value={ticket.event?.title || "Event"} />
        <Detail label="Ticket type" value={ticket.tier?.name || "Ticket"} />
        <Detail label="Gate" value={result.data.gate_label || gateLabel || "General admission"} />
      </View>
      <Pressable style={styles.resetBtn} onPress={onReset}><RotateCcw size={17} color="#153465" /><Text style={styles.resetText}>Scan another ticket</Text></Pressable>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:"#f5f7ff"},flexOne:{flex:1},centerPage:{flex:1,backgroundColor:"#f5f7ff",alignItems:"center",justifyContent:"center",padding:28,gap:10},centerText:{color:"#66728c",fontSize:12,lineHeight:18,fontWeight:"700",textAlign:"center"},lockedTitle:{color:"#9b2c2c",fontSize:20,fontWeight:"900"},backAction:{marginTop:8,borderRadius:16,backgroundColor:"#153465",paddingHorizontal:18,paddingVertical:12},backActionText:{color:"#fff",fontWeight:"900"},
  topBand:{backgroundColor:"#102a54",paddingHorizontal:16,paddingTop:50,paddingBottom:18,borderBottomLeftRadius:30,borderBottomRightRadius:30},headerRow:{flexDirection:"row",alignItems:"center",gap:12,marginBottom:16},backBtn:{width:44,height:44,borderRadius:22,backgroundColor:"rgba(255,255,255,.14)",alignItems:"center",justifyContent:"center"},kicker:{color:"rgba(255,255,255,.65)",fontSize:9,fontWeight:"900",letterSpacing:.8},title:{color:"#fff",fontSize:22,fontWeight:"900",marginTop:2},securityBadge:{width:44,height:44,borderRadius:22,backgroundColor:"#5c6ee6",alignItems:"center",justifyContent:"center"},
  cameraShell:{height:320,borderRadius:28,overflow:"hidden",backgroundColor:"#0a1730"},camera:{flex:1},cameraFallback:{flex:1,backgroundColor:"#eef2ff",alignItems:"center",justifyContent:"center",padding:22,gap:10},cameraFallbackTitle:{color:"#153465",fontSize:18,fontWeight:"900"},permissionBtn:{marginTop:6,minHeight:46,borderRadius:16,backgroundColor:"#5c6ee6",paddingHorizontal:18,alignItems:"center",justifyContent:"center"},permissionBtnText:{color:"#fff",fontWeight:"900"},scanOverlay:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(10,23,48,.7)",alignItems:"center",justifyContent:"center",gap:10},scanOverlayText:{color:"#fff",fontSize:13,fontWeight:"900"},
  content:{padding:16,gap:14,paddingBottom:40},noticeCard:{backgroundColor:"#effaf4",borderRadius:18,borderWidth:1,borderColor:"#d1eddf",padding:14,flexDirection:"row",alignItems:"flex-start",gap:10},noticeText:{flex:1,color:"#315c49",fontSize:11,lineHeight:17,fontWeight:"800"},manualCard:{backgroundColor:"#fff",borderRadius:22,borderWidth:1,borderColor:"#e3e8f7",padding:14,gap:12},manualHead:{flexDirection:"row",alignItems:"center",gap:9},cardTitle:{color:"#153465",fontSize:16,fontWeight:"900"},inputRow:{flexDirection:"row",gap:10},input:{flex:1,minHeight:50,borderRadius:16,borderWidth:1,borderColor:"#dfe5f4",paddingHorizontal:13,color:"#102a54",fontSize:13,fontWeight:"900"},checkBtn:{minHeight:50,borderRadius:16,backgroundColor:"#5c6ee6",paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7},checkBtnText:{color:"#fff",fontSize:12,fontWeight:"900"},disabled:{opacity:.55},
  waitingCard:{backgroundColor:"#fff",borderRadius:22,borderWidth:1,borderColor:"#e3e8f7",padding:24,alignItems:"center",gap:8},waitingTitle:{color:"#153465",fontSize:17,fontWeight:"900"},rejectedCard:{backgroundColor:"#fff5f4",borderRadius:22,borderWidth:1,borderColor:"#f2d0cc",padding:22,alignItems:"center",gap:8},rejectedTitle:{color:"#b42318",fontSize:20,fontWeight:"900"},acceptedCard:{backgroundColor:"#f1fbf6",borderRadius:22,borderWidth:1,borderColor:"#c8ead8",padding:22,alignItems:"center",gap:8},acceptedTitle:{color:"#087443",fontSize:22,fontWeight:"900"},resultCode:{color:"#8f3b34",fontSize:11,fontWeight:"900"},details:{width:"100%",marginTop:8,backgroundColor:"#fff",borderRadius:16,paddingHorizontal:12},detailRow:{minHeight:46,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12,borderBottomWidth:1,borderBottomColor:"#eef1f7"},detailLabel:{color:"#8290a8",fontSize:11,fontWeight:"800"},detailValue:{flex:1,color:"#203856",fontSize:11,fontWeight:"900",textAlign:"right"},resetBtn:{marginTop:8,minHeight:46,borderRadius:16,backgroundColor:"#fff",borderWidth:1,borderColor:"#dce3ef",paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8},resetText:{color:"#153465",fontSize:12,fontWeight:"900"},
});
