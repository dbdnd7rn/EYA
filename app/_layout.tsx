import "../global.css";
import React from "react";
import { Stack } from "expo-router";
import { AuthProvider } from "../providers/AuthProvider";
import { NetworkProvider } from "@/providers/NetworkProvider";
import SavedRoomsQueueSyncProvider from "@/providers/SavedRoomsQueueSyncProvider";

export default function RootLayout() {
  return (
    <NetworkProvider>
      <AuthProvider>
        <SavedRoomsQueueSyncProvider>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          />
        </SavedRoomsQueueSyncProvider>
      </AuthProvider>
    </NetworkProvider>
  );
}
