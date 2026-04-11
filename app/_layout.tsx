import "../global.css";
import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import { AuthProvider } from "../providers/AuthProvider";
import { NetworkProvider } from "@/providers/NetworkProvider";
import SavedRoomsQueueSyncProvider from "@/providers/SavedRoomsQueueSyncProvider";
import MutationOutboxSyncProvider from "@/providers/MutationOutboxSyncProvider";
import { NotificationInboxProvider } from "@/providers/NotificationInboxProvider";
import PaLevelLaunchAnimation from "@/components/PaLevelLaunchAnimation";
import AppRuntimeProvider from "@/providers/AppRuntimeProvider";

const LAUNCH_ANIMATION_SEEN_KEY = "pamaketi_launch_animation_seen_v1";

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
                <>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                    }}
                  />
                  {showLaunchAnimation ? (
                    <PaLevelLaunchAnimation onComplete={handleLaunchComplete} />
                  ) : null}
                </>
              </MutationOutboxSyncProvider>
            </SavedRoomsQueueSyncProvider>
          </NotificationInboxProvider>
        </AppRuntimeProvider>
      </AuthProvider>
    </NetworkProvider>
  );
}
