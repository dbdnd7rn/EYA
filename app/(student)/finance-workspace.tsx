import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, Banknote, ChevronRight, Landmark, LockKeyhole, ShieldCheck } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { getMyTicketFinanceWorkspace, type TicketFinanceWorkspace } from "@/lib/ticketEventFinanceApi";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

export default function FinanceWorkspaceScreen() {
  const router = useRouter();
  const { theme } = useStudentTheme();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [workspaces, setWorkspaces] = React.useState<TicketFinanceWorkspace[]>([]);

  React.useEffect(() => {
    let alive = true;
    getMyTicketFinanceWorkspace()
      .then((rows) => { if (alive) setWorkspaces(rows); })
      .catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : "Could not load Finance & Settlement."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable style={[styles.back, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]} onPress={() => router.back()}><ArrowLeft size={20} color={theme.text} /></Pressable>
          <View style={{ flex: 1 }}><Text style={[styles.title, { color: theme.heading }]}>Finance & Settlement</Text><Text style={[styles.subtitle, { color: theme.textMuted }]}>Organization-owned statements, liabilities and payout requests.</Text></View>
        </View>

        {loading ? <View style={styles.state}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.textMuted }}>Loading finance access...</Text></View> : null}
        {!loading && error ? <View style={[styles.state, { backgroundColor: theme.surface }]}><Text style={{ color: "#a32929", fontWeight: "800" }}>{error}</Text></View> : null}

        {!loading && !error ? workspaces.map((workspace) => (
          <View key={workspace.entitlement_id} style={styles.group}>
            <View style={[styles.orgCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
              <View style={[styles.icon, { backgroundColor: theme.surfaceMuted }]}>{workspace.status === "suspended" ? <LockKeyhole size={20} color="#a36a00" /> : <ShieldCheck size={20} color={theme.accent} />}</View>
              <View style={{ flex: 1 }}><Text style={[styles.orgName, { color: theme.text }]}>{workspace.organization_name}</Text><Text style={[styles.orgMeta, { color: theme.textMuted }]}>{workspace.role === "finance_owner" ? "Finance Owner" : "Finance Manager"}{workspace.status === "suspended" ? " · requests suspended" : ""}</Text></View>
            </View>

            <Pressable style={[styles.eventCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]} onPress={() => router.push({ pathname: "/(student)/payout-destinations", params: { organizationId: workspace.organization_id, organizationName: workspace.organization_name, accessStatus: workspace.status } } as any)}>
              <View style={[styles.eventIcon, { backgroundColor: theme.accentSoft }]}><Landmark size={19} color={theme.accent} /></View>
              <View style={{ flex: 1 }}><Text style={[styles.eventName, { color: theme.text }]}>Payout destinations</Text><Text style={[styles.eventMeta, { color: theme.textMuted }]}>{workspace.status === "suspended" ? "View masked details · changes suspended" : "Register and track verified bank or mobile money"}</Text></View>
              <ChevronRight size={20} color={theme.textSoft} />
            </Pressable>

            {workspace.events.length ? workspace.events.map((event) => (
              <Pressable key={event.event_id} style={[styles.eventCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]} onPress={() => router.push({ pathname: "/(student)/event-finance", params: { eventId: event.event_id, accessStatus: workspace.status } } as any)}>
                <View style={[styles.eventIcon, { backgroundColor: theme.accentSoft }]}><Banknote size={19} color={theme.accent} /></View>
                <View style={{ flex: 1 }}><Text style={[styles.eventName, { color: theme.text }]}>{event.event_title}</Text><Text style={[styles.eventMeta, { color: theme.textMuted }]}>{event.finance_status === "unconfigured" ? "Awaiting finance setup" : `Finance ${event.finance_status}`}</Text></View>
                <ChevronRight size={20} color={theme.textSoft} />
              </Pressable>
            )) : <Text style={[styles.empty, { color: theme.textMuted }]}>No approved events are attached to this organization yet.</Text>}
          </View>
        )) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, content: { padding: 16, paddingBottom: 48, gap: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  back: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 27, fontWeight: "900" }, subtitle: { marginTop: 4, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  state: { minHeight: 150, borderRadius: 22, alignItems: "center", justifyContent: "center", gap: 10, padding: 18 },
  group: { gap: 10 }, orgCard: { borderRadius: 24, borderWidth: 1, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  orgName: { fontSize: 18, fontWeight: "900" }, orgMeta: { marginTop: 3, fontSize: 12, fontWeight: "700" },
  eventCard: { minHeight: 82, borderRadius: 20, borderWidth: 1, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  eventIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  eventName: { fontSize: 16, fontWeight: "900" }, eventMeta: { marginTop: 3, fontSize: 12, fontWeight: "700" },
  empty: { textAlign: "center", paddingVertical: 22, fontSize: 13, fontWeight: "600" },
});
