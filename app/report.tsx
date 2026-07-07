import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import TopNav from "@/components/TopNav";
import { captureRuntimeError, captureRuntimeEvent } from "@/lib/monitoring";
import { createTrustSafetyReport } from "@/lib/trustSafety";
import { useAuth } from "@/providers/AuthProvider";

const categories = ["harassment", "fraud", "unsafe_listing", "delivery_issue", "spam", "other"] as const;

export default function ReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    subjectType?: string;
    subjectId?: string;
    enquiryId?: string;
    orderId?: string;
  }>();
  const { user } = useAuth();
  const [category, setCategory] = React.useState<(typeof categories)[number]>("harassment");
  const [details, setDetails] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const subjectType = String(params.subjectType ?? "general");
  const subjectId = typeof params.subjectId === "string" ? params.subjectId : null;
  const enquiryId = typeof params.enquiryId === "string" ? params.enquiryId : null;
  const orderId = typeof params.orderId === "string" ? params.orderId : null;

  const submit = async () => {
    if (!user?.id) {
      router.replace("/(auth)/login");
      return;
    }
    if (details.trim().length < 12) {
      Alert.alert("Add more detail", "Please describe the issue clearly so the team can review it.");
      return;
    }

    try {
      setSaving(true);
      await createTrustSafetyReport({
        reporterId: user.id,
        subjectType,
        subjectId,
        category,
        details,
        relatedEnquiryId: enquiryId,
        relatedOrderId: orderId,
      });
      await captureRuntimeEvent({
        type: "trust_report_created",
        message: "User submitted a trust and safety report.",
        userId: user.id,
        context: { category, subjectType },
      });
      Alert.alert("Report submitted", "Your report has been sent for review.");
      router.back();
    } catch (error) {
      await captureRuntimeError(error, { scope: "submit_trust_report", category, subjectType });
      Alert.alert("Could not submit report", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <TopNav title="Report an issue" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Trust and safety report</Text>
          <Text style={styles.sub}>
            Use this if you see fraud, harassment, unsafe conduct, or anything that should be reviewed by an admin.
          </Text>

          <View style={styles.metaBox}>
            <Text style={styles.metaText}>Subject type: {subjectType}</Text>
            {subjectId ? <Text style={styles.metaText}>Subject id: {subjectId}</Text> : null}
          </View>

          <Text style={styles.label}>Category</Text>
          <View style={styles.chips}>
            {categories.map((item) => {
              const active = item === category;
              return (
                <Pressable
                  key={item}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setCategory(item)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.replace(/_/g, " ")}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Details</Text>
          <TextInput
            value={details}
            onChangeText={setDetails}
            multiline
            style={styles.input}
            placeholder="Explain what happened, who was involved, and any timing details."
            placeholderTextColor="#95a0bb"
          />

          <Pressable style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
            <Text style={styles.primaryBtnText}>{saving ? "Submitting..." : "Submit report"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  content: { padding: 16, paddingBottom: 36 },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 16, gap: 12 },
  title: { color: "#0e2756", fontSize: 22, fontWeight: "900" },
  sub: { color: "#5f6b85", fontWeight: "600", lineHeight: 20 },
  metaBox: { borderRadius: 14, backgroundColor: "#f4f7ff", borderWidth: 1, borderColor: "#e1e7f6", padding: 12, gap: 4 },
  metaText: { color: "#0e2756", fontWeight: "700", fontSize: 12 },
  label: { color: "#5f6b85", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: "#d6def2", backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 8 },
  chipActive: { backgroundColor: "#0e2756", borderColor: "#0e2756" },
  chipText: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  input: {
    minHeight: 150,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d6def2",
    backgroundColor: "#fbfcff",
    padding: 12,
    color: "#0e2756",
    textAlignVertical: "top",
    fontWeight: "600",
  },
  primaryBtn: { borderRadius: 16, backgroundColor: "#ff0f64", paddingVertical: 14, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
});
