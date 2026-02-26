import React from "react";
import { Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

export default function LandlordEditPage() {
  return (
    <PublicPageShell title="Edit Listing">
      <View>
        <Text style={{ color: "#5f6b85", fontSize: 14 }}>Use your listing detail screen to update listing information in-app.</Text>
      </View>
    </PublicPageShell>
  );
}
