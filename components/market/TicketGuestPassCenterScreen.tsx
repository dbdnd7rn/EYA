import React from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import QRCode from "react-native-qrcode-svg";
import {
  ArrowLeft,
  ExternalLink,
  FileDown,
  Globe2,
  Link2,
  RefreshCw,
  Send,
  ShieldCheck,
  Ticket,
  Trash2,
  UserRound,
  WifiOff,
} from "lucide-react-native";
import { listMyTickets, type IssuedTicket } from "@/lib/tickets";
import {
  createTicketGuestPass,
  guestPassWebUrl,
  listMyTicketGuestPasses,
  revokeTicketGuestPass,
  type CreatedTicketGuestPass,
  type TicketGuestPassMode,
  type TicketGuestPassSummary,
} from "@/lib/ticketGuestPasses";
import { useAuth } from "@/providers/AuthProvider";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as BG,
  EYA_BORDER as BORDER,
  EYA_CARD as CARD,
  EYA_MUTED as MUTED,
  EYA_SUCCESS as SUCCESS,
  EYA_TEXT as TEXT,
  eventDateLabel,
  eventLocation,
  eventTimeLabel,
} from "@/components/market/ticketingUi";

type CreatedState = {
  result: CreatedTicketGuestPass;
  shareUrl: string | null;
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Not available";
}

function offlinePdfHtml(ticket: IssuedTicket, pass: CreatedTicketGuestPass, qrDataUrl: string) {
  const event = ticket.event as any;
  const tier = ticket.tier as any;
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
  *{box-sizing:border-box}body{margin:0;padding:34px;background:#eef2fb;color:#102a54;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.sheet{max-width:720px;margin:0 auto;background:#fff;border:1px solid #dfe5f4;border-radius:28px;overflow:hidden}.head{background:#102a54;color:#fff;padding:24px 28px}.brand{font-size:30px;font-weight:900;font-style:italic}.eyebrow{margin-top:18px;font-size:10px;font-weight:900;letter-spacing:1.3px;color:#bfc9ff}.title{font-size:30px;line-height:1.15;font-weight:900;margin:7px 0}.meta{color:rgba(255,255,255,.8);font-size:13px;font-weight:700}.body{padding:28px;text-align:center}.bearer{display:inline-block;background:#fff4dd;color:#8a5a00;padding:8px 12px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:.7px}.qr{width:280px;max-width:80%;margin:20px auto 12px}.qr img{width:100%;height:auto}.code{font-size:22px;font-weight:900;letter-spacing:1px;color:#33467f;background:#eef1ff;padding:14px;border-radius:16px}.rows{margin-top:20px;text-align:left;border:1px solid #e3e8f7;border-radius:18px;padding:16px}.row{padding:8px 0;border-bottom:1px solid #edf0f7}.row:last-child{border-bottom:0}.label{font-size:9px;text-transform:uppercase;color:#7c879f;font-weight:900}.value{font-size:13px;font-weight:800;margin-top:3px}.warn{margin-top:18px;padding:15px;border-radius:16px;background:#fff4dd;color:#7c5200;font-size:11px;line-height:1.55;font-weight:800}.foot{margin-top:18px;color:#7c879f;font-size:10px;line-height:1.5}
  </style></head><body><div class="sheet"><div class="head"><div class="brand">EYA</div><div class="eyebrow">OFFLINE GUEST PASS</div><div class="title">${escapeHtml(event?.title || "EYA Event")}</div><div class="meta">${escapeHtml(eventDateLabel(event))} · ${escapeHtml(eventTimeLabel(event))} · ${escapeHtml(eventLocation(event))}</div></div><div class="body"><div class="bearer">ONE-TIME BEARER TICKET</div><div class="qr"><img src="${qrDataUrl}"/></div><div class="code">${escapeHtml(pass.offline_manual_code || "")}</div><div class="rows"><div class="row"><div class="label">Guest</div><div class="value">${escapeHtml(pass.guest_name || "Guest holder")}</div></div><div class="row"><div class="label">Ticket type</div><div class="value">${escapeHtml(tier?.name || "Ticket")}</div></div><div class="row"><div class="label">Valid until</div><div class="value">${escapeHtml(formatDateTime(pass.expires_at))}</div></div><div class="row"><div class="label">Ticket reference</div><div class="value">${escapeHtml(ticket.ticket_code)}</div></div></div><div class="warn">This is a bearer pass. Whoever presents a valid copy first can use the ticket. After the first successful scan, every other copy is rejected. The ticket holder can revoke and reissue this pass before it is used.</div><div class="foot">The permanent EYA ticket reference is not an admission credential. Entry is authorized by the QR or OFF- backup code on this pass.</div></div></div></body></html>`;
}

export default function TicketGuestPassCenterScreen() {
  const router = useRouter();
  const { ticketId } = useLocalSearchParams<{ ticketId?: string }>();
  const { session } = useAuth();
  const [tickets, setTickets] = React.useState<IssuedTicket[]>([]);
  const [passes, setPasses] = React.useState<TicketGuestPassSummary[]>([]);
  const [selectedTicketId, setSelectedTicketId] = React.useState(String(ticketId || ""));
  const [guestName, setGuestName] = React.useState("");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [working, setWorking] = React.useState<TicketGuestPassMode | "revoke" | "share" | null>(null);
  const [created, setCreated] = React.useState<CreatedState | null>(null);
  const offlineQrRef = React.useRef<any>(null);

  const load = React.useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const [ticketRows, passRows] = await Promise.all([
        listMyTickets(session.access_token),
        listMyTicketGuestPasses(),
      ]);
      const activeTickets = ticketRows.filter((ticket) => String(ticket.status || "").toLowerCase() === "active" && !ticket.checked_in_at);
      setTickets(activeTickets);
      setPasses(passRows);
      setSelectedTicketId((current) => current || activeTickets[0]?.id || "");
    } catch (error) {
      Alert.alert("Guest passes", error instanceof Error ? error.message : "Could not load guest passes.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  React.useEffect(() => { void load(); }, [load]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) || null;
  const activePass = passes.find((pass) => pass.issued_ticket_id === selectedTicketId && pass.status === "active") || null;

  const createPass = async (mode: TicketGuestPassMode) => {
    if (!selectedTicketId) return Alert.alert("Choose a ticket", "Select the ticket you want to share.");
    const proceed = async () => {
      setWorking(mode);
      try {
        const result = await createTicketGuestPass({
          ticketId: selectedTicketId,
          mode,
          guestName,
          guestEmail,
        });
        const shareUrl = result.share_token ? guestPassWebUrl(result.share_token) : null;
        setCreated({ result, shareUrl });
        await load();
        if (mode === "live_link" && shareUrl) {
          await Share.share({
            title: "EYA guest ticket",
            message: `Your EYA guest pass is ready. Open this secure live ticket in your browser:\n\n${shareUrl}\n\nNo EYA account is required.`,
          });
        }
      } catch (error) {
        Alert.alert("Guest pass", error instanceof Error ? error.message : "Could not create guest pass.");
      } finally {
        setWorking(null);
      }
    };

    if (activePass) {
      Alert.alert(
        "Replace current guest pass?",
        "The existing guest pass will stop working immediately and a new one will be created.",
        [{ text: "Cancel", style: "cancel" }, { text: "Replace", style: "destructive", onPress: () => void proceed() }],
      );
      return;
    }
    await proceed();
  };

  const revoke = async (pass: TicketGuestPassSummary) => {
    Alert.alert(
      "Revoke guest pass?",
      "This guest pass will stop working immediately. Your personal EYA live QR can be used again afterward.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Revoke", style: "destructive", onPress: async () => {
          setWorking("revoke");
          try {
            await revokeTicketGuestPass(pass.id);
            if (created?.result.guest_pass_id === pass.id) setCreated(null);
            await load();
          } catch (error) {
            Alert.alert("Guest pass", error instanceof Error ? error.message : "Could not revoke guest pass.");
          } finally {
            setWorking(null);
          }
        } },
      ],
    );
  };

  const shareLinkAgain = async () => {
    if (!created?.shareUrl) return;
    await Share.share({ title: "EYA guest ticket", message: `Open your secure EYA guest pass:\n\n${created.shareUrl}` });
  };

  const shareOfflinePdf = async () => {
    if (!created?.result.offline_token || !selectedTicket) return;
    setWorking("share");
    try {
      const qrData = await new Promise<string>((resolve, reject) => {
        const ref = offlineQrRef.current;
        if (!ref?.toDataURL) return reject(new Error("Offline QR is not ready yet."));
        ref.toDataURL((data: string) => resolve(`data:image/png;base64,${data}`));
      });
      const { uri } = await Print.printToFileAsync({ html: offlinePdfHtml(selectedTicket, created.result, qrData) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Share offline EYA guest pass" });
      } else {
        await Print.printAsync({ html: offlinePdfHtml(selectedTicket, created.result, qrData) });
      }
    } catch (error) {
      Alert.alert("Offline guest pass", error instanceof Error ? error.message : "Could not create guest PDF.");
    } finally {
      setWorking(null);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={() => router.back()}><ArrowLeft size={22} color={TEXT} /></Pressable>
          <View style={styles.headerCopy}><Text style={styles.eyebrow}>TICKET SHARING</Text><Text style={styles.title}>Guest Pass</Text></View>
          <Pressable style={styles.refresh} onPress={() => void load()}><RefreshCw size={19} color={ACCENT} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.infoCard}><ShieldCheck size={22} color={SUCCESS} /><View style={styles.flex}><Text style={styles.infoTitle}>One ticket, one active presentation mode</Text><Text style={styles.infoText}>Creating a guest pass turns off your personal live QR. Revoke the guest pass to return the ticket to your EYA wallet.</Text></View></View>

          {loading ? <View style={styles.loading}><ActivityIndicator color={ACCENT} /><Text style={styles.muted}>Loading tickets…</Text></View> : null}

          {!loading ? (
            <>
              <Text style={styles.sectionTitle}>1. Choose ticket</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ticketRail}>
                {tickets.map((ticket) => {
                  const event = ticket.event as any;
                  const selected = ticket.id === selectedTicketId;
                  return <Pressable key={ticket.id} style={[styles.ticketChoice, selected && styles.ticketChoiceSelected]} onPress={() => { setSelectedTicketId(ticket.id); setCreated(null); }}><Ticket size={18} color={selected ? "#ffffff" : ACCENT} /><Text style={[styles.ticketChoiceTitle, selected && styles.ticketChoiceTitleSelected]} numberOfLines={2}>{event?.title || "EYA Ticket"}</Text><Text style={[styles.ticketChoiceRef, selected && styles.ticketChoiceTitleSelected]}>{ticket.ticket_code}</Text></Pressable>;
                })}
              </ScrollView>

              <Text style={styles.sectionTitle}>2. Guest details <Text style={styles.optional}>(optional)</Text></Text>
              <View style={styles.formCard}>
                <View style={styles.inputWrap}><UserRound size={17} color={MUTED} /><TextInput value={guestName} onChangeText={setGuestName} placeholder="Guest name" placeholderTextColor={MUTED} style={styles.input} /></View>
                <View style={styles.inputWrap}><ExternalLink size={17} color={MUTED} /><TextInput value={guestEmail} onChangeText={setGuestEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Guest email" placeholderTextColor={MUTED} style={styles.input} /></View>
              </View>

              {activePass ? <View style={styles.activeBanner}><ShieldCheck size={18} color="#8a5a00" /><View style={styles.flex}><Text style={styles.activeTitle}>Guest pass already active</Text><Text style={styles.activeText}>{activePass.mode === "live_link" ? "Secure browser pass" : "Offline bearer pass"} · {activePass.guest_name || "Guest"}</Text></View><Pressable onPress={() => void revoke(activePass)}><Trash2 size={19} color="#a23b31" /></Pressable></View> : null}

              <Text style={styles.sectionTitle}>3. Choose sharing mode</Text>
              <View style={styles.modeGrid}>
                <Pressable style={styles.modeCard} onPress={() => void createPass("live_link")} disabled={Boolean(working)}>
                  <View style={[styles.modeIcon, styles.liveIcon]}><Globe2 size={25} color={SUCCESS} /></View>
                  <Text style={styles.modeTitle}>Secure guest link</Text>
                  <Text style={styles.modeText}>No EYA account needed. Opens in a browser and shows a rotating live QR. Best choice for WhatsApp or email.</Text>
                  <View style={styles.modeAction}>{working === "live_link" ? <ActivityIndicator color="#ffffff" /> : <><Link2 size={17} color="#ffffff" /><Text style={styles.modeActionText}>{activePass ? "Replace & create link" : "Create live link"}</Text></>}</View>
                </Pressable>

                <Pressable style={styles.modeCard} onPress={() => void createPass("offline")} disabled={Boolean(working)}>
                  <View style={[styles.modeIcon, styles.offlineIcon]}><WifiOff size={25} color="#8a5a00" /></View>
                  <Text style={styles.modeTitle}>Offline guest pass</Text>
                  <Text style={styles.modeText}>For screenshot, PDF or print. It is a one-time bearer ticket: whoever successfully scans it first uses the ticket.</Text>
                  <View style={[styles.modeAction, styles.offlineAction]}>{working === "offline" ? <ActivityIndicator color="#ffffff" /> : <><FileDown size={17} color="#ffffff" /><Text style={styles.modeActionText}>{activePass ? "Replace & create pass" : "Create offline pass"}</Text></>}</View>
                </Pressable>
              </View>

              {created?.result.mode === "live_link" && created.shareUrl ? (
                <View style={styles.createdCard}><View style={styles.createdHead}><ShieldCheck size={22} color={SUCCESS} /><View style={styles.flex}><Text style={styles.createdTitle}>Live guest link ready</Text><Text style={styles.createdText}>The guest can open this in any modern browser. The QR rotates automatically.</Text></View></View><Text style={styles.linkPreview} numberOfLines={2}>{created.shareUrl}</Text><Pressable style={styles.primaryButton} onPress={() => void shareLinkAgain()}><Send size={17} color="#ffffff" /><Text style={styles.primaryText}>Share link again</Text></Pressable></View>
              ) : null}

              {created?.result.mode === "offline" && created.result.offline_token ? (
                <View style={styles.createdCard}><View style={styles.createdHead}><WifiOff size={22} color="#8a5a00" /><View style={styles.flex}><Text style={styles.createdTitle}>Offline bearer pass ready</Text><Text style={styles.createdText}>This QR will not rotate. Any copy can be presented, but only the first successful scan is admitted.</Text></View></View><View style={styles.qrWrap}><QRCode value={created.result.offline_token} size={215} backgroundColor="#ffffff" color="#102a54" getRef={(ref) => { offlineQrRef.current = ref; }} /></View><Text style={styles.offlineCode}>{created.result.offline_manual_code}</Text><Pressable style={[styles.primaryButton, styles.offlineButton]} onPress={() => void shareOfflinePdf()} disabled={working === "share"}>{working === "share" ? <ActivityIndicator color="#ffffff" /> : <><FileDown size={17} color="#ffffff" /><Text style={styles.primaryText}>Share / save PDF</Text></>}</Pressable></View>
              ) : null}

              <Text style={styles.sectionTitle}>Guest pass history</Text>
              {passes.length ? passes.map((pass) => <View key={pass.id} style={styles.historyRow}><View style={styles.historyIcon}>{pass.mode === "live_link" ? <Globe2 size={18} color={ACCENT} /> : <WifiOff size={18} color="#8a5a00" />}</View><View style={styles.flex}><Text style={styles.historyTitle}>{pass.event_title}</Text><Text style={styles.historyText}>{pass.mode === "live_link" ? "Secure browser pass" : "Offline bearer pass"} · {pass.guest_name || "Guest"}</Text><Text style={styles.historyText}>{String(pass.status).toUpperCase()} · expires {formatDateTime(pass.expires_at)}</Text></View>{pass.status === "active" ? <Pressable style={styles.revokeButton} onPress={() => void revoke(pass)}><Trash2 size={17} color="#a23b31" /></Pressable> : null}</View>) : <Text style={styles.emptyText}>No guest passes yet.</Text>}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:BG},safe:{flex:1},header:{minHeight:76,paddingHorizontal:16,flexDirection:"row",alignItems:"center",gap:12},back:{width:44,height:44,borderRadius:16,borderWidth:1,borderColor:BORDER,backgroundColor:CARD,alignItems:"center",justifyContent:"center"},refresh:{width:44,height:44,borderRadius:16,borderWidth:1,borderColor:BORDER,backgroundColor:CARD,alignItems:"center",justifyContent:"center"},headerCopy:{flex:1},eyebrow:{color:ACCENT,fontSize:10,fontWeight:"900",letterSpacing:1.1},title:{color:TEXT,fontSize:24,fontWeight:"900",marginTop:2},content:{paddingHorizontal:16,paddingBottom:42,gap:14},flex:{flex:1},infoCard:{flexDirection:"row",gap:10,padding:14,borderRadius:20,borderWidth:1,borderColor:"#cdebdc",backgroundColor:"#effbf5"},infoTitle:{color:"#087443",fontSize:13,fontWeight:"900"},infoText:{color:"#507063",fontSize:11,lineHeight:17,fontWeight:"700",marginTop:3},loading:{minHeight:120,alignItems:"center",justifyContent:"center",gap:10},muted:{color:MUTED,fontWeight:"700"},sectionTitle:{color:TEXT,fontSize:14,fontWeight:"900",marginTop:4},optional:{color:MUTED,fontWeight:"700",fontSize:11},ticketRail:{gap:10,paddingRight:12},ticketChoice:{width:170,minHeight:112,borderRadius:20,borderWidth:1,borderColor:BORDER,backgroundColor:CARD,padding:13,gap:6},ticketChoiceSelected:{backgroundColor:ACCENT,borderColor:ACCENT},ticketChoiceTitle:{color:TEXT,fontSize:13,fontWeight:"900"},ticketChoiceTitleSelected:{color:"#ffffff"},ticketChoiceRef:{color:MUTED,fontSize:9,fontWeight:"800"},formCard:{borderRadius:20,borderWidth:1,borderColor:BORDER,backgroundColor:CARD,padding:12,gap:10},inputWrap:{minHeight:50,borderRadius:15,borderWidth:1,borderColor:BORDER,backgroundColor:"#fbfcff",paddingHorizontal:12,flexDirection:"row",alignItems:"center",gap:9},input:{flex:1,color:TEXT,fontSize:13,fontWeight:"700"},activeBanner:{flexDirection:"row",alignItems:"center",gap:10,borderRadius:18,backgroundColor:"#fff8e9",borderWidth:1,borderColor:"#f1dfb2",padding:13},activeTitle:{color:"#7c5200",fontSize:12,fontWeight:"900"},activeText:{color:"#8a6b2b",fontSize:10,fontWeight:"700",marginTop:2},modeGrid:{gap:12},modeCard:{borderRadius:23,borderWidth:1,borderColor:BORDER,backgroundColor:CARD,padding:16},modeIcon:{width:48,height:48,borderRadius:17,alignItems:"center",justifyContent:"center"},liveIcon:{backgroundColor:"#e9f9f1"},offlineIcon:{backgroundColor:"#fff4dd"},modeTitle:{color:TEXT,fontSize:17,fontWeight:"900",marginTop:12},modeText:{color:MUTED,fontSize:11,lineHeight:17,fontWeight:"700",marginTop:5},modeAction:{minHeight:46,borderRadius:15,backgroundColor:ACCENT,marginTop:13,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8},offlineAction:{backgroundColor:"#8a5a00"},modeActionText:{color:"#ffffff",fontSize:12,fontWeight:"900"},createdCard:{borderRadius:24,borderWidth:1,borderColor:"#dbe2f6",backgroundColor:CARD,padding:16},createdHead:{flexDirection:"row",gap:10,alignItems:"flex-start"},createdTitle:{color:TEXT,fontSize:15,fontWeight:"900"},createdText:{color:MUTED,fontSize:11,lineHeight:17,fontWeight:"700",marginTop:3},linkPreview:{marginTop:12,borderRadius:14,backgroundColor:"#f3f5ff",padding:11,color:"#40518f",fontSize:10,fontWeight:"800"},primaryButton:{minHeight:48,borderRadius:16,backgroundColor:ACCENT,marginTop:12,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8},offlineButton:{backgroundColor:"#8a5a00"},primaryText:{color:"#ffffff",fontSize:12,fontWeight:"900"},qrWrap:{alignSelf:"center",padding:12,borderRadius:18,backgroundColor:"#ffffff",marginTop:16,borderWidth:1,borderColor:BORDER},offlineCode:{alignSelf:"center",marginTop:10,color:"#33467f",fontSize:19,fontWeight:"900",letterSpacing:1},historyRow:{flexDirection:"row",alignItems:"center",gap:10,borderRadius:18,borderWidth:1,borderColor:BORDER,backgroundColor:CARD,padding:12},historyIcon:{width:42,height:42,borderRadius:14,backgroundColor:"#f2f4ff",alignItems:"center",justifyContent:"center"},historyTitle:{color:TEXT,fontSize:12,fontWeight:"900"},historyText:{color:MUTED,fontSize:9,lineHeight:14,fontWeight:"700",marginTop:1},revokeButton:{width:40,height:40,borderRadius:14,backgroundColor:"#fff0ef",alignItems:"center",justifyContent:"center"},emptyText:{color:MUTED,fontSize:12,fontWeight:"700",textAlign:"center",paddingVertical:24}
});
