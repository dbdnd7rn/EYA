import React from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, ShieldCheck, UserPlus, XCircle } from "lucide-react-native";
import {
  extendAdminTicketOrganizerAccess,
  grantAdminTicketOrganizerAccess,
  listAdminTicketOrganizerAccess,
  revokeAdminTicketOrganizerAccess,
  type AdminTicketOrganizerAccess,
} from "@/lib/ticketOrganizerAccess";

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
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function tone(status: AdminTicketOrganizerAccess["status"]) {
  if (status === "active") return { bg: "#e4f7ec", text: "#087443", label: "Active" };
  if (status === "expired") return { bg: "#fff4d9", text: "#8a5a00", label: "Expired" };
  return { bg: "#fff0f0", text: "#a32929", label: "Revoked" };
}

export default function AdminOrganizerAccessScreen() {
  const router = useRouter();
  const [rows, setRows] = React.useState<AdminTicketOrganizerAccess[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");
  const [organizationName, setOrganizationName] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [note, setNote] = React.useState("");
  const [renewExpiry, setRenewExpiry] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      setError(null);
      setRows(await listAdminTicketOrganizerAccess());
    } catch (e: any) {
      setError(e?.message || "Could not load organizer access.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const grant = async () => {
    const expiry = parseMalawiLocalDateTime(expiresAt);
    if (!email.trim() || !organizationName.trim()) {
      Alert.alert("Details required", "Enter the organizer's EYA email and organization/event-company name.");
      return;
    }
    if (!expiry) {
      Alert.alert("Expiry required", "Use YYYY-MM-DD HH:mm, for example 2026-10-15 23:59.");
      return;
    }
    try {
      setBusy("grant");
      await grantAdminTicketOrganizerAccess({ email, organizationName, expiresAt: expiry, note });
      setEmail("");
      setOrganizationName("");
      setExpiresAt("");
      setNote("");
      await load();
      Alert.alert("Organizer access active", "This user can now open the temporary EYA Organizer Workspace until the expiry you selected.");
    } catch (e: any) {
      Alert.alert("Could not grant access", e?.message || "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const renew = async (row: AdminTicketOrganizerAccess) => {
    const expiry = parseMalawiLocalDateTime(renewExpiry[row.id] || "");
    if (!expiry) {
      Alert.alert("New expiry required", "Enter the new expiry beside this organizer using YYYY-MM-DD HH:mm.");
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

  const revoke = (row: AdminTicketOrganizerAccess) => {
    Alert.alert(
      "Revoke organizer access?",
      `${row.organization_name} will immediately lose Event Studio access. Pending events cannot be approved until a valid grant exists.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            try {
              setBusy(row.id);
              await revokeAdminTicketOrganizerAccess({ grantId: row.id, note: "Revoked by EYA Admin" });
              await load();
            } catch (e: any) {
              Alert.alert("Could not revoke access", e?.message || "Try again.");
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={ACCENT} />}
      >
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}><ArrowLeft size={21} color={TEXT} /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>EYA Admin</Text>
            <Text style={styles.title}>Organizer access</Text>
          </View>
        </View>

        <View style={styles.securityNote}>
          <ShieldCheck size={20} color="#087443" />
          <Text style={styles.securityText}>Organizer Event Studio is invite-only. Normal users do not see organizer controls. Access expires automatically at the date selected by Admin.</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.formHead}><UserPlus size={19} color={ACCENT} /><Text style={styles.formTitle}>Grant temporary access</Text></View>
          <Field label="Existing EYA account email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="organizer@example.com" />
          <Field label="Organization / promoter" value={organizationName} onChangeText={setOrganizationName} placeholder="XYZ Events" />
          <Field label="Access expires" value={expiresAt} onChangeText={setExpiresAt} autoCapitalize="none" placeholder="2026-10-15 23:59" />
          <Field label="Admin note (optional)" value={note} onChangeText={setNote} placeholder="Reason / event context" multiline />
          <Pressable style={[styles.primaryBtn, busy === "grant" && styles.disabled]} disabled={busy === "grant"} onPress={() => void grant()}>
            {busy === "grant" ? <ActivityIndicator color="#fff" /> : <CheckCircle2 size={18} color="#fff" />}
            <Text style={styles.primaryText}>Activate Organizer Workspace</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeadRow}><Text style={styles.sectionTitle}>Access history</Text><Text style={styles.count}>{rows.length}</Text></View>
        {loading ? <State><ActivityIndicator color={ACCENT} /><Text style={styles.stateText}>Loading organizer access...</Text></State> : null}
        {!loading && error ? <State><Text style={styles.errorText}>{error}</Text><Pressable style={styles.retryBtn} onPress={() => void load()}><Text style={styles.retryText}>Try again</Text></Pressable></State> : null}
        {!loading && !error && !rows.length ? <State><Clock3 size={30} color={ACCENT} /><Text style={styles.emptyTitle}>No organizer grants yet</Text><Text style={styles.stateText}>Normal users remain customer-only until Admin activates someone here.</Text></State> : null}

        {!loading && !error ? rows.map((row) => {
          const badge = tone(row.status);
          const canRenew = row.status !== "revoked";
          return (
            <View key={row.id} style={styles.accessCard}>
              <View style={styles.accessHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orgName}>{row.organization_name}</Text>
                  <Text style={styles.person}>{row.user?.full_name || row.user?.email || "EYA user"}</Text>
                  {row.user?.email ? <Text style={styles.small}>{row.user.email}</Text> : null}
                </View>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}><Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text></View>
              </View>
              <View style={styles.timeBox}>
                <CalendarClock size={16} color={MUTED} />
                <View style={{ flex: 1 }}><Text style={styles.timeLabel}>ACCESS WINDOW</Text><Text style={styles.timeValue}>{localLabel(row.starts_at)} → {localLabel(row.expires_at)}</Text></View>
              </View>
              {row.grant_note ? <Text style={styles.noteText}>Admin note: {row.grant_note}</Text> : null}
              {row.revoke_note ? <Text style={styles.revokeText}>Revoked: {row.revoke_note}</Text> : null}

              {canRenew ? (
                <View style={styles.renewRow}>
                  <TextInput
                    value={renewExpiry[row.id] || ""}
                    onChangeText={(value) => setRenewExpiry((current) => ({ ...current, [row.id]: value }))}
                    placeholder="New expiry: YYYY-MM-DD HH:mm"
                    placeholderTextColor="#9aa3b8"
                    autoCapitalize="none"
                    style={styles.renewInput}
                  />
                  <Pressable style={styles.renewBtn} disabled={busy === row.id} onPress={() => void renew(row)}>
                    {busy === row.id ? <ActivityIndicator size="small" color={ACCENT} /> : <Text style={styles.renewText}>Renew</Text>}
                  </Pressable>
                </View>
              ) : null}

              {row.status === "active" ? (
                <Pressable style={styles.revokeBtn} disabled={busy === row.id} onPress={() => revoke(row)}>
                  <XCircle size={17} color="#a32929" /><Text style={styles.revokeBtnText}>Revoke immediately</Text>
                </Pressable>
              ) : null}
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

function State({ children }: { children: React.ReactNode }) {
  return <View style={styles.state}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 18, paddingBottom: 90, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  kicker: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  title: { color: TEXT, fontSize: 26, fontWeight: "900", marginTop: 2 },
  securityNote: { borderRadius: 18, backgroundColor: "#e8f7ee", padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  securityText: { flex: 1, color: "#276346", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  formCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 24, padding: 16, gap: 13 },
  formHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  formTitle: { color: TEXT, fontSize: 18, fontWeight: "900" },
  field: { gap: 6 },
  label: { color: MUTED, fontSize: 10, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  input: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", paddingHorizontal: 14, color: TEXT, fontSize: 14, fontWeight: "700" },
  multiline: { minHeight: 82, paddingTop: 13, textAlignVertical: "top" },
  primaryBtn: { minHeight: 54, borderRadius: 27, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.55 },
  sectionHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sectionTitle: { color: TEXT, fontSize: 19, fontWeight: "900" },
  count: { minWidth: 34, height: 34, borderRadius: 17, backgroundColor: "#eef1ff", color: ACCENT, textAlign: "center", textAlignVertical: "center", fontWeight: "900" },
  state: { minHeight: 170, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 22, alignItems: "center", justifyContent: "center", gap: 10, padding: 22 },
  stateText: { color: MUTED, fontSize: 12, lineHeight: 18, fontWeight: "700", textAlign: "center" },
  emptyTitle: { color: TEXT, fontSize: 18, fontWeight: "900" },
  errorText: { color: "#a32929", fontWeight: "800", textAlign: "center" },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: "#eef1ff" },
  retryText: { color: ACCENT, fontWeight: "900" },
  accessCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 22, padding: 15, gap: 11 },
  accessHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  orgName: { color: TEXT, fontSize: 17, fontWeight: "900" },
  person: { color: "#40506f", fontSize: 13, fontWeight: "800", marginTop: 4 },
  small: { color: MUTED, fontSize: 11, fontWeight: "700", marginTop: 2 },
  badge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "900" },
  timeBox: { backgroundColor: "#f7f8fc", borderRadius: 15, padding: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  timeLabel: { color: MUTED, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  timeValue: { color: TEXT, fontSize: 11, lineHeight: 16, fontWeight: "800", marginTop: 2 },
  noteText: { color: "#55627d", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  revokeText: { color: "#a32929", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  renewRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  renewInput: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, color: TEXT, backgroundColor: "#fbfcff", fontSize: 12, fontWeight: "700" },
  renewBtn: { minWidth: 72, minHeight: 46, borderRadius: 14, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  renewText: { color: ACCENT, fontSize: 12, fontWeight: "900" },
  revokeBtn: { minHeight: 46, borderRadius: 16, backgroundColor: "#fff0f0", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  revokeBtnText: { color: "#a32929", fontSize: 12, fontWeight: "900" },
});
