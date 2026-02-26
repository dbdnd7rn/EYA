import React from "react";
import { Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

export default function SafetyPage() {
  return (
    <PublicPageShell title="Safety on Pa-Level">
      <View style={{ gap: 10 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14, lineHeight: 21 }}>
          Safety tips for students and landlords:
        </Text>
        <Text style={{ color: "#5f6b85", fontSize: 14, lineHeight: 22 }}>
          • Visit a property before paying.{"\n"}
          • Never send money for unverified details.{"\n"}
          • Use in-app reporting for suspicious listings.{"\n"}
          • Keep communication records where possible.
        </Text>
      </View>
    </PublicPageShell>
  );
}
