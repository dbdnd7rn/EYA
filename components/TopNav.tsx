import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../providers/AuthProvider";

export default function TopNav({
  title = "Pa-Level",
  showBack,
}: {
  title?: string;
  showBack?: boolean;
}) {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    if (signingOut) return;

    Alert.alert("Sign out", "Log out of your account?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          try {
            setSigningOut(true);
            await signOut();
          } finally {
            setSigningOut(false);
            router.replace("/(auth)/login");
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.inner}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {showBack ? (
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backTxt}>{"<"}</Text>
            </Pressable>
          ) : null}

          <Text style={styles.title}>{title}</Text>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {!user ? (
            <>
              <Pressable onPress={() => router.push("/(auth)/login")} style={styles.pillSoft}>
                <Text style={styles.pillSoftTxt}>Login</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/(auth)/signup")} style={styles.pillPink}>
                <Text style={styles.pillPinkTxt}>Sign up</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={handleSignOut}
              disabled={signingOut}
              style={[styles.pillSoft, { borderColor: "#ffd4e3", backgroundColor: "#fff0f6" }]}
            >
              <Text style={[styles.pillSoftTxt, { color: "#b0003a" }]}>{signingOut ? "Signing out..." : "Sign out"}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#f6f7fb",
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  inner: {
    backgroundColor: "white",
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#e7eaf6",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "#f6f7fb",
    borderWidth: 1,
    borderColor: "#e1e4ef",
    alignItems: "center",
    justifyContent: "center",
  },
  backTxt: { fontSize: 16, color: "#0e2756", fontWeight: "800" },
  title: { fontSize: 16, fontWeight: "900", color: "#0e2756" },

  pillSoft: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#f6f7fb",
    borderWidth: 1,
    borderColor: "#e1e4ef",
  },
  pillSoftTxt: { fontSize: 13, fontWeight: "800", color: "#0e2756" },

  pillPink: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "#ff0f64",
  },
  pillPinkTxt: { fontSize: 13, fontWeight: "900", color: "white" },
});
