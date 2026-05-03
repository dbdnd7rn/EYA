import "../global.css";
import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput } from "react-native";
import { AuthProvider } from "../providers/AuthProvider";
import { NetworkProvider } from "@/providers/NetworkProvider";
import SavedRoomsQueueSyncProvider from "@/providers/SavedRoomsQueueSyncProvider";
import MutationOutboxSyncProvider from "@/providers/MutationOutboxSyncProvider";
import { NotificationInboxProvider } from "@/providers/NotificationInboxProvider";
import EyaLaunchAnimation from "@/components/EyaLaunchAnimation";
import AppRuntimeProvider from "@/providers/AppRuntimeProvider";

const LAUNCH_ANIMATION_SEEN_KEY = "eya_launch_animation_seen_v1";

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
  const [showLaunchAnimation, setShowLaunchAnimation] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    const loadSeenState = async () => {
      const seen = await AsyncStorage.getItem(LAUNCH_ANIMATION_SEEN_KEY);
      if (active && !seen) setShowLaunchAnimation(true);
    };

    void loadSeenState();
    return () => {
      active = false;
    };
  }, []);

  const handleLaunchComplete = React.useCallback(() => {
    setShowLaunchAnimation(false);
    void AsyncStorage.setItem(LAUNCH_ANIMATION_SEEN_KEY, "1");
  }, []);

  return (
    <NetworkProvider>
      <AuthProvider>
        <AppRuntimeProvider>
          <NotificationInboxProvider>
            <SavedRoomsQueueSyncProvider>
              <MutationOutboxSyncProvider>
                <KeyboardAvoidingView
                  behavior={Platform.select({ ios: "padding", android: "height" })}
                  enabled={Platform.OS !== "web"}
                  keyboardVerticalOffset={0}
                  style={styles.keyboardRoot}
                >
                  <Stack
                    screenOptions={{
                      headerShown: false,
                    }}
                  />
                  {showLaunchAnimation ? (
                    <EyaLaunchAnimation onComplete={handleLaunchComplete} />
                  ) : null}
                </KeyboardAvoidingView>
              </MutationOutboxSyncProvider>
            </SavedRoomsQueueSyncProvider>
          </NotificationInboxProvider>
        </AppRuntimeProvider>
      </AuthProvider>
    </NetworkProvider>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
});
