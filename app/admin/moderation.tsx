import React from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { listCatalogItems, updateCatalogItem } from "@/lib/newApp/catalog";
import { listVendors, updateVendor } from "@/lib/newApp/vendors";
import type { CatalogItemRow, VendorRow } from "@/lib/newApp/types";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase";

type ModerationTab = "vendors" | "listings";

export default function AdminModerationPage() {
  const router = useRouter();
  const { user, role, loading, refreshRole } = useAuth();
  const [checkingAccess, setCheckingAccess] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<ModerationTab>("vendors");
  const [vendors, setVendors] = React.useState<VendorRow[]>([]);
  const [listings, setListings] = React.useState<CatalogItemRow[]>([]);
  const [fetching, setFetching] = React.useState(true);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        if (loading) return;
        if (!user) {
          router.replace("/(auth)/login");
          return;
        }
        if (!role) await refreshRole(user.id);
        const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
        const currentRole = ((data as any)?.role ?? role) as string | null;
        if (currentRole !== "admin") {
          router.replace("/");
          return;
        }
      } finally {
        if (active) setCheckingAccess(false);
      }
    };
    void check();
    return () => {
      active = false;
    };
  }, [loading, user, role, refreshRole, router]);

  const loadData = React.useCallback(async () => {
    setFetching(true);
    setMessage(null);
    try {
      const [vendorRows, listingRows] = await Promise.all([
        listVendors({ isActiveOnly: false, limit: 60 }),
        listCatalogItems({ isActiveOnly: false, limit: 120 }),
      ]);
      setVendors(vendorRows);
      setListings(listingRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load moderation data.");
    } finally {
      setFetching(false);
    }
  }, []);

  React.useEffect(() => {
    if (!checkingAccess && user) void loadData();
  }, [checkingAccess, user, loadData]);

  const toggleVendor = async (vendor: VendorRow) => {
    setSavingKey(`vendor-${vendor.id}`);
    try {
      await updateVendor(vendor.id, { is_active: !vendor.is_active });
      await loadData();
      setMessage(`Vendor ${vendor.is_active ? "hidden" : "activated"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update vendor.");
    } finally {
      setSavingKey(null);
    }
  };

  const toggleListing = async (item: CatalogItemRow) => {
    setSavingKey(`listing-${item.id}`);
    try {
      await updateCatalogItem(item.id, { is_active: !item.is_active });
      await loadData();
      setMessage(`Listing ${item.is_active ? "hidden" : "activated"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update listing.");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading || checkingAccess) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.helper}>Checking admin access...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>Admin moderation</Text>
          <Text style={styles.sub}>Review shops and listings, deactivate risky entries, and keep the marketplace clean.</Text>
          <View style={styles.actions}>
            <Pressable style={styles.primaryPill} onPress={() => void loadData()}>
              <Text style={styles.primaryPillText}>{fetching ? "Refreshing..." : "Refresh"}</Text>
            </Pressable>
            <Pressable style={styles.secondaryPill} onPress={() => router.push("/admin/reports")}>
              <Text style={styles.secondaryPillText}>Trust reports</Text>
            </Pressable>
          </View>
          <View style={styles.tabRow}>
            <Pressable style={[styles.tabBtn, activeTab === "vendors" && styles.tabBtnActive]} onPress={() => setActiveTab("vendors")}>
              <Text style={[styles.tabText, activeTab === "vendors" && styles.tabTextActive]}>Vendors</Text>
            </Pressable>
            <Pressable style={[styles.tabBtn, activeTab === "listings" && styles.tabBtnActive]} onPress={() => setActiveTab("listings")}>
              <Text style={[styles.tabText, activeTab === "listings" && styles.tabTextActive]}>Listings</Text>
            </Pressable>
          </View>
          {message ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{message}</Text>
            </View>
          ) : null}
        </View>

        {activeTab === "vendors"
          ? vendors.map((vendor) => (
              <View key={vendor.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{vendor.name}</Text>
                  <Text style={[styles.statusPill, vendor.is_active ? styles.statusGood : styles.statusMuted]}>
                    {vendor.is_active ? "Active" : "Hidden"}
                  </Text>
                </View>
                <Text style={styles.cardMeta}>{vendor.campus || "Campus"} • {vendor.area || "Area"} • {vendor.city || "City"}</Text>
                <Text style={styles.cardMeta}>{vendor.supports_market ? "Market" : ""}{vendor.supports_market && vendor.supports_food ? " + " : ""}{vendor.supports_food ? "Food" : ""}</Text>
                <Text style={styles.cardMeta}>Owner: {vendor.owner_id}</Text>
                <Pressable style={styles.primaryBtn} onPress={() => void toggleVendor(vendor)} disabled={savingKey === `vendor-${vendor.id}`}>
                  <Text style={styles.primaryBtnText}>{savingKey === `vendor-${vendor.id}` ? "Saving..." : vendor.is_active ? "Hide vendor" : "Activate vendor"}</Text>
                </Pressable>
              </View>
            ))
          : listings.map((item) => (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  <Text style={[styles.statusPill, item.is_active ? styles.statusGood : styles.statusMuted]}>
                    {item.is_active ? "Live" : "Hidden"}
                  </Text>
                </View>
                <Text style={styles.cardMeta}>{item.channel} • MWK {Number(item.price_mwk).toLocaleString()}</Text>
                <Text style={styles.cardMeta}>Stock: {item.stock_qty ?? "Open"}</Text>
                <Text style={styles.cardMeta}>Vendor: {item.vendor_id}</Text>
                <Text style={styles.details}>{item.description || "No description provided."}</Text>
                <Pressable style={styles.primaryBtn} onPress={() => void toggleListing(item)} disabled={savingKey === `listing-${item.id}`}>
                  <Text style={styles.primaryBtnText}>{savingKey === `listing-${item.id}` ? "Saving..." : item.is_active ? "Hide listing" : "Activate listing"}</Text>
                </Pressable>
              </View>
            ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  center: { flex: 1, backgroundColor: "#f6f7fb", alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  hero: { backgroundColor: "#fff", borderRadius: 20, padding: 16, gap: 10 },
  title: { color: "#0e2756", fontSize: 26, fontWeight: "900" },
  sub: { color: "#5f6b85", fontWeight: "600" },
  helper: { marginTop: 8, color: "#5f6b85", fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  primaryPill: { borderRadius: 999, backgroundColor: "#0e2756", paddingHorizontal: 12, paddingVertical: 8 },
  primaryPillText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  secondaryPill: { borderRadius: 999, backgroundColor: "#ff0f64", paddingHorizontal: 12, paddingVertical: 8 },
  secondaryPillText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  tabRow: { flexDirection: "row", gap: 8 },
  tabBtn: { borderRadius: 999, borderWidth: 1, borderColor: "#d7def1", backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 8 },
  tabBtnActive: { backgroundColor: "#0e2756", borderColor: "#0e2756" },
  tabText: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  tabTextActive: { color: "#fff" },
  notice: { borderRadius: 12, borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", padding: 10 },
  noticeText: { color: "#b0003a", fontWeight: "700", fontSize: 12 },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 14, gap: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" },
  cardTitle: { color: "#0e2756", fontWeight: "900", fontSize: 18 },
  statusPill: { overflow: "hidden", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: "900" },
  statusGood: { backgroundColor: "#e7fbf1", color: "#0d7b45" },
  statusMuted: { backgroundColor: "#eef1fb", color: "#6d7a99" },
  cardMeta: { color: "#5f6b85", fontWeight: "600", fontSize: 12 },
  details: { color: "#0e2756", lineHeight: 20, fontWeight: "600" },
  primaryBtn: { borderRadius: 14, backgroundColor: "#0e2756", paddingVertical: 13, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
});
