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
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Keyboard,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Ticket,
  XCircle,
} from "lucide-react-native";
import type { AdminTicketCheckInResult } from "@/lib/adminControlApi";
import { checkInLiveTicketCredential, type LiveTicketGateMethod } from "@/lib/ticketGateApi";
import {
  normalizeLiveTicketManualCode,
  normalizeLiveTicketQrToken,
} from "@/lib/ticketCredential";

type ScanResult =
  | { state: "idle" }
  | { state: "accepted"; message: string; data: AdminTicketCheckInResult }
  | { state: "rejected"; message: string; code: string };

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminTicketScannerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = React.useState("");
  const [working, setWorking] = React.useState(false);
  const [scanPaused, setScanPaused] = React.useState(false);
  const [lastCredential, setLastCredential] = React.useState("");
  const [result, setResult] = React.useState<ScanResult>({ state: "idle" });

  const runCheckIn = React.useCallback(async (rawValue: string, method: LiveTicketGateMethod) => {
    if (working) return;

    const credential = method === "manual"
      ? normalizeLiveTicketManualCode(rawValue)
      : normalizeLiveTicketQrToken(rawValue);

    if (!credential) {
      setScanPaused(true);
      setResult({
        state: "rejected",
        message: method === "manual"
          ? "That is not a live backup code. Ask the customer to open their ticket in EYA."
          : "Static or invalid QR rejected. Ask the customer to open the live ticket in EYA.",
        code: String(rawValue || "").trim().slice(0, 48) || "INVALID",
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
        deviceLabel: "EYA admin phone",
      });
      setResult({ state: "accepted", message: "Ticket accepted", data });
    } catch (error) {
      setResult({
        state: "rejected",
        message: error instanceof Error ? error.message : "Ticket rejected.",
        code: method === "manual" ? credential : "LIVE QR",
      });
    } finally {
      setWorking(false);
    }
  }, [working]);

  const resetScan = React.useCallback(() => {
    setManualCode("");
    setLastCredential("");
    setResult({ state: "idle" });
    setScanPaused(false);
  }, []);

  const hasCamera = permission?.granted;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topBand}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color="#ffffff" />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.kicker}>LIVE ENTRY</Text>
            <Text style={styles.title}>Ticket scanner</Text>
          </View>
          <View style={styles.securityBadge}>
            <ShieldCheck size={19} color="#ffffff" />
          </View>
        </View>

        <View style={styles.cameraShell}>
          {hasCamera ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => {
                if (scanPaused || working) return;
                const credential = normalizeLiveTicketQrToken(data);
                if (!credential) {
                  setScanPaused(true);
                  setResult({
                    state: "rejected",
                    message: "Static or invalid QR rejected. Ask the customer to open the live ticket in EYA.",
                    code: "INVALID QR",
                  });
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
              <Text style={styles.cameraFallbackText}>Allow camera access to scan rotating EYA ticket QR codes.</Text>
              <Pressable style={styles.permissionBtn} onPress={() => void requestPermission()}>
                <Text style={styles.permissionBtnText}>Allow Camera</Text>
              </Pressable>
            </View>
          )}

          <View pointerEvents="none" style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
          </View>

          <View pointerEvents="none" style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE QR ONLY</Text>
          </View>

          {working ? (
            <View style={styles.scanOverlay}>
              <ActivityIndicator color="#ffffff" />
              <Text style={styles.scanOverlayText}>Validating live credential...</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.manualCard}>
          <View style={styles.manualHead}>
            <View style={styles.manualIcon}>
              <Keyboard size={18} color="#153465" />
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.cardTitle}>Rotating backup code</Text>
              <Text style={styles.cardSub}>Use only the current LIVE- code shown under the customer's QR.</Text>
            </View>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              value={manualCode}
              onChangeText={(value) => setManualCode(value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="LIVE-XXXXXXXXXX"
              placeholderTextColor="#8d99b3"
              style={styles.input}
            />
            <Pressable
              style={[styles.checkBtn, working && styles.disabled]}
              onPress={() => void runCheckIn(manualCode, "manual")}
              disabled={working}
            >
              {working ? <ActivityIndicator color="#ffffff" size="small" /> : <QrCode size={18} color="#ffffff" />}
              <Text style={styles.checkBtnText}>Check</Text>
            </Pressable>
          </View>
        </View>

        <ResultCard result={result} onReset={resetScan} />
      </ScrollView>
    </View>
  );
}

function ResultCard({ result, onReset }: { result: ScanResult; onReset: () => void }) {
  if (result.state === "idle") {
    return (
      <View style={styles.waitingCard}>
        <View style={styles.waitingIcon}><Ticket size={24} color="#5c6ee6" /></View>
        <Text style={styles.waitingTitle}>Ready for a live ticket</Text>
        <Text style={styles.waitingText}>Permanent EYA ticket IDs cannot admit anyone. The customer must show the rotating QR or backup code from the live ticket screen.</Text>
      </View>
    );
  }

  if (result.state === "rejected") {
    return (
      <View style={[styles.resultCard, styles.rejectedCard]}>
        <View style={[styles.resultIcon, styles.rejectedIcon]}><XCircle size={30} color="#d92d20" /></View>
        <Text style={styles.rejectedTitle}>Do not admit</Text>
        <Text style={styles.resultText}>{result.message}</Text>
        <Text style={styles.resultCode}>{result.code}</Text>
        <Pressable style={styles.resetBtn} onPress={onReset}>
          <RotateCcw size={17} color="#153465" />
          <Text style={styles.resetBtnText}>Scan another ticket</Text>
        </Pressable>
      </View>
    );
  }

  const ticket = result.data.ticket;
  const event = ticket.event;
  const tier = ticket.tier;
  const buyer = ticket.user;

  return (
    <View style={[styles.resultCard, styles.acceptedCard]}>
      <View style={[styles.resultIcon, styles.acceptedIcon]}><CheckCircle2 size={32} color="#087443" /></View>
      <Text style={styles.acceptedTitle}>{result.message}</Text>
      <Text style={styles.resultText}>Checked in at {formatDateTime(ticket.checked_in_at)}</Text>
      <View style={styles.detailBox}>
        <DetailRow label="Ticket" value={ticket.ticket_code} strong />
        <DetailRow label="Event" value={event?.title ?? "Event"} />
        <DetailRow label="Venue" value={[event?.venue, event?.city].filter(Boolean).join(", ") || "Venue"} />
        <DetailRow label="Date" value={event?.date_label ?? "Event date"} />
        <DetailRow label="Type" value={tier?.name ?? "Ticket"} />
        <DetailRow label="Buyer" value={buyer?.full_name || buyer?.email || "Buyer"} />
      </View>
      <Pressable style={styles.resetBtn} onPress={onReset}>
        <RotateCcw size={17} color="#153465" />
        <Text style={styles.resetBtnText}>Scan another ticket</Text>
      </Pressable>
    </View>
  );
}

function DetailRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, strong && styles.detailValueStrong]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f7ff" },
  flexOne: { flex: 1 },
  topBand: { backgroundColor: "#102a54", paddingHorizontal: 16, paddingTop: 48, paddingBottom: 18, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  headerTitleWrap: { flex: 1 },
  kicker: { color: "rgba(255,255,255,0.64)", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#ffffff", fontSize: 28, lineHeight: 33, fontWeight: "900" },
  securityBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#5c6ee6", alignItems: "center", justifyContent: "center" },
  cameraShell: { height: 320, borderRadius: 28, overflow: "hidden", backgroundColor: "#0a1730", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  camera: { flex: 1 },
  cameraFallback: { flex: 1, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center", padding: 22, gap: 10 },
  cameraFallbackTitle: { color: "#153465", fontSize: 18, fontWeight: "900", textAlign: "center" },
  cameraFallbackText: { color: "#64708c", fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center" },
  permissionBtn: { marginTop: 8, minHeight: 46, borderRadius: 16, backgroundColor: "#5c6ee6", paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  permissionBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  scanFrame: { ...StyleSheet.absoluteFillObject, margin: 46 },
  corner: { position: "absolute", width: 44, height: 44, borderColor: "#ffffff" },
  cornerTopLeft: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 18 },
  cornerTopRight: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 18 },
  cornerBottomLeft: { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 18 },
  cornerBottomRight: { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 18 },
  liveBadge: { position: "absolute", top: 14, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 999, backgroundColor: "rgba(10,23,48,0.76)", paddingHorizontal: 12, paddingVertical: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#57e69a" },
  liveBadgeText: { color: "#ffffff", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,23,48,0.7)", alignItems: "center", justifyContent: "center", gap: 10 },
  scanOverlayText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  manualCard: { backgroundColor: "#ffffff", borderRadius: 24, borderWidth: 1, borderColor: "#e3e8f7", padding: 14, gap: 14 },
  manualHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  manualIcon: { width: 42, height: 42, borderRadius: 16, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center" },
  cardTitle: { color: "#102a54", fontSize: 17, fontWeight: "900" },
  cardSub: { marginTop: 2, color: "#66728c", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: { flex: 1, minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: "#dfe5f4", paddingHorizontal: 13, color: "#102a54", fontSize: 14, fontWeight: "900", backgroundColor: "#fbfcff" },
  checkBtn: { minHeight: 50, borderRadius: 16, backgroundColor: "#5c6ee6", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  checkBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.6 },
  waitingCard: { backgroundColor: "#ffffff", borderRadius: 24, borderWidth: 1, borderColor: "#e3e8f7", padding: 18, alignItems: "center", gap: 8 },
  waitingIcon: { width: 58, height: 58, borderRadius: 22, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center" },
  waitingTitle: { color: "#102a54", fontSize: 18, fontWeight: "900" },
  waitingText: { color: "#66728c", textAlign: "center", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  resultCard: { borderRadius: 26, borderWidth: 1, padding: 18, alignItems: "center", gap: 10 },
  acceptedCard: { backgroundColor: "#f0fff7", borderColor: "#b8efd2" },
  rejectedCard: { backgroundColor: "#fff4f3", borderColor: "#ffd1cc" },
  resultIcon: { width: 64, height: 64, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  acceptedIcon: { backgroundColor: "#d7f9e5" },
  rejectedIcon: { backgroundColor: "#ffe2df" },
  acceptedTitle: { color: "#087443", fontSize: 24, fontWeight: "900" },
  rejectedTitle: { color: "#b42318", fontSize: 24, fontWeight: "900" },
  resultText: { color: "#66728c", fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center" },
  resultCode: { color: "#102a54", fontSize: 13, fontWeight: "900" },
  detailBox: { width: "100%", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(16,42,84,0.08)", paddingHorizontal: 14, marginTop: 4 },
  detailRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#dfe5f0" },
  detailLabel: { color: "#71809b", fontSize: 12, fontWeight: "800" },
  detailValue: { flex: 1, color: "#102a54", fontSize: 12, fontWeight: "800", textAlign: "right" },
  detailValueStrong: { fontWeight: "900" },
  resetBtn: { minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: "#dfe5f4", backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18, marginTop: 4 },
  resetBtnText: { color: "#153465", fontSize: 13, fontWeight: "900" },
});
