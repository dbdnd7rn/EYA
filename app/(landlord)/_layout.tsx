import { Stack } from "expo-router";
import LandlordGuard from "@/components/LandlordGuard";

export default function LandlordLayout() {
  return (
    <LandlordGuard>
      <Stack screenOptions={{ headerShown: false, animation: "none", freezeOnBlur: false }} />
    </LandlordGuard>
  );
}
