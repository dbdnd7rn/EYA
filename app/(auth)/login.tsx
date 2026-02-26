import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import PublicFooter from "@/components/PublicFooter";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputBase =
    "w-full rounded-2xl border border-[#d9deef] bg-white px-4 py-3 text-sm text-[#0e2756]";

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      await new Promise((r) => setTimeout(r, 300));
      router.replace("/redirect");
    } catch {
      setError("Failed to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f6f7fb]">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="flex-1 items-center justify-center px-6 py-12">
            <View className="w-full max-w-xl rounded-[40px] bg-white px-8 py-9 shadow-xl">
              <Text className="text-xs font-extrabold uppercase tracking-[6px] text-[#ff0f64]">LOGIN</Text>

              <Text className="mt-3 text-4xl font-extrabold leading-tight text-[#0e2756]">Welcome back</Text>

              <Text className="mt-2 text-sm text-[#5f6b85]">Sign in to continue.</Text>

              <View className="mt-7 gap-5">
                <View>
                  <Text className="mb-2 text-sm font-semibold text-[#0e2756]">Email</Text>
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

                <View>
                  <Text className="mb-2 text-sm font-semibold text-[#0e2756]">Password</Text>
                  <View className="relative">
                    <TextInput
                      className={`${inputBase} pr-12`}
                      secureTextEntry={!showPassword}
                      placeholder="Your password"
                      placeholderTextColor="#9ba3c4"
                      value={password}
                      onChangeText={setPassword}
                    />
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2"
                    >
                      {showPassword ? <EyeOff size={18} color="#5f6b85" /> : <Eye size={18} color="#5f6b85" />}
                    </Pressable>
                  </View>
                </View>

                {error ? (
                  <View className="rounded-2xl border border-[#ffd4e3] bg-[#fff0f6] px-4 py-3">
                    <Text className="text-sm font-semibold text-[#b0003a]">{error}</Text>
                  </View>
                ) : null}

                <Pressable
                  disabled={loading}
                  onPress={handleSubmit}
                  className="mt-2 rounded-full bg-[#ff0f64] px-6 py-4 shadow-lg"
                  style={{ opacity: loading ? 0.7 : 1 }}
                >
                  <Text className="text-center text-base font-extrabold text-white">
                    {loading ? "Signing in..." : "Login"}
                  </Text>
                </Pressable>

                <View className="mt-2 items-end">
                  <Text className="text-sm text-blue-600" onPress={() => router.push("/(auth)/forgot-password")}>
                    Forgot password?
                  </Text>
                </View>

                <Text className="mt-6 text-center text-sm text-[#5f6b85]">
                  Don't have an account?{" "}
                  <Text className="font-extrabold text-[#ff0f64]" onPress={() => router.push("/(auth)/signup")}>
                    Sign up
                  </Text>
                </Text>

                <Text className="mt-6 text-center text-xs text-[#9ba3c4]">
                  <Text className="font-semibold text-[#0e2756] underline" onPress={() => router.push("/")}>
                    Back to home
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
