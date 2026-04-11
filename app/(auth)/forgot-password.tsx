import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import PublicFooter from "@/components/PublicFooter";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: "pamaketi://auth/callback?type=recovery",
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSent(true);
  }

  const inputBase =
    "w-full rounded-2xl border border-[#d9deef] bg-white px-4 py-3 text-sm text-[#0e2756]";

  return (
    <SafeAreaView className="flex-1 bg-[#f6f7fb]">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="flex-1 items-center justify-center px-6 py-12">
            <View className="w-full max-w-xl rounded-[40px] bg-white px-8 py-10 shadow-xl">
              <Text className="text-xs font-extrabold uppercase tracking-[6px] text-[#ff0f64]">RESET PASSWORD</Text>

              <Text className="mt-3 text-4xl font-extrabold leading-tight text-[#0e2756]">Forgot your password?</Text>

              <Text className="mt-2 text-sm text-[#5f6b85]">Enter your email and we'll send you a reset link.</Text>

              <View className="mt-7 gap-5">
                {error ? (
                  <View className="rounded-2xl border border-[#ffd4e3] bg-[#fff0f6] px-4 py-3">
                    <Text className="text-sm font-semibold text-[#b0003a]">{error}</Text>
                  </View>
                ) : null}

                {sent ? (
                  <View className="rounded-2xl border border-[#c8f2df] bg-[#ecfdf5] px-4 py-4">
                    <Text className="text-sm font-semibold text-[#027a48]">Reset link sent. Check your email.</Text>
                  </View>
                ) : (
                  <>
                    <View>
                      <Text className="mb-2 text-sm font-semibold text-[#0e2756]">Email address</Text>
                      <TextInput
                        className={inputBase}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        placeholder="you@example.com"
                        placeholderTextColor="#9ba3c4"
                        value={email}
                        onChangeText={setEmail}
                      />
                    </View>

                    <Pressable
                      disabled={loading}
                      onPress={handleSubmit}
                      className="mt-2 rounded-full bg-[#ff0f64] px-6 py-4 shadow-lg"
                      style={{ opacity: loading ? 0.7 : 1 }}
                    >
                      <Text className="text-center text-base font-extrabold text-white">
                        {loading ? "Sending link..." : "Send reset link"}
                      </Text>
                    </Pressable>
                  </>
                )}

                <Text className="mt-8 text-center text-sm text-[#5f6b85]">
                  Remembered your password?{" "}
                  <Text className="font-extrabold text-[#ff0f64]" onPress={() => router.push("/(auth)/login")}>
                    Back to login
                  </Text>
                </Text>
              </View>
            </View>
          </View>

          <PublicFooter />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

