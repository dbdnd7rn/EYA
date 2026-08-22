import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react-native";
import { claimOrganizerInvite, inspectOrganizerInvite, type OrganizerInvitePreview } from "@/lib/ticketOrganizerInvites";
import { supabase } from "@/lib/supabase";

const BG = "#f5f7fc";
const CARD = "#ffffff";
const TEXT = "#102a54";
const MUTED = "#6e7892";
const ACCENT = "#5e73dd";
const BORDER = "#e4e8f2";

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function OrganizerInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ t?: string }>();
  const fromLink = typeof params.t === "string" ? params.t : "";
  const [token, setToken] = React.useState(fromLink);
  const [preview, setPreview] = React.useState<OrganizerInvitePreview | null>(null);
  const [fullName, setFullName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [claiming, setClaiming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const inspect = React.useCallback(async (rawToken: string) => {
    const next = rawToken.trim();
    if (!next) return;
    try {
      setChecking(true);
      setError(null);
      const info = await inspectOrganizerInvite(next);
      setPreview(info);
    } catch (e: any) {
      setPreview(null);
      setError(e?.message || "This organizer invitation is unavailable.");
    } finally {
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    if (fromLink) void inspect(fromLink);
  }, [fromLink, inspect]);

  const claim = async () => {
    if (!preview) return;
    if (fullName.trim().length < 2) {
      Alert.alert("Name required", "Enter the organizer's full name.");
      return;
    }
    if (password.length < 10) {
      Alert.alert("Stronger password required", "Use at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords do not match", "Re-enter the same password.");
      return;
    }

    try {
      setClaiming(true);
      setError(null);
      const account = await claimOrganizerInvite({ token, fullName, password });

      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: account.email, password });
      if (signInError) throw signInError;

      router.replace("/redirect");
    } catch (e: any) {
      setError(e?.message || "Could not activate the temporary Organizer login.");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.icon}><ShieldCheck size={30} color={ACCENT} /></View>
          <Text style={styles.kicker}>EYA ORGANIZER INVITATION</Text>
          <Text style={styles.title}>Temporary Organizer Workspace</Text>
          <Text style={styles.subtitle}>Organizer access is private, Admin-issued, and expires automatically. This is separate from the normal EYA customer workspace.</Text>
        </View>

        {!preview ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Open your invitation</Text>
            <Text style={styles.help}>If EYA opened from the invitation link, the code is filled automatically. During testing you can paste the one-time code here.</Text>
            <TextInput value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} placeholder="EYA-ORG-INV-1-..." placeholderTextColor="#9aa3b8" style={styles.input} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable style={[styles.primary, checking && styles.disabled]} disabled={checking || !token.trim()} onPress={() => void inspect(token)}>
              {checking ? <ActivityIndicator color="#fff" /> : <KeyRound size={18} color="#fff" />}
              <Text style={styles.primaryText}>{checking ? "Checking..." : "Check invitation"}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.inviteCard}>
              <CheckCircle2 size={24} color="#087443" />
              <View style={{ flex: 1 }}>
                <Text style={styles.inviteLabel}>INVITED ORGANIZER</Text>
                <Text style={styles.inviteOrg}>{preview.organization_name}</Text>
                <Text style={styles.inviteEmail}>{preview.email}</Text>
                <Text style={styles.inviteMeta}>Invite expires {dateLabel(preview.invite_expires_at)}</Text>
                <Text style={styles.inviteMeta}>Workspace access ends {dateLabel(preview.access_expires_at)}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Create temporary login</Text>
              <Field label="Full name" value={fullName} onChangeText={setFullName} placeholder="Organizer name" />
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 10 characters" autoCapitalize="none" />
              <Field label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="Repeat password" autoCapitalize="none" />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable style={[styles.primary, claiming && styles.disabled]} disabled={claiming} onPress={() => void claim()}>
                {claiming ? <ActivityIndicator color="#fff" /> : <ShieldCheck size={18} color="#fff" />}
                <Text style={styles.primaryText}>{claiming ? "Activating..." : "Activate Organizer Workspace"}</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => { setPreview(null); setError(null); }}><Text style={styles.secondaryText}>Use a different invitation</Text></Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...input } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...input} placeholderTextColor="#9aa3b8" style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, content: { padding: 20, paddingBottom: 60, gap: 16 },
  hero: { alignItems: "center", paddingTop: 20, paddingBottom: 8, gap: 8 }, icon: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  kicker: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, marginTop: 4 }, title: { color: TEXT, fontSize: 27, lineHeight: 32, fontWeight: "900", textAlign: "center" }, subtitle: { color: MUTED, fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center", maxWidth: 410 },
  card: { backgroundColor: CARD, borderRadius: 24, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 13 }, cardTitle: { color: TEXT, fontSize: 19, fontWeight: "900" }, help: { color: MUTED, fontSize: 12, lineHeight: 18, fontWeight: "700" },
  field: { gap: 6 }, label: { color: MUTED, fontSize: 10, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" }, input: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", paddingHorizontal: 14, color: TEXT, fontSize: 14, fontWeight: "700" },
  primary: { minHeight: 54, borderRadius: 27, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 }, primaryText: { color: "#fff", fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.55 },
  secondary: { minHeight: 44, alignItems: "center", justifyContent: "center" }, secondaryText: { color: ACCENT, fontSize: 12, fontWeight: "900" }, error: { color: "#a32929", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  inviteCard: { backgroundColor: "#e9f8ef", borderRadius: 22, padding: 15, flexDirection: "row", alignItems: "flex-start", gap: 11 }, inviteLabel: { color: "#087443", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, inviteOrg: { color: TEXT, fontSize: 18, fontWeight: "900", marginTop: 3 }, inviteEmail: { color: "#39745a", fontSize: 12, fontWeight: "800", marginTop: 2 }, inviteMeta: { color: "#527261", fontSize: 10, lineHeight: 15, fontWeight: "700", marginTop: 2 },
});
