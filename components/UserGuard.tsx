import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { isTemporaryOrganizerUser } from "@/lib/temporaryOrganizerIdentity";

/**
 * Guards EYA's normal customer/user experience.
 *
 * Every authenticated EYA account keeps access to the personal user area even
 * when the same person also has Landlord, Food Provider, Delivery Agent, or
 * Admin workspace permissions. Specialized workspaces enforce their own
 * authorization independently.
 *
 * Temporary organizer-only identities are still kept out until the organizer
 * invite flow is migrated to the normal-account workspace model.
 */
export default function UserGuard({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let alive = true;

    const run = () => {
      if (authLoading) return;

      if (!user) {
        router.replace("/(auth)/login");
        if (alive) {
          setAllowed(false);
          setChecking(false);
        }
        return;
      }

      // Compatibility only: these separate organizer identities are being
      // retired in favor of normal EYA accounts with workspace permission.
      if (isTemporaryOrganizerUser(user)) {
        router.replace("/(organizer)/dashboard" as any);
        if (alive) {
          setAllowed(false);
          setChecking(false);
        }
        return;
      }

      if (alive) {
        setAllowed(true);
        setChecking(false);
      }
    };

    setChecking(true);
    setAllowed(false);
    run();

    return () => {
      alive = false;
    };
  }, [authLoading, router, user]);

  if (authLoading || checking || !allowed) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Checking account...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f6f7fb",
    padding: 20,
  },
  muted: { marginTop: 10, color: "#5f6b85", fontWeight: "700" },
});
