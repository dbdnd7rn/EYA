import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Bell, Camera, ChevronRight, Search, Star, Truck, User2, WalletCards } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useAgentWorkspace } from "@/components/agent/useAgentWorkspace";
import { useAuth } from "@/providers/AuthProvider";

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
  form.append("folder", "eya/agents");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Image upload failed.");
  return json.secure_url as string;
}

export default function AgentProfileScreen() {
  const router = useRouter();
  const { user, role, loading: authLoading, setActiveRole } = useAuth();
  const { workspace, metrics, loading, error, saveProfile, setOnlineStatus } = useAgentWorkspace();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fullName, setFullName] = useState(workspace.profile.fullName);
  const [phone, setPhone] = useState(workspace.profile.phone);
  const [vehicleType, setVehicleType] = useState(workspace.profile.vehicleType);
  const isAdmin = role === "admin" || user?.user_metadata?.role === "admin";

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    setFullName(workspace.profile.fullName);
    setPhone(workspace.profile.phone);
    setVehicleType(workspace.profile.vehicleType);
  }, [workspace.profile.fullName, workspace.profile.phone, workspace.profile.vehicleType]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);
      await saveProfile({
        fullName,
        phone,
        vehicleType,
      });
      setEditing(false);
      setMessage("Profile updated.");
    } catch (err: any) {
      Alert.alert("Could not save profile", err?.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
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

    try {
      setUploadingAvatar(true);
      const url = await uploadAvatar(asset);
      await saveProfile({
        fullName: workspace.profile.fullName,
        phone: workspace.profile.phone,
        vehicleType: workspace.profile.vehicleType,
        avatarUrl: url,
      });
      setMessage("Profile picture updated.");
    } catch (err: any) {
      Alert.alert("Avatar upload failed", err?.message ?? "Could not update rider photo.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const goBackToUserSection = async () => {
    await setActiveRole("student");
    router.replace("/(student)/(tabs)/account");
  };

  const openAdminPortal = async () => {
    await setActiveRole("admin");
    router.replace("/admin" as any);
  };

  const toggleOnline = async () => {
    try {
      await setOnlineStatus(!workspace.profile.isOnline);
    } catch (err: any) {
      Alert.alert("Status update failed", err?.message ?? "Could not update rider status.");
    }
  };

  const openWorkspaceSwitch = () => {
    Alert.alert("Switch workspace", "Move around the app without logging out.", [
      ...(isAdmin
        ? [
            {
              text: "Admin portal",
              onPress: () => void openAdminPortal(),
            },
          ]
        : []),
      {
        text: "User section",
        onPress: async () => {
          await setActiveRole("student");
          router.replace("/(student)/(tabs)/account");
        },
      },
      {
        text: "Manage roles",
        onPress: () => router.push({ pathname: "/onboarding", params: { role: "agent" } }),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <SoftPageGlow variant="account" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2c3068" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="account" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Profile</Text>
            <View style={styles.statusRow}>
              <View style={[styles.liveDot, !workspace.profile.isOnline && styles.liveDotOff]} />
              <Text style={styles.statusText}>{workspace.profile.isOnline ? "ONLINE" : "OFFLINE"}</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable style={styles.circleAction} onPress={() => router.push("/(agent)/notifications")}>
              <Bell size={18} color="#2c3068" />
            </Pressable>
            <Pressable style={styles.circleAction} onPress={() => router.push("/(agent)/(tabs)/earnings")}>
              <Search size={18} color="#2c3068" />
            </Pressable>
          </View>
        </View>

        {error ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{error}</Text>
          </View>
        ) : null}
        {message ? (
          <View style={styles.okCard}>
            <Text style={styles.okText}>{message}</Text>
          </View>
        ) : null}

        <View style={styles.heroCard}>
          <Pressable style={styles.avatarWrap} onPress={() => void handleAvatarChange()}>
            {workspace.profile.avatarUrl ? (
              <Image source={{ uri: workspace.profile.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <User2 size={30} color="#2c3068" />
            )}
            <View style={styles.cameraBadge}>
              <Camera size={14} color="#fff" />
            </View>
          </Pressable>

          <View style={styles.heroCopy}>
            <Text style={styles.heroName}>{workspace.profile.fullName}</Text>
            <Text style={styles.heroPhone}>{workspace.profile.phone || workspace.profile.email || "+265 not set"}</Text>
            <View style={styles.activeRow}>
              <View style={[styles.liveDot, !workspace.profile.isOnline && styles.liveDotOff]} />
              <Text style={styles.activeText}>{workspace.profile.isOnline ? "Active rider" : "Offline rider"}</Text>
            </View>
          </View>

          <Pressable style={[styles.onlinePill, !workspace.profile.isOnline && styles.onlinePillOff]} onPress={() => void toggleOnline()}>
            <Text style={styles.onlinePillText}>{workspace.profile.isOnline ? "Active" : "Offline"}</Text>
          </Pressable>
        </View>

        {uploadingAvatar ? <Text style={styles.helperText}>Uploading rider picture...</Text> : null}

        <View style={styles.statsRow}>
          <StatTile icon={<Truck size={18} color="#d78b35" />} label="Completed Deliveries" value={`${metrics.completedCount}`} />
          <StatTile icon={<Star size={18} color="#d78b35" />} label="Rating" value={workspace.rating ? workspace.rating.toFixed(1) : "New"} />
        </View>

        <MenuCard label="Edit Profile" onPress={() => setEditing((current) => !current)} />
        <MenuCard label="Notifications" onPress={() => router.push("/(agent)/notifications")} />
        <MenuCard label="Earnings" onPress={() => router.push("/(agent)/(tabs)/earnings")} />
        {isAdmin ? <MenuCard label="Admin Portal" onPress={() => void openAdminPortal()} /> : null}
        <MenuCard label="Switch workspace" onPress={openWorkspaceSwitch} />
        <MenuCard label="Go back to User section" onPress={() => void goBackToUserSection()} />

        {editing ? (
          <View style={styles.editCard}>
            <Field label="Full name" value={fullName} onChangeText={setFullName} />
            <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field label="Vehicle type" value={vehicleType} onChangeText={setVehicleType} />

            <View style={styles.editActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setEditing(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={() => void handleSave()} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save changes"}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Pressable style={styles.footerToggle} onPress={() => void toggleOnline()}>
          <WalletCards size={18} color="#4d58ad" />
          <Text style={styles.footerToggleText}>{workspace.profile.isOnline ? "Go offline" : "Go online"}</Text>
          <ChevronRight size={18} color="#4d58ad" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "phone-pad";
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} style={styles.fieldInput} keyboardType={keyboardType} placeholderTextColor="#a1a6c0" />
    </View>
  );
}

function MenuCard({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable style={styles.menuCard} onPress={onPress}>
      <Text style={[styles.menuText, danger && styles.menuTextDanger]}>{label}</Text>
      <ChevronRight size={18} color={danger ? "#bf3d67" : "#8085aa"} />
    </Pressable>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <View style={styles.statTileHead}>
        {icon}
        <Text style={styles.statTileLabel}>{label}</Text>
      </View>
      <Text style={styles.statTileValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3eefb" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 18, paddingBottom: 130, gap: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerCopy: { flexDirection: "row", alignItems: "center", gap: 14 },
  title: { color: "#262a63", fontSize: 25, fontWeight: "900" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  liveDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#7cd36d" },
  liveDotOff: { backgroundColor: "#a0a9bf" },
  statusText: { color: "#555c84", fontSize: 14, fontWeight: "800" },
  headerActions: { flexDirection: "row", gap: 10 },
  circleAction: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "#ebe6f8",
    alignItems: "center",
    justifyContent: "center",
  },
  noticeCard: { borderRadius: 18, backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd7e5", padding: 12 },
  noticeText: { color: "#b0003a", fontSize: 13, fontWeight: "800" },
  okCard: { borderRadius: 18, backgroundColor: "#eef9f2", borderWidth: 1, borderColor: "#cdebd6", padding: 12 },
  okText: { color: "#0a7337", fontSize: 13, fontWeight: "800" },
  heroCard: {
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "#ece7f8",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarWrap: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "#f3f4ff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  cameraBadge: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2c3068",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: { flex: 1, gap: 4 },
  heroName: { color: "#262a63", fontSize: 22, fontWeight: "900" },
  heroPhone: { color: "#656b8f", fontSize: 14, fontWeight: "700" },
  activeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  activeText: { color: "#656b8f", fontSize: 14, fontWeight: "700" },
  onlinePill: {
    borderRadius: 999,
    backgroundColor: "#456b66",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  onlinePillOff: { backgroundColor: "#8d97ac" },
  onlinePillText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  helperText: { color: "#7d7799", fontSize: 12, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 10 },
  statTile: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.84)",
    borderWidth: 1,
    borderColor: "#ece7f8",
    padding: 16,
    gap: 10,
  },
  statTileHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  statTileLabel: { flex: 1, color: "#676d91", fontSize: 14, fontWeight: "800" },
  statTileValue: { color: "#2e3362", fontSize: 24, fontWeight: "900" },
  menuCard: {
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderColor: "#ece7f8",
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuText: { color: "#363b68", fontSize: 16, fontWeight: "800" },
  menuTextDanger: { color: "#bf3d67" },
  editCard: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "#ece7f8",
    padding: 16,
    gap: 12,
  },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: "#74799c", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  fieldInput: {
    borderRadius: 18,
    backgroundColor: "#f7f7fe",
    borderWidth: 1,
    borderColor: "#e8eaf6",
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: "#2f3462",
    fontSize: 15,
    fontWeight: "700",
  },
  editActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  cancelBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#f4f4fb",
    borderWidth: 1,
    borderColor: "#e7e6f4",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { color: "#777b9f", fontSize: 15, fontWeight: "800" },
  saveBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#4d58ad",
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  footerToggle: {
    borderRadius: 22,
    backgroundColor: "#eef0fb",
    borderWidth: 1,
    borderColor: "#e2e5f4",
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerToggleText: { flex: 1, marginLeft: 10, color: "#4d58ad", fontSize: 15, fontWeight: "900" },
});
