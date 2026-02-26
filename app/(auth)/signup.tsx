import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import PublicFooter from "@/components/PublicFooter";

type RoleChoice = "student" | "landlord";

export default function SignupScreen() {
  const params = useLocalSearchParams<{ role?: string }>();

  const [roleChoice, setRoleChoice] = useState<RoleChoice>("student");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    const r = params?.role;
    if (r === "student" || r === "landlord") setRoleChoice(r);
  }, [params?.role]);

  const tabBase = "flex-1 rounded-full border px-4 py-2";
  const tabActive = "border-[#ff0f64] bg-[#fff0f6]";
  const tabIdle = "border-[#e1e4ef] bg-white";
  const inputBase =
    "w-full rounded-2xl border border-[#d9deef] bg-white px-4 py-3 text-sm text-[#0e2756]";

  const submit = async () => {
    setErrorMsg(null);
    setInfoMsg(null);

    if (!firstName.trim() || !lastName.trim()) return setErrorMsg("Please enter your full name.");
    if (password.length < 6) return setErrorMsg("Password must be at least 6 characters.");

    setLoading(true);

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim(),
            role: roleChoice,
          },
        },
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      if (data.session) {
        router.replace("/redirect");
        return;
      }

      setInfoMsg("Account created successfully. Please check your email to confirm your account, then log in.");
    } catch {
      setErrorMsg("Could not create your account. Try again.");
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
              <Text className="text-xs font-extrabold uppercase tracking-[6px] text-[#ff0f64]">SIGN UP</Text>

              <Text className="mt-3 text-4xl font-extrabold leading-tight text-[#0e2756]">Create your Pa-Level account</Text>

              <Text className="mt-2 text-sm text-[#5f6b85]">Choose your role, then create your account.</Text>

              <View className="mt-8">
                <Text className="text-sm font-semibold text-[#5f6b85]">I'm signing up as</Text>
                <View className="mt-3 flex-row gap-3">
                  <Pressable
                    onPress={() => setRoleChoice("student")}
                    className={`${tabBase} ${roleChoice === "student" ? tabActive : tabIdle}`}
                  >
                    <Text className={`text-center text-sm font-semibold ${roleChoice === "student" ? "text-[#ff0f64]" : "text-[#5f6b85]"}`}>
                      Student / tenant
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setRoleChoice("landlord")}
                    className={`${tabBase} ${roleChoice === "landlord" ? tabActive : tabIdle}`}
                  >
                    <Text className={`text-center text-sm font-semibold ${roleChoice === "landlord" ? "text-[#ff0f64]" : "text-[#5f6b85]"}`}>
                      Landlord
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View className="mt-7 gap-5">
                <View>
                  <Text className="mb-2 text-sm font-semibold text-[#0e2756]">First name</Text>
                  <TextInput className={inputBase} placeholder="Thoko" placeholderTextColor="#9ba3c4" value={firstName} onChangeText={setFirstName} />
                </View>

                <View>
                  <Text className="mb-2 text-sm font-semibold text-[#0e2756]">Last name</Text>
                  <TextInput className={inputBase} placeholder="Jere" placeholderTextColor="#9ba3c4" value={lastName} onChangeText={setLastName} />
                </View>

                <View>
                  <Text className="mb-2 text-sm font-semibold text-[#0e2756]">
                    Phone number <Text className="text-xs font-semibold text-[#5f6b85]">(WhatsApp)</Text>
                  </Text>
                  <TextInput className={inputBase} placeholder="+265 ..." placeholderTextColor="#9ba3c4" value={phone} onChangeText={setPhone} />
                </View>

                <View>
                  <Text className="mb-2 text-sm font-semibold text-[#0e2756]">Email</Text>
                  <TextInput className={inputBase} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" placeholderTextColor="#9ba3c4" value={email} onChangeText={setEmail} />
                </View>

                <View>
                  <Text className="mb-2 text-sm font-semibold text-[#0e2756]">Password</Text>
                  <View className="relative">
                    <TextInput className={`${inputBase} pr-12`} secureTextEntry={!showPassword} placeholder="At least 6 characters" placeholderTextColor="#9ba3c4" value={password} onChangeText={setPassword} />
                    <Pressable onPress={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2">
                      {showPassword ? <EyeOff size={18} color="#5f6b85" /> : <Eye size={18} color="#5f6b85" />}
                    </Pressable>
                  </View>
                </View>

                {errorMsg ? (
                  <View className="rounded-2xl border border-[#ffd4e3] bg-[#fff0f6] px-4 py-3">
                    <Text className="text-sm font-semibold text-[#b0003a]">{errorMsg}</Text>
                  </View>
                ) : null}

                {infoMsg ? (
                  <View className="rounded-2xl border border-[#d7f3e3] bg-[#f1fff7] px-4 py-3">
                    <Text className="text-sm font-semibold text-[#0a6b3d]">{infoMsg}</Text>
                  </View>
                ) : null}

                <Pressable disabled={loading} onPress={submit} className="mt-2 rounded-full bg-[#ff0f64] px-6 py-4 shadow-lg" style={{ opacity: loading ? 0.7 : 1 }}>
                  <Text className="text-center text-base font-extrabold text-white">{loading ? "Creating..." : "Create account"}</Text>
                </Pressable>

                <Text className="mt-6 text-center text-sm text-[#5f6b85]">
                  Already have an account?{" "}
                  <Text className="font-extrabold text-[#ff0f64]" onPress={() => router.push("/(auth)/login")}>
                    Log in
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
