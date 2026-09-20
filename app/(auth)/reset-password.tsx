import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import PublicFooter from "@/components/PublicFooter";

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const inputBase =
    "w-full rounded-2xl border border-[#d9deef] bg-white px-4 py-3 text-sm text-[#0e2756]";

  async function handleReset() {
    setError(null);

    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) return setError(error.message);

    setSuccess(true);
    setTimeout(() => router.replace("/"), 1500);
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f6f7fb]">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="flex-1 items-center justify-center px-6 py-12">
            <View className="w-full max-w-xl rounded-[40px] bg-white px-8 py-10 shadow-xl">
              <Text className="text-xs font-extrabold uppercase tracking-[6px] text-[#ff0f64]">RESET PASSWORD</Text>

              <Text className="mt-3 text-4xl font-extrabold leading-tight text-[#0e2756]">Set a new password</Text>

              <Text className="mt-2 text-sm text-[#5f6b85]">Choose a strong password to secure your account.</Text>

              <View className="mt-7 gap-5">
                {error ? (
                  <View className="rounded-2xl border border-[#ffd4e3] bg-[#fff0f6] px-4 py-3">
                    <Text className="text-sm font-semibold text-[#b0003a]">{error}</Text>
                  </View>
                ) : null}

                {success ? (
                  <View className="rounded-2xl border border-[#c8f2df] bg-[#ecfdf5] px-4 py-4">
                    <Text className="text-sm font-semibold text-[#027a48]">Password updated successfully. Redirecting you now...</Text>
                  </View>
                ) : (
                  <>
                    <View>
                      <Text className="mb-2 text-sm font-semibold text-[#0e2756]">New password</Text>
                      <View className="relative">
                        <TextInput className={`${inputBase} pr-12`} secureTextEntry={!showPassword} value={password} onChangeText={setPassword} />
                        <Pressable
                          onPress={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2"
                        >
                          {showPassword ? <EyeOff size={18} color="#5f6b85" /> : <Eye size={18} color="#5f6b85" />}
                        </Pressable>
                      </View>
                    </View>

                    <View>
                      <Text className="mb-2 text-sm font-semibold text-[#0e2756]">Confirm password</Text>
                      <TextInput className={inputBase} secureTextEntry value={confirm} onChangeText={setConfirm} />
                    </View>

                    <Pressable
                      disabled={loading}
                      onPress={handleReset}
                      className="mt-2 rounded-full bg-[#ff0f64] px-6 py-4 shadow-lg"
                      style={{ opacity: loading ? 0.7 : 1 }}
                    >
                      <Text className="text-center text-base font-extrabold text-white">
                        {loading ? "Updating..." : "Update password"}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          </View>

          <PublicFooter />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
