import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { isTemporaryOrganizerUser } from "@/lib/temporaryOrganizerIdentity";
import { getMyTicketOrganizerAccess } from "@/lib/ticketOrganizerAccess";

export default function OrganizerLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const signIn = async () => {
    if (!email.trim() || !password) {
      setError("Enter your organizer email and password.");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (signInError) throw signInError;
      if (!data.user || !isTemporaryOrganizerUser(data.user)) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        throw new Error("This login is only for EYA temporary Organizer accounts.");
      }
      const access = await getMyTicketOrganizerAccess().catch(() => null);
      if (!access) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        router.replace("/organizer-access-ended" as any);
        return;
      }
      router.replace("/(organizer)/dashboard" as any);
    } catch (e: any) {
      setError(e?.message || "Could not sign in to Organizer Workspace.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.card}>
        <View style={styles.icon}><ShieldCheck size={31} color="#5e73dd" /></View>
        <Text style={styles.kicker}>EYA ORGANIZER</Text>
        <Text style={styles.title}>Organizer Login</Text>
        <Text style={styles.subtitle}>For temporary organizer accounts issued by EYA Admin. Normal EYA customer accounts cannot sign in here.</Text>

        <View style={styles.inputWrap}><Mail size={19} color="#6e7892" /><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Organizer email" placeholderTextColor="#9aa3b8" style={styles.input} /></View>
        <View style={styles.inputWrap}><LockKeyhole size={19} color="#6e7892" /><TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="Password" placeholderTextColor="#9aa3b8" style={styles.input} /></View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.primary, loading && styles.disabled]} disabled={loading} onPress={() => void signIn()}>
          {loading ? <ActivityIndicator color="#fff" /> : <KeyRound size={18} color="#fff" />}
          <Text style={styles.primaryText}>{loading ? "Signing in..." : "Open Organizer Workspace"}</Text>
        </Pressable>

        <Pressable style={styles.linkBtn} onPress={() => router.push("/organizer-invite" as any)}><Text style={styles.linkText}>Have a new organizer invitation?</Text></Pressable>
        <Pressable style={styles.linkBtn} onPress={() => router.push("/(auth)/forgot-password" as any)}><Text style={styles.linkText}>Forgot organizer password?</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f7fc", padding: 22, justifyContent: "center" },
  card: { width: "100%", maxWidth: 520, alignSelf: "center", backgroundColor: "#fff", borderRadius: 28, borderWidth: 1, borderColor: "#e4e8f2", padding: 22, gap: 13 },
  icon: { width: 70, height: 70, borderRadius: 35, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", alignSelf: "center" },
  kicker: { color: "#5e73dd", fontSize: 10, fontWeight: "900", letterSpacing: 1, textAlign: "center" },
  title: { color: "#102a54", fontSize: 27, fontWeight: "900", textAlign: "center" },
  subtitle: { color: "#6e7892", fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center", marginBottom: 4 },
  inputWrap: { minHeight: 54, borderRadius: 17, borderWidth: 1, borderColor: "#e4e8f2", backgroundColor: "#fbfcff", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  input: { flex: 1, color: "#102a54", fontSize: 14, fontWeight: "700", paddingVertical: 13 },
  error: { color: "#a32929", fontSize: 12, lineHeight: 18, fontWeight: "800" },
  primary: { minHeight: 54, borderRadius: 27, backgroundColor: "#102a54", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.55 },
  linkBtn: { minHeight: 38, alignItems: "center", justifyContent: "center" }, linkText: { color: "#5e73dd", fontSize: 12, fontWeight: "900" },
});
