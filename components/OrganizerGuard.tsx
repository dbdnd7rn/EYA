import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { getMyTicketOrganizerAccess } from "@/lib/ticketOrganizerAccess";
import { isTemporaryOrganizerUser } from "@/lib/temporaryOrganizerIdentity";

const CHECK_TIMEOUT_MS = 7000;

async function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Ticket Management access check timed out.")), ms)),
  ]);
}

export default function OrganizerGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [checking, setChecking] = React.useState(true);
  const [allowed, setAllowed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;

    const deny = async () => {
      if (!alive) return;
      setAllowed(false);
      if (isTemporaryOrganizerUser(user)) {
        await signOut().catch(() => undefined);
        if (alive) router.replace("/organizer-access-ended" as any);
        return;
      }
      router.replace("/(student)/workspaces" as any);
    };

    const run = async () => {
      if (loading) return;
      if (!user) {
        router.replace("/(auth)/login" as any);
        return;
      }

      try {
        setChecking(true);
        setAllowed(false);
        const access = await withTimeout(getMyTicketOrganizerAccess(), CHECK_TIMEOUT_MS);
        if (!alive) return;
        if (!access) {
          await deny();
          return;
        }
        setAllowed(true);
      } catch {
        await deny();
      } finally {
        if (alive) setChecking(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [loading, router, signOut, user]);

  if (loading || checking || !allowed) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#5e73dd" />
        <Text style={styles.text}>Checking Ticket Management access...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f7fc", padding: 24 },
  text: { marginTop: 10, color: "#6e7892", fontSize: 13, fontWeight: "800" },
});
