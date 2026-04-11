import { Stack } from "expo-router";
import SellerGuard from "@/components/SellerGuard";

export default function MarketLayout() {
  return (
    <SellerGuard>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade_from_bottom",
          animationDuration: 220,
        }}
      />
    </SellerGuard>
  );
}
