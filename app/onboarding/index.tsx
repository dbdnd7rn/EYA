/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import PublicFooter from "@/components/PublicFooter";

type Role = "landlord" | "student";

export default function OnboardingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | "">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/(auth)/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, onboarded")
        .eq("id", data.user.id)
        .maybeSingle();

      if ((profile as any)?.onboarded) {
        if ((profile as any)?.role === "landlord") router.replace("/(landlord)/(tabs)/dashboard");
        else router.replace("/(student)/(tabs)/rooms");
        return;
      }

      setLoading(false);
    })();
  }, []);

  const completeOnboarding = async () => {
    setError(null);
    if (!role) return setError("Please select a role");

    const { data } = await supabase.auth.getUser();
    if (!data.user) return;

    const { error } = await supabase.from("profiles").update({ role, onboarded: true }).eq("id", data.user.id);

    if (error) return setError(error.message);

    if (role === "landlord") router.replace("/(landlord)/(tabs)/dashboard");
    else router.replace("/(student)/(tabs)/rooms");
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-[#f6f7fb]">
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <ActivityIndicator size="large" color="#ff0f64" />
          <Text className="text-sm font-semibold text-[#5f6b85]">Loading onboarding...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f6f7fb]">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="flex-1 items-center justify-center px-6 py-12">
          <View className="w-full max-w-md rounded-[32px] bg-white p-6 shadow-xl">
            <Text className="text-xs font-extrabold uppercase tracking-[6px] text-[#ff0f64]">ONBOARDING</Text>

            <Text className="mt-3 text-3xl font-extrabold leading-tight text-[#0e2756]">Welcome to Pa-Level</Text>

            <Text className="mt-2 text-sm text-[#5f6b85]">Tell us how you'll use the platform.</Text>

            {error ? (
              <View className="mt-5 rounded-2xl border border-[#ffd4e3] bg-[#fff0f6] px-4 py-3">
                <Text className="text-sm font-semibold text-[#b0003a]">{error}</Text>
              </View>
            ) : null}

            <View className="mt-6 gap-3">
              <Pressable
                className={`rounded-2xl px-4 py-4 ${role === "student" ? "bg-[#ff0f64]" : "bg-[#f6f7fb]"}`}
                onPress={() => setRole("student")}
              >
                <Text className={`text-center text-sm font-extrabold ${role === "student" ? "text-white" : "text-[#0e2756]"}`}>
                  I'm a Student
                </Text>
              </Pressable>

              <Pressable
                className={`rounded-2xl px-4 py-4 ${role === "landlord" ? "bg-[#ff0f64]" : "bg-[#f6f7fb]"}`}
                onPress={() => setRole("landlord")}
              >
                <Text className={`text-center text-sm font-extrabold ${role === "landlord" ? "text-white" : "text-[#0e2756]"}`}>
                  I'm a Landlord
                </Text>
              </Pressable>
            </View>

            <Pressable onPress={completeOnboarding} className="mt-6 rounded-2xl bg-[#0e2756] px-4 py-4">
              <Text className="text-center text-sm font-extrabold text-white">Continue</Text>
            </Pressable>
          </View>
        </View>

        <PublicFooter />
      </ScrollView>
    </SafeAreaView>
  );
}
