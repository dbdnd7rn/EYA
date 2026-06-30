import { Stack } from "expo-router";
import StudentGuard from "@/components/StudentGuard";

export default function StudentLayout() {
  return (
    <StudentGuard>
      <Stack screenOptions={{ headerShown: false }} />
    </StudentGuard>
  );
}
