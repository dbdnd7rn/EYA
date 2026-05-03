import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ArrowLeft, Camera, CheckCircle2, ChevronRight, QrCode, ShieldCheck } from "lucide-react-native";
import { useAgentWorkspace, type AgentJobCard } from "@/components/agent/useAgentWorkspace";
import { formatCacheTime, getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { getOrderHandoffDetails, verifyOrderHandoff, type OrderHandoffDetails } from "@/lib/orderHandoff";
import { goBackOrFallback } from "@/lib/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";

function money(value: number) {
  return `MWK ${Math.round(value || 0).toLocaleString("en-MW")}`;
}

function parseQrToken(payload: string): string | null {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload);
    if (typeof parsed?.qr_token === "string" && parsed.qr_token.trim()) return parsed.qr_token.trim();
  } catch {
    if (payload.includes(":")) return payload.trim();
  }

  return null;
}

function statusAction(job: AgentJobCard | null) {
  if (!job) return null;
  if (job.status === "assigned") return { label: "Mark picked up", nextStatus: "picked_up" as const };
  if (job.status === "picked_up") return { label: "Mark arriving", nextStatus: "arriving" as const };
  return null;
}

export default function AgentDeliveryVerificationPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string }>();
  const { user, session } = useAuth();
  const { isOnline } = useNetwork();
  const { workspace, refresh, updateJobStatus, releaseJob } = useAgentWorkspace();
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [handoff, setHandoff] = useState<OrderHandoffDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [cacheTime, setCacheTime] = useState<number | null>(null);

  const orderId = typeof params.orderId === "string" ? params.orderId : "";
  const handoffCacheKey = orderId ? `agent_handoff_${orderId}` : null;
  const job = [...workspace.activeJobs, ...workspace.completedJobs].find((row) => row.orderId === orderId) ?? null;
  const nextAction = statusAction(job);
  const canVerifyNow = Boolean(verifiedAt || job?.status === "arriving" || job?.status === "delivered");
  const verificationLocked = verifying || !!verifiedAt || !canVerifyNow;

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!orderId) {
        setError("Missing order id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        if (!isOnline && handoffCacheKey) {
          const cached = await getCachedJson<OrderHandoffDetails>(handoffCacheKey);
          if (!active) return;
          if (cached?.data) {
            setHandoff(cached.data);
            setVerifiedAt(cached.data.handoff.verified_at);
            setCacheTime(cached.ts ?? null);
            setError("Offline mode: showing cached delivery details.");
          } else {
            setError("Offline with no cached delivery details yet.");
          }
          return;
        }

        const data = await getOrderHandoffDetails(orderId, session?.access_token);
        if (!active) return;
        setHandoff(data);
        setVerifiedAt(data.handoff.verified_at);
        if (handoffCacheKey) {
          await setCachedJson(handoffCacheKey, data);
          setCacheTime(Date.now());
        }
      } catch (e: any) {
        if (!active) return;
        const cached = handoffCacheKey ? await getCachedJson<OrderHandoffDetails>(handoffCacheKey) : null;
        if (cached?.data) {
          setHandoff(cached.data);
          setVerifiedAt(cached.data.handoff.verified_at);
          setCacheTime(cached.ts ?? null);
          setError("Offline mode: showing cached delivery details.");
        } else {
          setError(e?.message ?? "Could not load delivery verification details.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [handoffCacheKey, isOnline, orderId, session?.access_token]);

  const lineSummary = useMemo(
    () => handoff?.invoice.line_items.map((line) => `${line.quantity}x ${line.item_name_snapshot}`).join(", ") ?? "",
    [handoff],
  );

  const runVerification = async (input: { pin?: string; qrToken?: string }) => {
    if (!orderId) return;
    if (!isOnline) {
      Alert.alert("Internet required", "Handoff verification must sync online.");
      return;
    }
    if (!canVerifyNow) {
      Alert.alert("Arrival required", "Mark the delivery as arriving before verifying the customer handoff.");
      return;
    }

    setVerifying(true);
    try {
      const result = await verifyOrderHandoff({
        orderId,
        accessToken: session?.access_token,
        pin: input.pin,
        qrToken: input.qrToken,
      });

      setVerifiedAt(result.verified_at);
      setHandoff((current) =>
        current
          ? {
              ...current,
              handoff: {
                ...current.handoff,
                verified_at: result.verified_at,
              },
            }
          : current,
      );
      if (handoffCacheKey && handoff) {
        await setCachedJson(handoffCacheKey, {
          ...handoff,
          handoff: {
            ...handoff.handoff,
            verified_at: result.verified_at,
          },
        });
        setCacheTime(Date.now());
      }
      await refresh();
      setScanOpen(false);
      Alert.alert("Verified", "Customer handoff verified. This delivery is now marked delivered.");
    } catch (e: any) {
      Alert.alert("Verification failed", e?.message ?? "Could not verify handoff.");
    } finally {
      setVerifying(false);
    }
  };

  const submitPin = async () => {
    const clean = pin.trim();
    if (!clean) {
      Alert.alert("PIN required", "Enter the customer delivery PIN.");
      return;
    }
    await runVerification({ pin: clean });
  };

  const startScan = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert("Camera required", "Allow camera access to scan the customer's QR pass.");
        return;
      }
    }
    setScanOpen(true);
  };

  const advanceDelivery = async () => {
    if (!job || !nextAction) return;
    try {
      setUpdatingStatus(true);
      await updateJobStatus(orderId, nextAction.nextStatus);
      Alert.alert("Delivery updated", `Delivery marked ${nextAction.label.toLowerCase().replace("mark ", "")}.`);
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Could not update this delivery.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const releaseAssignedJob = async () => {
    if (!job || job.status !== "assigned") return;
    Alert.alert("Release delivery", "Return this delivery to the request queue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Release",
        style: "destructive",
        onPress: async () => {
          try {
            setUpdatingStatus(true);
            await releaseJob(orderId);
            Alert.alert("Delivery released", "The request is back in the queue.");
            router.replace("/(agent)/(tabs)/deliveries");
          } catch (e: any) {
            Alert.alert("Release failed", e?.message ?? "Could not release this delivery.");
          } finally {
            setUpdatingStatus(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#102a54" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backBtn} onPress={() => goBackOrFallback(router, "/(agent)/(tabs)/deliveries")}>
          <ArrowLeft size={18} color="#102a54" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Delivery Verification</Text>
          <Text style={styles.heroTitle}>Order {handoff?.invoice.order_reference ?? orderId}</Text>
          <Text style={styles.heroSub}>Confirm the correct customer before handoff. Use the delivery PIN or scan the customer QR pass.</Text>
        </View>

        {error ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Unable to load delivery details</Text>
            <Text style={styles.noticeSub}>{error}</Text>
          </View>
        ) : null}
        {cacheTime ? <Text style={styles.cacheMeta}>Delivery cache: {formatCacheTime(cacheTime)}</Text> : null}

        {handoff ? (
          <>
            {job ? (
              <View style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionTitle}>Delivery Status</Text>
                  <View style={styles.paidPill}>
                    <Text style={styles.paidPillText}>{job.status.replaceAll("_", " ")}</Text>
                  </View>
                </View>
                <Text style={styles.invoiceMeta}>{job.vendorName}</Text>
                <Text style={styles.invoiceMeta}>{job.dropoffLabel}</Text>
                <Text style={styles.invoiceMeta}>{job.itemSummary}</Text>

                {nextAction ? (
                  <Pressable style={[styles.primaryBtn, updatingStatus && styles.btnDisabled]} onPress={() => void advanceDelivery()} disabled={updatingStatus}>
                    <ShieldCheck size={16} color="#ffffff" />
                    <Text style={styles.primaryBtnText}>{updatingStatus ? "Updating..." : nextAction.label}</Text>
                  </Pressable>
                ) : null}

                {job.status === "assigned" ? (
                  <Pressable style={[styles.secondaryBtn, updatingStatus && styles.btnDisabled]} onPress={() => void releaseAssignedJob()} disabled={updatingStatus}>
                    <Text style={styles.secondaryBtnText}>Release delivery</Text>
                  </Pressable>
                ) : null}

                {job.status === "arriving" && !verifiedAt ? (
                  <Text style={styles.verifiedText}>Arrived at destination. Verify the handoff below to complete delivery.</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Invoice</Text>
                <View style={styles.paidPill}>
                  <Text style={styles.paidPillText}>Paid</Text>
                </View>
              </View>
              <Text style={styles.invoiceTitle}>{handoff.invoice.title ?? "Food order"}</Text>
              <Text style={styles.invoiceMeta}>{lineSummary || "Order items unavailable"}</Text>
              <Text style={styles.invoiceMeta}>{handoff.invoice.delivery_address ?? "Delivery address not set"}</Text>
              <Text style={styles.invoiceTotal}>{money(handoff.order.total_mwk)}</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle}>Handoff Check</Text>
                {verifiedAt ? (
                  <View style={styles.okPill}>
                    <CheckCircle2 size={14} color="#0d7b45" />
                    <Text style={styles.okPillText}>Verified</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.label}>Customer PIN</Text>
              <TextInput
                value={pin}
                onChangeText={setPin}
                keyboardType="number-pad"
                placeholder="Enter 6-digit PIN"
                placeholderTextColor="#98a3ba"
                style={styles.input}
                editable={!verificationLocked}
              />

              {!canVerifyNow && !verifiedAt ? <Text style={styles.helperText}>Mark the delivery as arriving before you verify the customer handoff.</Text> : null}

              <Pressable style={[styles.primaryBtn, verificationLocked && styles.btnDisabled]} onPress={() => void submitPin()} disabled={verificationLocked}>
                <ShieldCheck size={16} color="#ffffff" />
                <Text style={styles.primaryBtnText}>
                  {verifying ? "Verifying..." : verifiedAt ? "Already verified" : canVerifyNow ? "Verify PIN" : "Mark arriving first"}
                </Text>
              </Pressable>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or</Text>
                <View style={styles.orLine} />
              </View>

              <Pressable style={[styles.secondaryBtn, verificationLocked && styles.btnDisabled]} onPress={() => void startScan()} disabled={verificationLocked}>
                <QrCode size={16} color="#102a54" />
                <Text style={styles.secondaryBtnText}>{verifiedAt ? "Already verified" : canVerifyNow ? "Scan customer QR" : "Mark arriving first"}</Text>
                <ChevronRight size={18} color="#102a54" />
              </Pressable>

              {verifiedAt ? <Text style={styles.verifiedText}>Verified at {new Date(verifiedAt).toLocaleString()}</Text> : null}
            </View>
          </>
        ) : null}
      </ScrollView>

      <Modal visible={scanOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setScanOpen(false)}>
        <SafeAreaView style={styles.scanRoot}>
          <View style={styles.scanHeader}>
            <View>
              <Text style={styles.scanTitle}>Scan customer QR</Text>
              <Text style={styles.scanSub}>Scan the QR shown on the customer delivery pass.</Text>
            </View>
            <Pressable style={styles.scanCloseBtn} onPress={() => setScanOpen(false)}>
              <Text style={styles.scanCloseText}>Close</Text>
            </Pressable>
          </View>

          {permission?.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => {
                const qrToken = parseQrToken(data);
                if (!qrToken || verifying || verifiedAt) return;
                void runVerification({ qrToken });
              }}
            />
          ) : (
            <View style={styles.cameraFallback}>
              <Camera size={30} color="#102a54" />
              <Text style={styles.cameraFallbackText}>Camera permission is required for QR scanning.</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 120, gap: 16 },
  backBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dfe5f4",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backText: { color: "#102a54", fontWeight: "800", fontSize: 13 },
  heroCard: {
    borderRadius: 30,
    backgroundColor: "#b9dfe8",
    padding: 20,
    gap: 8,
  },
  heroLabel: { color: "#355d71", fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  heroTitle: { color: "#102a54", fontWeight: "900", fontSize: 28 },
  heroSub: { color: "#264b67", fontWeight: "700", fontSize: 14, lineHeight: 21 },
  noticeCard: { borderRadius: 24, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd5e4", padding: 16, gap: 6 },
  noticeTitle: { color: "#b0003a", fontWeight: "900", fontSize: 15 },
  noticeSub: { color: "#8b4560", fontWeight: "600", fontSize: 13, lineHeight: 19 },
  cacheMeta: { color: "#6d7a99", fontWeight: "700", fontSize: 12 },
  card: {
    borderRadius: 28,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 18,
    gap: 12,
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sectionTitle: { color: "#102a54", fontWeight: "900", fontSize: 18 },
  paidPill: { borderRadius: 999, backgroundColor: "#e7f7ee", paddingHorizontal: 12, paddingVertical: 8 },
  paidPillText: { color: "#0d7b45", fontWeight: "900", fontSize: 12 },
  okPill: { borderRadius: 999, backgroundColor: "#e7f7ee", paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  okPillText: { color: "#0d7b45", fontWeight: "900", fontSize: 12 },
  invoiceTitle: { color: "#102a54", fontWeight: "900", fontSize: 22 },
  invoiceMeta: { color: "#6d7a99", fontWeight: "700", fontSize: 14, lineHeight: 20 },
  invoiceTotal: { color: "#102a54", fontWeight: "900", fontSize: 20, marginTop: 4 },
  label: { color: "#596885", fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  helperText: { color: "#6d7a99", fontWeight: "700", fontSize: 13, lineHeight: 19 },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dde4f1",
    backgroundColor: "#f8faff",
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: "#102a54",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 2,
  },
  primaryBtn: {
    borderRadius: 18,
    backgroundColor: "#102a54",
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  secondaryBtn: {
    borderRadius: 18,
    backgroundColor: "#f7f8fe",
    borderWidth: 1,
    borderColor: "#e5eaf6",
    paddingVertical: 15,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryBtnText: { color: "#102a54", fontWeight: "900", fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  orLine: { flex: 1, height: 1, backgroundColor: "#e4e8f2" },
  orText: { color: "#7b88a3", fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  verifiedText: { color: "#0d7b45", fontWeight: "800", fontSize: 13 },
  scanRoot: { flex: 1, backgroundColor: "#0b1124" },
  scanHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e7ebf5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  scanTitle: { color: "#102a54", fontWeight: "900", fontSize: 18 },
  scanSub: { color: "#6d7a99", fontWeight: "700", fontSize: 12, marginTop: 2 },
  scanCloseBtn: { borderRadius: 999, backgroundColor: "#eef2fa", paddingHorizontal: 12, paddingVertical: 8 },
  scanCloseText: { color: "#102a54", fontWeight: "800", fontSize: 12 },
  camera: { flex: 1 },
  cameraFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: "#f7f8fe" },
  cameraFallbackText: { color: "#102a54", fontWeight: "700", fontSize: 14, textAlign: "center" },
});
