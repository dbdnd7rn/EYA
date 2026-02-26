import React from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import PublicFooter from "@/components/PublicFooter";

export default function PublicPageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f7fb" }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ width: "100%", maxWidth: 1120, alignSelf: "center", paddingHorizontal: 24, paddingTop: 30 }}>
          <Text style={{ fontSize: 30, fontWeight: "900", color: "#0e2756" }}>{title}</Text>

          <View
            style={{
              marginTop: 16,
              borderRadius: 24,
              backgroundColor: "#fff",
              padding: 18,
              shadowColor: "#000",
              shadowOpacity: 0.06,
              shadowRadius: 15,
              shadowOffset: { width: 0, height: 10 },
              elevation: 3,
            }}
          >
            {children}
          </View>
        </View>

        <PublicFooter />
      </ScrollView>
    </SafeAreaView>
  );
}
