import { Stack } from "expo-router";
import StudentGuard from "@/components/StudentGuard";

export default function FoodLayout() {
  return (
    <StudentGuard>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          freezeOnBlur: false,
        }}
      />
    </StudentGuard>
  );
}
