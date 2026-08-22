import React from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, ShieldCheck, Ticket, UserPlus, XCircle } from "lucide-react-native";
import {
  extendAdminTicketOrganizerAccess,
  grantAdminTicketOrganizerAccess,
  listAdminTicketOrganizerAccess,
  regrantAdminTicketOrganizerAccess,
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
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function accessTone(status: AdminTicketOrganizerAccess["status"]) {
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
      setError(e?.message || "Could not load Ticket Management access.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const grantAccess = async () => {
    const expiry = parseMalawiLocalDateTime(expiresAt);
    if (!email.trim() || !organizationName.trim()) {
      Alert.alert("Details required", "Enter the user's EYA account email and promoter / organization name.");
      return;
    }
    if (!expiry) {
      Alert.alert("Access expiry required", "Use YYYY-MM-DD HH:mm, for example 2026-10-15 23:59.");
      return;
    }

    try {
      setBusy("grant");
      await grantAdminTicketOrganizerAccess({
        email,
        organizationName,
        expiresAt: expiry,
        note,
      });
      setEmail("");
      setOrganizationName("");
      setExpiresAt("");
      setNote("");
      Alert.alert("Ticket Management granted", "The workspace will now appear on that user's normal EYA account.");
      await load();
    } catch (e: any) {
      Alert.alert("Could not grant access", e?.message || "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const renewOrReenable = async (row: AdminTicketOrganizerAccess) => {
    const expiry = parseMalawiLocalDateTime(renewExpiry[row.id] || "");
    if (!expiry) {
      Alert.alert("New expiry required", "Enter the new expiry using YYYY-MM-DD HH:mm.");
      return;
    }

    try {
      setBusy(row.id);
      if (row.status === "revoked") {
        await regrantAdminTicketOrganizerAccess({ userId: row.user_id, expiresAt: expiry, note: "Re-enabled by EYA Admin" });
      } else {
        await extendAdminTicketOrganizerAccess({ grantId: row.id, expiresAt: expiry });
      }
      setRenewExpiry((current) => ({ ...current, [row.id]: "" }));
      await load();
    } catch (e: any) {
      Alert.alert(row.status === "revoked" ? "Could not re-enable access" : "Could not renew access", e?.message || "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const revokeAccess = (row: AdminTicketOrganizerAccess) => {
    Alert.alert(
      "Revoke Ticket Management?",
      `${row.organization_name} management will disappear from this user's Workspaces. Their normal EYA account, personal activity and purchases remain available.`,
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
          <Pressable style={styles.iconBtn} onPress={() => router.back()}>
            <ArrowLeft size={21} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>EYA Admin</Text>
            <Text style={styles.title}>Ticket Management access</Text>
          </View>
        </View>

        <View style={styles.securityNote}>
          <ShieldCheck size={20} color="#087443" />
          <Text style={styles.securityText}>
            Organizer tools are an Admin-granted workspace on a normal EYA account. There is no separate organizer login. Revoking or expiring this permission removes Ticket Management only.
          </Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.formHead}>
            <UserPlus size={19} color={ACCENT} />
            <Text style={styles.formTitle}>Grant Ticket Management</Text>
          </View>
          <Text style={styles.helperText}>The organizer must already have a normal EYA account with this email.</Text>
          <Field label="EYA account email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="organizer@example.com" />
          <Field label="Promoter / organization" value={organizationName} onChangeText={setOrganizationName} placeholder="XYZ Events" />
          <Field label="Access expires" value={expiresAt} onChangeText={setExpiresAt} autoCapitalize="none" placeholder="2026-10-15 23:59" />
          <Field label="Admin note (optional)" value={note} onChangeText={setNote} placeholder="Verification / event context" multiline />
          <Pressable style={[styles.primaryBtn, busy === "grant" && styles.disabled]} disabled={busy === "grant"} onPress={() => void grantAccess()}>
            {busy === "grant" ? <ActivityIndicator color="#fff" /> : <CheckCircle2 size={18} color="#fff" />}
            <Text style={styles.primaryText}>Grant Ticket Management</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeadRow}>
          <View>
            <Text style={styles.sectionTitle}>Organizer workspace access</Text>
            <Text style={styles.sectionSub}>Current and historical Ticket Management grants.</Text>
          </View>
          <Text style={styles.count}>{rows.length}</Text>
        </View>

        {loading ? (
          <State>
            <ActivityIndicator color={ACCENT} />
            <Text style={styles.stateText}>Loading access...</Text>
          </State>
        ) : null}

        {!loading && error ? (
          <State>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </State>
        ) : null}

        {!loading && !error && !rows.length ? (
          <State>
            <Ticket size={30} color={ACCENT} />
            <Text style={styles.emptyTitle}>No Ticket Management grants yet</Text>
            <Text style={styles.stateText}>Grant access to a verified EYA account when a promoter is ready.</Text>
          </State>
        ) : null}

        {!loading && !error
          ? rows.map((row) => {
              const badge = accessTone(row.status);
              return (
                <View key={row.id} style={styles.accessCard}>
                  <View style={styles.accessHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orgName}>{row.organization_name}</Text>
                      <Text style={styles.person}>{row.user?.full_name || row.user?.email || "EYA user"}</Text>
                      {row.user?.email ? <Text style={styles.small}>{row.user.email}</Text> : null}
                    </View>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                    </View>
                  </View>

                  <View style={styles.timeBox}>
                    <CalendarClock size={16} color={MUTED} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timeLabel}>TICKET MANAGEMENT WINDOW</Text>
                      <Text style={styles.timeValue}>{localLabel(row.starts_at)} → {localLabel(row.expires_at)}</Text>
                    </View>
                  </View>

                  {row.grant_note ? <Text style={styles.noteText}>Admin note: {row.grant_note}</Text> : null}
                  {row.revoke_note ? <Text style={styles.noteText}>Revoke note: {row.revoke_note}</Text> : null}

                  {row.status === "active" ? (
                    <Pressable style={styles.revokeBtn} disabled={busy === row.id} onPress={() => revokeAccess(row)}>
                      <XCircle size={17} color="#a32929" />
                      <Text style={styles.revokeBtnText}>Revoke Ticket Management</Text>
                    </Pressable>
                  ) : null}

                  {row.status !== "active" ? (
                    <View style={styles.renewBox}>
                      <Text style={styles.timeLabel}>{row.status === "revoked" ? "RE-ENABLE UNTIL" : "RENEW UNTIL"}</Text>
                      <TextInput
                        value={renewExpiry[row.id] || ""}
                        onChangeText={(value) => setRenewExpiry((current) => ({ ...current, [row.id]: value }))}
                        placeholder="2026-10-15 23:59"
                        placeholderTextColor="#9aa3b7"
                        style={styles.input}
                        autoCapitalize="none"
                      />
                      <Pressable style={[styles.secondaryBtn, busy === row.id && styles.disabled]} disabled={busy === row.id} onPress={() => void renewOrReenable(row)}>
                        {busy === row.id ? <ActivityIndicator color={ACCENT} /> : <Clock3 size={17} color={ACCENT} />}
                        <Text style={styles.secondaryText}>{row.status === "revoked" ? "Re-enable" : "Renew"}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })
          : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput {...inputProps} placeholderTextColor="#9aa3b7" style={[styles.input, inputProps.multiline ? styles.multiline : null]} />
    </View>
  );
}

function State({ children }: { children: React.ReactNode }) {
  return <View style={styles.state}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 52, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  kicker: { color: ACCENT, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  title: { color: TEXT, fontSize: 25, fontWeight: "900", marginTop: 2 },
  securityNote: { backgroundColor: "#eaf8f0", borderWidth: 1, borderColor: "#c8ecd8", borderRadius: 18, padding: 13, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  securityText: { flex: 1, color: "#185b3d", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  formCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 22, padding: 15, gap: 12 },
  formHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  formTitle: { color: TEXT, fontSize: 18, fontWeight: "900" },
  helperText: { color: MUTED, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  field: { gap: 6 },
  fieldLabel: { color: TEXT, fontSize: 12, fontWeight: "800" },
  input: { minHeight: 48, borderWidth: 1, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, color: TEXT, backgroundColor: "#fbfcff", fontWeight: "600" },
  multiline: { minHeight: 82, textAlignVertical: "top" },
  primaryBtn: { minHeight: 50, borderRadius: 15, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  primaryText: { color: "#fff", fontWeight: "900" },
  disabled: { opacity: 0.55 },
  sectionHeadRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 4 },
  sectionTitle: { color: TEXT, fontSize: 18, fontWeight: "900" },
  sectionSub: { color: MUTED, fontSize: 12, marginTop: 3, fontWeight: "600" },
  count: { color: ACCENT, fontSize: 14, fontWeight: "900", backgroundColor: "#eef1ff", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  state: { minHeight: 128, borderRadius: 20, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", padding: 18, gap: 8 },
  stateText: { color: MUTED, textAlign: "center", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  emptyTitle: { color: TEXT, fontSize: 16, fontWeight: "900" },
  errorText: { color: "#a32929", fontWeight: "800", textAlign: "center" },
  retryBtn: { borderRadius: 12, backgroundColor: "#eef1ff", paddingHorizontal: 14, paddingVertical: 8 },
  retryText: { color: ACCENT, fontWeight: "900" },
  accessCard: { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 20, padding: 14, gap: 11 },
  accessHead: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  orgName: { color: TEXT, fontSize: 17, fontWeight: "900" },
  person: { color: TEXT, fontSize: 13, fontWeight: "700", marginTop: 3 },
  small: { color: MUTED, fontSize: 11, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  badgeText: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  timeBox: { flexDirection: "row", gap: 8, backgroundColor: "#f7f8fc", borderRadius: 14, padding: 10 },
  timeLabel: { color: MUTED, fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },
  timeValue: { color: TEXT, fontSize: 12, fontWeight: "700", marginTop: 3 },
  noteText: { color: MUTED, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  revokeBtn: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: "#f0c9c9", backgroundColor: "#fff7f7", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  revokeBtnText: { color: "#a32929", fontWeight: "900", fontSize: 12 },
  renewBox: { gap: 8, paddingTop: 3 },
  secondaryBtn: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: "#cfd6ff", backgroundColor: "#f5f6ff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  secondaryText: { color: ACCENT, fontWeight: "900" },
});
