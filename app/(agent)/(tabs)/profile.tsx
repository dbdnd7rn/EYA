/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Bell, Search, User2, Camera } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import SoftPageGlow from "@/components/SoftPageGlow";
import { supabase } from "@/lib/supabase";
import { normalizeAppRole } from "@/lib/roleRouting";
import { useAuth } from "@/providers/AuthProvider";
import { useNotificationInbox } from "@/providers/NotificationInboxProvider";
import { useRouter } from "expo-router";
import { getAgentRiderProfile, setAgentRiderProfile } from "@/lib/agentRiderProfile";

type ProfileRow = {
  id?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: "student" | "landlord" | "agent" | "admin" | string | null;
  created_at?: string | null;
};

function firstName(profile: ProfileRow | null, email?: string | null) {
  const full = profile?.full_name?.trim();
  if (full) return full.split(/\s+/)[0] ?? "Rider";
  const composed = `${profile?.first_name ?? ""} ${profile?.last_name ?? profile?.surname ?? ""}`.trim();
  if (composed) return composed.split(/\s+/)[0] ?? "Rider";
  return email?.split("@")[0] || "Rider";
}

function getUploadFileMeta(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const mime = asset.mimeType || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  return {
    name: `agent-avatar-${Date.now()}.${ext === "heic" || ext === "heif" ? "jpg" : ext}`,
    type: mime,
  };
}

async function uploadAvatar(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) throw new Error("Cloudinary env vars missing.");

  const meta = getUploadFileMeta(asset);
  const form = new FormData();
  form.append("file", { uri: asset.uri, name: meta.name, type: meta.type } as any);
  form.append("upload_preset", uploadPreset);
  form.append("folder", "pamaketi/agents");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Image upload failed.");
  return json.secure_url as string;
}

export default function AgentProfile() {
  const { user, role, signOut } = useAuth();
  const router = useRouter();
  const { unreadCount } = useNotificationInbox();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("Motorbike");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const vehicleRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const fullNameRef = useRef<TextInput>(null);

  const displayEmail = profile?.email ?? user?.email ?? "-";
  const currentRole = String(profile?.role ?? role ?? "agent");
  const riderName = useMemo(() => firstName(profile, user?.email), [profile, user?.email]);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        setLoading(true);
        setErr(null);
        setMsg(null);

        const attempts = [
          "id,full_name,email,phone,role,created_at",
          "id,first_name,last_name,email,phone,role,created_at",
          "id,first_name,surname,email,phone,role,created_at",
          "id,full_name,phone,role,created_at",
        ];

        let profileData: ProfileRow | null = null;
        for (const clause of attempts) {
          const { data, error } = await supabase.from("profiles").select(clause).eq("id", user.id).maybeSingle();
          if (!error) {
            profileData = (data as ProfileRow | null) ?? null;
            break;
          }
        }

        if (!profileData) {
          setErr("Could not load profile.");
          setLoading(false);
          return;
        }

        if (normalizeAppRole(profileData.role) !== "agent") {
          router.replace("/onboarding");
          return;
        }

        const riderProfile = await getAgentRiderProfile(user.id);
        setProfile(profileData);
        const initialName = profileData.full_name ?? `${profileData.first_name ?? ""} ${profileData.last_name ?? profileData.surname ?? ""}`.trim();
        setFullName((initialName ?? "").trim());
        setPhone((profileData.phone ?? "").trim());
        setVehicleType(riderProfile?.vehicleType ?? "Motorbike");
        setAvatarUrl(riderProfile?.avatarUrl ?? null);
        setIsOnline(riderProfile?.isOnline ?? true);
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message ?? "Something went wrong");
        setLoading(false);
      }
    };

    void load();
  }, [user?.id]);

  const persistRiderExtras = async (next: { avatarUrl?: string | null; vehicleType?: string; isOnline?: boolean }) => {
    if (!user) return;
    await setAgentRiderProfile({
      userId: user.id,
      avatarUrl: next.avatarUrl ?? avatarUrl ?? null,
      vehicleType: next.vehicleType ?? vehicleType,
      isOnline: next.isOnline ?? isOnline,
    });
  };

  const handleAvatarChange = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow photo access to change your rider picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.88,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(asset);
      setAvatarUrl(url);
      await persistRiderExtras({ avatarUrl: url });
      setMsg("Profile picture updated.");
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? "Could not update rider photo.");
      setMsg(null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setErr(null);
    setMsg(null);

    const cleanName = fullName.trim();
    const cleanPhone = phone.trim().replace(/\s+/g, "");

    if (cleanName.length < 2) {
      setErr("Please enter your full name.");
      setSaving(false);
      return;
    }

    if (cleanPhone && !cleanPhone.startsWith("+265")) {
      setErr("Phone should start with +265.");
      setSaving(false);
      return;
    }

    let updateError: string | null = null;
    const fullNameUpdate = await supabase.from("profiles").update({ full_name: cleanName, phone: cleanPhone || null }).eq("id", user.id);

    if (fullNameUpdate.error) {
      const parts = cleanName.split(/\s+/).filter(Boolean);
      const first = parts.shift() ?? cleanName;
      const rest = parts.join(" ") || null;
      const fallback = await supabase.from("profiles").update({ first_name: first, last_name: rest, surname: rest, phone: cleanPhone || null } as any).eq("id", user.id);
      if (fallback.error) updateError = fallback.error.message;
    }

    if (updateError) {
      setErr(updateError);
      setSaving(false);
      return;
    }

    await persistRiderExtras({ vehicleType });
    setProfile((prev) => ({ ...(prev ?? {}), full_name: cleanName, phone: cleanPhone || null }));
    setMsg("Profile updated successfully.");
    setSaving(false);
  };

  const toggleOnline = async () => {
    const next = !isOnline;
    setIsOnline(next);
    await persistRiderExtras({ isOnline: next });
    setMsg(next ? "You are now online." : "You are now offline.");
    setErr(null);
  };

  const logout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
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

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <SoftPageGlow variant="account" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0e2756" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="account" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Profile</Text>
          <View style={styles.headerButtons}>
            <View style={styles.headerActionWrap}>
              <CircleIcon icon={<Bell size={18} color="#0e2756" />} onPress={() => router.push("/(agent)/notifications")} />
              {unreadCount ? (
                <View style={styles.dotBadge}>
                  <Text style={styles.dotBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                </View>
              ) : null}
            </View>
            <CircleIcon icon={<Search size={18} color="#0e2756" />} onPress={() => router.push("/(agent)/(tabs)/deliveries")} />
            <Pressable style={styles.miniAvatar} onPress={handleAvatarChange}>
              {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.miniAvatarImage} /> : <Text style={styles.miniAvatarText}>{riderName.slice(0, 2).toUpperCase()}</Text>}
            </Pressable>
          </View>
        </View>

        {err ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{err}</Text>
          </View>
        ) : null}
        {msg ? (
          <View style={styles.okCard}>
            <Text style={styles.okText}>{msg}</Text>
          </View>
        ) : null}

        <View style={styles.profileHero}>
          <Pressable style={styles.heroAvatar} onPress={handleAvatarChange}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.heroAvatarImage} /> : <User2 size={28} color="#0e2756" />}
            <View style={styles.cameraBadge}>
              <Camera size={14} color="#fff" />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{fullName || riderName}</Text>
            <View style={styles.heroMetaRow}>
              <View style={[styles.greenDot, !isOnline && styles.offlineDot]} />
              <Text style={styles.heroMetaText}>{isOnline ? "Active Rider" : "Offline Rider"}</Text>
              <View style={styles.softDot} />
            </View>
            {uploadingAvatar ? <Text style={styles.uploadText}>Uploading picture...</Text> : null}
          </View>
        </View>

        <InfoCard label="Account Info" value={displayEmail} onEdit={() => Alert.alert("Account email", "Email changes are handled from your auth account settings.")} />
        <EditableField label="Vehicle Type" value={vehicleType} onChangeText={setVehicleType} inputRef={vehicleRef} />
        <EditableField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" inputRef={phoneRef} />
        <EditableField label="Full name" value={fullName} onChangeText={setFullName} inputRef={fullNameRef} />

        <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save changes"}</Text>
        </Pressable>

        <Pressable style={styles.primaryBtn} onPress={toggleOnline}>
          <Text style={styles.primaryBtnText}>{isOnline ? "Go Offline" : "Go Online"}</Text>
        </Pressable>

        <Pressable style={styles.secondaryBtn} onPress={logout}>
          <Text style={styles.secondaryBtnText}>Logout</Text>
        </Pressable>

        <Text style={styles.roleText}>Role: {currentRole}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function CircleIcon({ icon, onPress }: { icon: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable style={styles.circleIcon} onPress={onPress}>
      {icon}
    </Pressable>
  );
}

function InfoCard({ label, onEdit, value }: { label: string; value: string; onEdit: () => void }) {
  return (
    <View style={styles.infoCard}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.infoTitle}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
      <Pressable onPress={onEdit}>
        <Text style={styles.editText}>Edit ›</Text>
      </Pressable>
    </View>
  );
}

function EditableField({
  inputRef,
  keyboardType,
  label,
  onChangeText,
  value,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "phone-pad";
  inputRef: React.RefObject<TextInput | null>;
}) {
  return (
    <View style={styles.infoCard}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.infoTitle}>{label}</Text>
        <TextInput ref={inputRef} value={value} onChangeText={onChangeText} style={styles.input} placeholderTextColor="#9aa3bd" keyboardType={keyboardType} />
      </View>
      <Pressable onPress={() => inputRef.current?.focus()}>
        <Text style={styles.editText}>Edit ›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 120, gap: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#2a2d63", fontSize: 24, fontWeight: "500" },
  headerButtons: { flexDirection: "row", gap: 10, alignItems: "center" },
  headerActionWrap: { position: "relative" },
  dotBadge: {
    position: "absolute",
    right: -4,
    top: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#ff0f64",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  dotBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  circleIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.84)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#eeeaf8" },
  miniAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#ece7f8", overflow: "hidden" },
  miniAvatarImage: { width: "100%", height: "100%" },
  miniAvatarText: { color: "#0e2756", fontWeight: "900" },
  noticeCard: { borderRadius: 18, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd5e4", padding: 12 },
  noticeText: { color: "#b0003a", fontWeight: "800" },
  okCard: { borderRadius: 18, backgroundColor: "#f0fff6", borderWidth: 1, borderColor: "#c7f5d8", padding: 12 },
  okText: { color: "#0b6b2f", fontWeight: "800" },
  profileHero: { overflow: "hidden", borderRadius: 28, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: "#ece7f8", padding: 18, flexDirection: "row", alignItems: "center", gap: 14 },
  heroAvatar: { width: 74, height: 74, borderRadius: 37, backgroundColor: "#f5efff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  heroAvatarImage: { width: "100%", height: "100%" },
  cameraBadge: { position: "absolute", right: 4, bottom: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: "#0e2756", alignItems: "center", justifyContent: "center" },
  heroName: { color: "#202554", fontSize: 22, fontWeight: "900" },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  greenDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: "#41c15f" },
  offlineDot: { backgroundColor: "#9ca5ba" },
  softDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: "#e1e3ca" },
  heroMetaText: { color: "#5f667b", fontSize: 14, fontWeight: "600" },
  uploadText: { color: "#8a88a0", fontSize: 12, fontWeight: "700", marginTop: 6 },
  infoCard: { borderRadius: 24, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: "#ece7f8", paddingHorizontal: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  infoTitle: { color: "#202554", fontSize: 16, fontWeight: "900" },
  infoValue: { color: "#5f667b", fontSize: 14, fontWeight: "600" },
  editText: { color: "#7a7790", fontSize: 15, fontWeight: "600" },
  input: { color: "#5f667b", fontSize: 15, fontWeight: "600", paddingVertical: 0 },
  saveBtn: { borderRadius: 24, backgroundColor: "#202554", alignItems: "center", justifyContent: "center", paddingVertical: 18 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  primaryBtn: { borderRadius: 24, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: "#ece7f8", alignItems: "center", justifyContent: "center", paddingVertical: 18 },
  primaryBtnText: { color: "#202554", fontSize: 16, fontWeight: "900" },
  secondaryBtn: { borderRadius: 20, backgroundColor: "rgba(255,255,255,0.86)", borderWidth: 1, borderColor: "#ece7f8", alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  secondaryBtnText: { color: "#5a556f", fontSize: 16, fontWeight: "600" },
  roleText: { color: "#8a88a0", fontSize: 12, fontWeight: "700", textAlign: "center" },
});
