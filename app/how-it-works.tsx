import React from "react";
import { Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";
import HomeHowItWorksSection from "@/components/HomeHowItWorksSection";

export default function HowItWorksPage() {
  return (
    <PublicPageShell title="How it works">
      <View style={{ marginHorizontal: -18, marginTop: -12 }}>
        <HomeHowItWorksSection />
      </View>
      <Text style={{ marginTop: 10, color: "#5f6b85", fontSize: 13 }}>
        This flow is the same for website and app.
      </Text>
    </PublicPageShell>
  );
}
