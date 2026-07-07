import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Bell, ChevronRight, Clock3, Mail, MapPin, PencilLine, Phone, Search, ShieldCheck, Star, UserRound } from "lucide-react-native";
import { useAuth } from "@/providers/AuthProvider";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import { getSellerStorefrontMeta } from "@/lib/sellerStorefront";
import { getSellerShopMeta } from "@/lib/sellerEnhancements";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function RestaurantProfilePage() {
  const router = useRouter();
  const { user, role, setActiveRole } = useAuth();
  const { workspace, metrics, updateVendorProfile } = useSellerWorkspace("food");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState<string | null>(null);
  const [openingHours, setOpeningHours] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const name = workspace.vendor?.name || workspace.profile.displayName || "My Restaurant";
  const phone = workspace.profile.phone || "+265 000 000 000";
  const online = workspace.vendor?.is_active ?? true;
  const isAdmin = role === "admin" || user?.user_metadata?.role === "admin";
  const rating = useMemo(() => {
    if (!workspace.orders.length) return 4.8;
    return Math.max(4.4, Math.min(5, Number((4.6 + metrics.deliveredCount / 100).toFixed(1))));
  }, [metrics.deliveredCount, workspace.orders.length]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!workspace.vendor?.id) {
        setAvatarUrl(null);
        return;
      }
      const meta = await getSellerStorefrontMeta(workspace.vendor.id).catch(() => null);
      const shopMeta = await getSellerShopMeta(workspace.vendor.id).catch(() => null);
      if (!active) return;
      setAvatarUrl(meta?.avatarUrl ?? null);
      setContactEmail(shopMeta?.contactEmail ?? user?.email ?? null);
      setContactPhone(shopMeta?.contactPhone ?? workspace.profile.phone ?? null);
      setOpeningHours(shopMeta?.openingHours ?? null);
    };
    void load();
    return () => {
      active = false;
    };
  }, [user?.email, workspace.profile.phone, workspace.vendor?.id]);

  const toggleOnline = async () => {
    if (!workspace.vendor) {
      router.push("/(market)/setup");
      return;
    }
    try {
      setToggling(true);
      await updateVendorProfile({ is_active: !online });
    } catch (err: any) {
      Alert.alert("Update failed", err?.message ?? "Could not update your status.");
    } finally {
      setToggling(false);
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
        onPress: () => router.push({ pathname: "/onboarding", params: { role: "vendor" } }),
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

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subTitle}>{online ? "ONLINE" : "OFFLINE"}</Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={() => router.push("/(market)/notifications")}>
            <Search size={18} color="#232c54" />
          </Pressable>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>{initials(name)}</Text>
              </View>
            )}
            <View style={styles.profileCopy}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.phone}>{phone}</Text>
            </View>
          </View>
          <View style={styles.profileDivider} />
          <View style={styles.profileBottom}>
            <Text style={styles.statusLabel}>{online ? "Active" : "Inactive"}</Text>
            <Pressable style={[styles.statusPill, online ? styles.statusPillOn : styles.statusPillOff]} onPress={() => void toggleOnline()} disabled={toggling}>
              <Text style={styles.statusPillText}>{toggling ? "..." : online ? "Active" : "Inactive"}</Text>
            </Pressable>
          </View>
          <Pressable style={styles.editHeroBtn} onPress={() => router.push("/(market)/shop-settings")}>
            <PencilLine size={16} color="#ffffff" />
            <Text style={styles.editHeroBtnText}>Edit restaurant info</Text>
          </Pressable>
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Restaurant details</Text>
          <DetailRow icon={<Mail size={16} color="#21406f" />} label="Business email" value={contactEmail || user?.email || "Add business email"} />
          <DetailRow icon={<Phone size={16} color="#0f6d80" />} label="Contact phone" value={contactPhone || "Add contact number"} />
          <DetailRow icon={<Clock3 size={16} color="#996a12" />} label="Opening hours" value={openingHours || "Set kitchen hours"} />
          <DetailRow
            icon={<MapPin size={16} color="#9f5b1f" />}
            label="Location"
            value={[workspace.vendor?.campus, workspace.vendor?.area, workspace.vendor?.city].filter(Boolean).join(" • ") || "Add restaurant location"}
          />
        </View>

        <View style={styles.statsCard}>
          <StatRow label="Completed deliveries" value={String(metrics.deliveredCount)} />
          <StatRow icon={<Star size={16} color="#d9a429" fill="#d9a429" />} label="Rating" value={String(rating)} />
        </View>

        <View style={styles.menuCard}>
          <MenuRow label="Edit Business Info" onPress={() => router.push("/(market)/shop-settings")} />
          <MenuRow
            label="Contact Details"
            subtitle={contactEmail || contactPhone || "Email, phone, WhatsApp"}
            onPress={() => router.push("/(market)/shop-settings")}
          />
          <MenuRow
            label="Restaurant Location"
            subtitle={[workspace.vendor?.campus, workspace.vendor?.area].filter(Boolean).join(" • ") || "Campus and area"}
            onPress={() => router.push("/(market)/shop-settings")}
          />
          <MenuRow
            label="Bank Details"
            onPress={() =>
              Alert.alert("Bank details", "Payout transfers use your registered account details. You can review payout history from analytics.", [
                { text: "Open analytics", onPress: () => router.push("/(market)/analytics") },
                { text: "Close", style: "cancel" },
              ])
            }
          />
          <MenuRow label="Notifications" onPress={() => router.push("/(market)/notifications")} />
          <MenuRow label="Settings" onPress={() => router.push("/(market)/shop-settings")} />
          <MenuRow label="Messages" onPress={() => router.push("/(market)/messages")} />
          {isAdmin ? <MenuRow label="Admin Portal" subtitle="Return to platform control" onPress={() => void openAdminPortal()} /> : null}
          <MenuRow label="Switch workspace" subtitle="Go back to the user section or manage roles" onPress={openWorkspaceSwitch} />
        </View>

        <View style={styles.footerRow}>
          <Pressable style={styles.ghostBtn} onPress={() => router.push("/(market)/notifications")}>
            <Bell size={17} color="#2f4374" />
            <Text style={styles.ghostText}>Alerts</Text>
          </Pressable>
          <Pressable style={[styles.ghostBtn, styles.userSectionBtn]} onPress={() => void goBackToUserSection()}>
            <UserRound size={17} color="#2f4374" />
            <Text style={styles.userSectionText}>User section</Text>
          </Pressable>
          {isAdmin ? (
            <Pressable style={[styles.ghostBtn, styles.adminSectionBtn]} onPress={() => void openAdminPortal()}>
              <ShieldCheck size={17} color="#111827" />
              <Text style={styles.adminSectionText}>Admin</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuRow({ label, subtitle, onPress }: { label: string; subtitle?: string; onPress: () => void }) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <View style={styles.menuCopy}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subtitle ? <Text style={styles.menuSub}>{subtitle}</Text> : null}
      </View>
      <ChevronRight size={17} color="#677397" />
    </Pressable>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>{icon}</View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function StatRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <View style={styles.statLeft}>
        {icon ? <View style={styles.statIcon}>{icon}</View> : null}
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1eff9" },
  content: { padding: 18, paddingBottom: 126, gap: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerCopy: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: "#232c54", fontSize: 38, fontWeight: "900" },
  subTitle: { color: "#4f7f5f", fontSize: 20, fontWeight: "800" },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  profileCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.97)",
    padding: 14,
    gap: 12,
  },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#ecf0fb" },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ecf0fb",
  },
  avatarFallbackText: { color: "#243360", fontSize: 21, fontWeight: "900" },
  profileCopy: { flex: 1, gap: 4 },
  name: { color: "#232c54", fontSize: 26, fontWeight: "900" },
  phone: { color: "#6d79a1", fontSize: 16, fontWeight: "700" },
  profileDivider: { borderTopWidth: 1, borderTopColor: "#eceff9" },
  profileBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLabel: { color: "#232c54", fontSize: 18, fontWeight: "800" },
  editHeroBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#232c54",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  editHeroBtnText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  statusPill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 88, alignItems: "center" },
  statusPillOn: { backgroundColor: "#4f8764" },
  statusPillOff: { backgroundColor: "#979db5" },
  statusPillText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  detailsCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.97)",
    padding: 14,
    gap: 12,
  },
  detailsTitle: { color: "#232c54", fontWeight: "900", fontSize: 18 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#eef2fb",
    alignItems: "center",
    justifyContent: "center",
  },
  detailCopy: { flex: 1, gap: 2 },
  detailLabel: { color: "#6b779c", fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  detailValue: { color: "#243360", fontWeight: "800", fontSize: 15 },
  statsCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.97)",
    overflow: "hidden",
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: "#eef1fa",
  },
  statLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  statIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff7d9",
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: { color: "#2e3c6f", fontWeight: "800", fontSize: 15 },
  statValue: { color: "#232c54", fontWeight: "900", fontSize: 21 },
  menuCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.97)",
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#eef1fa",
  },
  menuCopy: { flex: 1, gap: 3 },
  menuLabel: { color: "#2e3c6f", fontSize: 16, fontWeight: "800" },
  menuSub: { color: "#7b86a6", fontSize: 12, fontWeight: "700" },
  footerRow: { flexDirection: "row", gap: 10 },
  ghostBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d9deef",
    backgroundColor: "#f8f9ff",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    flexDirection: "row",
    gap: 7,
  },
  ghostText: { color: "#2f4374", fontWeight: "900", fontSize: 14 },
  userSectionBtn: { backgroundColor: "#eef2fb", borderColor: "#d9deef" },
  userSectionText: { color: "#2f4374", fontWeight: "900", fontSize: 14 },
  adminSectionBtn: { backgroundColor: "#f8f5ec", borderColor: "#d8d1c2" },
  adminSectionText: { color: "#111827", fontWeight: "900", fontSize: 14 },
});
