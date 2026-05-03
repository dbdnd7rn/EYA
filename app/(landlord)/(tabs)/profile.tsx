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
import {
  Bell,
  ChevronRight,
  CreditCard,
  Ellipsis,
  House,
  Settings,
  Shield,
} from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useNotificationInbox } from "@/providers/NotificationInboxProvider";

type ProfileRow = {
  id?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  role?: "student" | "landlord" | "admin" | string | null;
  created_at?: string | null;
};

function initials(name?: string | null) {
  const clean = (name ?? "").trim();
  if (!clean) return "LL";
  const parts = clean.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "L";
  const b = parts[1]?.[0] ?? "L";
  return `${a}${b}`.toUpperCase();
}

function MenuRow({
  accent,
  badge,
  icon,
  label,
  onPress,
  subtitle,
}: {
  accent: string;
  badge?: string | null;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  subtitle?: string;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]} onPress={onPress}>
      <View style={[styles.menuIconWrap, { backgroundColor: accent }]}>{icon}</View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subtitle ? <Text style={styles.menuSub}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.menuBadge}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <ChevronRight size={20} color="#7b83a7" />
    </Pressable>
  );
}

function Notice({ tone, text }: { tone: "error" | "ok"; text: string }) {
  return (
    <View style={[styles.notice, tone === "error" ? styles.noticeError : styles.noticeOk]}>
      <Text style={[styles.noticeText, tone === "error" ? styles.noticeTextError : styles.noticeTextOk]}>{text}</Text>
    </View>
  );
}

export default function LandlordProfileScreen() {
  const { user, role, setActiveRole } = useAuth();
  const { unreadCount } = useNotificationInbox();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const displayEmail = profile?.email ?? user?.email ?? "-";
  const avatarUrl = profile?.avatar_url ?? null;
  const isAdmin = role === "admin" || user?.user_metadata?.role === "admin";

  const derivedName = useMemo(() => {
    const joined =
      profile?.full_name ??
      `${profile?.first_name ?? ""} ${profile?.last_name ?? profile?.surname ?? ""}`.trim();
    return (joined ?? "").trim() || "Landlord";
  }, [profile]);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        setLoading(true);
        setErr(null);
        setMsg(null);

        const attempts = [
          "id,full_name,email,phone,role,created_at,avatar_url",
          "id,first_name,last_name,email,phone,role,created_at,avatar_url",
          "id,first_name,surname,email,phone,role,created_at,avatar_url",
          "id,full_name,phone,role,created_at,avatar_url",
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

        setProfile(profileData);
        const initialName =
          profileData.full_name ??
          `${profileData.first_name ?? ""} ${profileData.last_name ?? profileData.surname ?? ""}`.trim();
        setFullName((initialName ?? "").trim());
        setPhone((profileData.phone ?? "").trim());
        setLoading(false);
      } catch (e: any) {
        setErr(e?.message ?? "Something went wrong");
        setLoading(false);
      }
    };

    void load();
  }, [user?.id]);

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
      setErr("Phone should start with +265 (e.g. +265991234567).");
      setSaving(false);
      return;
    }

    let updateError: string | null = null;

    const fullNameUpdate = await supabase
      .from("profiles")
      .update({ full_name: cleanName, phone: cleanPhone || null })
      .eq("id", user.id);

    if (fullNameUpdate.error) {
      const parts = cleanName.split(/\s+/).filter(Boolean);
      const first = parts.shift() ?? cleanName;
      const rest = parts.join(" ") || null;
      const fallback = await supabase
        .from("profiles")
        .update({ first_name: first, last_name: rest, surname: rest, phone: cleanPhone || null } as any)
        .eq("id", user.id);

      if (fallback.error) updateError = fallback.error.message;
    }

    if (updateError) {
      setErr(updateError);
      setSaving(false);
      return;
    }

    setProfile((prev) => ({ ...(prev ?? {}), full_name: cleanName, phone: cleanPhone || null }));
    setMsg("Profile updated successfully.");
    setSaving(false);
    setEditorOpen(false);
  };

  const openQuickActions = () => {
    Alert.alert("Quick actions", "Choose what to open.", [
      { text: "My listings", onPress: () => router.push("/(landlord)/(tabs)/listings") },
      { text: "Notifications", onPress: () => router.push("/(landlord)/notifications") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const openSecurity = () => {
    router.push({
      pathname: "/support",
      params: {
        type: "message_us",
        subject: "Landlord account security",
        prefill: "I need help securing, recovering, or updating my landlord account access.",
      },
    } as any);
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
        onPress: () => router.push({ pathname: "/onboarding", params: { role: "landlord" } }),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const openAdminPortal = async () => {
    await setActiveRole("admin");
    router.replace("/admin" as any);
  };

  const goBackToUserSection = async () => {
    await setActiveRole("student");
    router.replace("/(student)/(tabs)/account");
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View pointerEvents="none" style={[styles.backgroundOrb, styles.backgroundOrbLeft]} />
        <View pointerEvents="none" style={[styles.backgroundOrb, styles.backgroundOrbRight]} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#ff0f64" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View pointerEvents="none" style={[styles.backgroundOrb, styles.backgroundOrbLeft]} />
      <View pointerEvents="none" style={[styles.backgroundOrb, styles.backgroundOrbRight]} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.h1}>Profile</Text>
          <Pressable style={styles.menuBtn} onPress={openQuickActions}>
            <Ellipsis size={22} color="#646d92" />
          </Pressable>
        </View>

        <View style={styles.profileHero}>
          <View style={styles.avatarShell}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackText}>{initials(derivedName)}</Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              <House size={16} color="#fff" />
            </View>
          </View>

          <View style={styles.profileCopy}>
            <Text numberOfLines={1} style={styles.name}>
              {derivedName}
            </Text>
            <Text numberOfLines={1} style={styles.email}>
              {displayEmail}
            </Text>
          </View>
        </View>

        {err ? <Notice tone="error" text={err} /> : null}
        {msg ? <Notice tone="ok" text={msg} /> : null}

        <View style={styles.menuList}>
          <MenuRow
            accent="#ffe9f3"
            icon={<CreditCard size={20} color="#ff0f64" />}
            label="Payments & Payouts"
            onPress={() => router.push("/(landlord)/subscription")}
            subtitle="Access and payout setup"
          />

          <MenuRow
            accent="#eef1ff"
            badge={unreadCount ? (unreadCount > 99 ? "99+" : String(unreadCount)) : null}
            icon={<Bell size={20} color="#3354b8" />}
            label="Notifications"
            onPress={() => router.push("/(landlord)/notifications")}
            subtitle="Alerts and landlord updates"
          />

          <MenuRow
            accent="#e8f7f4"
            icon={<Shield size={20} color="#0f5f7c" />}
            label="Account Security"
            onPress={openSecurity}
            subtitle="Login and account protection"
          />

          <MenuRow
            accent="#eef1ff"
            icon={<Settings size={20} color="#4b5eaa" />}
            label="Settings"
            onPress={() => setEditorOpen((current) => !current)}
            subtitle={editorOpen ? "Hide profile editor" : "Edit profile and landlord tools"}
          />
          <MenuRow
            accent="#fff4ea"
            icon={<House size={20} color="#9f5b1f" />}
            label="Switch workspace"
            onPress={openWorkspaceSwitch}
            subtitle="Go back to the user section or manage roles"
          />
          {isAdmin ? (
            <MenuRow
              accent="#f8f5ec"
              icon={<Shield size={20} color="#111827" />}
              label="Admin Portal"
              onPress={() => void openAdminPortal()}
              subtitle="Return to platform control"
            />
          ) : null}
        </View>

        {editorOpen ? (
          <View style={styles.editorCard}>
            <Text style={styles.editorTitle}>Profile settings</Text>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g. Your name"
                placeholderTextColor="#9aa3bd"
                style={styles.input}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Phone (WhatsApp)</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="e.g. +265991234567"
                placeholderTextColor="#9aa3bd"
                keyboardType="phone-pad"
                style={styles.input}
              />
            </View>

            <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
              <Text style={styles.saveBtnText}>{saving ? "Saving..." : "Save changes"}</Text>
            </Pressable>

            <View style={styles.quickActionRow}>
              <Pressable style={styles.quickChip} onPress={() => router.push("/(landlord)/(tabs)/listings")}>
                <Text style={styles.quickChipText}>My listings</Text>
              </Pressable>
              <Pressable style={styles.quickChip} onPress={() => router.push("/(landlord)/(tabs)/enquiries")}>
                <Text style={styles.quickChipText}>Enquiries</Text>
              </Pressable>
              <Pressable style={styles.quickChip} onPress={() => router.push("/(landlord)/(tabs)/create")}>
                <Text style={styles.quickChipText}>Create listing</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Pressable style={styles.userSectionPill} onPress={() => void goBackToUserSection()}>
          <House size={16} color="#3354b8" />
          <Text style={styles.userSectionPillText}>Go back to User section</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8f5ff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundOrb: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.56,
  },
  backgroundOrbLeft: {
    width: 220,
    height: 220,
    left: -100,
    top: 40,
    backgroundColor: "#efeaff",
    shadowColor: "#b79bff",
    shadowOpacity: 0.2,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  backgroundOrbRight: {
    width: 260,
    height: 260,
    right: -120,
    bottom: 140,
    backgroundColor: "#ffe4ef",
    shadowColor: "#ff6ea8",
    shadowOpacity: 0.16,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 0 },
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 150,
    gap: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  h1: {
    color: "#1f2f68",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  menuBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#ece8fa",
    alignItems: "center",
    justifyContent: "center",
  },
  profileHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  avatarShell: {
    position: "relative",
  },
  avatar: {
    width: 118,
    height: 118,
    borderRadius: 36,
    backgroundColor: "#ebedf5",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dfe7ff",
  },
  avatarFallbackText: {
    color: "#22408a",
    fontSize: 30,
    fontWeight: "900",
  },
  avatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ff0f64",
    borderWidth: 4,
    borderColor: "#f8f5ff",
    alignItems: "center",
    justifyContent: "center",
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  name: {
    color: "#1f2f68",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  email: {
    color: "#7a82a4",
    fontSize: 16,
    fontWeight: "600",
  },
  notice: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  noticeError: {
    backgroundColor: "#fff1f7",
    borderColor: "#ffd2e5",
  },
  noticeOk: {
    backgroundColor: "#f0fff6",
    borderColor: "#c7f5d8",
  },
  noticeText: {
    fontWeight: "800",
  },
  noticeTextError: {
    color: "#b0003a",
  },
  noticeTextOk: {
    color: "#0b6b2f",
  },
  menuList: {
    gap: 14,
  },
  menuRow: {
    minHeight: 88,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "#ebe7fb",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#c9c0ea",
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  menuRowPressed: {
    opacity: 0.9,
  },
  menuIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  menuCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  menuLabel: {
    color: "#1f2f68",
    fontSize: 17,
    fontWeight: "800",
  },
  menuSub: {
    color: "#7c84a7",
    fontSize: 13,
    fontWeight: "600",
  },
  menuBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ff0f64",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  menuBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  editorCard: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#ebe7fb",
    padding: 18,
    gap: 14,
    shadowColor: "#c9c0ea",
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  editorTitle: {
    color: "#1f2f68",
    fontSize: 18,
    fontWeight: "900",
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    color: "#5f6d9a",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#f8f7ff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2def1",
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: "#1f2f68",
    fontWeight: "700",
  },
  saveBtn: {
    backgroundColor: "#ff0f64",
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  quickActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2def1",
    backgroundColor: "#fbfbff",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quickChipText: {
    color: "#1f2f68",
    fontWeight: "800",
    fontSize: 13,
  },
  userSectionPill: {
    alignSelf: "center",
    minHeight: 50,
    borderRadius: 999,
    backgroundColor: "#eef1ff",
    borderWidth: 1,
    borderColor: "#dbe3ff",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  userSectionPillText: {
    color: "#3354b8",
    fontSize: 15,
    fontWeight: "900",
  },
});
