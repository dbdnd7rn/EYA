import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import UserGuard from "@/components/UserGuard";
import { PreferredLocationProvider } from "@/providers/PreferredLocationProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

function UserStack() {
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

export default function UserLayout() {
  return (
    <UserGuard>
      <PreferredLocationProvider>
        <UserStack />
      </PreferredLocationProvider>
    </UserGuard>
  );
}
