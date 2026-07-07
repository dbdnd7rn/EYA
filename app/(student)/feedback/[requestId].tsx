import React, { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, ChevronLeft, Star } from "lucide-react-native";
import { getMarketRequestById, submitStudentPickupFeedback, type MarketInterestRequest } from "@/lib/marketInterest";

const quickTags = ["Friendly", "Easy meetup", "Good item", "Great deal"];

export default function StudentFeedbackPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string }>();
  const [request, setRequest] = useState<MarketInterestRequest | null>(null);
  const [rating, setRating] = useState(5);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!params.requestId) return;
      const next = await getMarketRequestById(params.requestId);
      if (active) setRequest(next);
    };
    void run();
    return () => {
      active = false;
    };
  }, [params.requestId]);

  if (!request) {
    return <SafeAreaView style={styles.root}><View style={styles.center}><Text style={styles.title}>Feedback</Text></View></SafeAreaView>;
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.iconBtn} onPress={() => router.replace("/(student)/requests")}>
            <ChevronLeft size={22} color="#102a54" />
          </Pressable>
          <View style={styles.successCard}>
            <CheckCircle2 size={48} color="#7cb6ff" />
            <Text style={styles.successTitle}>Your feedback was submitted!</Text>
            <Text style={styles.successSub}>Thanks for your feedback. It helps sellers in our community.</Text>
            <View style={styles.reviewCard}>
              <Image source={{ uri: request.image }} style={styles.image} />
              <View style={styles.meta}>
                <Text style={styles.itemName}>{request.itemName}</Text>
                <Text style={styles.vendor}>{request.vendorName}</Text>
                <Text style={styles.noteText}>{note || "Great meetup, fast and friendly."}</Text>
              </View>
            </View>
            <Pressable style={styles.primaryBtn} onPress={() => router.replace("/(student)/requests")}>
              <Text style={styles.primaryText}>Back to My Requests</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={22} color="#102a54" />
          </Pressable>
          <Text style={styles.title}>Feedback</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.card}>
          <View style={styles.summary}>
            <Image source={{ uri: request.image }} style={styles.image} />
            <View style={styles.meta}>
              <Text style={styles.itemName}>{request.itemName}</Text>
              <Text style={styles.vendor}>{request.vendorName}</Text>
              <Text style={styles.sub}>Pickup completed today</Text>
            </View>
          </View>
          <Text style={styles.question}>How was your experience?</Text>
          <Text style={styles.sub}>Leave feedback for {request.vendorName} and share your experience.</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable key={value} onPress={() => setRating(value)}>
                <Star size={28} color="#f0bb3f" fill={value <= rating ? "#f0bb3f" : "transparent"} />
              </Pressable>
            ))}
          </View>
          <TextInput value={note} onChangeText={setNote} placeholder="Write your feedback here..." placeholderTextColor="#98a3bd" multiline textAlignVertical="top" style={styles.textArea} maxLength={300} />
          <View style={styles.tagRow}>
            {quickTags.map((tag) => {
              const active = tags.includes(tag);
              return (
                <Pressable key={tag} style={[styles.tag, active && styles.tagActive]} onPress={() => setTags((current) => active ? current.filter((x) => x !== tag) : [...current, tag])}>
                  <Text style={[styles.tagText, active && styles.tagTextActive]}>{tag}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={styles.primaryBtn}
            onPress={async () => {
              await submitStudentPickupFeedback(request.id, {
                rating,
                note,
                tags,
                submittedAt: new Date().toISOString(),
              });
              setSubmitted(true);
            }}
          >
            <Text style={styles.primaryText}>Submit feedback</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  content: { padding: 18, paddingBottom: 40, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e7ebf6", alignItems: "center", justifyContent: "center" },
  title: { color: "#102a54", fontWeight: "900", fontSize: 24 },
  card: { borderRadius: 26, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e7ebf6", padding: 16, gap: 14 },
  summary: { flexDirection: "row", gap: 12 },
  image: { width: 100, height: 100, borderRadius: 20, backgroundColor: "#dde5f4" },
  meta: { flex: 1, gap: 4 },
  itemName: { color: "#102a54", fontSize: 20, fontWeight: "900" },
  vendor: { color: "#4f6786", fontSize: 15, fontWeight: "800" },
  sub: { color: "#7a88a4", fontSize: 13, fontWeight: "700" },
  question: { color: "#102a54", fontSize: 18, fontWeight: "900" },
  starRow: { flexDirection: "row", gap: 8 },
  textArea: { minHeight: 140, borderRadius: 20, borderWidth: 1, borderColor: "#e7ebf6", backgroundColor: "#fafbff", padding: 16, color: "#102a54", fontWeight: "700" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tag: { borderRadius: 999, borderWidth: 1, borderColor: "#e3e8f5", backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 10 },
  tagActive: { backgroundColor: "#edf3ff", borderColor: "#cfe0ff" },
  tagText: { color: "#60708f", fontWeight: "800", fontSize: 13 },
  tagTextActive: { color: "#102a54" },
  primaryBtn: { borderRadius: 999, backgroundColor: "#102a54", paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  successCard: { borderRadius: 28, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e7ebf6", padding: 18, gap: 16, alignItems: "center" },
  successTitle: { color: "#102a54", fontWeight: "900", fontSize: 28, textAlign: "center" },
  successSub: { color: "#6f7f9c", fontWeight: "700", fontSize: 14, textAlign: "center", lineHeight: 21 },
  reviewCard: { width: "100%", borderRadius: 22, backgroundColor: "#f9fbff", borderWidth: 1, borderColor: "#e7ebf6", padding: 14, flexDirection: "row", gap: 12 },
  noteText: { color: "#445f7d", fontWeight: "700", fontSize: 14, lineHeight: 21 },
});
