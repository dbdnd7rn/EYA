import React from "react";
import { useRouter } from "expo-router";
import MarketPaymentsComingSoonScreen from "@/components/market/MarketPaymentsComingSoonScreen";

export default function SellerPaymentsPage() {
  const router = useRouter();

  return (
    <MarketPaymentsComingSoonScreen
      audience="seller"
      primaryAction={{
        label: "Back to dashboard",
        onPress: () => router.replace("/(market)/(tabs)/dashboard"),
      }}
      secondaryAction={{
        label: "Manage listings",
        onPress: () => router.push("/(market)/(tabs)/products"),
      }}
    />
  );
}
