import { Stack } from "expo-router";
import StudentGuard from "@/components/StudentGuard";
import { StudentThemeProvider } from "@/providers/StudentThemeProvider";

export default function FoodLayout() {
  return (
    <StudentGuard>
      <StudentThemeProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "fade_from_bottom",
            animationDuration: 220,
          }}
        />
      </StudentThemeProvider>
    </StudentGuard>
  );
}
