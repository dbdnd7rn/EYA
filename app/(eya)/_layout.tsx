import { Stack } from "expo-router";
import StudentGuard from "@/components/StudentGuard";
import { StudentThemeProvider } from "@/providers/StudentThemeProvider";

export default function StudentLayout() {
  return (
    <StudentGuard>
      <StudentThemeProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </StudentThemeProvider>
    </StudentGuard>
  );
}
