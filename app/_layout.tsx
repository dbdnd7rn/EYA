import "../global.css";
import { installRuntimeDiagnostics } from "@/lib/runtimeDiagnostics";
import React from "react";
import { Stack } from "expo-router";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../providers/AuthProvider";
import { NetworkProvider } from "@/providers/NetworkProvider";
import SavedRoomsQueueSyncProvider from "@/providers/SavedRoomsQueueSyncProvider";
import MutationOutboxSyncProvider from "@/providers/MutationOutboxSyncProvider";
import { NotificationInboxProvider } from "@/providers/NotificationInboxProvider";
import EyaLaunchAnimation from "@/components/EyaLaunchAnimation";
import AppRuntimeProvider from "@/providers/AppRuntimeProvider";
import { StudentThemeProvider, useStudentTheme } from "@/providers/StudentThemeProvider";

installRuntimeDiagnostics();

type ComponentWithDefaults = {
  defaultProps?: Record<string, unknown>;
};

const scrollViewDefaults = ScrollView as unknown as ComponentWithDefaults;
scrollViewDefaults.defaultProps = {
  ...scrollViewDefaults.defaultProps,
  automaticallyAdjustKeyboardInsets: true,
  keyboardShouldPersistTaps: "handled",
};

const textInputDefaults = TextInput as unknown as ComponentWithDefaults;
textInputDefaults.defaultProps = {
  ...textInputDefaults.defaultProps,
  cursorColor: "#1e40af",
  placeholderTextColor: "#94a3b8",
  selectionColor: "#93c5fd",
};

export default function RootLayout() {
  const [showLaunchAnimation, setShowLaunchAnimation] = React.useState(true);

  const handleLaunchComplete = React.useCallback(() => {
    setShowLaunchAnimation(false);
  }, []);

  React.useEffect(() => {
    const fallback = setTimeout(() => {
      setShowLaunchAnimation(false);
    }, 3600);

    return () => clearTimeout(fallback);
  }, []);

  return (
    <SafeAreaProvider>
      <NetworkProvider>
        <AuthProvider>
          <StudentThemeProvider>
            <ThemedRuntime showLaunchAnimation={showLaunchAnimation} onLaunchComplete={handleLaunchComplete} />
          </StudentThemeProvider>
        </AuthProvider>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}

function ThemedRuntime({
  onLaunchComplete,
  showLaunchAnimation,
}: {
  onLaunchComplete: () => void;
  showLaunchAnimation: boolean;
}) {
  const { mode, theme } = useStudentTheme();

  return (
    <AppRuntimeProvider>
      <NotificationInboxProvider>
        <SavedRoomsQueueSyncProvider>
          <MutationOutboxSyncProvider>
            <View style={[styles.keyboardRoot, { backgroundColor: theme.background }]}>
              <StatusBar style={mode === "dark" ? "light" : "dark"} backgroundColor={theme.background} />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: theme.background },
                }}
              />
              {showLaunchAnimation ? (
                <EyaLaunchAnimation onComplete={onLaunchComplete} />
              ) : null}
            </View>
          </MutationOutboxSyncProvider>
        </SavedRoomsQueueSyncProvider>
      </NotificationInboxProvider>
    </AppRuntimeProvider>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
});
