import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ExpoCalendar from "expo-calendar";
import * as MailComposer from "expo-mail-composer";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import QRCode from "react-native-qrcode-svg";
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Hash,
  Mail,
  MapPin,
  QrCode,
  Share2,
  ShieldCheck,
  Ticket,
  User,
} from "lucide-react-native";
import { getCachedMyTickets, listMyTickets, type IssuedTicket } from "@/lib/tickets";
import { buildTicketQrPayload, canPresentTicketQr } from "@/lib/ticketCredential";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as BG,
  EYA_BORDER as BORDER,
  EYA_CARD as CARD,
  EYA_GREEN as GREEN,
  EYA_MUTED as MUTED,
  EYA_SUCCESS as SUCCESS,
  EYA_TEXT as TEXT,
  eventDateLabel,
  eventImageUrl,
  eventLocation,
  eventTimeLabel,
  issuedTicketStatus,
  money,
  userDisplayName,
} from "@/components/market/ticketingUi";

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}>;

type UtilityAction = "download" | "send" | "calendar" | "share";

type PaymentAudit = {
  method: string | null;
  provider: string | null;
};

function mergeCachedTicketDetail(cached: IssuedTicket | null, live: IssuedTicket | null) {
  if (!cached || !live) return live;
  return {
    ...cached,
    ...live,
    event: live.event ?? cached.event,
    tier: live.tier ?? cached.tier,
    order: live.order ?? cached.order,
    qr_data_url: live.qr_data_url ?? cached.qr_data_url,
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPaymentMethod(method: string | null | undefined) {
  switch (String(method || "").toLowerCase()) {
    case "airtel_money":
      return "Airtel Money";
    case "mpamba":
      return "TNM Mpamba";
    case "bank_transfer":
      return "Bank Transfer";
    case "card":
      return "Card";
    default:
      return "Verified payment";
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function eventStart(event: any) {
  const raw = event?.starts_at || event?.startsAt;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function eventEnd(event: any, start: Date) {
  const raw = event?.ends_at || event?.endsAt;
  if (raw) {
    const date = new Date(raw);
    if (Number.isFinite(date.getTime()) && date.getTime() > start.getTime()) return date;
  }
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const eventTime = Date.parse(value);
  if (!Number.isFinite(eventTime)) return null;
  return Math.ceil((eventTime - Date.now()) / (1000 * 60 * 60 * 24));
}

function ticketLifecycle(ticket: IssuedTicket) {
  if (ticket.checked_in_at || String(ticket.status || "").toLowerCase() === "used") {
    return { label: "Used", tone: "used" as const, description: "This ticket has already been admitted." };
  }

  const status = issuedTicketStatus(ticket);
  if (status === "cancelled" || String(ticket.status || "").toLowerCase() === "cancelled") {
    return { label: "Cancelled", tone: "cancelled" as const, description: "This ticket is no longer valid for entry." };
  }
  if (status === "past") {
    return { label: "Past", tone: "past" as const, description: "The event date for this ticket has passed." };
  }
  if (canPresentTicketQr(ticket)) {
    return { label: "Ready for entry", tone: "ready" as const, description: "Present the QR below at the event gate." };
  }
  return { label: String(ticket.status || "Unavailable"), tone: "past" as const, description: "Entry is currently unavailable for this ticket." };
}

function ticketPdfHtml({
  ticket,
  holderName,
  paymentMethod,
  qrDataUrl,
}: {
  ticket: IssuedTicket;
  holderName: string;
  paymentMethod: string;
  qrDataUrl: string | null;
}) {
  const event = ticket.event as any;
  const tier = ticket.tier as any;
  const order = ticket.order as any;
  const quantity = Math.max(1, Number(order?.quantity || 1));
  const ticketPrice = Number(tier?.price_mwk || (Number(order?.total_mwk || 0) / quantity) || 0);
  const qr = qrDataUrl
    ? `<img src="${escapeHtml(qrDataUrl)}" style="width:210px;height:210px;object-fit:contain" />`
    : `<div style="width:210px;height:210px;border:2px dashed #cad2ec;border-radius:18px;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;color:#69748f;font-weight:700">Open the live ticket in EYA for the current entry credential.</div>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
*{box-sizing:border-box} body{margin:0;padding:36px;background:#f4f2fb;color:#102a54;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.sheet{max-width:720px;margin:0 auto;background:#fff;border:1px solid #e6eaf5;border-radius:28px;overflow:hidden}.head{background:#5e73dd;color:#fff;padding:26px 30px;display:flex;justify-content:space-between;align-items:center}.brand{font-size:29px;font-weight:900;font-style:italic}.verified{font-size:11px;font-weight:900;background:rgba(255,255,255,.17);padding:9px 13px;border-radius:999px}.body{padding:30px}.eyebrow{font-size:10px;font-weight:900;letter-spacing:1.4px;color:#5e73dd}.title{font-size:31px;line-height:1.15;font-weight:900;margin:8px 0 6px}.tier{color:#6d7891;font-size:16px;font-weight:800}.pass{margin-top:24px;border:1px solid #e4e8f3;border-radius:22px;background:#f8f9fe;padding:22px;display:flex;gap:28px;align-items:center}.meta{flex:1}.row{padding:9px 0;border-bottom:1px solid #e5e9f4}.row:last-child{border-bottom:0}.label{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#75809a;font-weight:900}.value{margin-top:4px;font-size:14px;font-weight:800}.qr{text-align:center}.code{font-size:13px;font-weight:900;margin-top:10px;letter-spacing:.5px}.receipt{margin-top:22px;display:flex;justify-content:space-between;gap:18px;border-top:1px solid #e5e9f4;padding-top:18px}.receipt .value{font-size:16px}.foot{padding:0 30px 28px;color:#6d7891;font-size:11px;line-height:1.6}
</style>
</head>
<body><div class="sheet"><div class="head"><div class="brand">EYA</div><div class="verified">VERIFIED TICKET</div></div><div class="body"><div class="eyebrow">OFFICIAL EVENT PASS</div><div class="title">${escapeHtml(event?.title || "EYA ticket")}</div><div class="tier">${escapeHtml(tier?.name || "Ticket")}</div><div class="pass"><div class="meta"><div class="row"><div class="label">Holder</div><div class="value">${escapeHtml(holderName)}</div></div><div class="row"><div class="label">Date</div><div class="value">${escapeHtml(eventDateLabel(event))}</div></div><div class="row"><div class="label">Time</div><div class="value">${escapeHtml(eventTimeLabel(event))}</div></div><div class="row"><div class="label">Venue</div><div class="value">${escapeHtml(eventLocation(event))}</div></div><div class="row"><div class="label">Ticket ID</div><div class="value">${escapeHtml(ticket.ticket_code)}</div></div></div><div class="qr">${qr}<div class="code">${escapeHtml(ticket.ticket_code)}</div></div></div><div class="receipt"><div><div class="label">Payment</div><div class="value">${escapeHtml(paymentMethod)}</div></div><div style="text-align:right"><div class="label">Ticket price</div><div class="value">${escapeHtml(money(ticketPrice))}</div></div></div></div><div class="foot">The live ticket inside EYA is the authoritative credential. Each ticket can be admitted once and is marked used after successful gate check-in.</div></div></body></html>`;
}

export default function SingleTicketScreen() {
  const { ticketId } = useLocalSearchParams<{ ticketId?: string }>();
  const { session, user } = useAuth();
  const [ticket, setTicket] = React.useState<IssuedTicket | null>(null);
  const [paymentAudit, setPaymentAudit] = React.useState<PaymentAudit>({ method: null, provider: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    const loadPaymentAudit = async (orderId: string) => {
      if (!orderId) return;
      try {
        const { data, error: paymentError } = await supabase
          .from("ticket_payments")
          .select("method,provider")
          .eq("order_id", orderId)
          .eq("status", "paid")
          .limit(1)
          .maybeSingle();
        if (!paymentError && active && data) {
          setPaymentAudit({
            method: typeof data.method === "string" ? data.method : null,
            provider: typeof data.provider === "string" ? data.provider : null,
          });
        }
      } catch {
        // Payment audit is helpful display metadata; it must never block the ticket.
      }
    };

    const loadTicket = async () => {
      setLoading(true);
      setError(null);
      let cachedTicket: IssuedTicket | null = null;

      try {
        const cached = await getCachedMyTickets(user?.id);
        cachedTicket = cached.find((item) => item.id === ticketId) ?? null;
        if (active && cachedTicket) {
          setTicket(cachedTicket);
          void loadPaymentAudit(cachedTicket.order_id);
        }

        if (!session?.access_token) throw new Error("Log in to view this ticket.");
        const liveTickets = await listMyTickets(session.access_token);
        const selected = liveTickets.find((item) => item.id === ticketId) ?? null;
        if (!selected) throw new Error("Ticket not found.");

        const merged = mergeCachedTicketDetail(cachedTicket, selected) ?? selected;
        if (active) {
          setTicket(merged);
          setError(null);
          void loadPaymentAudit(merged.order_id);
        }
      } catch (loadError: any) {
        if (active) setError(loadError?.message || "Could not refresh this ticket.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadTicket();
    return () => {
      active = false;
    };
  }, [session?.access_token, ticketId, user?.id]);

  if (loading && !ticket) {
    return (
      <View style={styles.centeredRoot}>
        <View style={styles.stateIcon}><ActivityIndicator color={ACCENT} /></View>
        <Text style={styles.stateTitle}>Loading your ticket</Text>
        <Text style={styles.stateText}>Preparing the latest entry status and ticket details.</Text>
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.centeredRoot}>
        <View style={styles.stateIcon}><Ticket size={30} color={ACCENT} /></View>
        <Text style={styles.stateTitle}>Ticket unavailable</Text>
        <Text style={styles.stateText}>{error || "This ticket could not be found."}</Text>
      </View>
    );
  }

  const holderName = userDisplayName(user);
  const paymentMethod = formatPaymentMethod(paymentAudit.method);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <Header />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {error ? (
            <View style={styles.syncWarning}>
              <Text style={styles.syncWarningText}>Showing your saved ticket. Live refresh: {error}</Text>
            </View>
          ) : null}
          <TicketPass ticket={ticket} />
          <EntryReminder ticket={ticket} />
          <TicketDetails ticket={ticket} holderName={holderName} paymentMethod={paymentMethod} />
          <TicketTools ticket={ticket} holderName={holderName} paymentMethod={paymentMethod} />
          <SecurityNote />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Header() {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <Pressable style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]} onPress={() => router.back()}>
        <ArrowLeft size={22} color={TEXT} strokeWidth={2.5} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.headerEyebrow}>EYA PASS</Text>
        <Text style={styles.headerTitle}>My Ticket</Text>
      </View>
      <View style={styles.verifiedBadge}>
        <ShieldCheck size={17} color={GREEN} strokeWidth={2.4} />
        <Text style={styles.verifiedText}>Verified</Text>
      </View>
    </View>
  );
}

function TicketPass({ ticket }: { ticket: IssuedTicket }) {
  const { width } = useWindowDimensions();
  const event = ticket.event as any;
  const tier = ticket.tier as any;
  const lifecycle = ticketLifecycle(ticket);
  const showQr = lifecycle.tone === "ready";
  const qrPayload = React.useMemo(() => buildTicketQrPayload(ticket), [ticket.ticket_code]);
  const qrSize = Math.min(238, Math.max(190, width - 112));

  return (
    <View style={styles.passCard}>
      <Image source={{ uri: eventImageUrl(event, true) }} style={styles.heroImage} />
      <View style={styles.heroShade} />
      <View style={styles.heroContent}>
        <View style={styles.brandBadge}><Text style={styles.brandBadgeText}>EYA</Text></View>
        <View style={[styles.lifecycleBadge, styles[`lifecycle_${lifecycle.tone}`]]}>
          {lifecycle.tone === "ready" ? <CheckCircle2 size={15} color={SUCCESS} /> : <Clock size={15} color={MUTED} />}
          <Text style={[styles.lifecycleText, lifecycle.tone === "ready" && styles.lifecycleReadyText]}>{lifecycle.label}</Text>
        </View>
      </View>

      <View style={styles.passBody}>
        <Text style={styles.eventTitle}>{String(event?.title || "EYA ticket")}</Text>
        <Text style={styles.ticketType}>{String(tier?.name || "Ticket")}</Text>

        <View style={styles.metaGrid}>
          <PassMeta Icon={Calendar} label="Date" value={eventDateLabel(event)} />
          <PassMeta Icon={Clock} label="Time" value={eventTimeLabel(event)} />
          <PassMeta Icon={MapPin} label="Venue" value={eventLocation(event)} wide />
        </View>

        <View style={styles.dashedDivider} />

        <View style={styles.qrSection}>
          {showQr ? (
            <View style={styles.qrFrame}>
              <QRCode value={qrPayload} size={qrSize} quietZone={9} color={TEXT} backgroundColor="#FFFFFF" ecl="M" />
            </View>
          ) : (
            <View style={[styles.qrInactive, { width: qrSize, minHeight: qrSize }]}>
              <View style={styles.qrInactiveIcon}><QrCode size={35} color={MUTED} /></View>
              <Text style={styles.qrInactiveTitle}>{lifecycle.label}</Text>
              <Text style={styles.qrInactiveText}>{lifecycle.description}</Text>
            </View>
          )}

          <Text style={styles.ticketCodeLabel}>TICKET ID</Text>
          <Text selectable style={styles.ticketCode}>{ticket.ticket_code}</Text>
          <Text style={styles.entryText}>{lifecycle.description}</Text>
        </View>
      </View>
    </View>
  );
}

function PassMeta({ Icon, label, value, wide = false }: { Icon: IconComponent; label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.metaCard, wide && styles.metaCardWide]}>
      <View style={styles.metaIcon}><Icon size={16} color={ACCENT} strokeWidth={2.3} /></View>
      <View style={styles.metaCopy}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function EntryReminder({ ticket }: { ticket: IssuedTicket }) {
  const event = ticket.event as any;
  const days = daysUntil(event?.starts_at);
  const lifecycle = ticketLifecycle(ticket);
  const title = lifecycle.tone !== "ready"
    ? lifecycle.label
    : days == null
      ? "Keep this ticket ready"
      : days === 0
        ? "Your event is today"
        : days > 0
          ? `${days} ${days === 1 ? "day" : "days"} to go`
          : "Event date passed";

  return (
    <View style={styles.reminderCard}>
      <View style={styles.reminderIcon}><Clock size={23} color={ACCENT} /></View>
      <View style={styles.reminderCopy}>
        <Text style={styles.reminderTitle}>{title}</Text>
        <Text style={styles.reminderText}>Arrive early and open the live ticket in EYA before reaching the gate.</Text>
      </View>
    </View>
  );
}

function TicketDetails({ ticket, holderName, paymentMethod }: { ticket: IssuedTicket; holderName: string; paymentMethod: string }) {
  const tier = ticket.tier as any;
  const order = ticket.order as any;
  const quantity = Math.max(1, Number(order?.quantity || 1));
  const ticketPrice = Number(tier?.price_mwk || (Number(order?.total_mwk || 0) / quantity) || 0);
  const rows = [
    { label: "Ticket holder", value: holderName, Icon: User },
    { label: "Ticket type", value: String(tier?.name || "Ticket"), Icon: Ticket },
    { label: "Ticket ID", value: ticket.ticket_code, Icon: Hash },
    { label: "Purchased", value: formatDateTime(order?.paid_at || ticket.issued_at), Icon: Calendar },
    { label: "Paid with", value: paymentMethod, Icon: CreditCard },
    { label: "Ticket price", value: money(ticketPrice), Icon: Check },
  ];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionEyebrow}>TICKET DETAILS</Text>
        <Text style={styles.sectionTitle}>Pass information</Text>
      </View>
      <View style={styles.detailsCard}>
        {rows.map(({ Icon, label, value }, index) => (
          <View key={label} style={[styles.detailRow, index < rows.length - 1 && styles.detailBorder]}>
            <View style={styles.detailIcon}><Icon size={18} color={ACCENT} strokeWidth={2.3} /></View>
            <Text style={styles.detailLabel}>{label}</Text>
            <Text style={styles.detailValue} selectable={label === "Ticket ID"} numberOfLines={2}>{value}</Text>
          </View>
        ))}
      </View>
      {quantity > 1 ? <Text style={styles.orderNote}>This is one of {quantity} tickets in the same order.</Text> : null}
    </View>
  );
}

function TicketTools({ ticket, holderName, paymentMethod }: { ticket: IssuedTicket; holderName: string; paymentMethod: string }) {
  const [busy, setBusy] = React.useState<UtilityAction | null>(null);
  const qrRef = React.useRef<any>(null);
  const event = ticket.event as any;
  const lifecycle = ticketLifecycle(ticket);
  const qrPayload = React.useMemo(() => buildTicketQrPayload(ticket), [ticket.ticket_code]);

  const captureQr = React.useCallback(async () => {
    if (lifecycle.tone !== "ready" || !qrRef.current?.toDataURL) return null;
    return new Promise<string | null>((resolve) => {
      let settled = false;
      const finish = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), 1800);
      try {
        qrRef.current.toDataURL((data: string) => {
          clearTimeout(timer);
          finish(data ? `data:image/png;base64,${data}` : null);
        });
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    });
  }, [lifecycle.tone]);

  const createPdf = async () => {
    const qrDataUrl = await captureQr();
    const result = await Print.printToFileAsync({
      html: ticketPdfHtml({ ticket, holderName, paymentMethod, qrDataUrl }),
    });
    if (!result?.uri) throw new Error("Could not create the ticket PDF.");
    return result.uri;
  };

  const run = async (action: UtilityAction, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(action);
    try {
      await task();
    } catch (actionError: any) {
      Alert.alert("Could not complete action", actionError?.message || "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const download = () => run("download", async () => {
    const uri = await createPdf();
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Save EYA ticket" });
      return;
    }
    await Print.printAsync({ html: ticketPdfHtml({ ticket, holderName, paymentMethod, qrDataUrl: await captureQr() }) });
  });

  const send = () => run("send", async () => {
    const uri = await createPdf();
    const body = [
      `EYA ticket for ${String(event?.title || "event")}`,
      `${eventDateLabel(event)} • ${eventTimeLabel(event)}`,
      eventLocation(event),
      `Ticket ID: ${ticket.ticket_code}`,
      "",
      "The live ticket remains available in EYA.",
    ].join("\n");

    if (await MailComposer.isAvailableAsync()) {
      await MailComposer.composeAsync({ subject: `EYA Ticket — ${String(event?.title || "Event")}`, body, attachments: [uri] });
      return;
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Send EYA ticket" });
      return;
    }
    throw new Error("No email or file-sharing app is available on this device.");
  });

  const calendar = () => run("calendar", async () => {
    const start = eventStart(event);
    if (!start) throw new Error("This event does not have a calendar-ready start time yet.");
    await ExpoCalendar.createEventInCalendarAsync({
      title: String(event?.title || "EYA event"),
      startDate: start,
      endDate: eventEnd(event, start),
      location: eventLocation(event),
      notes: `EYA ticket ${ticket.ticket_code}. Open the live ticket in EYA for entry.`,
    });
  });

  const shareEvent = () => run("share", async () => {
    await Share.share({
      title: String(event?.title || "EYA event"),
      message: [
        String(event?.title || "EYA event"),
        `${eventDateLabel(event)} • ${eventTimeLabel(event)}`,
        eventLocation(event),
        "",
        "Booked with EYA.",
      ].join("\n"),
    });
  });

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionEyebrow}>TICKET TOOLS</Text>
        <Text style={styles.sectionTitle}>Keep it handy</Text>
      </View>

      <View style={styles.toolsGrid}>
        <ToolButton Icon={Download} title="Download" subtitle="Save PDF" loading={busy === "download"} disabled={Boolean(busy)} onPress={download} />
        <ToolButton Icon={Mail} title="Send Ticket" subtitle="Email PDF" loading={busy === "send"} disabled={Boolean(busy)} onPress={send} />
        <ToolButton Icon={Calendar} title="Add to Calendar" subtitle="Save event" loading={busy === "calendar"} disabled={Boolean(busy)} onPress={calendar} />
        <ToolButton Icon={Share2} title="Share Event" subtitle="Invite friends" loading={busy === "share"} disabled={Boolean(busy)} onPress={shareEvent} />
      </View>

      <View style={styles.hiddenQr} pointerEvents="none">
        {lifecycle.tone === "ready" ? (
          <QRCode
            value={qrPayload}
            size={240}
            quietZone={10}
            color={TEXT}
            backgroundColor="#FFFFFF"
            ecl="M"
            getRef={(ref) => {
              qrRef.current = ref;
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

function ToolButton({ Icon, title, subtitle, loading, disabled, onPress }: {
  Icon: IconComponent;
  title: string;
  subtitle: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.toolButton, disabled && styles.toolDisabled, pressed && !disabled && styles.pressed]}>
      <View style={styles.toolIcon}>{loading ? <ActivityIndicator color={ACCENT} size="small" /> : <Icon size={22} color={ACCENT} strokeWidth={2.3} />}</View>
      <Text style={styles.toolTitle}>{title}</Text>
      <Text style={styles.toolSubtitle}>{loading ? "Working…" : subtitle}</Text>
    </Pressable>
  );
}

function SecurityNote() {
  return (
    <View style={styles.securityNote}>
      <View style={styles.securityIcon}><ShieldCheck size={22} color={ACCENT} /></View>
      <View style={styles.securityCopy}>
        <Text style={styles.securityTitle}>Use the live ticket at the gate</Text>
        <Text style={styles.securityText}>Each ticket can be admitted once. After successful check-in, EYA marks it used and the entry QR is no longer shown.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  centeredRoot: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 28 },
  stateIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", marginBottom: 15 },
  stateTitle: { color: TEXT, fontSize: 20, fontWeight: "900", textAlign: "center" },
  stateText: { color: MUTED, fontSize: 13, lineHeight: 20, fontWeight: "600", textAlign: "center", maxWidth: 320, marginTop: 7 },

  header: { minHeight: 72, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: BG },
  headerButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: { color: ACCENT, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  headerTitle: { color: TEXT, fontSize: 18, fontWeight: "900", marginTop: 2 },
  verifiedBadge: { minHeight: 34, borderRadius: 17, paddingHorizontal: 10, backgroundColor: "#eaf8f0", flexDirection: "row", alignItems: "center", gap: 5 },
  verifiedText: { color: GREEN, fontSize: 10, fontWeight: "900" },

  scrollContent: { padding: 15, paddingBottom: 36, gap: 14 },
  syncWarning: { borderRadius: 15, borderWidth: 1, borderColor: "#f1dfb7", backgroundColor: "#fff9e9", padding: 11 },
  syncWarningText: { color: "#8a6515", fontSize: 10, lineHeight: 15, fontWeight: "700", textAlign: "center" },

  passCard: { borderRadius: 26, overflow: "hidden", borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, shadowColor: "#102a54", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  heroImage: { width: "100%", height: 145, backgroundColor: BORDER },
  heroShade: { position: "absolute", left: 0, right: 0, top: 0, height: 145, backgroundColor: "rgba(14,39,86,0.46)" },
  heroContent: { position: "absolute", left: 15, right: 15, top: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  brandBadge: { minWidth: 52, height: 38, borderRadius: 13, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  brandBadgeText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", fontStyle: "italic" },
  lifecycleBadge: { minHeight: 32, borderRadius: 16, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.92)" },
  lifecycle_ready: { backgroundColor: "#eaf8f0" },
  lifecycle_used: { backgroundColor: "#eef0f5" },
  lifecycle_past: { backgroundColor: "#eef0f5" },
  lifecycle_cancelled: { backgroundColor: "#fff0ef" },
  lifecycleText: { color: MUTED, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  lifecycleReadyText: { color: GREEN },

  passBody: { padding: 15 },
  eventTitle: { color: TEXT, fontSize: 24, lineHeight: 29, fontWeight: "900" },
  ticketType: { color: MUTED, fontSize: 12, fontWeight: "800", marginTop: 4 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  metaCard: { width: "48%", flexGrow: 1, minHeight: 54, borderRadius: 15, backgroundColor: "#f8f9fe", borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 8, padding: 9 },
  metaCardWide: { width: "100%" },
  metaIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  metaCopy: { flex: 1, minWidth: 0 },
  metaLabel: { color: MUTED, fontSize: 7, fontWeight: "900", textTransform: "uppercase" },
  metaValue: { color: TEXT, fontSize: 9, fontWeight: "800", marginTop: 2 },
  dashedDivider: { borderTopWidth: 1, borderStyle: "dashed", borderColor: BORDER, marginVertical: 16 },
  qrSection: { alignItems: "center" },
  qrFrame: { padding: 8, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: BORDER },
  qrInactive: { borderRadius: 20, backgroundColor: "#f8f9fd", borderWidth: 1, borderStyle: "dashed", borderColor: BORDER, alignItems: "center", justifyContent: "center", padding: 22 },
  qrInactiveIcon: { width: 62, height: 62, borderRadius: 21, backgroundColor: "#eef1f6", alignItems: "center", justifyContent: "center" },
  qrInactiveTitle: { color: TEXT, fontSize: 16, fontWeight: "900", marginTop: 11 },
  qrInactiveText: { color: MUTED, fontSize: 11, lineHeight: 17, fontWeight: "600", textAlign: "center", marginTop: 5 },
  ticketCodeLabel: { color: MUTED, fontSize: 7, fontWeight: "900", letterSpacing: 1, marginTop: 12 },
  ticketCode: { color: TEXT, fontSize: 14, fontWeight: "900", letterSpacing: 0.5, marginTop: 3 },
  entryText: { color: MUTED, fontSize: 10, lineHeight: 15, fontWeight: "600", textAlign: "center", marginTop: 6, maxWidth: 300 },

  reminderCard: { borderRadius: 20, borderWidth: 1, borderColor: "#dce4ff", backgroundColor: "#f2f5ff", flexDirection: "row", alignItems: "center", gap: 11, padding: 13 },
  reminderIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: "#e4e9ff", alignItems: "center", justifyContent: "center" },
  reminderCopy: { flex: 1, minWidth: 0 },
  reminderTitle: { color: TEXT, fontSize: 13, fontWeight: "900" },
  reminderText: { color: MUTED, fontSize: 10, lineHeight: 16, fontWeight: "600", marginTop: 3 },

  section: { borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 14 },
  sectionHeading: { marginBottom: 12 },
  sectionEyebrow: { color: ACCENT, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  sectionTitle: { color: TEXT, fontSize: 18, fontWeight: "900", marginTop: 3 },
  detailsCard: { borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", overflow: "hidden" },
  detailRow: { minHeight: 57, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 11 },
  detailBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  detailIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  detailLabel: { width: 84, color: MUTED, fontSize: 9, fontWeight: "800" },
  detailValue: { flex: 1, color: TEXT, fontSize: 10, lineHeight: 14, fontWeight: "800", textAlign: "right" },
  orderNote: { color: MUTED, fontSize: 9, fontWeight: "600", marginTop: 9, textAlign: "center" },

  toolsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  toolButton: { width: "48%", flexGrow: 1, minHeight: 105, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", alignItems: "center", justifyContent: "center", padding: 10 },
  toolDisabled: { opacity: 0.55 },
  toolIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  toolTitle: { color: TEXT, fontSize: 11, fontWeight: "900", marginTop: 7, textAlign: "center" },
  toolSubtitle: { color: MUTED, fontSize: 8, fontWeight: "700", marginTop: 2, textAlign: "center" },
  hiddenQr: { position: "absolute", left: -10000, top: -10000, opacity: 0.01 },

  securityNote: { borderRadius: 20, borderWidth: 1, borderColor: "#d8e4fb", backgroundColor: "#eef3ff", flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 13 },
  securityIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#dfe7ff", alignItems: "center", justifyContent: "center" },
  securityCopy: { flex: 1, minWidth: 0 },
  securityTitle: { color: TEXT, fontSize: 12, fontWeight: "900" },
  securityText: { color: MUTED, fontSize: 9, lineHeight: 15, fontWeight: "600", marginTop: 3 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.994 }] },
});
