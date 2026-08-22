import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, BriefcaseBusiness, ChevronRight, House, ShieldCheck, Store, Ticket, UserRound } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { getMyTicketOrganizerAccess } from "@/lib/ticketOrganizerAccess";
import { getWorkspaceHomeRoute, getWorkspaceStatuses, type WorkspaceRole } from "@/lib/workspaceAccess";
import { useAuth } from "@/providers/AuthProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

type WorkspaceKey = WorkspaceRole | "ticket_organizer";

type ReadyWorkspace = {
  key: WorkspaceKey;
  label: string;
  description: string;
  homeRoute: string;
};

function workspaceIcon(key: WorkspaceKey) {
  if (key === "landlord") return House;
  if (key === "vendor") return Store;
  if (key === "agent") return BriefcaseBusiness;
  if (key === "ticket_organizer") return Ticket;
  if (key === "admin") return ShieldCheck;
  return UserRound;
}

function workspaceSubtitle(key: WorkspaceKey, fallback: string) {
  if (key === "student") return "Your main EYA experience for rooms, food, marketplace, tickets, messages and more.";
  if (key === "vendor") return "Manage your food provider profile, menu, orders and customer activity.";
  if (key === "landlord") return "Manage room listings, enquiries and property activity.";
  if (key === "agent") return "Manage delivery jobs, rider activity and earnings.";
  if (key === "ticket_organizer") return fallback;
  if (key === "admin") return "Manage EYA platform operations and approvals.";
  return fallback;
}

export default function WorkspacesScreen() {
  const router = useRouter();
  const { user, role, activeRole, setActiveRole } = useAuth();
  const { theme } = useStudentTheme();
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<WorkspaceKey | null>(null);
  const [ready, setReady] = useState<ReadyWorkspace[]>([]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        if (!user?.id) return;
        const [statuses, organizerAccess] = await Promise.all([
          getWorkspaceStatuses(user.id, user.email),
          getMyTicketOrganizerAccess().catch(() => null),
        ]);
        if (!alive) return;

        const visible: ReadyWorkspace[] = statuses
          .filter((entry) => entry.role === "student" || entry.ready)
          .map((entry) => ({
            key: entry.role,
            label: entry.label,
            description: entry.description,
            homeRoute: entry.homeRoute,
          }));

        if (organizerAccess) {
          visible.push({
            key: "ticket_organizer",
            label: "Ticket Management",
            description: `Manage approved events and ticket operations for ${organizerAccess.organization_name}.`,
            homeRoute: "/(organizer)/dashboard",
          });
        }

        if (role === "admin") {
          visible.push({
            key: "admin",
            label: "Admin",
            description: "EYA platform management",
            homeRoute: getWorkspaceHomeRoute("admin"),
          });
        }

        setReady(visible);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [role, user?.email, user?.id]);

  const ordered = useMemo(() => {
    const order: WorkspaceKey[] = ["student", "vendor", "landlord", "agent", "ticket_organizer", "admin"];
    return [...ready].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }, [ready]);

  const openWorkspace = async (workspace: ReadyWorkspace) => {
    if (switching) return;
    try {
      setSwitching(workspace.key);
      if (workspace.key === "ticket_organizer") {
        router.push(workspace.homeRoute as any);
        return;
      }
      await setActiveRole(workspace.key);
      router.replace(workspace.homeRoute as any);
    } finally {
      setSwitching(null);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]} onPress={() => router.back()}>
            <ArrowLeft size={20} color={theme.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.heading }]}>Workspaces</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>One EYA account. Open the workspaces you are approved to use.</Text>
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
          <Text style={[styles.infoTitle, { color: theme.text }]}>Your personal EYA access never disappears</Text>
          <Text style={[styles.infoText, { color: theme.textMuted }]}>Verified business or job workspaces add tools to your account. They do not stop you from using EYA as a normal user.</Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading your workspaces...</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {ordered.map((workspace) => {
              const Icon = workspaceIcon(workspace.key);
              const selected = workspace.key !== "ticket_organizer" && (activeRole ?? "student") === workspace.key;
              const busy = switching === workspace.key;
              return (
                <Pressable
                  key={workspace.key}
                  style={[styles.workspaceCard, { backgroundColor: theme.surface, borderColor: selected ? theme.accent : theme.borderSoft }]}
                  onPress={() => void openWorkspace(workspace)}
                  disabled={Boolean(switching)}
                >
                  <View style={[styles.iconWrap, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                    <Icon size={21} color={theme.accent} />
                  </View>
                  <View style={styles.workspaceCopy}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.workspaceTitle, { color: theme.text }]}>{workspace.key === "student" ? "Personal / User" : workspace.label}</Text>
                      {selected ? (
                        <View style={[styles.activePill, { backgroundColor: theme.accentSoft }]}>
                          <Text style={[styles.activePillText, { color: theme.accent }]}>Current</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.workspaceText, { color: theme.textMuted }]}>{workspaceSubtitle(workspace.key, workspace.description)}</Text>
                  </View>
                  {busy ? <ActivityIndicator color={theme.accent} /> : <ChevronRight size={20} color={theme.textSoft} />}
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          style={[styles.applyCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
          onPress={() => router.push({ pathname: "/onboarding", params: { mode: "apply" } } as any)}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.applyTitle, { color: theme.text }]}>Apply for another workspace</Text>
            <Text style={[styles.applyText, { color: theme.textMuted }]}>Landlord, Food Provider and Delivery applications are reviewed before management tools become available.</Text>
          </View>
          <ChevronRight size={20} color={theme.textSoft} />
        </Pressable>

        <Text style={[styles.note, { color: theme.textSoft }]}>Ticket Management is Admin-granted only and appears here after EYA verifies the organizer account.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  backBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  title: { fontSize: 28, fontWeight: "900" },
  subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  infoCard: { borderRadius: 24, borderWidth: 1, padding: 16, gap: 6 },
  infoTitle: { fontSize: 17, fontWeight: "900" },
  infoText: { fontSize: 13, lineHeight: 19, fontWeight: "600" },
  loadingWrap: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 13, fontWeight: "700" },
  list: { gap: 12 },
  workspaceCard: { minHeight: 112, borderRadius: 24, borderWidth: 1.5, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  workspaceCopy: { flex: 1, gap: 5 },
  titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  workspaceTitle: { fontSize: 18, fontWeight: "900" },
  workspaceText: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  activePill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  activePillText: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  applyCard: { minHeight: 92, borderRadius: 22, borderWidth: 1, padding: 15, flexDirection: "row", alignItems: "center", gap: 10 },
  applyTitle: { fontSize: 16, fontWeight: "900" },
  applyText: { marginTop: 4, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  note: { fontSize: 12, lineHeight: 18, fontWeight: "600", textAlign: "center", paddingHorizontal: 10 },
});
