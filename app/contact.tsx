import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

export default function ContactPage() {
  return (
    <PublicPageShell title="Contact us">
      <View style={{ gap: 12 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14 }}>Reach out to Pa-Level support and VAC Team.</Text>

        <Pressable onPress={() => Linking.openURL("mailto:hello.palevel@gmail.com")}>
          <Text style={{ color: "#0e2756", fontSize: 15, fontWeight: "700" }}>Email: hello.palevel@gmail.com</Text>
        </Pressable>

        <Pressable onPress={() => Linking.openURL("tel:+265996595135")}>
          <Text style={{ color: "#0e2756", fontSize: 15, fontWeight: "700" }}>Phone/WhatsApp: +265 996 59 51 35</Text>
        </Pressable>
      </View>
    </PublicPageShell>
  );
}
