import React from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, Send, ShieldCheck, UserPlus, XCircle } from "lucide-react-native";
import {
  extendAdminTicketOrganizerAccess,
  listAdminTicketOrganizerAccess,
  revokeAdminTicketOrganizerAccess,
  type AdminTicketOrganizerAccess,
} from "@/lib/ticketOrganizerAccess";
import {
  createAdminOrganizerInvite,
  listAdminOrganizerInvites,
  organizerInviteDeepLink,
  revokeAdminOrganizerInvite,
  type AdminOrganizerInvite,
  type CreatedOrganizerInvite,
} from "@/lib/ticketOrganizerInvites";

const BG = "#f5f7fc";
const CARD = "#ffffff";
const TEXT = "#102a54";
const MUTED = "#6e7892";
const ACCENT = "#5e73dd";
const BORDER = "#e4e8f2";

function parseMalawiLocalDateTime(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:00+02:00`;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function localLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function accessTone(status: AdminTicketOrganizerAccess["status"]) {
  if (status === "active") return { bg: "#e4f7ec", text: "#087443", label: "Active" };
  if (status === "expired") return { bg: "#fff4d9", text: "#8a5a00", label: "Expired" };
  return { bg: "#fff0f0", text: "#a32929", label: "Revoked" };
}

function inviteTone(status: AdminOrganizerInvite["status"]) {
  if (status === "claimed") return { bg: "#e4f7ec", text: "#087443", label: "Claimed" };
  if (status === "pending") return { bg: "#eef1ff", text: ACCENT, label: "Waiting" };
  if (status === "expired") return { bg: "#fff4d9", text: "#8a5a00", label: "Expired" };
  return { bg: "#fff0f0", text: "#a32929", label: "Revoked" };
}

export default function AdminOrganizerAccessScreen() {
  const router = useRouter();
  const [accessRows, setAccessRows] = React.useState<AdminTicketOrganizerAccess[]>([]);
  const [inviteRows, setInviteRows] = React.useState<AdminOrganizerInvite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");
  const [organizationName, setOrganizationName] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [inviteHours, setInviteHours] = React.useState("72");
  const [note, setNote] = React.useState("");
  const [createdInvite, setCreatedInvite] = React.useState<CreatedOrganizerInvite | null>(null);
  const [renewExpiry, setRenewExpiry] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      setError(null);
      const [access, invites] = await Promise.all([listAdminTicketOrganizerAccess(), listAdminOrganizerInvites()]);
      setAccessRows(access);
      setInviteRows(invites);
    } catch (e: any) {
      setError(e?.message || "Could not load organizer access.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const createInvite = async () => {
    const expiry = parseMalawiLocalDateTime(expiresAt);
    const hours = Math.floor(Number(inviteHours));
    if (!email.trim() || !organizationName.trim()) {
      Alert.alert("Details required", "Enter the organizer email and organization/event-company name.");
      return;
    }
    if (!expiry) {
      Alert.alert("Access expiry required", "Use YYYY-MM-DD HH:mm, for example 2026-10-15 23:59.");
      return;
    }
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
      Alert.alert("Invite window", "Invitation validity must be between 1 and 168 hours.");
      return;
    }
    try {
      setBusy("invite");
      const result = await createAdminOrganizerInvite({
        email,
        organizationName,
        accessExpiresAt: expiry,
        adminNote: note,
        inviteHours: hours,
      });
      setCreatedInvite(result);
      setEmail("");
      setOrganizationName("");
      setExpiresAt("");
      setNote("");
      await load();
    } catch (e: any) {
      Alert.alert("Could not create invitation", e?.message || "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const shareInvite = async () => {
    if (!createdInvite) return;
    const link = organizerInviteDeepLink(createdInvite.invite_token);
    await Share.share({
      message: `You have been invited to a temporary EYA Organizer Workspace for ${createdInvite.organization_name}. Open EYA with this invitation: ${link}\n\nIf the link does not open yet, open EYA Organizer Invite and enter this one-time code:\n${createdInvite.invite_token}\n\nThis invitation expires ${localLabel(createdInvite.invite_expires_at)}. Organizer access ends ${localLabel(createdInvite.access_expires_at)}.`,
    });
  };

  const revokeInvite = (row: AdminOrganizerInvite) => {
    Alert.alert("Revoke unused invitation?", `${row.email} will no longer be able to create the temporary Organizer login with this invitation.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke", style: "destructive", onPress: async () => {
        try {
          setBusy(`invite-${row.id}`);
          await revokeAdminOrganizerInvite(row.id, "Revoked by EYA Admin");
          await load();
        } catch (e: any) {
          Alert.alert("Could not revoke invitation", e?.message || "Try again.");
        } finally {
          setBusy(null);
        }
      } },
    ]);
  };

  const renew = async (row: AdminTicketOrganizerAccess) => {
    const expiry = parseMalawiLocalDateTime(renewExpiry[row.id] || "");
    if (!expiry) {
      Alert.alert("New expiry required", "Enter the new expiry using YYYY-MM-DD HH:mm.");
      return;
    }
    try {
      setBusy(row.id);
      await extendAdminTicketOrganizerAccess({ grantId: row.id, expiresAt: expiry });
      setRenewExpiry((current) => ({ ...current, [row.id]: "" }));
      await load();
    } catch (e: any) {
      Alert.alert("Could not renew access", e?.message || "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const revokeAccess = (row: AdminTicketOrganizerAccess) => {
    Alert.alert("Revoke organizer access?", `${row.organization_name} will immediately lose Event Studio access. Pending events cannot be approved until access is restored.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke", style: "destructive", onPress: async () => {
        try {
          setBusy(row.id);
          await revokeAdminTicketOrganizerAccess({ grantId: row.id, note: "Revoked by EYA Admin" });
          await load();
        } catch (e: any) {
          Alert.alert("Could not revoke access", e?.message || "Try again.");
        } finally {
          setBusy(null);
        }
      } },
    ]);
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={ACCENT} />}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}><ArrowLeft size={21} color={TEXT} /></Pressable>
          <View style={{ flex: 1 }}><Text style={styles.kicker}>EYA Admin</Text><Text style={styles.title}>Organizer access</Text></View>
        </View>

        <View style={styles.securityNote}>
          <ShieldCheck size={20} color="#087443" />
          <Text style={styles.securityText}>Organizer accounts are invite-only and temporary. Normal EYA users do not receive organizer controls or self-application.</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.formHead}><UserPlus size={19} color={ACCENT} /><Text style={styles.formTitle}>Create temporary organizer invite</Text></View>
          <Field label="Organizer email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="events@promoter.com" />
          <Field label="Organization / promoter" value={organizationName} onChangeText={setOrganizationName} placeholder="XYZ Events" />
          <Field label="Organizer access expires" value={expiresAt} onChangeText={setExpiresAt} autoCapitalize="none" placeholder="2026-10-15 23:59" />
          <Field label="Invite valid for hours" value={inviteHours} onChangeText={setInviteHours} keyboardType="numeric" placeholder="72" />
          <Field label="Admin note (optional)" value={note} onChangeText={setNote} placeholder="Event / promoter context" multiline />
          <Pressable style={[styles.primaryBtn, busy === "invite" && styles.disabled]} disabled={busy === "invite"} onPress={() => void createInvite()}>
            {busy === "invite" ? <ActivityIndicator color="#fff" /> : <CheckCircle2 size={18} color="#fff" />}
            <Text style={styles.primaryText}>Create one-time invitation</Text>
          </Pressable>
        </View>

        {createdInvite ? (
          <View style={styles.createdCard}>
            <Text style={styles.createdKicker}>INVITATION READY — SECRET SHOWN ONCE</Text>
            <Text style={styles.createdTitle}>{createdInvite.organization_name}</Text>
            <Text style={styles.createdText}>{createdInvite.email}</Text>
            <Text style={styles.secretCode} selectable>{createdInvite.invite_token}</Text>
            <Text style={styles.createdText}>Invite expires {localLabel(createdInvite.invite_expires_at)}. Workspace access ends {localLabel(createdInvite.access_expires_at)}.</Text>
            <Pressable style={styles.shareBtn} onPress={() => void shareInvite()}><Send size={17} color="#fff" /><Text style={styles.primaryText}>Share invitation</Text></Pressable>
            <Pressable style={styles.dismissBtn} onPress={() => setCreatedInvite(null)}><Text style={styles.dismissText}>I have shared it</Text></Pressable>
          </View>
        ) : null}

        <View style={styles.sectionHeadRow}><Text style={styles.sectionTitle}>Invitation history</Text><Text style={styles.count}>{inviteRows.length}</Text></View>
        {loading ? <State><ActivityIndicator color={ACCENT} /><Text style={styles.stateText}>Loading organizer access...</Text></State> : null}
        {!loading && error ? <State><Text style={styles.errorText}>{error}</Text><Pressable style={styles.retryBtn} onPress={() => void load()}><Text style={styles.retryText}>Try again</Text></Pressable></State> : null}
        {!loading && !error && !inviteRows.length ? <State><Clock3 size={30} color={ACCENT} /><Text style={styles.emptyTitle}>No organizer invitations yet</Text><Text style={styles.stateText}>Normal users remain customer-only until Admin creates an invitation.</Text></State> : null}

        {!loading && !error ? inviteRows.map((row) => {
          const badge = inviteTone(row.status);
          return (
            <View key={row.id} style={styles.accessCard}>
              <View style={styles.accessHead}>
                <View style={{ flex: 1 }}><Text style={styles.orgName}>{row.organization_name}</Text><Text style={styles.person}>{row.email}</Text></View>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}><Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text></View>
              </View>
              <View style={styles.timeBox}><CalendarClock size={16} color={MUTED} /><View style={{ flex: 1 }}><Text style={styles.timeLabel}>INVITE / ACCESS</Text><Text style={styles.timeValue}>Invite: {localLabel(row.invite_expires_at)}{"\n"}Access: {localLabel(row.access_expires_at)}</Text></View></View>
              {row.admin_note ? <Text style={styles.noteText}>Admin note: {row.admin_note}</Text> : null}
              {row.status === "pending" ? <Pressable style={styles.revokeBtn} disabled={busy === `invite-${row.id}`} onPress={() => revokeInvite(row)}><XCircle size={17} color="#a32929" /><Text style={styles.revokeBtnText}>Revoke unused invitation</Text></Pressable> : null}
            </View>
          );
        }) : null}

        <View style={styles.sectionHeadRow}><Text style={styles.sectionTitle}>Claimed organizer access</Text><Text style={styles.count}>{accessRows.length}</Text></View>
        {!loading && !error && !accessRows.length ? <State><Clock3 size={30} color={ACCENT} /><Text style={styles.emptyTitle}>No claimed organizers yet</Text><Text style={styles.stateText}>Claimed temporary organizer accounts will appear here.</Text></State> : null}

        {!loading && !error ? accessRows.map((row) => {
          const badge = accessTone(row.status);
          const canRenew = row.status !== "revoked";
          return (
            <View key={row.id} style={styles.accessCard}>
              <View style={styles.accessHead}>
                <View style={{ flex: 1 }}><Text style={styles.orgName}>{row.organization_name}</Text><Text style={styles.person}>{row.user?.full_name || row.user?.email || "Temporary organizer"}</Text>{row.user?.email ? <Text style={styles.small}>{row.user.email}</Text> : null}</View>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}><Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text></View>
              </View>
              <View style={styles.timeBox}><CalendarClock size={16} color={MUTED} /><View style={{ flex: 1 }}><Text style={styles.timeLabel}>WORKSPACE WINDOW</Text><Text style={styles.timeValue}>{localLabel(row.starts_at)} → {localLabel(row.expires_at)}</Text></View></View>
              {row.grant_note ? <Text style={styles.noteText}>Admin note: {row.grant_note}</Text> : null}
              {row.revoke_note ? <Text style={styles.revokeText}>Revoked: {row.revoke_note}</Text> : null}
              {canRenew ? <View style={styles.renewRow}><TextInput value={renewExpiry[row.id] || ""} onChangeText={(value) => setRenewExpiry((current) => ({ ...current, [row.id]: value }))} placeholder="New expiry: YYYY-MM-DD HH:mm" placeholderTextColor="#9aa3b8" autoCapitalize="none" style={styles.renewInput} /><Pressable style={styles.renewBtn} disabled={busy === row.id} onPress={() => void renew(row)}>{busy === row.id ? <ActivityIndicator size="small" color={ACCENT} /> : <Text style={styles.renewText}>Renew</Text>}</Pressable></View> : null}
              {row.status === "active" ? <Pressable style={styles.revokeBtn} disabled={busy === row.id} onPress={() => revokeAccess(row)}><XCircle size={17} color="#a32929" /><Text style={styles.revokeBtnText}>Revoke immediately</Text></Pressable> : null}
            </View>
          );
        }) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, multiline, ...input } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...input} multiline={multiline} placeholderTextColor="#9aa3b8" style={[styles.input, multiline && styles.multiline]} /></View>;
}
function State({ children }: { children: React.ReactNode }) { return <View style={styles.state}>{children}</View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, content: { padding: 18, paddingBottom: 90, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 }, iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  kicker: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" }, title: { color: TEXT, fontSize: 26, fontWeight: "900", marginTop: 2 },
  securityNote: { borderRadius: 18, backgroundColor: "#e8f7ee", padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, securityText: { flex: 1, color: "#276346", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  formCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 24, padding: 16, gap: 13 }, formHead: { flexDirection: "row", alignItems: "center", gap: 8 }, formTitle: { color: TEXT, fontSize: 18, fontWeight: "900" },
  field: { gap: 6 }, label: { color: MUTED, fontSize: 10, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" }, input: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", paddingHorizontal: 14, color: TEXT, fontSize: 14, fontWeight: "700" }, multiline: { minHeight: 82, paddingTop: 13, textAlignVertical: "top" },
  primaryBtn: { minHeight: 54, borderRadius: 27, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 }, primaryText: { color: "#fff", fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.55 },
  createdCard: { backgroundColor: "#eef1ff", borderRadius: 24, borderWidth: 1, borderColor: "#d9def8", padding: 16, gap: 9 }, createdKicker: { color: ACCENT, fontSize: 9, fontWeight: "900", letterSpacing: 0.9 }, createdTitle: { color: TEXT, fontSize: 20, fontWeight: "900" }, createdText: { color: MUTED, fontSize: 12, lineHeight: 18, fontWeight: "700" }, secretCode: { color: "#33467f", backgroundColor: "#fff", borderRadius: 14, padding: 12, fontSize: 11, lineHeight: 17, fontWeight: "900" }, shareBtn: { minHeight: 48, borderRadius: 24, backgroundColor: "#102a54", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, dismissBtn: { minHeight: 42, alignItems: "center", justifyContent: "center" }, dismissText: { color: ACCENT, fontWeight: "900" },
  sectionHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }, sectionTitle: { color: TEXT, fontSize: 19, fontWeight: "900" }, count: { minWidth: 34, height: 34, borderRadius: 17, backgroundColor: "#eef1ff", color: ACCENT, textAlign: "center", textAlignVertical: "center", fontWeight: "900" },
  state: { minHeight: 150, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 22, alignItems: "center", justifyContent: "center", gap: 10, padding: 22 }, stateText: { color: MUTED, fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center" }, emptyTitle: { color: TEXT, fontSize: 18, fontWeight: "900" }, errorText: { color: "#a32929", fontWeight: "800", textAlign: "center" }, retryBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: "#eef1ff" }, retryText: { color: ACCENT, fontWeight: "900" },
  accessCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 22, padding: 15, gap: 11 }, accessHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, orgName: { color: TEXT, fontSize: 17, fontWeight: "900" }, person: { color: "#4f5d7a", fontSize: 12, fontWeight: "800", marginTop: 3 }, small: { color: MUTED, fontSize: 11, fontWeight: "700", marginTop: 2 }, badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 }, badgeText: { fontSize: 10, fontWeight: "900" },
  timeBox: { flexDirection: "row", gap: 9, backgroundColor: "#f7f8fc", borderRadius: 15, padding: 11 }, timeLabel: { color: MUTED, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 }, timeValue: { color: TEXT, fontSize: 11, lineHeight: 17, fontWeight: "800", marginTop: 2 }, noteText: { color: MUTED, fontSize: 11, lineHeight: 17, fontWeight: "700" }, revokeText: { color: "#a32929", fontSize: 11, fontWeight: "800" },
  renewRow: { flexDirection: "row", gap: 8 }, renewInput: { flex: 1, minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 11, color: TEXT, fontSize: 11, fontWeight: "700" }, renewBtn: { minWidth: 72, borderRadius: 14, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" }, renewText: { color: ACCENT, fontSize: 11, fontWeight: "900" }, revokeBtn: { minHeight: 43, borderRadius: 17, backgroundColor: "#fff0f0", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, revokeBtnText: { color: "#a32929", fontSize: 11, fontWeight: "900" },
});
