import React from "react";
import { Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

export default function TermsPage() {
  return (
    <PublicPageShell title="Terms & Conditions">
      <View style={{ gap: 12 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14 }}>
          By using Pa-Level, you agree to these terms. The platform helps students discover accommodation and contact landlords.
        </Text>

        <View style={{ borderRadius: 20, backgroundColor: "#fff", padding: 14, borderWidth: 1, borderColor: "#e8ebf5" }}>
          <Text style={{ color: "#0e2756", fontSize: 15, fontWeight: "900" }}>Important notes</Text>
          <Text style={{ marginTop: 8, color: "#5f6b85", fontSize: 14, lineHeight: 22 }}>
            • Pa-Level does not process rent payments.{"\n"}
            • Landlords are responsible for the accuracy of listings.{"\n"}
            • Students must verify details before paying.{"\n"}
            • Report suspicious listings for review.
          </Text>
        </View>
      </View>
    </PublicPageShell>
  );
}
