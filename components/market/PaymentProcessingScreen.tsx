import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Landmark,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Ticket,
} from "lucide-react-native";
import { appendCachedMyTickets, getTicketOrderDetail, type TicketOrderDetail } from "@/lib/tickets";
import { useAuth } from "@/providers/AuthProvider";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as BG,
  EYA_BORDER as BORDER,
  EYA_CARD as CARD,
  EYA_GREEN as GREEN,
  EYA_MUTED as MUTED,
  EYA_TEXT as TEXT,
  eventDateLabel,
  eventImageUrl,
  eventLocation,
  eventTimeLabel,
  money,
} from "@/components/market/ticketingUi";

type PaymentMethod = "airtel_money" | "mpamba" | "bank_transfer" | "card";

type MethodPresentation = {
  title: string;
  subtitle: string;
  noticeTitle: string;
  noticeText: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

const TERMINAL_STATUSES = new Set(["failed", "cancelled", "expired"]);

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "").trim() : String(value || "").trim();
}

function normalizeMethod(value: string): PaymentMethod {
  if (value === "mpamba" || value === "bank_transfer" || value === "card") return value;
  return "airtel_money";
}

function methodPresentation(method: PaymentMethod): MethodPresentation {
  if (method === "mpamba") {
    return {
      title: "TNM Mpamba request sent",
      subtitle: "Approve the payment request on your TNM line. Never share your PIN with EYA or anyone else.",
      noticeTitle: "Check your TNM phone",
      noticeText: "Open the official Mpamba prompt and approve the exact amount shown in EYA.",
      Icon: Smartphone,
    };
  }
  if (method === "bank_transfer") {
    return {
      title: "Bank-transfer account ready",
      subtitle: "Transfer the exact amount to the temporary account below before it expires.",
      noticeTitle: "Use Instant Bank Transfer",
      noticeText: "Send the exact amount from your bank app or USSD. EYA confirms the order only after PayChangu verifies receipt.",
      Icon: Landmark,
    };
  }
  if (method === "card") {
    return {
      title: "Card payment submitted",
      subtitle: "PayChangu is completing server-side verification. Returning to EYA does not by itself prove payment.",
      noticeTitle: "Verification in progress",
      noticeText: "Keep this screen open briefly while EYA waits for the verified callback and issues your ticket.",
      Icon: CreditCard,
    };
  }
  return {
    title: "Airtel Money request sent",
    subtitle: "Approve the payment request on your Airtel line. Never share your PIN with EYA or anyone else.",
    noticeTitle: "Check your Airtel phone",
    noticeText: "Open the official Airtel Money prompt and approve the exact amount shown in EYA.",
    Icon: Smartphone,
  };
}

function parseExpiryMs(value: string): number | null {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function initialCountdown(method: PaymentMethod, expiresAt: string): number {
  const expiryMs = parseExpiryMs(expiresAt);
  if (method === "bank_transfer" && expiryMs) {
    return Math.max(0, Math.floor((expiryMs - Date.now()) / 1000));
  }
  return method === "card" ? 10 * 60 : 5 * 60;
}

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function maskedPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return value || "your selected number";
  return `+${digits.slice(0, 3)} ${digits.slice(3, 6)} *** ${digits.slice(-3)}`;
}

export default function PaymentProcessingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderId?: string;
    txRef?: string;
    paymentId?: string;
    paymentMethod?: string;
    phone?: string;
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
    expiresAt?: string;
  }>();
  const orderId = firstParam(params.orderId);
  const txRef = firstParam(params.txRef);
  const paymentMethod = normalizeMethod(firstParam(params.paymentMethod));
  const phone = firstParam(params.phone);
  const bankName = firstParam(params.bankName);
  const accountNumber = firstParam(params.accountNumber);
  const accountName = firstParam(params.accountName);
  const expiresAt = firstParam(params.expiresAt);
  const copy = methodPresentation(paymentMethod);
  const { session, user } = useAuth();
  const [detail, setDetail] = React.useState<TicketOrderDetail | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState(() => initialCountdown(paymentMethod, expiresAt));
  const secondsLeftRef = React.useRef(secondsLeft);

  React.useEffect(() => {
    secondsLeftRef.current = secondsLeft;
  }, [secondsLeft]);

  React.useEffect(() => {
    const timer = setInterval(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  const checkPaymentStatus = React.useCallback(async () => {
    if (!orderId || !session?.access_token || checking) return;
    try {
      setChecking(true);
      setError(null);
      const nextDetail = await getTicketOrderDetail(session.access_token, orderId);
      setDetail(nextDetail);

      if (nextDetail.fulfilled && nextDetail.tickets?.length) {
        await appendCachedMyTickets(user?.id, nextDetail.tickets).catch(() => undefined);
        router.replace({
          pathname: "/(student)/market/payment-success",
          params: { orderId, ticketId: nextDetail.tickets[0]?.id || "" },
        } as any);
        return;
      }

      const status = String(nextDetail.payment_status || nextDetail.order?.payment_status || "").toLowerCase();
      if (TERMINAL_STATUSES.has(status)) {
        setError(`PayChangu reported this payment as ${status}. No ticket has been issued.`);
      }
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Payment confirmation is still pending.");
    } finally {
      setChecking(false);
    }
  }, [checking, orderId, router, session?.access_token, user?.id]);

  React.useEffect(() => {
    if (!orderId || !session?.access_token) return undefined;
    void checkPaymentStatus();
    const interval = setInterval(() => {
      if (secondsLeftRef.current > 0) void checkPaymentStatus();
    }, 8_000);
    return () => clearInterval(interval);
  }, [checkPaymentStatus, orderId, session?.access_token]);

  const order = detail?.order;
  const event = detail?.event as Record<string, unknown> | undefined;
  const tier = detail?.tier as Record<string, unknown> | undefined;
  const total = Number(order?.total_mwk || 0);
  const referenceLabel = txRef ? txRef.slice(-12) : "Pending";
  const terminal = TERMINAL_STATUSES.has(String(detail?.payment_status || order?.payment_status || "").toLowerCase());

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color={TEXT} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Payment Processing</Text>
            <View style={styles.secureRow}>
              <ShieldCheck size={14} color={GREEN} />
              <Text style={styles.secureText}>PayChangu verification required</Text>
            </View>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(34, insets.bottom + 24) }]}
        >
          <View style={styles.statusCard}>
            <View style={styles.statusIcon}>
              <copy.Icon size={44} color={ACCENT} strokeWidth={2.1} />
            </View>
            <ActivityIndicator size="small" color={ACCENT} />
            <Text style={styles.statusTitle}>{copy.title}</Text>
            <Text style={styles.statusSubtitle}>{copy.subtitle}</Text>
            <View style={styles.referencePill}>
              <Text style={styles.referenceLabel}>REFERENCE</Text>
              <Text style={styles.referenceValue}>{referenceLabel}</Text>
            </View>
            {checking ? <Text style={styles.checkingText}>Checking verified payment status…</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          {paymentMethod === "bank_transfer" ? (
            <View style={styles.bankCard}>
              <View style={styles.sectionHeadingRow}>
                <Landmark size={22} color={ACCENT} />
                <Text style={styles.sectionTitle}>Temporary bank account</Text>
              </View>
              <DetailRow label="Bank" value={bankName || "Waiting for bank details"} />
              <DetailRow label="Account name" value={accountName || "Waiting for account name"} />
              <DetailRow label="Account number" value={accountNumber || "Waiting for account number"} emphasize />
              <DetailRow label="Exact amount" value={total > 0 ? money(total) : "Loading order amount"} emphasize />
              <View style={styles.expiryRow}>
                <Clock size={18} color={ACCENT} />
                <Text style={styles.expiryText}>Account expires in {formatTime(secondsLeft)}</Text>
              </View>
              <Text style={styles.bankWarning}>Transfer the exact amount only. Do not reuse this temporary account for another order.</Text>
            </View>
          ) : (
            <View style={styles.noticeCard}>
              <View style={styles.noticeIcon}>
                {paymentMethod === "card" ? <CreditCard size={28} color={ACCENT} /> : <Smartphone size={28} color={ACCENT} />}
              </View>
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>{copy.noticeTitle}</Text>
                <Text style={styles.noticeText}>{copy.noticeText}</Text>
                {phone && paymentMethod !== "card" ? <Text style={styles.phoneText}>{maskedPhone(phone)}</Text> : null}
              </View>
            </View>
          )}

          {paymentMethod !== "bank_transfer" ? (
            <View style={styles.countdownRow}>
              <Clock size={18} color={ACCENT} />
              <Text style={styles.countdownText}>Checking for up to {formatTime(secondsLeft)}</Text>
            </View>
          ) : null}

          <View style={styles.orderCard}>
            <View style={styles.sectionHeadingRow}>
              <Ticket size={22} color={ACCENT} />
              <Text style={styles.sectionTitle}>Ticket order</Text>
            </View>
            <View style={styles.eventRow}>
              <Image source={{ uri: eventImageUrl(event || {}) }} style={styles.eventImage} />
              <View style={styles.eventCopy}>
                <Text style={styles.eventTitle} numberOfLines={2}>{String(event?.title || "EYA ticket order")}</Text>
                <MetaRow Icon={Calendar} text={eventDateLabel(event || {})} />
                <MetaRow Icon={Clock} text={eventTimeLabel(event || {})} />
                <MetaRow Icon={MapPin} text={eventLocation(event || {})} />
              </View>
            </View>
            <View style={styles.ticketRow}>
              <View>
                <Text style={styles.ticketName}>{String(tier?.name || "Ticket")}</Text>
                <Text style={styles.ticketQuantity}>Quantity: {Number(order?.quantity || 1)}</Text>
              </View>
              <Text style={styles.ticketTotal}>{total > 0 ? money(total) : "Loading…"}</Text>
            </View>
          </View>

          <Pressable
            disabled={checking || terminal}
            style={[styles.checkButton, (checking || terminal) && styles.checkButtonDisabled]}
            onPress={() => void checkPaymentStatus()}
          >
            {checking ? <ActivityIndicator color="#ffffff" /> : <RefreshCw size={19} color="#ffffff" />}
            <Text style={styles.checkButtonText}>{terminal ? "Payment not completed" : "Check payment status"}</Text>
          </Pressable>

          <View style={styles.securityCard}>
            <ShieldCheck size={24} color={GREEN} />
            <View style={styles.securityCopy}>
              <Text style={styles.securityTitle}>Nothing is issued from this screen alone</Text>
              <Text style={styles.securityText}>EYA waits for PayChangu verification of the reference, currency and exact amount. The ticket fulfilment callback is signed and idempotent.</Text>
            </View>
          </View>

          <Pressable style={styles.returnButton} onPress={() => router.replace("/(student)/market/tickets" as any)}>
            <Text style={styles.returnButtonText}>Return to tickets</Text>
          </Pressable>

          <View style={styles.footerNote}>
            <CheckCircle2 size={17} color={MUTED} />
            <Text style={styles.footerText}>You may leave this page. Your order will still update after a verified callback.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function DetailRow({ emphasize = false, label, value }: { emphasize?: boolean; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={[styles.detailValue, emphasize && styles.detailValueEmphasized]}>{value}</Text>
    </View>
  );
}

function MetaRow({ Icon, text }: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  text: string;
}) {
  return (
    <View style={styles.metaRow}>
      <Icon size={15} color={MUTED} />
      <Text style={styles.metaText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1 },
  header: { minHeight: 82, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  backButton: { width: 48, height: 48, borderRadius: 17, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, gap: 5 },
  headerTitle: { color: TEXT, fontSize: 22, fontWeight: "900" },
  secureRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  secureText: { color: GREEN, fontSize: 11, fontWeight: "900" },
  content: { paddingHorizontal: 18, gap: 16 },
  statusCard: { borderRadius: 28, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", padding: 24, gap: 10 },
  statusIcon: { width: 88, height: 88, borderRadius: 28, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", marginBottom: 2 },
  statusTitle: { color: TEXT, fontSize: 24, lineHeight: 30, fontWeight: "900", textAlign: "center" },
  statusSubtitle: { color: MUTED, fontSize: 14, lineHeight: 21, fontWeight: "700", textAlign: "center" },
  referencePill: { marginTop: 4, borderRadius: 14, backgroundColor: "#f7f8fe", paddingHorizontal: 14, paddingVertical: 9, alignItems: "center", gap: 3 },
  referenceLabel: { color: MUTED, fontSize: 9, letterSpacing: 1.2, fontWeight: "900" },
  referenceValue: { color: TEXT, fontSize: 13, fontWeight: "900" },
  checkingText: { color: ACCENT, fontSize: 12, fontWeight: "900" },
  errorText: { color: "#b43b4b", fontSize: 13, lineHeight: 19, fontWeight: "800", textAlign: "center" },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  sectionTitle: { color: TEXT, fontSize: 17, fontWeight: "900" },
  noticeCard: { borderRadius: 22, backgroundColor: "#eef1ff", borderWidth: 1, borderColor: "#d9e5fb", flexDirection: "row", alignItems: "center", gap: 14, padding: 17 },
  noticeIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: CARD, alignItems: "center", justifyContent: "center" },
  noticeCopy: { flex: 1, minWidth: 0 },
  noticeTitle: { color: TEXT, fontSize: 16, fontWeight: "900" },
  noticeText: { color: MUTED, fontSize: 13, lineHeight: 19, fontWeight: "700", marginTop: 5 },
  phoneText: { color: ACCENT, fontSize: 13, fontWeight: "900", marginTop: 8 },
  countdownRow: { alignSelf: "center", borderRadius: 999, backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  countdownText: { color: ACCENT, fontSize: 13, fontWeight: "900" },
  bankCard: { borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 18, gap: 14 },
  detailRow: { borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 12, gap: 5 },
  detailLabel: { color: MUTED, fontSize: 11, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  detailValue: { color: TEXT, fontSize: 15, fontWeight: "800" },
  detailValueEmphasized: { color: ACCENT, fontSize: 20, fontWeight: "900" },
  expiryRow: { borderRadius: 14, backgroundColor: "#eef1ff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 11 },
  expiryText: { color: ACCENT, fontSize: 13, fontWeight: "900" },
  bankWarning: { color: MUTED, fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center" },
  orderCard: { borderRadius: 24, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, padding: 17, gap: 16 },
  eventRow: { flexDirection: "row", gap: 14 },
  eventImage: { width: 104, height: 132, borderRadius: 18, backgroundColor: BORDER },
  eventCopy: { flex: 1, minWidth: 0, justifyContent: "center", gap: 8 },
  eventTitle: { color: TEXT, fontSize: 19, lineHeight: 24, fontWeight: "900" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { flex: 1, color: MUTED, fontSize: 12, fontWeight: "700" },
  ticketRow: { borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  ticketName: { color: TEXT, fontSize: 15, fontWeight: "900" },
  ticketQuantity: { color: MUTED, fontSize: 12, fontWeight: "700", marginTop: 5 },
  ticketTotal: { color: ACCENT, fontSize: 20, fontWeight: "900" },
  checkButton: { minHeight: 58, borderRadius: 18, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  checkButtonDisabled: { backgroundColor: "#aeb7d4" },
  checkButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  securityCard: { borderRadius: 20, backgroundColor: "#eaf8f0", flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 },
  securityCopy: { flex: 1 },
  securityTitle: { color: GREEN, fontSize: 14, fontWeight: "900" },
  securityText: { color: TEXT, opacity: 0.72, fontSize: 12, lineHeight: 18, fontWeight: "700", marginTop: 5 },
  returnButton: { minHeight: 54, borderRadius: 17, borderWidth: 1.5, borderColor: ACCENT, alignItems: "center", justifyContent: "center" },
  returnButtonText: { color: ACCENT, fontSize: 14, fontWeight: "900" },
  footerNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12 },
  footerText: { flex: 1, color: MUTED, fontSize: 11, lineHeight: 17, fontWeight: "700", textAlign: "center" },
});
