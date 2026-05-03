import React, { useEffect, useState } from "react";
import {
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
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
} from "lucide-react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { supabase } from "@/lib/supabase";
import { ENV } from "@/lib/env";
import { consumeAuthFeedback } from "@/lib/authFeedback";
import { matchDevAccount } from "@/lib/devAuth";
import { signInWithGoogle } from "@/lib/googleAuth";
import { useAuth } from "@/providers/AuthProvider";
import EyaWordmark from "@/components/brand/EyaWordmark";
import GoogleMark from "@/components/brand/GoogleMark";

export default function LoginScreen() {
  const params = useLocalSearchParams<{ redirectTo?: string }>();
  const { signInDev } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirectTo = params.redirectTo === "/admin" ? "/admin" : null;
  const isAdminLogin = redirectTo === "/admin";

  useEffect(() => {
    let active = true;

    const hydrateFeedback = async () => {
      const feedback = await consumeAuthFeedback("login");
      if (!active || !feedback) return;
      setError(feedback.error ?? null);
    };

    void hydrateFeedback();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      if (ENV.DEV_AUTH_MODE) {
        const account = matchDevAccount(email, password);
        if (!account) {
          setError("Invalid dev credentials. Use a configured test account.");
          return;
        }

        await signInDev({ email: account.email, role: account.role });
        router.replace((redirectTo ?? "/redirect") as any);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
      router.replace((redirectTo ?? "/redirect") as any);
    } catch {
      setError("Failed to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);

    try {
      const result = await signInWithGoogle(null, "login");
      if (!result.redirected && !result.cancelled) {
        router.replace((redirectTo ?? "/redirect") as any);
      }
    } catch (err: any) {
      setError(err?.message ?? "Google sign-in failed. Please try again.");
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
              <Pressable style={styles.wordmarkWrap}>
                <EyaWordmark width={220} height={72} withTagline />
              </Pressable>

              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Sign in to your account.</Text>

              {ENV.DEV_AUTH_MODE ? (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>Dev auth mode is enabled on this device.</Text>
                </View>
              ) : null}

              <Text style={styles.sectionLabel}>{isAdminLogin ? "Sign in as Admin" : "Sign in as User"}</Text>
              <View style={styles.selectButton}>
                <View style={styles.inputIconWrap}>
                  <UserRound size={22} color="#4a5b87" />
                </View>
                <Text style={styles.selectButtonText}>{isAdminLogin ? "Admin Access" : "User"}</Text>
              </View>

              <View style={styles.inputStack}>
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
                    placeholder="Enter your password"
                    placeholderTextColor="#7381a3"
                    value={password}
                    onChangeText={setPassword}
                  />
                  <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={10}>
                    {showPassword ? <EyeOff size={24} color="#4a5b87" /> : <Eye size={24} color="#4a5b87" />}
                  </Pressable>
                </View>
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable style={[styles.primaryButton, loading && styles.primaryButtonDisabled]} onPress={handleSubmit} disabled={loading}>
                <View style={styles.primaryButtonGradient}>
                  <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject}>
                    <Defs>
                      <LinearGradient id="login-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <Stop offset="0%" stopColor="#55c39d" />
                        <Stop offset="52%" stopColor="#1186bf" />
                        <Stop offset="100%" stopColor="#234dd6" />
                      </LinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="100%" rx="999" fill="url(#login-gradient)" />
                  </Svg>
                  <Text style={styles.primaryButtonText}>{loading ? "Signing in..." : "Sign In"}</Text>
                </View>
              </Pressable>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or</Text>
                <View style={styles.orLine} />
              </View>

              <Pressable style={styles.googleButton} onPress={handleGoogleSignIn} disabled={googleLoading || loading}>
                <View style={styles.googleBadge}>
                  <GoogleMark size={22} />
                </View>
                <Text style={styles.googleText}>{googleLoading ? "Connecting to Google..." : "Sign in with Google"}</Text>
              </Pressable>

              <View style={styles.linkRow}>
                <Text style={styles.forgotLink} onPress={() => router.push("/(auth)/forgot-password")}>
                  Forgot Password?
                </Text>
                <Text style={styles.signupPrompt}>
                  Don't have an account?{" "}
                  <Text style={styles.signupLink} onPress={() => router.push("/(auth)/signup")}>
                    Sign Up
                  </Text>
                </Text>
              </View>

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
  title: { color: "#0f2c68", fontSize: 34, fontWeight: "900", letterSpacing: -0.8 },
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
  adminInfoBox: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d7e1ff",
    backgroundColor: "#f3f7ff",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  adminInfoText: { flex: 1, color: "#18325d", fontSize: 13, fontWeight: "700" },
  inputStack: { marginTop: 12, gap: 12 },
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
    minWidth: 260,
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
  linkRow: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  forgotLink: {
    color: "#1f8a59",
    fontSize: 15,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
  signupPrompt: { color: "#42547c", fontSize: 15, fontWeight: "500" },
  signupLink: {
    color: "#1f4aa8",
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  backLink: {
    marginTop: 34,
    alignSelf: "center",
    color: "#0f2c68",
    fontSize: 16,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
});
