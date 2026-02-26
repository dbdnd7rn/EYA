import React from "react";
import { Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

export default function PricingPage() {
  return (
    <PublicPageShell title="Pricing">
      <View style={{ gap: 10 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14, lineHeight: 21 }}>
          This page explains landlord subscription tiers and platform pricing details.
        </Text>
        <Text style={{ color: "#5f6b85", fontSize: 14, lineHeight: 21 }}>
          Upcoming: Basic, Silver, Gold, and Platinum plans, verification fees, and feature comparison.
        </Text>
      </View>
    </PublicPageShell>
  );
}
