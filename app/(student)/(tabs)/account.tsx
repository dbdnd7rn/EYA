import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Bell, ChevronRight, CircleHelp, CreditCard, LogOut, MapPin, PencilLine, Settings, ShieldCheck, ShoppingBag, Star, Wallet2 } from "lucide-react-native";
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

type WalletAccountRow = {
  balance_mwk?: number | null;
};

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function maskPhone(phone?: string | null) {
  const raw = (phone ?? "").trim();
  if (!raw) return "+265 99 **** 4567";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return raw;
  const tail = digits.slice(-4);
  return `+${digits.slice(0, Math.min(3, digits.length - 4))} ${digits.slice(3, 5) || "99"} **** ${tail}`;
}

function formatCurrency(amount: number) {
  return `MWK ${amount.toLocaleString("en-MW")}`;
}

export default function AccountScreen() {
  const router = useRouter();
  const { user, role, signOut, setActiveRole } = useAuth();
  const { theme } = useStudentTheme();
  const { orders, wallet } = useStudentBadges();
  const { unreadCount } = useNotificationInbox();
  const notificationCount = unreadCount;
  const { location } = usePreferredLocation();
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("Peter Phiri");
  const [phone, setPhone] = useState("+265 99 **** 4567");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        if (!user?.id) return;

        const [{ data: profile }, { data: wallet }] = await Promise.all([
          supabase.from("profiles").select("full_name,phone,avatar_url").eq("id", user.id).maybeSingle(),
          supabase.from("wallet_accounts").select("balance_mwk").eq("user_id", user.id).maybeSingle(),
        ]);

        if (!active) return;

        const prof = (profile ?? null) as ProfileRow | null;
        const wal = (wallet ?? null) as WalletAccountRow | null;

        setFullName(prof?.full_name?.trim() || "User Account");
        setPhone(maskPhone(prof?.phone));
        setAvatarUrl(prof?.avatar_url ?? null);
        setWalletBalance(Number(wal?.balance_mwk ?? 0));
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const avatarText = useMemo(() => initials(fullName), [fullName]);
  const isAdmin = role === "admin" || user?.user_metadata?.role === "admin";

  const openAdminPortal = async () => {
    await setActiveRole("admin");
    router.replace("/admin" as any);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={styles.skeletonWrap}>
          <View style={[styles.skeletonCard, { height: 74, backgroundColor: theme.surfaceMuted }]} />
          <View style={[styles.skeletonCard, { height: 172, backgroundColor: theme.surfaceMuted }]} />
          <View style={[styles.skeletonCard, { height: 260, backgroundColor: theme.surfaceMuted }]} />
          <View style={[styles.skeletonCard, { height: 82, backgroundColor: theme.surfaceMuted }]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView contentContainerStyle={[styles.content, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.shell, { backgroundColor: theme.shell }]}>
          <View style={styles.headerRow}>
            <Pressable style={[styles.circleBtn, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]} onPress={() => router.push("/(student)/(tabs)/home")}>
              <ArrowLeft size={22} color={theme.text} />
            </Pressable>

            <Text style={[styles.headerTitle, { color: theme.text }]}>Account</Text>

            <View style={styles.headerRight}>
              <Pressable style={[styles.circleBtn, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]} onPress={() => router.push("/(student)/notifications")}>
                <Bell size={22} color={theme.text} />
              </Pressable>
              {notificationCount ? (
                <View style={[styles.dotBadge, { borderColor: theme.surface }]}>
                  <Text style={styles.dotBadgeText}>{notificationCount > 9 ? "9+" : notificationCount}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
            <View style={styles.profileRow}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={[styles.avatarImg, { backgroundColor: theme.surfaceMuted }]} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: theme.accent }]}>
                  <Text style={styles.avatarFallbackText}>{avatarText}</Text>
                </View>
              )}

              <View style={styles.profileText}>
                <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>{fullName}</Text>
                <Text style={[styles.phone, { color: theme.textMuted }]}>{phone}</Text>
              </View>
            </View>

            <Pressable style={[styles.editBtn, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]} onPress={() => router.push("/(student)/(tabs)/profile")}>
              <PencilLine size={18} color={theme.accent} />
              <Text style={[styles.editBtnText, { color: theme.text }]}>Edit profile</Text>
            </Pressable>
          </View>

          <View style={styles.grid}>
            <Pressable style={[styles.tile, styles.walletTile, { backgroundColor: theme.surfaceStrong, borderColor: theme.border }]} onPress={() => router.push("/(student)/(tabs)/wallet")}>
              <View style={styles.walletGlow} />
              {wallet ? (
                <View style={[styles.countBubble, { backgroundColor: theme.isDark ? "#24344e" : "#fff4ea" }]}>
                  <Text style={[styles.countText, { color: theme.text }]}>{wallet > 9 ? "9+" : wallet}</Text>
                </View>
              ) : null}
              <Text style={[styles.tileEyebrow, { color: theme.textMuted }]}>Wallet Balance</Text>
              <Text style={[styles.walletAmount, { color: theme.text }]}>{formatCurrency(walletBalance)}</Text>
              <View style={[styles.walletPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Wallet2 size={18} color={theme.textMuted} />
                <Text style={[styles.walletPillText, { color: theme.text }]}>Open wallet</Text>
              </View>
            </Pressable>

            <Pressable style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]} onPress={() => router.push("/(student)/(tabs)/orders")}>
              <View style={[styles.iconBubble, { backgroundColor: "#fdecd7" }]}>
                <ShoppingBag size={22} color="#c28d36" />
              </View>
              {orders ? (
                <View style={[styles.countBubble, { backgroundColor: theme.isDark ? "#24344e" : "#fff4ea" }]}>
                  <Text style={[styles.countText, { color: theme.text }]}>{orders > 9 ? "9+" : orders}</Text>
                </View>
              ) : null}
              <Text style={[styles.tileTitle, { color: theme.text }]}>Orders</Text>
            </Pressable>

            <Pressable
              style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}
              onPress={() => router.push("/(student)/address")}
            >
              <View style={[styles.iconBubble, { backgroundColor: "#e5f3ee" }]}>
                <MapPin size={22} color="#698b7a" />
              </View>
              <Text style={[styles.tileTitle, { color: theme.text }]}>Addresses</Text>
              <Text numberOfLines={2} style={[styles.tileSub, { color: theme.textSoft }]}>{formatPreferredLocation(location)}</Text>
            </Pressable>

            <Pressable
              style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}
              onPress={() => router.push("/(student)/payments")}
            >
              <View style={[styles.iconBubble, { backgroundColor: "#e6eefb" }]}>
                <CreditCard size={22} color="#5b6fad" />
              </View>
              <Text style={[styles.tileTitle, { color: theme.text }]}>Payments</Text>
            </Pressable>
          </View>

          <View style={styles.rowMenu}>
            <Pressable style={[styles.menuPill, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]} onPress={() => router.push("/(student)/settings")}>
              <View style={[styles.menuIconSoft, { backgroundColor: theme.surfaceMuted }]}>
                <Settings size={18} color={theme.textMuted} />
              </View>
              <Text style={[styles.menuText, { color: theme.text }]}>Settings</Text>
            </Pressable>

            <Pressable style={[styles.menuPill, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]} onPress={() => router.push("/(student)/help")}>
              <View style={[styles.menuIconSoft, { backgroundColor: theme.surfaceMuted }]}>
                <CircleHelp size={18} color={theme.accent} />
              </View>
              <Text style={[styles.menuText, { color: theme.text }]}>Help</Text>
              <ChevronRight size={18} color={theme.textSoft} />
            </Pressable>
          </View>

          {isAdmin ? (
            <Pressable
              style={[styles.rolesWorkspaceBtn, styles.adminPortalBtn, { backgroundColor: theme.surfaceStrong, borderColor: "#111827" }]}
              onPress={() => void openAdminPortal()}
            >
              <View style={[styles.rolesWorkspaceIconWrap, { backgroundColor: "#111827", borderColor: "#111827" }]}>
                <ShieldCheck size={17} color="#ffffff" />
              </View>
              <View style={styles.rolesWorkspaceTextWrap}>
                <Text style={[styles.rolesWorkspaceTitle, { color: theme.text }]}>Admin Portal</Text>
                <Text style={[styles.rolesWorkspaceSub, { color: theme.textMuted }]}>Return to platform management</Text>
              </View>
              <ChevronRight size={19} color={theme.textSoft} />
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.rolesWorkspaceBtn, { backgroundColor: theme.surface, borderColor: theme.accent }]}
            onPress={() => router.push("/onboarding")}
          >
            <View style={[styles.rolesWorkspaceIconWrap, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
              <Star size={17} color={theme.accent} />
            </View>
            <View style={styles.rolesWorkspaceTextWrap}>
              <Text style={[styles.rolesWorkspaceTitle, { color: theme.text }]}>Roles & Workspaces</Text>
              <Text style={[styles.rolesWorkspaceSub, { color: theme.textMuted }]}>Register extra roles and switch workspaces</Text>
            </View>
            <ChevronRight size={19} color={theme.textSoft} />
          </Pressable>

          <Pressable
            style={[styles.signOutBtn, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}
            onPress={() =>
              Alert.alert("Sign out", "Log out of your account?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign out",
                  style: "destructive",
                  onPress: async () => {
                    await signOut();
                    router.replace("/(auth)/login");
                  },
                },
              ])
            }
          >
            <View style={[styles.menuIconSoft, styles.signOutIconSoft, { backgroundColor: theme.isDark ? "#4b2c38" : "#fff0f6" }]}>
              <LogOut size={18} color="#cf7d84" />
            </View>
            <Text style={[styles.signOutText, { color: theme.isDark ? "#ffb3c6" : "#74494e" }]}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  content: {
    padding: 16,
    paddingBottom: 118,
    backgroundColor: "#f4f2fb",
  },
  shell: {
    borderRadius: 36,
    backgroundColor: "#f7f5fd",
    padding: 16,
    gap: 14,
    overflow: "hidden",
    shadowColor: "#8a99c1",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  skeletonWrap: { padding: 16, gap: 12 },
  skeletonCard: { borderRadius: 28, backgroundColor: "#dde1ff" },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  circleBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#eef1fb",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#edf1fb",
  },
  headerTitle: { color: "#0e2756", fontSize: 22, fontWeight: "900" },
  headerRight: { position: "relative" },
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

  profileCard: {
    borderRadius: 30,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eef1fb",
    padding: 16,
    gap: 14,
    shadowColor: "#8a99c1",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 1,
  },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarImg: { width: 74, height: 74, borderRadius: 37, backgroundColor: "#ebedf5" },
  avatarFallback: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#0e2756",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: { color: "#fff", fontSize: 24, fontWeight: "900" },
  profileText: { flex: 1 },
  name: { color: "#0e2756", fontSize: 20, fontWeight: "900" },
  phone: { marginTop: 5, color: "#6e7892", fontSize: 15, fontWeight: "600" },
  editBtn: {
    alignSelf: "flex-start",
    minHeight: 58,
    borderRadius: 999,
    backgroundColor: "#eef1fb",
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e7ebf5",
  },
  editBtnText: { color: "#0e2756", fontSize: 17, fontWeight: "800" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  tile: {
    width: "48%",
    minHeight: 170,
    borderRadius: 30,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eef1fb",
    padding: 16,
    justifyContent: "space-between",
    shadowColor: "#8a99c1",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 1,
  },
  walletTile: {
    overflow: "hidden",
    backgroundColor: "#dceeff",
    borderColor: "#d7e7fb",
  },
  walletGlow: {
    position: "absolute",
    right: -20,
    bottom: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,214,200,0.45)",
  },
  tileEyebrow: { color: "#6e7892", fontSize: 14, fontWeight: "500" },
  walletAmount: { color: "#0e2756", fontSize: 21, fontWeight: "900", maxWidth: 120 },
  walletPill: {
    alignSelf: "flex-start",
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e7ebf5",
  },
  walletPillText: { color: "#0e2756", fontSize: 14, fontWeight: "800" },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  countBubble: {
    position: "absolute",
    top: 14,
    right: 14,
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 8,
    backgroundColor: "#fff4ea",
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: "#0e2756", fontSize: 16, fontWeight: "900" },
  tileTitle: { color: "#0e2756", fontSize: 18, fontWeight: "500" },
  tileSub: { color: "#7b86a2", fontSize: 13, fontWeight: "600", lineHeight: 18 },

  rowMenu: { flexDirection: "row", gap: 12 },
  menuPill: {
    flex: 1,
    minHeight: 72,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eef1fb",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#8a99c1",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  menuIconSoft: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#eef1fb",
    alignItems: "center",
    justifyContent: "center",
  },
  menuText: { flex: 1, color: "#0e2756", fontSize: 16, fontWeight: "700" },
  rolesWorkspaceBtn: {
    minHeight: 88,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#5e73dd",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#7f8db2",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  adminPortalBtn: {
    borderWidth: 1.5,
  },
  rolesWorkspaceIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#e6ebf7",
    backgroundColor: "#eef1fb",
    alignItems: "center",
    justifyContent: "center",
  },
  rolesWorkspaceTextWrap: { flex: 1, gap: 3 },
  rolesWorkspaceTitle: { color: "#0e2756", fontSize: 18, fontWeight: "900", lineHeight: 22 },
  rolesWorkspaceSub: { color: "#6e7892", fontSize: 13, fontWeight: "600", lineHeight: 17 },
  signOutBtn: {
    minHeight: 82,
    borderRadius: 28,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eef1fb",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#8a99c1",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  signOutIconSoft: { backgroundColor: "#fff0f6" },
  signOutText: { color: "#74494e", fontSize: 18, fontWeight: "700" },
});
