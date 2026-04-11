import { Stack } from "expo-router";
import StudentGuard from "@/components/StudentGuard";
import { PreferredLocationProvider } from "@/providers/PreferredLocationProvider";

export default function StudentLayout() {
  return (
    <StudentGuard>
      <PreferredLocationProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "fade_from_bottom",
            animationDuration: 220,
          }}
        />
      </PreferredLocationProvider>
    </StudentGuard>
  );
}
