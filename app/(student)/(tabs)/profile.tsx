/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Camera, LogOut, Mail, Phone, Shield, User2 } from "lucide-react-native";
import TopNav from "@/components/TopNav";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type ProfileRole = "student" | "landlord" | "admin";

type ProfileRow = {
  id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  surname?: string | null;
  role?: ProfileRole | string | null;
  phone?: string | null;
  avatar_url?: string | null;
};

function splitName(full?: string | null) {
  const s = (full || "").trim();
  if (!s) return { first: "", last: "" };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function initials(fullName?: string | null) {
  const s = (fullName || "").trim();
  if (!s) return "U";
  const parts = s.split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "U"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function normalizeRole(role?: string | null): ProfileRole {
  return role === "landlord" || role === "admin" ? role : "student";
}

function getUploadFileMeta(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const mime = asset.mimeType || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  return {
    name: `avatar-${Date.now()}.${ext === "heic" || ext === "heif" ? "jpg" : ext}`,
    type: mime,
  };
}

async function uploadAvatarExpo(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary env vars missing (CLOUD_NAME / UPLOAD_PRESET).");
  }

  const meta = getUploadFileMeta(asset);
  const form = new FormData();
  form.append("file", { uri: asset.uri, name: meta.name, type: meta.type } as any);
  form.append("upload_preset", uploadPreset);
  form.append("folder", "palevel/avatars");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Failed to upload avatar.");
  return json.secure_url as string;
}

export default function StudentProfileScreen() {
  const router = useRouter();
  const { user, role: authRole, signOut, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [role, setRole] = useState<ProfileRole>("student");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullNameForAvatar, setFullNameForAvatar] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canSave = useMemo(() => firstName.trim().length > 0, [firstName]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;

    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        setEmail(user.email || "");
        setNewEmail(user.email || "");

        const attempts = [
          "id, full_name, role, phone, avatar_url",
          "id, first_name, last_name, role, phone, avatar_url",
          "id, first_name, surname, role, phone, avatar_url",
        ];

        let prof: ProfileRow | null = null;
        let lastErr: string | null = null;

        for (const clause of attempts) {
          const { data, error } = await supabase.from("profiles").select(clause).eq("id", user.id).maybeSingle();
          if (!error) {
            prof = (data as ProfileRow | null) ?? null;
            lastErr = null;
            break;
          }
          lastErr = error.message;
        }

        if (!mounted) return;
        if (lastErr) throw new Error(lastErr);

        const computedFullName =
          (prof?.full_name ?? `${prof?.first_name ?? ""} ${prof?.last_name ?? prof?.surname ?? ""}`.trim()).trim() || "";
        const parts = splitName(computedFullName);

        setRole(normalizeRole(String(prof?.role ?? authRole ?? "student")));
        setAvatarUrl(prof?.avatar_url ?? null);
        setFullNameForAvatar(computedFullName || null);
        setFirstName(parts.first);
        setLastName(parts.last);
        setPhone(prof?.phone ?? "");
      } catch (e: any) {
        if (!mounted) return;
        setErrorMsg(e?.message || "Failed to load profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [user?.id, authRole]);

  const pickAvatar = async () => {
    try {
      setErrorMsg(null);
      setSuccessMsg(null);

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Allow photo access to update your profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri || !user) return;

      setUploadingAvatar(true);
      const url = await uploadAvatarExpo(asset);
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      if (error) throw error;

      setAvatarUrl(url);
      setSuccessMsg("Profile picture updated.");
    } catch (e: any) {
      const msg = String(e?.message ?? "Failed to update profile picture.");
      if (msg.toLowerCase().includes("heic")) {
        setErrorMsg("Please choose a JPG or PNG image for profile picture.");
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const onSaveProfile = async () => {
    if (!user) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    if (!canSave) {
      setErrorMsg("First name is required.");
      return;
    }

    try {
      setSavingProfile(true);
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone: phone.trim() || null,
        })
        .eq("id", user.id);
      if (profileErr) throw profileErr;

      setFullNameForAvatar(fullName);

      if (newEmail.trim() && newEmail.trim() !== email) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: newEmail.trim() });
        if (emailErr) throw emailErr;
        setEmail(newEmail.trim());
        setSuccessMsg("Saved. Please confirm the email change from the link sent to your email.");
      } else {
        setSuccessMsg("Profile updated successfully.");
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to save changes.");
    } finally {
      setSavingProfile(false);
    }
  };

  const onUpdatePassword = async () => {
    if (!user) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (!oldPassword.trim()) throw new Error("Enter your old password.");
      if (!newPassword.trim()) throw new Error("Enter a new password.");
      if (newPassword.trim().length < 6) throw new Error("New password must be at least 6 characters.");

      setSavingPassword(true);

      const { error: reErr } = await supabase.auth.signInWithPassword({
        email: user.email || email,
        password: oldPassword.trim(),
      });
      if (reErr) throw new Error("Old password is incorrect.");

      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword.trim() });
      if (pwErr) throw pwErr;

      setOldPassword("");
      setNewPassword("");
      setSuccessMsg("Password updated successfully.");
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to update password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Log out", "Log out of your account?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
          } finally {
            router.replace("/(auth)/login");
          }
        },
      },
    ]);
  };

  const displayName = `${firstName || "User"} ${lastName || ""}`.trim();

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <TopNav title="Profile" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#ff0f64" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <TopNav title="Profile" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroLeft}>
              <View style={styles.avatarWrap}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>{initials(fullNameForAvatar ?? displayName)}</Text>
                  </View>
                )}

                <Pressable style={styles.cameraBtn} onPress={pickAvatar}>
                  <Camera size={14} color="#0e2756" />
                </Pressable>
              </View>

              <View style={styles.heroText}>
                <Text style={styles.heroLabel}>Student Profile</Text>
                <Text style={styles.heroName}>{displayName || "User"}</Text>
                <View style={styles.heroEmailRow}>
                  <Mail size={14} color="#5b6887" />
                  <Text numberOfLines={1} style={styles.heroEmail}>{email || "-"}</Text>
                </View>
              </View>
            </View>

            <View style={styles.heroRight}>
              {uploadingAvatar ? (
                <View style={styles.heroPill}>
                  <Text style={styles.heroPillText}>Uploading picture...</Text>
                </View>
              ) : null}
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>
                  Role: <Text style={styles.heroPillStrong}>{role}</Text>
                </Text>
              </View>
            </View>
          </View>

          {errorMsg ? (
            <View style={[styles.noticeBox, styles.noticeErr]}>
              <Text style={styles.noticeErrText}>{errorMsg}</Text>
            </View>
          ) : null}
          {successMsg ? (
            <View style={[styles.noticeBox, styles.noticeOk]}>
              <Text style={styles.noticeOkText}>{successMsg}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHead}>
            <User2 size={18} color="#ff0f64" />
            <Text style={styles.sectionTitle}>Personal info</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor="#9aa3bd"
            />
            <Text style={styles.helpText}>Changing email requires confirmation via link sent to your email.</Text>
          </View>

          <View style={styles.row2}>
            <View style={styles.col}>
              <Text style={styles.label}>First name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                placeholderTextColor="#9aa3bd"
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.label}>Last name</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                placeholderTextColor="#9aa3bd"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <Phone size={14} color="#5b6887" />
              <Text style={styles.label}>Phone</Text>
            </View>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. +265..."
              placeholderTextColor="#9aa3bd"
              keyboardType="phone-pad"
            />
          </View>

          <Pressable style={[styles.primaryBtn, savingProfile && styles.btnDisabled]} onPress={onSaveProfile} disabled={savingProfile}>
            <Text style={styles.primaryBtnText}>{savingProfile ? "Saving..." : "Save changes"}</Text>
          </Pressable>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHead}>
            <Shield size={18} color="#ff0f64" />
            <Text style={styles.sectionTitle}>Security</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Old password</Text>
            <TextInput
              style={styles.input}
              value={oldPassword}
              onChangeText={setOldPassword}
              secureTextEntry
              placeholder="Enter old password"
              placeholderTextColor="#9aa3bd"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>New password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="New password (min 6 chars)"
              placeholderTextColor="#9aa3bd"
            />
          </View>

          <Pressable
            style={[styles.darkBtn, savingPassword && styles.btnDisabled]}
            onPress={onUpdatePassword}
            disabled={savingPassword}
          >
            <Text style={styles.darkBtnText}>{savingPassword ? "Updating..." : "Update password"}</Text>
          </Pressable>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.accountSub}>Log out from this device.</Text>

          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <LogOut size={16} color="#b42318" />
            <Text style={styles.logoutBtnText}>Log out</Text>
          </Pressable>
        </View>

        <Text style={styles.footerMeta}>pa-level • clean student experience</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 14, paddingBottom: 30 },

  heroCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 16,
    shadowColor: "#0e2756",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  heroTop: { gap: 12 },
  heroLeft: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatarWrap: { position: "relative" },
  avatarImg: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#eef1fb" },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#0e2756",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: { color: "#fff", fontWeight: "900", fontSize: 22 },
  cameraBtn: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e7eaf6",
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1, minWidth: 0 },
  heroLabel: {
    color: "#ff0f64",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroName: { marginTop: 3, color: "#0e2756", fontSize: 22, fontWeight: "900" },
  heroEmailRow: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 6 },
  heroEmail: { flex: 1, color: "#5b6887", fontSize: 13, fontWeight: "600" },
  heroRight: { gap: 8 },
  heroPill: {
    alignSelf: "flex-start",
    backgroundColor: "#f6f7fb",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroPillText: { color: "#5b6887", fontSize: 12, fontWeight: "600" },
  heroPillStrong: { color: "#0e2756", fontWeight: "800" },

  noticeBox: { marginTop: 12, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1 },
  noticeErr: { borderColor: "#fecdd3", backgroundColor: "#fff1f2" },
  noticeOk: { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" },
  noticeErrText: { color: "#be123c", fontWeight: "700", fontSize: 13 },
  noticeOkText: { color: "#15803d", fontWeight: "700", fontSize: 13 },

  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 16,
    gap: 12,
    shadowColor: "#0e2756",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: "#0e2756", fontSize: 18, fontWeight: "900" },
  formGroup: { gap: 6 },
  row2: { flexDirection: "row", gap: 10 },
  col: { flex: 1, gap: 6 },
  label: { color: "#0e2756", fontSize: 12, fontWeight: "800" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  helpText: { color: "#5b6887", fontSize: 11, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#d9deef",
    backgroundColor: "#f9fafc",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#0e2756",
    fontSize: 14,
  },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: "#ff0f64",
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  darkBtn: {
    marginTop: 2,
    backgroundColor: "#0e2756",
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  darkBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  accountSub: { color: "#5b6887", fontSize: 13, marginTop: -6 },
  logoutBtn: {
    marginTop: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  logoutBtnText: { color: "#b42318", fontWeight: "800", fontSize: 13 },
  footerMeta: { textAlign: "center", color: "#9aa3bd", fontSize: 11, marginTop: 4, fontWeight: "600" },
});
