import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import {
  BriefcaseBusiness,
  ChevronDown,
  Eye,
  EyeOff,
  House,
  LockKeyhole,
  Mail,
  Phone,
  Search,
  UserRound,
  UtensilsCrossed,
} from "lucide-react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { supabase } from "@/lib/supabase";
import { createVendor, listMyVendors } from "@/lib/newApp/vendors";
import { ENV } from "@/lib/env";
import { useAuth } from "@/providers/AuthProvider";
import EyaWordmark from "@/components/brand/EyaWordmark";
import GoogleMark from "@/components/brand/GoogleMark";
import { signInWithGoogle } from "@/lib/googleAuth";

type RoleChoice = "student" | "vendor" | "landlord" | "agent";

const ROLE_OPTIONS: {
  value: RoleChoice;
  label: string;
  buttonLabel: string;
  Icon: typeof UserRound;
}[] = [
  { value: "student", label: "Student", buttonLabel: "Student", Icon: Search },
  { value: "agent", label: "Agent", buttonLabel: "Agent", Icon: BriefcaseBusiness },
  { value: "vendor", label: "Restaurant", buttonLabel: "Restaurant", Icon: UtensilsCrossed },
  { value: "landlord", label: "Landlord", buttonLabel: "Landlord", Icon: House },
];

async function ensureSellerVendor(ownerId: string, fullName: string) {
  const existing = await listMyVendors(ownerId);
  const current = existing.find((row) => row.supports_market) ?? existing[0] ?? null;
  if (current) return current;

  try {
    return await createVendor(ownerId, {
      name: fullName || "Seller Shop",
      description: "Campus seller storefront",
      supports_market: true,
      supports_food: false,
      campus: null,
      area: null,
      city: null,
    });
  } catch {
    const retry = await listMyVendors(ownerId);
    const resolved = retry.find((row) => row.supports_market) ?? retry[0] ?? null;
    if (resolved) return resolved;
    throw new Error("Could not create or load seller shop. Please retry.");
  }
}

export default function SignupScreen() {
  const { signInDev } = useAuth();
  const params = useLocalSearchParams<{ role?: string }>();
  const initialRole = params.role === "vendor" || params.role === "landlord" || params.role === "agent" ? params.role : "student";

  const [roleChoice, setRoleChoice] = useState<RoleChoice>(initialRole);
  const [showRoles, setShowRoles] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const selectedRole = ROLE_OPTIONS.find((item) => item.value === roleChoice) ?? ROLE_OPTIONS[0];

  const submit = async () => {
    setErrorMsg(null);
    setInfoMsg(null);

    if (!firstName.trim() || !lastName.trim()) return setErrorMsg("Please enter your full name.");
    if (password.length < 6) return setErrorMsg("Password must be at least 6 characters.");

    setLoading(true);

    try {
      if (ENV.DEV_AUTH_MODE) {
        await signInDev({ email: email.trim() || `${roleChoice}@local.dev`, role: roleChoice });
        router.replace("/redirect");
        return;
      }

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
        const uid = data.session.user?.id;
        if (uid) {
          const normalizedEmail = (data.session.user?.email ?? email.trim()).trim().toLowerCase();
          const profilePayload = {
            id: uid,
            email: normalizedEmail,
            full_name: fullName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim() || null,
            role: roleChoice,
            onboarded: true,
            updated_at: new Date().toISOString(),
          };

          const upsertRes = await supabase.from("profiles").upsert(profilePayload as any, { onConflict: "id" });
          if (upsertRes.error) {
            const updateRes = await supabase.from("profiles").update(profilePayload as any).eq("id", uid);
            if (updateRes.error) {
              setErrorMsg(`Account created but role setup failed: ${updateRes.error.message}. Please retry login.`);
              return;
            }
          }

          if (roleChoice === "vendor") {
            try {
              await ensureSellerVendor(uid, fullName);
            } catch (vendorError: any) {
              console.warn("Seller shop setup deferred after signup:", vendorError?.message ?? vendorError);
            }
          }
        }

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

  const handleGoogleSignup = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setGoogleLoading(true);

    try {
      const result = await signInWithGoogle(roleChoice);
      if (!result.redirected && !result.cancelled) {
        router.replace("/redirect");
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Google sign-up failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.shell}>
            <View style={styles.card}>
              <View style={styles.wordmarkWrap}>
                <EyaWordmark width={220} height={72} withTagline />
              </View>

              <Text style={styles.title}>Create your EYA account</Text>
              <Text style={styles.subtitle}>Choose your role, then create your account.</Text>

              {ENV.DEV_AUTH_MODE ? (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>Dev auth mode is enabled on this device.</Text>
                </View>
              ) : null}

              <Text style={styles.sectionLabel}>Sign up as</Text>

              <Pressable style={styles.selectButton} onPress={() => setShowRoles((value) => !value)}>
                <View style={styles.inputIconWrap}>
                  <UserRound size={22} color="#4a5b87" />
                </View>
                <Text style={styles.selectButtonText}>{selectedRole.buttonLabel || "Select Role"}</Text>
                <ChevronDown size={24} color="#4a5b87" style={{ transform: [{ rotate: showRoles ? "180deg" : "0deg" }] }} />
              </Pressable>

              {showRoles ? (
                <View style={styles.roleMenu}>
                  {ROLE_OPTIONS.map(({ value, label, Icon }, index) => {
                    const selected = value === roleChoice;
                    return (
                      <Pressable
                        key={value}
                        onPress={() => {
                          setRoleChoice(value);
                          setShowRoles(false);
                        }}
                        style={[styles.roleRow, index < ROLE_OPTIONS.length - 1 && styles.roleRowBorder, selected && styles.roleRowSelected]}
                      >
                        <Icon size={22} color={selected ? "#102968" : "#566788"} />
                        <Text style={[styles.roleText, selected && styles.roleTextSelected]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.inputStack}>
                <View style={styles.inlineInputs}>
                  <View style={[styles.inputWrap, styles.inlineInput]}>
                    <UserRound size={20} color="#627196" />
                    <TextInput
                      style={styles.textInput}
                      placeholder="First Name"
                      placeholderTextColor="#7381a3"
                      value={firstName}
                      onChangeText={setFirstName}
                    />
                  </View>

                  <View style={[styles.inputWrap, styles.inlineInput]}>
                    <UserRound size={20} color="#627196" />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Last Name"
                      placeholderTextColor="#7381a3"
                      value={lastName}
                      onChangeText={setLastName}
                    />
                  </View>
                </View>

                <View style={styles.inputWrap}>
                  <Phone size={22} color="#627196" />
                  <TextInput
                    style={styles.textInput}
                    keyboardType="phone-pad"
                    placeholder="+265 ..."
                    placeholderTextColor="#7381a3"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>

                <View style={styles.inputWrap}>
                  <Mail size={22} color="#627196" />
                  <TextInput
                    style={styles.textInput}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="Email Address"
                    placeholderTextColor="#7381a3"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <View style={styles.inputWrap}>
                  <LockKeyhole size={22} color="#627196" />
                  <TextInput
                    style={[styles.textInput, styles.passwordInput]}
                    secureTextEntry={!showPassword}
                    placeholder="Create a password"
                    placeholderTextColor="#7381a3"
                    value={password}
                    onChangeText={setPassword}
                  />
                  <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={10}>
                    {showPassword ? <EyeOff size={24} color="#4a5b87" /> : <Eye size={24} color="#4a5b87" />}
                  </Pressable>
                </View>
              </View>

              {errorMsg ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              ) : null}

              {infoMsg ? (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>{infoMsg}</Text>
                </View>
              ) : null}

              <Pressable style={[styles.primaryButton, loading && styles.primaryButtonDisabled]} onPress={submit} disabled={loading}>
                <View style={styles.primaryButtonGradient}>
                  <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject}>
                    <Defs>
                      <LinearGradient id="signup-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <Stop offset="0%" stopColor="#55c39d" />
                        <Stop offset="52%" stopColor="#1186bf" />
                        <Stop offset="100%" stopColor="#234dd6" />
                      </LinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="100%" rx="999" fill="url(#signup-gradient)" />
                  </Svg>
                  <Text style={styles.primaryButtonText}>{loading ? "Creating..." : "Sign Up"}</Text>
                </View>
              </Pressable>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or continue with</Text>
                <View style={styles.orLine} />
              </View>

              <Pressable
                style={styles.googleButton}
                onPress={handleGoogleSignup}
                disabled={googleLoading || loading}
              >
                <View style={styles.googleBadge}>
                  <GoogleMark size={22} />
                </View>
                <Text style={styles.googleText}>{googleLoading ? "Connecting to Google..." : "Sign up with Google"}</Text>
              </Pressable>

              <Text style={styles.loginPrompt}>
                Already have an account?{" "}
                <Text style={styles.loginLink} onPress={() => router.push({ pathname: "/(auth)/login", params: { role: roleChoice } })}>
                  Log In
                </Text>
              </Text>

              <Text style={styles.backLink} onPress={() => router.push("/")}>
                Back to Home
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f5fd" },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingVertical: 28 },
  shell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  card: {
    width: "100%",
    maxWidth: 880,
    borderRadius: 44,
    backgroundColor: "#ffffff",
    paddingHorizontal: 26,
    paddingTop: 34,
    paddingBottom: 30,
    shadowColor: "#95a6d9",
    shadowOpacity: 0.32,
    shadowRadius: 30,
    elevation: 18,
  },
  wordmarkWrap: { alignItems: "center", marginBottom: 24 },
  title: { color: "#0f2c68", fontSize: 30, fontWeight: "900", letterSpacing: -0.8 },
  subtitle: { marginTop: 8, color: "#455884", fontSize: 18, fontWeight: "500" },
  infoBox: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d5e2ff",
    backgroundColor: "#eef4ff",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  infoText: { color: "#18325d", fontSize: 13, fontWeight: "600" },
  sectionLabel: { marginTop: 26, marginBottom: 12, color: "#0f2c68", fontSize: 16, fontWeight: "800" },
  selectButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#d6ddee",
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    shadowColor: "#aeb8d4",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  inputIconWrap: {
    width: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  selectButtonText: { flex: 1, color: "#0f2c68", fontSize: 16, fontWeight: "700" },
  roleMenu: {
    marginTop: 8,
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d6ddee",
    backgroundColor: "#ffffff",
    shadowColor: "#aeb8d4",
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 6,
  },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  roleRowBorder: { borderBottomWidth: 1, borderBottomColor: "#e8edf7" },
  roleRowSelected: { backgroundColor: "#f8faff" },
  roleText: { color: "#0f2c68", fontSize: 16, fontWeight: "700" },
  roleTextSelected: { color: "#102968" },
  inputStack: { marginTop: 12, gap: 12 },
  inlineInputs: { flexDirection: "row", gap: 12 },
  inlineInput: { flex: 1 },
  inputWrap: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#dde3f1",
    backgroundColor: "#fbfcff",
    paddingHorizontal: 18,
  },
  textInput: {
    flex: 1,
    color: "#0f2c68",
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 14,
  },
  passwordInput: { paddingRight: 8 },
  errorBox: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ffd2df",
    backgroundColor: "#fff1f6",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: { color: "#b11a4c", fontSize: 13, fontWeight: "700" },
  successBox: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ceeedd",
    backgroundColor: "#f1fff7",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  successText: { color: "#0a6b3d", fontSize: 13, fontWeight: "700" },
  primaryButton: {
    marginTop: 18,
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#4a6fd6",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  primaryButtonDisabled: { opacity: 0.75 },
  primaryButtonGradient: {
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.3,
    textShadowColor: "rgba(10,23,64,0.22)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  orRow: {
    marginTop: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  orLine: { flex: 1, height: 1, backgroundColor: "#d8deed" },
  orText: { color: "#516489", fontSize: 18, fontWeight: "500" },
  googleButton: {
    alignSelf: "center",
    marginTop: 18,
    minWidth: 280,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d9dfef",
    backgroundColor: "#ffffff",
    paddingHorizontal: 24,
    paddingVertical: 14,
    shadowColor: "#b6c0dc",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  googleBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  googleText: { color: "#12295f", fontSize: 16, fontWeight: "800" },
  loginPrompt: {
    marginTop: 28,
    alignSelf: "center",
    color: "#42547c",
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
  },
  loginLink: {
    color: "#1f4aa8",
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  backLink: {
    marginTop: 32,
    alignSelf: "center",
    color: "#0f2c68",
    fontSize: 16,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
});
