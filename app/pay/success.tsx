import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

export default function PaySuccessPage() {
  const params = useLocalSearchParams<{ tx_ref?: string; reference?: string }>();
  const router = useRouter();
  const txRef = params.tx_ref || params.reference || null;

  return (
    <PublicPageShell title="Payment Status">
      <View style={{ gap: 10 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14 }}>Payment marked as successful.</Text>
        {txRef ? <Text style={{ color: "#0e2756", fontSize: 13 }}>Tx Ref: {String(txRef)}</Text> : null}

        <View style={{ borderRadius: 14, backgroundColor: "#f1fff7", borderWidth: 1, borderColor: "#d7f3e3", padding: 12 }}>
          <Text style={{ color: "#0a6b3d", fontWeight: "700" }}>Payment successful. You can continue.</Text>
        </View>

        <Pressable onPress={() => router.push("/(landlord)/subscription")} style={{ borderRadius: 14, backgroundColor: "#0e2756", paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>Back to subscription</Text>
        </Pressable>
      </View>
    </PublicPageShell>
  );
}
