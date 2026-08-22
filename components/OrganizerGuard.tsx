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
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Organizer access check timed out.")), ms)),
  ]);
}

export default function OrganizerGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      if (loading) return;
      if (!user) {
        router.replace("/organizer-login" as any);
        return;
      }
      if (!isTemporaryOrganizerUser(user)) {
        router.replace("/redirect");
        return;
      }

      try {
        setChecking(true);
        const access = await withTimeout(getMyTicketOrganizerAccess(), CHECK_TIMEOUT_MS);
        if (!alive) return;
        if (!access) {
          await signOut().catch(() => undefined);
          if (alive) router.replace("/organizer-access-ended" as any);
          return;
        }
      } catch {
        await signOut().catch(() => undefined);
        if (alive) router.replace("/organizer-access-ended" as any);
      } finally {
        if (alive) setChecking(false);
      }
    };
    void run();
    return () => { alive = false; };
  }, [loading, router, signOut, user]);

  if (loading || checking) {
    return <View style={styles.center}><ActivityIndicator color="#5e73dd" /><Text style={styles.text}>Checking Organizer access...</Text></View>;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f7fc", padding: 24 },
  text: { marginTop: 10, color: "#6e7892", fontSize: 13, fontWeight: "800" },
});
