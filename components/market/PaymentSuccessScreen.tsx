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
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ExpoCalendar from "expo-calendar";
import * as MailComposer from "expo-mail-composer";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Download,
  Home,
  Mail,
  MapPin,
  QrCode,
  Share2,
  ShieldCheck,
  Ticket,
} from "lucide-react-native";
import { getTicketOrderDetail, type IssuedTicket, type TicketOrderDetail } from "@/lib/tickets";
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
  money,
} from "@/components/market/ticketingUi";

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}>;

type UtilityAction = "download" | "send" | "calendar" | "share";

function formatPaidDate(value?: string | null) {
  if (!value) return "Confirmed now";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Confirmed now";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validQrSource(value?: string | null) {
  const normalized = String(value || "").trim();
  if (normalized.startsWith("data:image/") || normalized.startsWith("https://")) return normalized;
  return null;
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

function ticketPdfHtml(detail: TicketOrderDetail, ticket: IssuedTicket) {
  const event = detail.event as any;
  const tier = detail.tier as any;
  const qr = validQrSource(ticket.qr_data_url);
  const title = escapeHtml(event?.title || "EYA Ticket");
  const tierName = escapeHtml(tier?.name || "Ticket");
  const date = escapeHtml(eventDateLabel(event));
  const time = escapeHtml(eventTimeLabel(event));
  const venue = escapeHtml(eventLocation(event));
  const ticketCode = escapeHtml(ticket.ticket_code);
  const orderId = escapeHtml(detail.order.id);
  const amount = escapeHtml(money(detail.order.total_mwk));
  const qrMarkup = qr
    ? `<img src="${escapeHtml(qr)}" style="width:190px;height:190px;object-fit:contain;border-radius:14px;" />`
    : `<div style="width:190px;height:190px;border:2px dashed #cbd4f7;border-radius:14px;display:flex;align-items:center;justify-content:center;text-align:center;color:#6e7892;font-weight:700;padding:16px;box-sizing:border-box;">Open this ticket in EYA to refresh the entry QR.</div>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 34px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0e2756; background: #f4f2fb; }
    .sheet { max-width: 680px; margin: 0 auto; background: #fff; border: 1px solid #e8edf7; border-radius: 26px; overflow: hidden; }
    .head { background: #5e73dd; color: white; padding: 26px 30px; display: flex; justify-content: space-between; align-items: center; }
    .brand { font-size: 28px; font-weight: 900; font-style: italic; letter-spacing: 1px; }
    .status { font-size: 12px; font-weight: 800; background: rgba(255,255,255,.16); border-radius: 999px; padding: 8px 12px; }
    .body { padding: 30px; }
    .eyebrow { color: #5e73dd; font-size: 11px; font-weight: 900; letter-spacing: 1.4px; text-transform: uppercase; }
    h1 { margin: 8px 0 6px; font-size: 30px; line-height: 1.15; }
    .tier { color: #6e7892; font-size: 16px; font-weight: 700; margin-bottom: 24px; }
    .ticket { border: 1px solid #e8edf7; background: #f8f9fe; border-radius: 22px; padding: 22px; display: flex; gap: 28px; align-items: center; }
    .meta { flex: 1; }
    .row { padding: 9px 0; border-bottom: 1px solid #e8edf7; }
    .row:last-child { border-bottom: 0; }
    .label { display: block; color: #6e7892; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .8px; }
    .value { display: block; margin-top: 4px; font-size: 15px; font-weight: 800; }
    .qr { width: 220px; text-align: center; }
    .ticket-id { margin-top: 10px; font-size: 13px; font-weight: 900; letter-spacing: .5px; }
    .receipt { margin-top: 22px; border-top: 1px solid #e8edf7; padding-top: 18px; display: flex; justify-content: space-between; gap: 20px; }
    .receipt small { color: #6e7892; font-weight: 700; }
    .amount { font-size: 22px; font-weight: 900; }
    .foot { color: #6e7892; font-size: 11px; line-height: 1.6; padding: 0 30px 28px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div class="brand">EYA</div>
      <div class="status">PAID • ACTIVE</div>
    </div>
    <div class="body">
      <div class="eyebrow">Official ticket</div>
      <h1>${title}</h1>
      <div class="tier">${tierName}</div>
      <div class="ticket">
        <div class="meta">
          <div class="row"><span class="label">Date</span><span class="value">${date}</span></div>
          <div class="row"><span class="label">Time</span><span class="value">${time}</span></div>
          <div class="row"><span class="label">Venue</span><span class="value">${venue}</span></div>
          <div class="row"><span class="label">Ticket ID</span><span class="value">${ticketCode}</span></div>
        </div>
        <div class="qr">${qrMarkup}<div class="ticket-id">${ticketCode}</div></div>
      </div>
      <div class="receipt">
        <div><small>Order</small><div>${orderId}</div></div>
        <div style="text-align:right"><small>Amount paid</small><div class="amount">${amount}</div></div>
      </div>
    </div>
    <div class="foot">Keep this ticket secure. The live ticket stored in EYA is the authoritative entry credential and each ticket can be admitted once.</div>
  </div>
</body>
</html>`;
}

async function createTicketPdf(detail: TicketOrderDetail, ticket: IssuedTicket) {
  const result = await Print.printToFileAsync({ html: ticketPdfHtml(detail, ticket) });
  if (!result?.uri) throw new Error("Could not create the ticket PDF.");
  return result.uri;
}

export default function PaymentSuccessScreen() {
  const { orderId, ticketId } = useLocalSearchParams<{ orderId?: string; ticketId?: string }>();
  const { session, user } = useAuth();
  const [detail, setDetail] = React.useState<TicketOrderDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const loadDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!orderId || !session?.access_token) throw new Error("Ticket order could not be loaded.");
        const nextDetail = await getTicketOrderDetail(session.access_token, orderId);
        if (active) setDetail(nextDetail);
      } catch (loadError: any) {
        if (active) setError(loadError?.message || "Could not load confirmed ticket.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDetail();
    return () => {
      active = false;
    };
  }, [orderId, session?.access_token]);

  const ticket = React.useMemo(() => {
    return detail?.tickets.find((item) => item.id === ticketId) ?? detail?.tickets[0] ?? null;
  }, [detail?.tickets, ticketId]);

  if (loading) {
    return (
      <View style={styles.centeredRoot}>
        <View style={styles.loadingIcon}>
          <ActivityIndicator color={ACCENT} />
        </View>
        <Text style={styles.stateTitle}>Preparing your ticket</Text>
        <Text style={styles.stateText}>We’re loading the confirmed order and secure entry pass.</Text>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.centeredRoot}>
        <View style={styles.loadingIcon}>
          <Ticket size={30} color={ACCENT} strokeWidth={2.2} />
        </View>
        <Text style={styles.stateTitle}>Ticket unavailable</Text>
        <Text style={styles.stateText}>{error || "We could not load this ticket order."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <Header />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.pageShell}>
            <ProgressStrip />
            <SuccessHero />
            <ConfirmationNotice email={user?.email || null} />
            <OrderReceipt detail={detail} />
            {ticket ? <TicketPreview detail={detail} ticket={ticket} /> : null}
            {ticket ? <TicketUtilities detail={detail} ticket={ticket} /> : null}
            <ImportantNote />
            <SuccessActions ticket={ticket} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Header() {
  const router = useRouter();
  const close = () => router.replace("/(student)/market/tickets" as any);

  return (
    <View style={styles.header}>
      <Pressable style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]} onPress={close}>
        <ArrowLeft size={22} color={TEXT} strokeWidth={2.5} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>Payment complete</Text>
        <Text style={styles.headerSubtitle}>Your ticket order is confirmed</Text>
      </View>
      <View style={styles.secureBadge}>
        <ShieldCheck size={18} color={GREEN} strokeWidth={2.3} />
        <Text style={styles.secureText}>Secure</Text>
      </View>
    </View>
  );
}

function ProgressStrip() {
  return (
    <View style={styles.progressCard}>
      <ProgressPoint label="Details" />
      <View style={styles.progressLine} />
      <ProgressPoint label="Payment" />
      <View style={styles.progressLine} />
      <ProgressPoint label="Ticket" />
    </View>
  );
}

function ProgressPoint({ label }: { label: string }) {
  return (
    <View style={styles.progressPoint}>
      <View style={styles.progressCircle}>
        <Check size={15} color="#FFFFFF" strokeWidth={3} />
      </View>
      <Text style={styles.progressLabel}>{label}</Text>
    </View>
  );
}

function SuccessHero() {
  return (
    <View style={styles.successHero}>
      <View style={styles.successGlow}>
        <View style={styles.successCircle}>
          <Check size={42} color="#FFFFFF" strokeWidth={3.2} />
        </View>
      </View>
      <View style={styles.confirmedPill}>
        <View style={styles.confirmedDot} />
        <Text style={styles.confirmedPillText}>PAYMENT CONFIRMED</Text>
      </View>
      <Text style={styles.successTitle}>Your ticket is ready</Text>
      <Text style={styles.successSubtitle}>
        Payment was verified successfully and your ticket has been issued to your EYA account.
      </Text>
    </View>
  );
}

function ConfirmationNotice({ email }: { email: string | null }) {
  return (
    <View style={styles.noticeCard}>
      <View style={styles.noticeIcon}>
        <Ticket size={23} color={SUCCESS} strokeWidth={2.3} />
      </View>
      <View style={styles.noticeCopy}>
        <Text style={styles.noticeTitle}>Saved to My Tickets</Text>
        <Text style={styles.noticeText}>
          {email
            ? `This purchase is linked to ${email}. Your ticket stays available inside EYA.`
            : "Your ticket stays available inside EYA for event entry."}
        </Text>
      </View>
      <View style={styles.noticeCheck}>
        <Check size={16} color={SUCCESS} strokeWidth={3} />
      </View>
    </View>
  );
}

function OrderReceipt({ detail }: { detail: TicketOrderDetail }) {
  const event = detail.event as any;
  const tier = detail.tier as any;
  const quantity = Math.max(1, Number(detail.order.quantity || 1));
  const unitPrice = Number(tier?.price_mwk || detail.order.unit_price_mwk || 0);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardEyebrow}>ORDER SUMMARY</Text>
          <Text style={styles.cardTitle}>Purchase details</Text>
        </View>
        <View style={styles.paidBadge}>
          <Check size={14} color={SUCCESS} strokeWidth={3} />
          <Text style={styles.paidBadgeText}>Paid</Text>
        </View>
      </View>

      <View style={styles.eventSummary}>
        <Image source={{ uri: eventImageUrl(event) }} style={styles.eventImage} />
        <View style={styles.eventCopy}>
          <Text style={styles.eventTitle} numberOfLines={2}>{String(event?.title || "Ticket event")}</Text>
          <MetaRow Icon={Calendar} text={eventDateLabel(event)} />
          <MetaRow Icon={Clock} text={eventTimeLabel(event)} />
          <MetaRow Icon={MapPin} text={eventLocation(event)} />
        </View>
      </View>

      <View style={styles.divider} />

      <ReceiptRow label="Ticket type" value={String(tier?.name || "Ticket")} />
      <ReceiptRow label="Quantity" value={String(quantity)} />
      <ReceiptRow label="Unit price" value={money(unitPrice)} />
      <ReceiptRow label="Paid on" value={formatPaidDate(detail.order.paid_at)} />

      <View style={styles.amountRow}>
        <View style={styles.amountCopy}>
          <Text style={styles.amountLabel}>Amount paid</Text>
          <Text style={styles.orderReference} selectable>Order {detail.order.id}</Text>
        </View>
        <Text style={styles.amountValue}>{money(detail.order.total_mwk)}</Text>
      </View>
    </View>
  );
}

function MetaRow({ Icon, text }: { Icon: IconComponent; text: string }) {
  return (
    <View style={styles.metaRow}>
      <Icon size={15} color={MUTED} strokeWidth={2.1} />
      <Text style={styles.metaText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text style={styles.receiptValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function TicketPreview({ detail, ticket }: { detail: TicketOrderDetail; ticket: IssuedTicket }) {
  const router = useRouter();
  const event = detail.event as any;
  const tier = detail.tier as any;
  const quantity = Math.max(1, Number(detail.order.quantity || detail.tickets.length || 1));
  const openTicket = () =>
    router.push({ pathname: "/(student)/market/single-ticket", params: { ticketId: ticket.id } } as any);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardEyebrow}>YOUR TICKET</Text>
          <Text style={styles.cardTitle}>Ready for entry</Text>
        </View>
        <View style={styles.readyBadge}>
          <ShieldCheck size={15} color={GREEN} strokeWidth={2.4} />
          <Text style={styles.readyBadgeText}>{String(ticket.status || "active").toUpperCase()}</Text>
        </View>
      </View>

      <Pressable onPress={openTicket} style={({ pressed }) => [styles.ticketCard, pressed && styles.pressed]}>
        <View style={styles.ticketTopRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandText}>EYA</Text>
          </View>
          <View style={styles.ticketHeading}>
            <Text style={styles.ticketEventTitle} numberOfLines={2}>{String(event?.title || "Ticket event")}</Text>
            <Text style={styles.ticketClass}>{String(tier?.name || "Ticket")}</Text>
          </View>
          <ChevronRight size={21} color={ACCENT} strokeWidth={2.5} />
        </View>

        <View style={styles.ticketMetaGrid}>
          <TicketMeta Icon={Calendar} label="Date" value={eventDateLabel(event)} />
          <TicketMeta Icon={Clock} label="Time" value={eventTimeLabel(event)} />
          <TicketMeta Icon={MapPin} label="Venue" value={eventLocation(event)} wide />
        </View>

        <View style={styles.ticketDivider} />

        <View style={styles.qrArea}>
          {ticket.qr_data_url ? (
            <View style={styles.qrFrame}>
              <Image source={{ uri: ticket.qr_data_url }} style={styles.qrImage} />
            </View>
          ) : (
            <View style={styles.qrPreparing}>
              <View style={styles.qrPreparingIcon}>
                <QrCode size={33} color={ACCENT} strokeWidth={2} />
              </View>
              <Text style={styles.qrPreparingTitle}>Entry QR is preparing</Text>
              <Text style={styles.qrPreparingText}>Open the ticket to refresh the secure entry code.</Text>
            </View>
          )}

          <View style={styles.ticketCodeWrap}>
            <Text style={styles.ticketCodeLabel}>TICKET ID</Text>
            <Text style={styles.ticketCode} selectable>{ticket.ticket_code}</Text>
          </View>
          {quantity > 1 ? <Text style={styles.ticketCountNote}>One of {quantity} tickets in this order</Text> : null}
        </View>
      </Pressable>
    </View>
  );
}

function TicketMeta({
  Icon,
  label,
  value,
  wide = false,
}: {
  Icon: IconComponent;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <View style={[styles.ticketMetaItem, wide && styles.ticketMetaWide]}>
      <View style={styles.ticketMetaIcon}>
        <Icon size={16} color={ACCENT} strokeWidth={2.2} />
      </View>
      <View style={styles.ticketMetaCopy}>
        <Text style={styles.ticketMetaLabel}>{label}</Text>
        <Text style={styles.ticketMetaValue} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

function TicketUtilities({ detail, ticket }: { detail: TicketOrderDetail; ticket: IssuedTicket }) {
  const [busy, setBusy] = React.useState<UtilityAction | null>(null);
  const event = detail.event as any;
  const title = String(event?.title || "EYA event").trim();

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

  const downloadTicket = () =>
    run("download", async () => {
      const uri = await createTicketPdf(detail, ticket);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: "Save EYA ticket",
        });
        return;
      }
      await Print.printAsync({ html: ticketPdfHtml(detail, ticket) });
    });

  const sendTicket = () =>
    run("send", async () => {
      const uri = await createTicketPdf(detail, ticket);
      const body = [
        `EYA ticket for ${title}`,
        `${eventDateLabel(event)} • ${eventTimeLabel(event)}`,
        eventLocation(event),
        `Ticket ID: ${ticket.ticket_code}`,
        "",
        "The official live ticket remains available inside EYA.",
      ].join("\n");

      if (await MailComposer.isAvailableAsync()) {
        await MailComposer.composeAsync({
          subject: `EYA Ticket — ${title}`,
          body,
          attachments: [uri],
        });
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          UTI: "com.adobe.pdf",
          dialogTitle: "Send EYA ticket",
        });
        return;
      }

      throw new Error("No email or file-sharing app is available on this device.");
    });

  const addToCalendar = () =>
    run("calendar", async () => {
      const start = eventStart(event);
      if (!start) {
        throw new Error("This event does not have a calendar-ready start time yet.");
      }
      await ExpoCalendar.createEventInCalendarAsync({
        title,
        startDate: start,
        endDate: eventEnd(event, start),
        location: eventLocation(event),
        notes: `EYA ticket ${ticket.ticket_code}. Keep your live ticket available in the EYA app for entry.`,
      });
    });

  const shareEvent = () =>
    run("share", async () => {
      await Share.share({
        title,
        message: [
          title,
          `${eventDateLabel(event)} • ${eventTimeLabel(event)}`,
          eventLocation(event),
          "",
          "Booked with EYA.",
        ].join("\n"),
      });
    });

  return (
    <View style={styles.card}>
      <View style={styles.utilityHeader}>
        <View>
          <Text style={styles.cardEyebrow}>TICKET TOOLS</Text>
          <Text style={styles.cardTitle}>Keep it handy</Text>
        </View>
        <Text style={styles.utilityHint}>PDF, email, calendar & share</Text>
      </View>

      <View style={styles.utilityGrid}>
        <UtilityButton
          Icon={Download}
          title="Download"
          subtitle="Save PDF"
          loading={busy === "download"}
          disabled={Boolean(busy)}
          onPress={downloadTicket}
        />
        <UtilityButton
          Icon={Mail}
          title="Send Ticket"
          subtitle="Email PDF"
          loading={busy === "send"}
          disabled={Boolean(busy)}
          onPress={sendTicket}
        />
        <UtilityButton
          Icon={Calendar}
          title="Add to Calendar"
          subtitle="Save event"
          loading={busy === "calendar"}
          disabled={Boolean(busy)}
          onPress={addToCalendar}
        />
        <UtilityButton
          Icon={Share2}
          title="Share Event"
          subtitle="Invite friends"
          loading={busy === "share"}
          disabled={Boolean(busy)}
          onPress={shareEvent}
        />
      </View>
    </View>
  );
}

function UtilityButton({
  Icon,
  title,
  subtitle,
  loading,
  disabled,
  onPress,
}: {
  Icon: IconComponent;
  title: string;
  subtitle: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.utilityButton, disabled && styles.utilityButtonDisabled, pressed && !disabled && styles.pressed]}
    >
      <View style={styles.utilityIcon}>
        {loading ? <ActivityIndicator size="small" color={ACCENT} /> : <Icon size={23} color={ACCENT} strokeWidth={2.2} />}
      </View>
      <Text style={styles.utilityTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.utilitySubtitle} numberOfLines={1}>{loading ? "Working…" : subtitle}</Text>
    </Pressable>
  );
}

function ImportantNote() {
  return (
    <View style={styles.importantCard}>
      <View style={styles.importantIcon}>
        <ShieldCheck size={24} color={ACCENT} strokeWidth={2.2} />
      </View>
      <View style={styles.importantCopy}>
        <Text style={styles.importantTitle}>Keep your ticket secure</Text>
        <Text style={styles.importantText}>Use the ticket stored in EYA at the entrance. Each ticket can be admitted once.</Text>
      </View>
    </View>
  );
}

function SuccessActions({ ticket }: { ticket: IssuedTicket | null }) {
  const router = useRouter();
  const openTicket = () => {
    if (ticket) {
      router.push({ pathname: "/(student)/market/single-ticket", params: { ticketId: ticket.id } } as any);
      return;
    }
    router.replace("/(student)/market/my-tickets" as any);
  };

  return (
    <View style={styles.actions}>
      <Pressable onPress={openTicket} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
        <Ticket size={20} color="#FFFFFF" strokeWidth={2.4} />
        <Text style={styles.primaryButtonText}>{ticket ? "View Ticket" : "My Tickets"}</Text>
        <ChevronRight size={20} color="#FFFFFF" strokeWidth={2.5} />
      </Pressable>

      <Pressable
        onPress={() => router.replace("/(student)/market/my-tickets" as any)}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
      >
        <ShieldCheck size={19} color={ACCENT} strokeWidth={2.3} />
        <Text style={styles.secondaryButtonText}>All My Tickets</Text>
      </Pressable>

      <Pressable
        onPress={() => router.replace("/(student)/market/tickets" as any)}
        style={({ pressed }) => [styles.homeButton, pressed && styles.pressed]}
      >
        <Home size={18} color={MUTED} strokeWidth={2.3} />
        <Text style={styles.homeButtonText}>Back to Tickets</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  safeArea: { flex: 1, backgroundColor: BG },
  centeredRoot: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 28 },
  loadingIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  stateTitle: { color: TEXT, fontSize: 20, fontWeight: "900", textAlign: "center" },
  stateText: { color: MUTED, fontSize: 13, lineHeight: 20, fontWeight: "600", textAlign: "center", maxWidth: 320, marginTop: 7 },

  header: { minHeight: 70, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: 1, borderBottomColor: "rgba(232,237,247,0.75)", backgroundColor: "rgba(244,242,251,0.96)" },
  headerButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: TEXT, fontSize: 17, fontWeight: "900" },
  headerSubtitle: { color: MUTED, fontSize: 10, fontWeight: "700", marginTop: 2 },
  secureBadge: { minHeight: 34, borderRadius: 17, paddingHorizontal: 10, backgroundColor: "#eaf8f0", flexDirection: "row", alignItems: "center", gap: 5 },
  secureText: { color: GREEN, fontSize: 11, fontWeight: "900" },

  scrollContent: { paddingHorizontal: 15, paddingTop: 14, paddingBottom: 34 },
  pageShell: { width: "100%", maxWidth: 680, alignSelf: "center", gap: 13 },

  progressCard: { minHeight: 66, borderRadius: 22, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  progressPoint: { width: 64, alignItems: "center", justifyContent: "center" },
  progressCircle: { width: 29, height: 29, borderRadius: 15, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  progressLabel: { color: TEXT, fontSize: 9, fontWeight: "900", marginTop: 5 },
  progressLine: { flex: 1, maxWidth: 58, height: 2, backgroundColor: "#b8c4f7", marginHorizontal: 2, marginBottom: 15 },

  successHero: { borderRadius: 28, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, alignItems: "center", paddingHorizontal: 22, paddingVertical: 24, shadowColor: "#102a54", shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 3 },
  successGlow: { width: 106, height: 106, borderRadius: 53, backgroundColor: "rgba(34,164,110,0.10)", alignItems: "center", justifyContent: "center" },
  successCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: SUCCESS, alignItems: "center", justifyContent: "center", shadowColor: SUCCESS, shadowOpacity: 0.22, shadowRadius: 15, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  confirmedPill: { minHeight: 27, borderRadius: 14, backgroundColor: "#eaf8f0", paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16 },
  confirmedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: SUCCESS },
  confirmedPillText: { color: GREEN, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  successTitle: { color: TEXT, fontSize: 28, lineHeight: 33, fontWeight: "900", textAlign: "center", marginTop: 12 },
  successSubtitle: { color: MUTED, fontSize: 13, lineHeight: 20, fontWeight: "600", textAlign: "center", maxWidth: 400, marginTop: 7 },

  noticeCard: { borderRadius: 20, borderWidth: 1, borderColor: "#cfe8d8", backgroundColor: "#f1fbf5", flexDirection: "row", alignItems: "center", gap: 11, padding: 13 },
  noticeIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#dcf4e6", alignItems: "center", justifyContent: "center" },
  noticeCopy: { flex: 1, minWidth: 0 },
  noticeTitle: { color: GREEN, fontSize: 13, fontWeight: "900" },
  noticeText: { color: MUTED, fontSize: 11, lineHeight: 16, fontWeight: "600", marginTop: 3 },
  noticeCheck: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#dcf4e6", alignItems: "center", justifyContent: "center" },

  card: { borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 15, shadowColor: "#102a54", shadowOpacity: 0.045, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 },
  cardEyebrow: { color: ACCENT, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  cardTitle: { color: TEXT, fontSize: 18, fontWeight: "900", marginTop: 3 },
  paidBadge: { minHeight: 30, borderRadius: 15, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#eaf8f0" },
  paidBadgeText: { color: GREEN, fontSize: 11, fontWeight: "900" },
  readyBadge: { minHeight: 30, borderRadius: 15, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#eaf8f0" },
  readyBadgeText: { color: GREEN, fontSize: 9, fontWeight: "900" },

  eventSummary: { flexDirection: "row", gap: 12, alignItems: "center" },
  eventImage: { width: 88, height: 88, borderRadius: 18, backgroundColor: BORDER },
  eventCopy: { flex: 1, minWidth: 0 },
  eventTitle: { color: TEXT, fontSize: 17, lineHeight: 21, fontWeight: "900", marginBottom: 7 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 4 },
  metaText: { flex: 1, color: MUTED, fontSize: 10, fontWeight: "700" },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 14 },

  receiptRow: { minHeight: 31, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  receiptLabel: { color: MUTED, fontSize: 11, fontWeight: "700" },
  receiptValue: { flex: 1, color: TEXT, fontSize: 11, fontWeight: "800", textAlign: "right" },
  amountRow: { marginTop: 11, borderRadius: 17, backgroundColor: "#f6f7fd", borderWidth: 1, borderColor: BORDER, padding: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  amountCopy: { flex: 1, minWidth: 0 },
  amountLabel: { color: MUTED, fontSize: 10, fontWeight: "800" },
  orderReference: { color: MUTED, fontSize: 8, fontWeight: "600", marginTop: 4 },
  amountValue: { color: TEXT, fontSize: 21, fontWeight: "900" },

  ticketCard: { borderRadius: 20, borderWidth: 1, borderColor: "#dfe5f5", backgroundColor: "#f8f9fe", padding: 13, overflow: "hidden" },
  ticketTopRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  brandText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900", fontStyle: "italic" },
  ticketHeading: { flex: 1, minWidth: 0 },
  ticketEventTitle: { color: TEXT, fontSize: 16, lineHeight: 20, fontWeight: "900" },
  ticketClass: { color: MUTED, fontSize: 11, fontWeight: "800", marginTop: 3 },
  ticketMetaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  ticketMetaItem: { width: "48%", flexGrow: 1, minHeight: 52, borderRadius: 14, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 8, padding: 9 },
  ticketMetaWide: { width: "100%" },
  ticketMetaIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  ticketMetaCopy: { flex: 1, minWidth: 0 },
  ticketMetaLabel: { color: MUTED, fontSize: 7, fontWeight: "900", textTransform: "uppercase" },
  ticketMetaValue: { color: TEXT, fontSize: 9, fontWeight: "800", marginTop: 2 },
  ticketDivider: { height: 1, backgroundColor: BORDER, marginVertical: 14 },
  qrArea: { alignItems: "center" },
  qrFrame: { padding: 9, borderRadius: 18, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
  qrImage: { width: 174, height: 174, borderRadius: 10, backgroundColor: CARD },
  qrPreparing: { width: "100%", minHeight: 150, borderRadius: 18, backgroundColor: CARD, borderWidth: 1, borderStyle: "dashed", borderColor: "#cbd4f7", alignItems: "center", justifyContent: "center", padding: 20 },
  qrPreparingIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  qrPreparingTitle: { color: TEXT, fontSize: 14, fontWeight: "900", marginTop: 10 },
  qrPreparingText: { color: MUTED, fontSize: 10, lineHeight: 15, fontWeight: "600", textAlign: "center", marginTop: 4, maxWidth: 260 },
  ticketCodeWrap: { alignItems: "center", marginTop: 11 },
  ticketCodeLabel: { color: MUTED, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  ticketCode: { color: TEXT, fontSize: 13, fontWeight: "900", letterSpacing: 0.6, marginTop: 3 },
  ticketCountNote: { color: MUTED, fontSize: 9, fontWeight: "600", marginTop: 6 },

  utilityHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 13 },
  utilityHint: { color: MUTED, fontSize: 9, fontWeight: "700", textAlign: "right" },
  utilityGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  utilityButton: { width: "48%", flexGrow: 1, minHeight: 104, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fafbff", alignItems: "center", justifyContent: "center", paddingHorizontal: 10, paddingVertical: 12 },
  utilityButtonDisabled: { opacity: 0.58 },
  utilityIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  utilityTitle: { color: TEXT, fontSize: 12, fontWeight: "900", marginTop: 8 },
  utilitySubtitle: { color: MUTED, fontSize: 9, fontWeight: "600", marginTop: 3 },

  importantCard: { borderRadius: 20, borderWidth: 1, borderColor: "#dce4ff", backgroundColor: "#f2f5ff", flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 13 },
  importantIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#e4e9ff", alignItems: "center", justifyContent: "center" },
  importantCopy: { flex: 1, minWidth: 0 },
  importantTitle: { color: TEXT, fontSize: 13, fontWeight: "900" },
  importantText: { color: MUTED, fontSize: 10, lineHeight: 16, fontWeight: "600", marginTop: 3 },

  actions: { gap: 9, paddingTop: 1 },
  primaryButton: { minHeight: 55, borderRadius: 18, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 17, shadowColor: ACCENT, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", flex: 1, textAlign: "center" },
  secondaryButton: { minHeight: 51, borderRadius: 17, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryButtonText: { color: ACCENT, fontSize: 13, fontWeight: "900" },
  homeButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  homeButtonText: { color: MUTED, fontSize: 11, fontWeight: "800" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.992 }] },
});
