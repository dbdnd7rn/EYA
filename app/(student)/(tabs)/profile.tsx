/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { BadgeCheck, Camera, CheckCircle2, Mail, Phone, Sparkles, User2 } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
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

function profileRoleLabel(role: ProfileRole) {
  if (role === "admin") return "Admin";
  if (role === "landlord") return "Landlord";
  return "User";
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
  form.append("folder", "eya/avatars");

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
  const { user, role: authRole, loading: authLoading } = useAuth();
  const { width } = useWindowDimensions();
  const reveal = useRef(new Animated.Value(0)).current;
  const isNarrow = width < 640;

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [role, setRole] = useState<ProfileRole>("student");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullNameForAvatar, setFullNameForAvatar] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canSave = useMemo(() => firstName.trim().length > 0, [firstName]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || loading) return;
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [authLoading, loading, reveal]);

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

  const displayName = `${firstName || "User"} ${lastName || ""}`.trim();
  const roleLabel = profileRoleLabel(role);
  const profileComplete = Boolean(firstName.trim() && phone.trim() && avatarUrl);
  const revealStyle = {
    opacity: reveal,
    transform: [
      {
        translateY: reveal.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };

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
      <SoftPageGlow variant="account" />
      <TopNav title="Profile" />
      <Animated.ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={revealStyle}>
        <View style={styles.heroCard}>
          <View pointerEvents="none" style={styles.heroArt}>
            <View style={styles.heroPanel} />
            <View style={styles.heroRibbon} />
            <View style={styles.heroMiniPanel} />
          </View>

          <View style={styles.heroKickerRow}>
            <View style={styles.heroKicker}>
              <Sparkles size={15} color="#ff0f64" />
              <Text style={styles.heroLabel}>Profile center</Text>
            </View>
            <View style={styles.profileStatePill}>
              <BadgeCheck size={14} color="#168653" />
              <Text style={styles.profileStateText}>Active</Text>
            </View>
          </View>

          <View style={[styles.heroMain, isNarrow && styles.heroMainStack]}>
            <View style={styles.avatarStage}>
              <View style={styles.avatarRing}>
                <View style={styles.avatarWrap}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarFallbackText}>{initials(fullNameForAvatar ?? displayName)}</Text>
                    </View>
                  )}

                  <Pressable style={styles.cameraBtn} onPress={pickAvatar}>
                    {uploadingAvatar ? <ActivityIndicator size="small" color="#ff0f64" /> : <Camera size={15} color="#0e2756" />}
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.heroText}>
              <Text style={styles.heroName}>{displayName || "User"}</Text>
              <Text style={styles.heroSub}>Manage the details students and workspace teams use to recognize you.</Text>
              <View style={styles.heroEmailRow}>
                <Mail size={15} color="#5b6887" />
                <Text numberOfLines={1} style={styles.heroEmail}>{email || "-"}</Text>
              </View>
            </View>
          </View>

          <View style={styles.heroChips}>
            <View style={styles.heroChip}>
              <User2 size={14} color="#5e73dd" />
              <Text style={styles.heroChipText}>Role: {roleLabel}</Text>
            </View>
            <View style={styles.heroChip}>
              <Mail size={14} color="#5e73dd" />
              <Text style={styles.heroChipText}>Email ready</Text>
            </View>
            <View style={[styles.heroChip, profileComplete ? styles.heroChipDone : styles.heroChipTodo]}>
              <CheckCircle2 size={14} color={profileComplete ? "#168653" : "#9a6a00"} />
              <Text style={[styles.heroChipText, profileComplete ? styles.heroChipDoneText : styles.heroChipTodoText]}>
                {profileComplete ? "Profile complete" : "Add photo and phone"}
              </Text>
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
            <View style={styles.sectionIcon}>
              <User2 size={18} color="#ff0f64" />
            </View>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Personal info</Text>
              <Text style={styles.sectionSub}>Keep your contact details accurate for orders, rooms and support.</Text>
            </View>
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

          <View style={[styles.row2, isNarrow && styles.rowStacked]}>
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
            <CheckCircle2 size={17} color="#ffffff" />
            <Text style={styles.primaryBtnText}>{savingProfile ? "Saving..." : "Save changes"}</Text>
          </Pressable>
        </View>

        <Text style={styles.footerMeta}>EYA - Everything You Access</Text>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 14, gap: 14, paddingBottom: 110 },

  heroCard: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#e7ecfa",
    padding: 18,
    shadowColor: "#0e2756",
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 3,
  },
  heroArt: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  heroPanel: {
    position: "absolute",
    top: -42,
    right: -36,
    width: 190,
    height: 136,
    borderRadius: 34,
    backgroundColor: "rgba(94,115,221,0.10)",
    transform: [{ rotate: "-14deg" }],
  },
  heroRibbon: {
    position: "absolute",
    right: 30,
    top: 96,
    width: 124,
    height: 28,
    borderRadius: 999,
    backgroundColor: "rgba(255,15,100,0.08)",
    transform: [{ rotate: "-16deg" }],
  },
  heroMiniPanel: {
    position: "absolute",
    right: 22,
    bottom: 24,
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: "rgba(22,134,83,0.08)",
    transform: [{ rotate: "18deg" }],
  },
  heroKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 16,
  },
  heroKicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,15,100,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,15,100,0.16)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  profileStatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#ecfbf2",
    borderWidth: 1,
    borderColor: "#ccefd9",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  profileStateText: { color: "#168653", fontSize: 12, fontWeight: "900" },
  heroMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  heroMainStack: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  avatarStage: {
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: "#dfe6fb",
    backgroundColor: "#f8faff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: { position: "relative" },
  avatarImg: { width: 92, height: 92, borderRadius: 46, backgroundColor: "#eef1fb" },
  avatarFallback: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "#0e2756",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: { color: "#fff", fontWeight: "900", fontSize: 24 },
  cameraBtn: {
    position: "absolute",
    right: -5,
    bottom: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dfe6fb",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0e2756",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  heroText: { flex: 1, minWidth: 0, gap: 6 },
  heroLabel: {
    color: "#ff0f64",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroName: { color: "#0e2756", fontSize: 28, fontWeight: "900", lineHeight: 34 },
  heroSub: { color: "#6e7892", fontSize: 13, fontWeight: "700", lineHeight: 19, maxWidth: 520 },
  heroEmailRow: { flexDirection: "row", alignItems: "center", gap: 7, minWidth: 0 },
  heroEmail: { flex: 1, color: "#5b6887", fontSize: 14, fontWeight: "800" },
  heroChips: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heroChip: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e6ecfa",
    backgroundColor: "#f8faff",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroChipDone: { backgroundColor: "#ecfbf2", borderColor: "#ccefd9" },
  heroChipTodo: { backgroundColor: "#fff8e8", borderColor: "#f7df9c" },
  heroChipText: { color: "#5b6887", fontSize: 12, fontWeight: "900" },
  heroChipDoneText: { color: "#168653" },
  heroChipTodoText: { color: "#9a6a00" },

  noticeBox: { marginTop: 12, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1 },
  noticeErr: { borderColor: "#fecdd3", backgroundColor: "#fff1f2" },
  noticeOk: { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" },
  noticeErrText: { color: "#be123c", fontWeight: "700", fontSize: 13 },
  noticeOkText: { color: "#15803d", fontWeight: "700", fontSize: 13 },

  sectionCard: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#e7ecfa",
    padding: 18,
    gap: 14,
    shadowColor: "#0e2756",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffd0df",
    backgroundColor: "#fff1f6",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { color: "#0e2756", fontSize: 20, fontWeight: "900" },
  sectionSub: { color: "#6e7892", fontSize: 12, fontWeight: "700", lineHeight: 17, marginTop: 2 },
  formGroup: { gap: 7 },
  row2: { flexDirection: "row", gap: 12 },
  rowStacked: { flexDirection: "column" },
  col: { flex: 1, gap: 7, minWidth: 0 },
  label: { color: "#0e2756", fontSize: 12, fontWeight: "900" },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  helpText: { color: "#6e7892", fontSize: 11, fontWeight: "700", lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#dce3f5",
    backgroundColor: "#f9fbff",
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 13,
    color: "#0e2756",
    fontSize: 15,
    fontWeight: "700",
    minHeight: 50,
  },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: "#ff0f64",
    borderRadius: 18,
    minHeight: 54,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: "#ff0f64",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  btnDisabled: { opacity: 0.6 },
  footerMeta: { textAlign: "center", color: "#8a94af", fontSize: 11, marginTop: 2, fontWeight: "800" },
});





