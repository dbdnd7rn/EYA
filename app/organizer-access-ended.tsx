import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Clock3, LogIn } from "lucide-react-native";

export default function OrganizerAccessEndedScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.card}>
        <View style={styles.icon}><Clock3 size={34} color="#a35b00" /></View>
        <Text style={styles.kicker}>EYA ORGANIZER</Text>
        <Text style={styles.title}>Organizer access is not active</Text>
        <Text style={styles.text}>This temporary Organizer Workspace has expired, was revoked, or could not be verified. Contact EYA Admin if the event still needs organizer access.</Text>
        <Pressable style={styles.btn} onPress={() => router.replace("/organizer-login" as any)}><LogIn size={17} color="#fff" /><Text style={styles.btnText}>Organizer Login</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f7fc", padding: 22, justifyContent: "center" },
  card: { backgroundColor: "#fff", borderRadius: 28, borderWidth: 1, borderColor: "#e4e8f2", padding: 26, alignItems: "center", gap: 11 },
  icon: { width: 78, height: 78, borderRadius: 39, backgroundColor: "#fff4df", alignItems: "center", justifyContent: "center" },
  kicker: { color: "#a35b00", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  title: { color: "#102a54", fontSize: 24, lineHeight: 29, fontWeight: "900", textAlign: "center" },
  text: { color: "#6e7892", fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center" },
  btn: { marginTop: 6, minHeight: 50, borderRadius: 25, paddingHorizontal: 20, backgroundColor: "#102a54", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  btnText: { color: "#fff", fontSize: 13, fontWeight: "900" },
});
