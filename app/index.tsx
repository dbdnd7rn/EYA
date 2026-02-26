import React from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import HomeHowItWorksSection from "@/components/HomeHowItWorksSection";
import PublicFooter from "@/components/PublicFooter";

export default function IndexPage() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f7fb" }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: "#f6f7fb" }}
        contentContainerStyle={{ paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: "100%", maxWidth: 1120, alignSelf: "center", paddingHorizontal: 24, paddingTop: 30 }}>
          <Pressable onPress={() => router.push("/")} style={{ alignSelf: "flex-start" }}>
            <Text style={{ fontSize: 30, fontWeight: "900", letterSpacing: -0.4 }}>
              <Text style={{ color: "#0e2756" }}>pa</Text>
              <Text style={{ color: "#ff0f64" }}>level</Text>
            </Text>
          </Pressable>
        </View>

        <View style={{ width: "100%", maxWidth: 1120, alignSelf: "center", paddingHorizontal: 24, paddingTop: 20 }}>
          <View
            style={{
              borderRadius: 40,
              paddingHorizontal: 24,
              paddingVertical: 40,
              backgroundColor: "#d9efff",
              overflow: "hidden",
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 12 },
              elevation: 5,
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -80,
                left: -80,
                right: -80,
                height: 220,
                backgroundColor: "#c3e5ff",
                borderBottomLeftRadius: 220,
                borderBottomRightRadius: 220,
              }}
            />

            <Text
              style={{
                position: "relative",
                textAlign: "center",
                color: "#0e2756",
                fontSize: 36,
                fontWeight: "900",
                lineHeight: 42,
              }}
            >
              Student Accommodation in Malawi
            </Text>

            <Text
              style={{
                marginTop: 12,
                textAlign: "center",
                alignSelf: "center",
                maxWidth: 860,
                color: "#5f6b85",
                fontSize: 15,
                lineHeight: 22,
                position: "relative",
              }}
            >
              Search hostels, apartments and bedsitters near campus, message landlords, save rooms you like and book your
              next accommodation with ease. PaLevel is the #1 platform for students in Malawi to find their perfect home
              away from home.
            </Text>

            <View
              style={{
                marginTop: 28,
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 12,
                position: "relative",
              }}
            >
              <Pressable
                onPress={() => router.push("/(auth)/login")}
                style={{
                  backgroundColor: "#0e2756",
                  borderRadius: 999,
                  paddingHorizontal: 24,
                  paddingVertical: 13,
                  shadowColor: "#0e2756",
                  shadowOpacity: 0.25,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 4,
                }}
              >
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "900" }}>Login</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push({ pathname: "/(auth)/signup", params: { role: "student" } })}
                style={{
                  backgroundColor: "#ff0f64",
                  borderRadius: 999,
                  paddingHorizontal: 24,
                  paddingVertical: 13,
                  shadowColor: "#ff0f64",
                  shadowOpacity: 0.28,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 4,
                }}
              >
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "900" }}>Sign up (Student)</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push({ pathname: "/(auth)/signup", params: { role: "landlord" } })}
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 999,
                  paddingHorizontal: 24,
                  paddingVertical: 13,
                  shadowColor: "#000",
                  shadowOpacity: 0.09,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 3,
                }}
              >
                <Text style={{ color: "#0e2756", fontSize: 14, fontWeight: "900" }}>Sign up (Landlord)</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <HomeHowItWorksSection />
        <PublicFooter />
      </ScrollView>
    </SafeAreaView>
  );
}
