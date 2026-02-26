import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

export default function PayCancelPage() {
  const params = useLocalSearchParams<{ tx_ref?: string; reference?: string; status?: string }>();
  const router = useRouter();
  const txRef = params.tx_ref || params.reference || null;

  return (
    <PublicPageShell title="Payment Cancelled">
      <View style={{ gap: 10 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14 }}>
          {params.status ? `Payment status: ${String(params.status)}` : "Payment was not completed."}
        </Text>
        {txRef ? <Text style={{ color: "#0e2756", fontSize: 13 }}>Tx Ref: {String(txRef)}</Text> : null}

        <View style={{ borderRadius: 14, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd4e3", padding: 12 }}>
          <Text style={{ color: "#b0003a", fontWeight: "700" }}>Payment cancelled or failed.</Text>
        </View>

        <Pressable onPress={() => router.push("/(landlord)/subscription")} style={{ borderRadius: 14, backgroundColor: "#0e2756", paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>Back to subscription</Text>
        </Pressable>
      </View>
    </PublicPageShell>
  );
}
