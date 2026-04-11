import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, Bell, ChevronRight, CircleHelp, CreditCard, LogOut, MapPin, MessageCircle, PencilLine, Settings, ShoppingBag, Wallet2 } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useNotificationInbox } from "@/providers/NotificationInboxProvider";
import { useStudentBadges } from "@/providers/StudentBadgeProvider";
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
  const { user, signOut } = useAuth();
  const { messages, orders, wallet } = useStudentBadges();
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

        setFullName(prof?.full_name?.trim() || "Student Account");
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

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.skeletonWrap}>
          <View style={[styles.skeletonCard, { height: 74 }]} />
          <View style={[styles.skeletonCard, { height: 172 }]} />
          <View style={[styles.skeletonCard, { height: 260 }]} />
          <View style={[styles.skeletonCard, { height: 82 }]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow topColor="rgba(169, 190, 255, 0.16)" middleColor="rgba(206, 196, 255, 0.14)" bottomColor="rgba(255, 214, 196, 0.12)" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.shell}>
          <View style={styles.headerRow}>
            <Pressable style={styles.circleBtn} onPress={() => router.push("/(student)/(tabs)/home")}>
              <ArrowLeft size={22} color="#23273f" />
            </Pressable>

            <Text style={styles.headerTitle}>Account</Text>

            <View style={styles.headerRight}>
              <Pressable style={styles.circleBtn} onPress={() => router.push("/(student)/notifications")}>
                <Bell size={22} color="#23273f" />
              </Pressable>
              {notificationCount ? (
                <View style={styles.dotBadge}>
                  <Text style={styles.dotBadgeText}>{notificationCount > 9 ? "9+" : notificationCount}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.profileCard}>
            <View style={styles.profileRow}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{avatarText}</Text>
                </View>
              )}

              <View style={styles.profileText}>
                <Text numberOfLines={1} style={styles.name}>{fullName}</Text>
                <Text style={styles.phone}>{phone}</Text>
              </View>
            </View>

            <Pressable style={styles.editBtn} onPress={() => router.push("/(student)/(tabs)/profile")}>
              <PencilLine size={18} color="#5e63a8" />
              <Text style={styles.editBtnText}>Edit profile</Text>
            </Pressable>
          </View>

          <View style={styles.grid}>
            <Pressable style={[styles.tile, styles.walletTile]} onPress={() => router.push("/(student)/(tabs)/wallet")}>
              <View style={styles.walletGlow} />
              {wallet ? (
                <View style={styles.countBubble}>
                  <Text style={styles.countText}>{wallet > 9 ? "9+" : wallet}</Text>
                </View>
              ) : null}
              <Text style={styles.tileEyebrow}>Wallet Balance</Text>
              <Text style={styles.walletAmount}>{formatCurrency(walletBalance)}</Text>
              <View style={styles.walletPill}>
                <Wallet2 size={18} color="#6a6f97" />
                <Text style={styles.walletPillText}>Open wallet</Text>
              </View>
            </Pressable>

            <Pressable style={styles.tile} onPress={() => router.push("/(student)/(tabs)/orders")}>
              <View style={[styles.iconBubble, { backgroundColor: "#fdecd7" }]}>
                <ShoppingBag size={22} color="#c28d36" />
              </View>
              {orders ? (
                <View style={styles.countBubble}>
                  <Text style={styles.countText}>{orders > 9 ? "9+" : orders}</Text>
                </View>
              ) : null}
              <Text style={styles.tileTitle}>Orders</Text>
            </Pressable>

            <Pressable
              style={styles.tile}
              onPress={() => router.push("/(student)/address")}
            >
              <View style={[styles.iconBubble, { backgroundColor: "#e5f3ee" }]}>
                <MapPin size={22} color="#698b7a" />
              </View>
              <Text style={styles.tileTitle}>Addresses</Text>
              <Text numberOfLines={2} style={styles.tileSub}>{formatPreferredLocation(location)}</Text>
            </Pressable>

            <Pressable
              style={styles.tile}
              onPress={() => Alert.alert("Payments", "Payment methods can be connected next.")}
            >
              <View style={[styles.iconBubble, { backgroundColor: "#e6eefb" }]}>
                <CreditCard size={22} color="#5b6fad" />
              </View>
              <Text style={styles.tileTitle}>Payments</Text>
            </Pressable>
          </View>

          <View style={styles.rowMenu}>
            <Pressable style={styles.menuPill} onPress={() => router.push("/safety")}>
              <View style={styles.menuIconSoft}>
                <Settings size={18} color="#6b6f82" />
              </View>
              <Text style={styles.menuText}>Settings</Text>
            </Pressable>

            <Pressable style={styles.menuPill} onPress={() => router.push("/support")}>
              <View style={styles.menuIconSoft}>
                <CircleHelp size={18} color="#5d63aa" />
              </View>
              <Text style={styles.menuText}>Help</Text>
              <ChevronRight size={18} color="#7e84a2" />
            </Pressable>
          </View>

          <Pressable
            style={styles.signOutBtn}
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
            <View style={[styles.menuIconSoft, styles.signOutIconSoft]}>
              <LogOut size={18} color="#cf7d84" />
            </View>
            <Text style={styles.signOutText}>Sign out</Text>
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
