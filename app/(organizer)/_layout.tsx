import { Stack } from "expo-router";
import OrganizerGuard from "@/components/OrganizerGuard";

export default function OrganizerLayout() {
  return (
    <OrganizerGuard>
      <Stack screenOptions={{ headerShown: false, animation: "none", freezeOnBlur: false }} />
    </OrganizerGuard>
  );
}
