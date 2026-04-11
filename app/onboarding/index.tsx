/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { listMyVendors, createVendor } from "@/lib/newApp/vendors";
import PublicFooter from "@/components/PublicFooter";
import { normalizeAppRole } from "@/lib/roleRouting";
import { ENV } from "@/lib/env";
import { getDevAuthRecord, setDevAuthRecord } from "@/lib/devAuth";
import { useAuth } from "@/providers/AuthProvider";

type Role = "landlord" | "student" | "agent" | "vendor";

async function ensureSellerVendor(ownerId: string, name: string) {
  const existing = await listMyVendors(ownerId);
  const current = existing.find((row) => row.supports_market) ?? existing[0] ?? null;
  if (current) return current;

  try {
    return await createVendor(ownerId, {
      name: name || "Seller Shop",
      description: "Campus seller storefront",
      supports_market: true,
      supports_food: false,
    });
  } catch {
    const retry = await listMyVendors(ownerId);
    const resolved = retry.find((row) => row.supports_market) ?? retry[0] ?? null;
    if (resolved) return resolved;
    throw new Error("Could not create or load seller shop. Please retry.");
  }
}

export default function OnboardingPage() {
  const router = useRouter();
  const { role: authRole, refreshRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | "">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (ENV.DEV_AUTH_MODE) {
        const record = await getDevAuthRecord();
        if (!record) {
          router.replace("/(auth)/login");
          return;
        }

        const normalized = normalizeAppRole(record.role ?? authRole);
        if (normalized === "landlord") router.replace("/(landlord)/(tabs)/dashboard");
        else if (normalized === "vendor") router.replace("/(market)/(tabs)/dashboard");
        else if (normalized === "agent") router.replace("/(agent)/(tabs)/dashboard");
        else if (normalized === "student") router.replace("/(student)/(tabs)/home");
        else setLoading(false);
        return;
      }

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
        const role = normalizeAppRole((profile as any)?.role);
        if (role === "landlord") router.replace("/(landlord)/(tabs)/dashboard");
        else if (role === "vendor") router.replace("/(market)/(tabs)/dashboard");
        else if (role === "agent") router.replace("/(agent)/(tabs)/dashboard");
        else router.replace("/(student)/(tabs)/home");
        return;
      }

      setLoading(false);
    })();
  }, []);

  const completeOnboarding = async () => {
    setError(null);
    if (!role) return setError("Please select a role");

    if (ENV.DEV_AUTH_MODE) {
      const record = await getDevAuthRecord();
      if (!record) {
        router.replace("/(auth)/login");
        return;
      }
      await setDevAuthRecord({ email: record.email, role });
      await refreshRole(record.id);
      if (role === "landlord") router.replace("/(landlord)/(tabs)/dashboard");
      else if (role === "vendor") router.replace("/(market)/(tabs)/dashboard");
      else if (role === "agent") router.replace("/(agent)/(tabs)/dashboard");
      else router.replace("/(student)/(tabs)/home");
      return;
    }

    const { data } = await supabase.auth.getUser();
    if (!data.user) return;

    const { error } = await supabase.from("profiles").update({ role, onboarded: true }).eq("id", data.user.id);

    if (error) return setError(error.message);

    if (role === "vendor") {
      try {
        const sellerName =
          (data.user.user_metadata?.full_name as string | undefined) ||
          [data.user.user_metadata?.first_name, data.user.user_metadata?.last_name].filter(Boolean).join(" ").trim() ||
          data.user.email ||
          "Seller Shop";
        await ensureSellerVendor(data.user.id, sellerName);
      } catch (vendorError: any) {
        console.warn("Seller shop setup deferred during onboarding:", vendorError?.message ?? vendorError);
      }
    }

    if (role === "landlord") router.replace("/(landlord)/(tabs)/dashboard");
    else if (role === "vendor") router.replace("/(market)/(tabs)/dashboard");
    else if (role === "agent") router.replace("/(agent)/(tabs)/dashboard");
    else router.replace("/(student)/(tabs)/home");
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

            <Text className="mt-3 text-3xl font-extrabold leading-tight text-[#0e2756]">Welcome to EYA</Text>

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

              <Pressable
                className={`rounded-2xl px-4 py-4 ${role === "vendor" ? "bg-[#ff0f64]" : "bg-[#f6f7fb]"}`}
                onPress={() => setRole("vendor")}
              >
                <Text className={`text-center text-sm font-extrabold ${role === "vendor" ? "text-white" : "text-[#0e2756]"}`}>
                  I'm a Seller
                </Text>
              </Pressable>

              <Pressable
                className={`rounded-2xl px-4 py-4 ${role === "agent" ? "bg-[#ff0f64]" : "bg-[#f6f7fb]"}`}
                onPress={() => setRole("agent")}
              >
                <Text className={`text-center text-sm font-extrabold ${role === "agent" ? "text-white" : "text-[#0e2756]"}`}>
                  I'm an Agent / Rider
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



