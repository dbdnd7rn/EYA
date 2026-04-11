import React from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import TopNav from "@/components/TopNav";

export default function SubscriptionScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.root}>
      <TopNav title="Access" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>EYA is free for all landlords</Text>
          <Text style={styles.sub}>You can now create, edit, and manage listings without subscription restrictions.</Text>
          <Pressable style={styles.btn} onPress={() => router.push("/(landlord)/(tabs)/create")}>
            <Text style={styles.btnText}>Create listing</Text>
          </Pressable>
          <Pressable style={styles.softBtn} onPress={() => router.push("/(landlord)/(tabs)/dashboard")}>
            <Text style={styles.softBtnText}>Back to dashboard</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  content: { padding: 16, paddingBottom: 30 },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 16, gap: 12 },
  title: { color: "#0e2756", fontWeight: "900", fontSize: 22 },
  sub: { color: "#5f6b85", fontWeight: "700", lineHeight: 20 },
  btn: { backgroundColor: "#ff0f64", borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "900" },
  softBtn: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#e1e4ef" },
  softBtnText: { color: "#0e2756", fontWeight: "900" },
});



