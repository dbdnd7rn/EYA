import React from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { listTrustSafetyReportsForAdmin, updateTrustSafetyReportStatus, type TrustSafetyReportStatus } from "@/lib/trustSafety";
import { supabase } from "@/lib/supabase";
import { useNotificationInbox } from "@/providers/NotificationInboxProvider";

type ReportRow = {
  id: string;
  reporter_id: string;
  category: string;
  subject_type: string;
  subject_id: string | null;
  status: TrustSafetyReportStatus;
  details: string;
  created_at: string | null;
  admin_notes: string | null;
};

const statuses: TrustSafetyReportStatus[] = ["open", "in_review", "resolved", "dismissed"];

export default function AdminReportsPage() {
  const router = useRouter();
  const { user, role, loading, refreshRole } = useAuth();
  const { unreadCount } = useNotificationInbox();
  const [checkingAccess, setCheckingAccess] = React.useState(true);
  const [fetching, setFetching] = React.useState(true);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [reports, setReports] = React.useState<ReportRow[]>([]);

  React.useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        if (loading) return;
        if (!user) {
          router.replace("/(auth)/login");
          return;
        }
        if (!role) await refreshRole(user.id);
        const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        const currentRole = ((data as any)?.role ?? role) as string | null;
        if (currentRole !== "admin") {
          router.replace("/");
          return;
        }
      } finally {
        if (active) setCheckingAccess(false);
      }
    };

    void check();
    return () => {
      active = false;
    };
  }, [loading, user, role, refreshRole, router]);

  const loadReports = React.useCallback(async () => {
    setFetching(true);
    setMessage(null);
    try {
      const data = await listTrustSafetyReportsForAdmin();
      setReports(data as ReportRow[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load reports.");
    } finally {
      setFetching(false);
    }
  }, []);

  React.useEffect(() => {
    if (!checkingAccess && user) {
      void loadReports();
    }
  }, [checkingAccess, user, loadReports]);

  const save = async (report: ReportRow) => {
    setSavingId(report.id);
    setMessage(null);
    try {
      await updateTrustSafetyReportStatus(report.id, report.status, report.admin_notes);
      setMessage("Report updated.");
      await loadReports();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update report.");
    } finally {
      setSavingId(null);
    }
  };

  if (loading || checkingAccess) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.helper}>Checking admin access...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>Trust reports</Text>
          <Text style={styles.sub}>Review user-submitted safety, fraud, and conduct issues.</Text>
          <View style={styles.actions}>
            <Pressable style={styles.primaryPill} onPress={() => void loadReports()}>
              <Text style={styles.primaryPillText}>{fetching ? "Refreshing..." : "Refresh"}</Text>
            </Pressable>
            <Pressable style={styles.secondaryPill} onPress={() => router.push("/admin/pricing")}>
              <Text style={styles.secondaryPillText}>Pricing CMS</Text>
            </Pressable>
            <Pressable style={styles.secondaryPill} onPress={() => router.push("/admin/moderation")}>
              <Text style={styles.secondaryPillText}>Moderation</Text>
            </Pressable>
            <Pressable style={styles.secondaryPill} onPress={() => router.push("/admin/notifications")}>
              <Text style={styles.secondaryPillText}>Notifications{unreadCount ? ` (${unreadCount})` : ""}</Text>
            </Pressable>
          </View>
          {message ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{message}</Text>
            </View>
          ) : null}
        </View>

        {reports.map((report) => (
          <View key={report.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{report.category.replace(/_/g, " ")}</Text>
              <Text style={styles.cardMeta}>{report.status}</Text>
            </View>
            <Text style={styles.cardMeta}>Subject: {report.subject_type}{report.subject_id ? ` (${report.subject_id})` : ""}</Text>
            <Text style={styles.cardMeta}>Reporter: {report.reporter_id}</Text>
            <Text style={styles.cardMeta}>Created: {report.created_at ? new Date(report.created_at).toLocaleString() : "-"}</Text>
            <Text style={styles.details}>{report.details}</Text>

            <View style={styles.statusRow}>
              {statuses.map((status) => {
                const active = status === report.status;
                return (
                  <Pressable
                    key={status}
                    style={[styles.statusChip, active && styles.statusChipActive]}
                    onPress={() =>
                      setReports((current) =>
                        current.map((row) => (row.id === report.id ? { ...row, status } : row)),
                      )
                    }
                  >
                    <Text style={[styles.statusChipText, active && styles.statusChipTextActive]}>{status}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={report.admin_notes ?? ""}
              onChangeText={(value) =>
                setReports((current) =>
                  current.map((row) => (row.id === report.id ? { ...row, admin_notes: value } : row)),
                )
              }
              multiline
              style={styles.notesInput}
              placeholder="Admin notes"
              placeholderTextColor="#95a0bb"
            />

            <Pressable style={styles.primaryBtn} onPress={() => void save(report)} disabled={savingId === report.id}>
              <Text style={styles.primaryBtnText}>{savingId === report.id ? "Saving..." : "Save review"}</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  center: { flex: 1, backgroundColor: "#f6f7fb", alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  hero: { backgroundColor: "#fff", borderRadius: 20, padding: 16, gap: 10 },
  title: { color: "#0e2756", fontSize: 26, fontWeight: "900" },
  sub: { color: "#5f6b85", fontWeight: "600" },
  helper: { marginTop: 8, color: "#5f6b85", fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  primaryPill: { borderRadius: 999, backgroundColor: "#0e2756", paddingHorizontal: 12, paddingVertical: 8 },
  primaryPillText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  secondaryPill: { borderRadius: 999, backgroundColor: "#ff0f64", paddingHorizontal: 12, paddingVertical: 8 },
  secondaryPillText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  notice: { borderRadius: 12, borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", padding: 10 },
  noticeText: { color: "#b0003a", fontWeight: "700", fontSize: 12 },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 14, gap: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  cardTitle: { color: "#0e2756", fontWeight: "900", fontSize: 18, textTransform: "capitalize" },
  cardMeta: { color: "#5f6b85", fontWeight: "600", fontSize: 12 },
  details: { color: "#0e2756", lineHeight: 20, fontWeight: "600" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusChip: { borderRadius: 999, borderWidth: 1, borderColor: "#d7def1", backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 7 },
  statusChipActive: { backgroundColor: "#0e2756", borderColor: "#0e2756" },
  statusChipText: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  statusChipTextActive: { color: "#fff" },
  notesInput: {
    minHeight: 110,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d7def1",
    backgroundColor: "#fbfcff",
    padding: 12,
    color: "#0e2756",
    textAlignVertical: "top",
    fontWeight: "600",
  },
  primaryBtn: { borderRadius: 14, backgroundColor: "#0e2756", paddingVertical: 13, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
});
