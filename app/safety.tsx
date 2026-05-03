import React from "react";
import { Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

export default function SafetyPage() {
  return (
    <PublicPageShell title="Safety on EYA">
      <View style={{ gap: 10 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14, lineHeight: 21 }}>
          Safety tips for students, vendors, restaurants, and delivery riders:
        </Text>
        <Text style={{ color: "#5f6b85", fontSize: 14, lineHeight: 22 }}>
          - Confirm listing and seller location before payment.{"\n"}
          - For accommodation, visit the property before paying rent.{"\n"}
          - For products and food, verify order details and delivery fee in advance.{"\n"}
          - Use in-app reporting for suspicious listings or behavior.{"\n"}
          - Keep communication records for disputes or support follow-up.
        </Text>
      </View>
    </PublicPageShell>
  );
}



