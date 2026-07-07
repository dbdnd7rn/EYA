import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import StudentGuard from "@/components/StudentGuard";
import { PreferredLocationProvider } from "@/providers/PreferredLocationProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

function StudentStack() {
  const { mode } = useStudentTheme();

  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          freezeOnBlur: false,
        }}
      />
    </>
  );
}

export default function StudentLayout() {
  return (
    <StudentGuard>
      <PreferredLocationProvider>
        <StudentStack />
      </PreferredLocationProvider>
    </StudentGuard>
  );
}
