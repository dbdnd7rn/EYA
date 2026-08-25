import React from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  CircleHelp,
  LogOut,
  MapPin,
  PencilLine,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
} from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useNotificationInbox } from "@/providers/NotificationInboxProvider";
import { useStudentBadges } from "@/providers/StudentBadgeProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";
import { formatPreferredLocation, usePreferredLocation } from "@/providers/PreferredLocationProvider";

type ProfileRow = {
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
};

function initials(name?: string | null) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return `${parts[0]?.[0] ?? "U"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function maskPhone(phone?: string | null) {
  const raw = String(phone ?? "").trim();
  if (!raw) return "Add phone number";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return raw;
  const tail = digits.slice(-4);
  const prefix = digits.slice(0, Math.max(0, digits.length - 7));
  return prefix ? `+${prefix} *** ${tail}` : `*** ${tail}`;
}

export default function AccountStudio() {
  const router = useRouter();
  const { user, role, signOut, setActiveRole } = useAuth();
  const { theme } = useStudentTheme();
  const { orders } = useStudentBadges();
  const { unreadCount } = useNotificationInbox();
  const { location } = usePreferredLocation();

  const [loading, setLoading] = React.useState(true);
  const [fullName, setFullName] = React.useState("EYA User");
  const [phone, setPhone] = React.useState("Add phone number");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        if (!user?.id) return;
        const { data, error } = await supabase
          .from("profiles")
          .select("full_name,phone,avatar_url")
          .eq("id", user.id)
          .maybeSingle();

        if (error) throw error;
        if (!active) return;

        const profile = (data ?? null) as ProfileRow | null;
        const fallbackName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").trim();
        setFullName(profile?.full_name?.trim() || fallbackName || "EYA User");
        setPhone(maskPhone(profile?.phone));
        setAvatarUrl(profile?.avatar_url ?? null);
      } catch {
        if (!active) return;
        const fallbackName = String(user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? "").trim();
        setFullName(fallbackName || "EYA User");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [user?.id, user?.user_metadata?.full_name, user?.user_metadata?.name]);

  const isAdmin = role === "admin" || user?.user_metadata?.role === "admin";
  const avatarText = React.useMemo(() => initials(fullName), [fullName]);

  const openAdminPortal = async () => {
    await setActiveRole("admin");
    router.replace("/admin" as any);
  };

  const confirmSignOut = () => {
    Alert.alert("Sign out?", "You’ll need to sign in again to continue.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading account...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="Back to Home"
            style={[styles.circleBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => router.replace("/(student)/(tabs)/home" as any)}
          >
            <ArrowLeft size={20} color={theme.text} />
          </Pressable>

          <Text style={[styles.headerTitle, { color: theme.heading }]}>Account</Text>

          <View style={styles.notificationWrap}>
            <Pressable
              accessibilityLabel="Notifications"
              style={[styles.circleBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => router.push("/(student)/notifications" as any)}
            >
              <Bell size={20} color={theme.text} />
            </Pressable>
            {unreadCount > 0 ? (
              <View style={[styles.badge, { borderColor: theme.surface }]}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
          <View style={styles.profileMain}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={[styles.avatar, { backgroundColor: theme.surfaceMuted }]} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: theme.accent }]}>
                <Text style={styles.avatarText}>{avatarText}</Text>
              </View>
            )}

            <View style={styles.profileCopy}>
              <Text numberOfLines={1} style={[styles.name, { color: theme.heading }]}>{fullName}</Text>
              <Text numberOfLines={1} style={[styles.phone, { color: theme.textMuted }]}>{phone}</Text>
            </View>

            <Pressable
              accessibilityLabel="Edit profile"
              style={[styles.editIconBtn, { backgroundColor: theme.surfaceMuted }]}
              onPress={() => router.push("/(student)/(tabs)/profile" as any)}
            >
              <PencilLine size={17} color={theme.accent} />
            </Pressable>
          </View>

          <Pressable
            style={[styles.editProfileBtn, { backgroundColor: theme.surfaceMuted }]}
            onPress={() => router.push("/(student)/(tabs)/profile" as any)}
          >
            <Text style={[styles.editProfileText, { color: theme.text }]}>Edit profile</Text>
            <ChevronRight size={17} color={theme.textSoft} />
          </Pressable>
        </View>

        <View style={styles.quickGrid}>
          <Pressable
            style={[styles.quickCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}
            onPress={() => router.push("/(student)/(tabs)/orders" as any)}
          >
            <View style={[styles.quickIcon, { backgroundColor: theme.isDark ? "#3f3326" : "#fdebd5" }]}>
              <ShoppingBag size={22} color={theme.isDark ? "#efc27a" : "#bc8227"} />
            </View>
            {orders > 0 ? (
              <View style={[styles.orderCount, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.orderCountText, { color: theme.accent }]}>{orders > 9 ? "9+" : orders}</Text>
              </View>
            ) : null}
            <Text style={[styles.quickTitle, { color: theme.text }]}>Orders</Text>
          </Pressable>

          <Pressable
            style={[styles.quickCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}
            onPress={() => router.push("/(student)/address" as any)}
          >
            <View style={[styles.quickIcon, { backgroundColor: theme.isDark ? "#203a35" : "#e4f2ed" }]}>
              <MapPin size={22} color={theme.isDark ? "#82bea9" : "#668b7c"} />
            </View>
            <Text style={[styles.quickTitle, { color: theme.text }]}>Addresses</Text>
            <Text numberOfLines={1} style={[styles.quickSub, { color: theme.textSoft }]}>{formatPreferredLocation(location)}</Text>
          </Pressable>
        </View>

        <View style={styles.compactRow}>
          <Pressable
            style={[styles.compactAction, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}
            onPress={() => router.push("/(student)/settings" as any)}
          >
            <View style={[styles.compactIcon, { backgroundColor: theme.surfaceMuted }]}>
              <Settings size={18} color={theme.textMuted} />
            </View>
            <Text style={[styles.compactText, { color: theme.text }]}>Settings</Text>
          </Pressable>

          <Pressable
            style={[styles.compactAction, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}
            onPress={() => router.push("/(student)/help" as any)}
          >
            <View style={[styles.compactIcon, { backgroundColor: theme.surfaceMuted }]}>
              <CircleHelp size={18} color={theme.accent} />
            </View>
            <Text style={[styles.compactText, { color: theme.text }]}>Help</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.workspaceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.push("/(student)/workspaces" as any)}
        >
          <View style={[styles.workspaceIcon, { backgroundColor: theme.accentSoft }]}>
            <Star size={19} color={theme.accent} />
          </View>
          <View style={styles.workspaceCopy}>
            <Text style={[styles.workspaceTitle, { color: theme.text }]}>Workspaces</Text>
            <Text style={[styles.workspaceSub, { color: theme.textMuted }]}>Switch workspace</Text>
          </View>
          <ChevronRight size={19} color={theme.textSoft} />
        </Pressable>

        {isAdmin ? (
          <Pressable
            style={[styles.workspaceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => void openAdminPortal()}
          >
            <View style={[styles.workspaceIcon, { backgroundColor: theme.isDark ? "#27354c" : "#eef1f7" }]}>
              <ShieldCheck size={19} color={theme.text} />
            </View>
            <View style={styles.workspaceCopy}>
              <Text style={[styles.workspaceTitle, { color: theme.text }]}>Admin Portal</Text>
              <Text style={[styles.workspaceSub, { color: theme.textMuted }]}>Platform management</Text>
            </View>
            <ChevronRight size={19} color={theme.textSoft} />
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.signOutBtn, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}
          onPress={confirmSignOut}
        >
          <View style={[styles.compactIcon, { backgroundColor: theme.isDark ? "#472a34" : "#fff0f4" }]}>
            <LogOut size={18} color={theme.danger} />
          </View>
          <Text style={[styles.signOutText, { color: theme.danger }]}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 124, gap: 13, width: "100%", maxWidth: 760, alignSelf: "center" },
  headerRow: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  circleBtn: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 22, fontWeight: "900", letterSpacing: -0.3 },
  notificationWrap: { position: "relative" },
  badge: { position: "absolute", right: -4, top: -3, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, backgroundColor: "#ff285d", borderWidth: 2, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  profileCard: { borderRadius: 26, borderWidth: 1, padding: 15, gap: 13, shadowColor: "#7180a6", shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 1 },
  profileMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 66, height: 66, borderRadius: 33 },
  avatarFallback: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "900" },
  profileCopy: { flex: 1, minWidth: 0 },
  name: { fontSize: 19, fontWeight: "900" },
  phone: { marginTop: 4, fontSize: 13, fontWeight: "700" },
  editIconBtn: { width: 39, height: 39, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  editProfileBtn: { minHeight: 43, borderRadius: 15, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  editProfileText: { fontSize: 13, fontWeight: "900" },
  quickGrid: { flexDirection: "row", gap: 12 },
  quickCard: { flex: 1, minWidth: 0, minHeight: 132, borderRadius: 24, borderWidth: 1, padding: 14, justifyContent: "space-between", position: "relative", shadowColor: "#7180a6", shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 1 },
  quickIcon: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  quickTitle: { fontSize: 16, fontWeight: "900" },
  quickSub: { fontSize: 11, fontWeight: "700", marginTop: 3 },
  orderCount: { position: "absolute", right: 13, top: 13, minWidth: 28, height: 28, borderRadius: 14, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
  orderCountText: { fontSize: 11, fontWeight: "900" },
  compactRow: { flexDirection: "row", gap: 12 },
  compactAction: { flex: 1, minHeight: 62, borderRadius: 22, borderWidth: 1, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  compactIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  compactText: { fontSize: 14, fontWeight: "900" },
  workspaceCard: { minHeight: 72, borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  workspaceIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  workspaceCopy: { flex: 1 },
  workspaceTitle: { fontSize: 15, fontWeight: "900" },
  workspaceSub: { marginTop: 2, fontSize: 11, fontWeight: "700" },
  signOutBtn: { minHeight: 62, borderRadius: 22, borderWidth: 1, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  signOutText: { fontSize: 14, fontWeight: "900" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 12, fontWeight: "800" },
});
