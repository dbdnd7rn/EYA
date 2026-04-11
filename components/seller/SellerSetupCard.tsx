import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";

export default function SellerSetupCard({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { signOut } = useAuth();

  return (
    <View style={[styles.card, compact && styles.compactCard]}>
      <Text style={styles.title}>Finish shop setup</Text>
      <Text style={styles.sub}>
        Your seller account is active, but you still need to create your shop profile before adding products, receiving orders, and chatting with customers.
      </Text>
      <View style={styles.actions}>
        <Pressable style={styles.btn} onPress={() => router.push("/(market)/setup")}>
          <Text style={styles.btnText}>Open seller setup</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryBtn}
          onPress={async () => {
            await signOut();
            router.replace("/(auth)/login");
          }}
        >
          <Text style={styles.secondaryBtnText}>Logout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 18,
    gap: 8,
  },
  compactCard: { marginTop: 6 },
  title: { color: "#102a54", fontSize: 20, fontWeight: "900" },
  sub: { color: "#7a87a5", fontSize: 13, fontWeight: "700", lineHeight: 20 },
  actions: { marginTop: 8, flexDirection: "row", gap: 10, flexWrap: "wrap" },
  btn: { marginTop: 8, alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#102a54", paddingHorizontal: 16, paddingVertical: 12 },
  btnText: { color: "#fff", fontWeight: "900" },
  secondaryBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#eef2fb",
    borderWidth: 1,
    borderColor: "#dfe7f8",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryBtnText: { color: "#102a54", fontWeight: "900" },
});
