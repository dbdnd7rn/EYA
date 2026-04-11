import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { CirclePlus, LogOut, PencilLine, Search, Trash2 } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import { useAuth } from "@/providers/AuthProvider";
import { getSellerProductMetaMap, setBulkSellerProductCategory } from "@/lib/sellerEnhancements";

function money(value: number) {
  return `MWK ${Math.round(value).toLocaleString()}`;
}

type ProductFilter = "all" | "market" | "food" | "inactive";

type PreviewProduct = {
  id: string;
  name: string;
  price_mwk: number;
  description: string;
  stock_qty: number | null;
  channel: "market" | "food";
  is_active: boolean;
  image_url: string | null;
};

const PREVIEW_PRODUCTS: PreviewProduct[] = [
  { id: "preview-1", name: "Study Chair", price_mwk: 45000, description: "Comfortable hostel study chair", stock_qty: 3, channel: "market", is_active: true, image_url: null },
  { id: "preview-2", name: "Desk Lamp", price_mwk: 18000, description: "Soft light for late reading", stock_qty: 8, channel: "market", is_active: true, image_url: null },
  { id: "preview-3", name: "Microwave", price_mwk: 5200, description: "Hidden while restocking", stock_qty: 0, channel: "market", is_active: false, image_url: null },
];

export default function SellerProductsPage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { workspace, archiveProduct, setProductActive, metrics } = useSellerWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [metaMap, setMetaMap] = useState<Record<string, { category?: string | null; promotion?: { title: string; type: "percent" | "flat"; value: number; active: boolean } | null } | null>>({});
  const inputRef = useRef<TextInput | null>(null);

  const sourceProducts = workspace.hasVendor ? workspace.products : PREVIEW_PRODUCTS;
  const goToSetup = () => router.push("/(market)/setup");

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sourceProducts.filter((item) => {
      if (filter === "inactive") {
        if (item.is_active) return false;
      } else {
        if (!item.is_active && filter !== "all") return false;
        if (filter === "market" && item.channel !== "market") return false;
        if (filter === "food" && item.channel !== "food") return false;
      }

      if (!term) return true;
      return [item.name, item.description ?? ""].some((value) => value.toLowerCase().includes(term));
    });
  }, [filter, query, sourceProducts]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const map = await getSellerProductMetaMap(sourceProducts.map((item) => item.id));
      if (active) setMetaMap(map);
    };
    void run();
    return () => {
      active = false;
    };
  }, [sourceProducts]);

  const toggleSelection = (productId: string) => {
    setSelectedIds((current) => (current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]));
  };

  const applyBulkCategory = async (category: string) => {
    if (!selectedIds.length) return;
    await setBulkSellerProductCategory(selectedIds, category);
    const map = await getSellerProductMetaMap(sourceProducts.map((item) => item.id));
    setMetaMap(map);
    Alert.alert("Updated", `Applied ${category} to ${selectedIds.length} product(s).`);
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const applyBulkVisibility = async (isActive: boolean) => {
    if (!selectedIds.length || !workspace.hasVendor) return;
    await Promise.all(selectedIds.map((id) => setProductActive(id, isActive)));
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const openProductEditor = (productId: string) => {
    if (!workspace.hasVendor) {
      goToSetup();
      return;
    }
    router.push({ pathname: "/(market)/add-product", params: { itemId: productId } });
  };

  const toggleProductVisibility = async (productId: string, isActive: boolean) => {
    if (!workspace.hasVendor) {
      goToSetup();
      return;
    }
    try {
      await setProductActive(productId, !isActive);
    } catch (err: any) {
      Alert.alert("Update failed", err?.message ?? "Could not update listing visibility.");
    }
  };

  const confirmDeleteProduct = (productId: string, productName: string) => {
    if (!workspace.hasVendor) {
      goToSetup();
      return;
    }
    Alert.alert(
      "Delete listing",
      `Remove ${productName} from your listings? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await archiveProduct(productId);
            } catch (err: any) {
              Alert.alert("Delete failed", err?.message ?? "Could not remove this listing.");
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="home" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Text style={styles.pageTitle}>Products</Text>
          <View style={styles.topActions}>
            <Pressable style={styles.iconCircle} onPress={() => inputRef.current?.focus()}>
              <Search size={18} color="#0e2756" />
            </Pressable>
            <Pressable style={styles.iconCircle} onPress={() => (workspace.hasVendor ? router.push("/(market)/add-product") : goToSetup())}>
              <CirclePlus size={18} color="#0e2756" />
            </Pressable>
            <Pressable
              style={styles.iconCircle}
              onPress={() =>
                Alert.alert("Logout", "Leave the seller workspace?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Logout",
                    style: "destructive",
                    onPress: async () => {
                      await signOut();
                      router.replace("/(auth)/login");
                    },
                  },
                ])
              }
            >
              <LogOut size={18} color="#0e2756" />
            </Pressable>
          </View>
        </View>

        <View style={styles.toolbarRow}>
          <Pressable style={[styles.smallAction, selectionMode && styles.smallActionActive]} onPress={() => {
            setSelectionMode((current) => !current);
            setSelectedIds([]);
          }}>
            <Text style={[styles.smallActionText, selectionMode && styles.smallActionTextActive]}>{selectionMode ? "Cancel selection" : "Bulk edit"}</Text>
          </Pressable>
          {selectionMode ? <Text style={styles.selectionText}>{selectedIds.length} selected</Text> : null}
        </View>

        <View style={styles.searchShell}>
          <Search size={16} color="#7d78a5" />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search products..."
            placeholderTextColor="#9e98bc"
            style={styles.searchInput}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(["all", "market", "food", "inactive"] as ProductFilter[]).map((value) => {
            const active = filter === value;
            const label = value === "all" ? "All" : value === "inactive" ? "Hidden" : value === "market" ? "Market" : "Food";
            return (
              <Pressable key={value} style={[styles.filterPill, active && styles.filterPillActive]} onPress={() => setFilter(value)}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {(workspace.hasVendor ? metrics.lowStockCount || metrics.outOfStockCount : true) ? (
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>Inventory notices</Text>
            {workspace.hasVendor ? (
              <>
                {metrics.outOfStockCount ? <Text style={styles.alertText}>{metrics.outOfStockCount} listing(s) are out of stock.</Text> : null}
                {metrics.lowStockCount ? <Text style={styles.alertText}>{metrics.lowStockCount} listing(s) are running low.</Text> : null}
              </>
            ) : (
              <>
                <Text style={styles.alertText}>1 listing is out of stock.</Text>
                <Text style={styles.alertText}>1 listing is running low.</Text>
              </>
            )}
          </View>
        ) : null}

        {selectionMode ? (
          <View style={styles.bulkCard}>
            <Text style={styles.bulkTitle}>Bulk actions</Text>
            <View style={styles.bulkRow}>
              <Pressable style={styles.bulkPill} onPress={() => void applyBulkCategory("Essentials")}>
                <Text style={styles.bulkPillText}>Essentials</Text>
              </Pressable>
              <Pressable style={styles.bulkPill} onPress={() => void applyBulkCategory("Study")}>
                <Text style={styles.bulkPillText}>Study</Text>
              </Pressable>
              <Pressable style={styles.bulkPill} onPress={() => void applyBulkCategory("Electronics")}>
                <Text style={styles.bulkPillText}>Electronics</Text>
              </Pressable>
            </View>
            <View style={styles.bulkRow}>
              <Pressable style={styles.bulkPill} onPress={() => void applyBulkVisibility(false)}>
                <Text style={styles.bulkPillText}>Hide selected</Text>
              </Pressable>
              <Pressable style={styles.bulkPill} onPress={() => void applyBulkVisibility(true)}>
                <Text style={styles.bulkPillText}>Restore selected</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.list}>
          {rows.map((item) => {
            const selected = selectedIds.includes(item.id);
            const meta = metaMap[item.id];
            const lowStock = item.is_active && item.stock_qty != null && item.stock_qty > 0 && item.stock_qty <= 5;
            const outOfStock = item.is_active && item.stock_qty != null && item.stock_qty <= 0;
            const badgeLabel = !item.is_active ? "Hidden" : outOfStock ? "Out of stock" : lowStock ? "Low stock" : "Live";
            const badgeStyle = !item.is_active ? styles.badgeMuted : outOfStock ? styles.badgeDanger : lowStock ? styles.badgeWarning : styles.badgeSoft;

            return (
              <Pressable key={item.id} style={[styles.card, selectionMode && selected && styles.cardSelected]} onPress={() => (selectionMode ? toggleSelection(item.id) : undefined)}>
                <View style={styles.cardGlowA} />
                <View style={styles.cardGlowB} />
                <View style={styles.cardBody}>
                  <View style={styles.cardHead}>
                    <View style={styles.cardText}>
                      <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.price}>{money(Number(item.price_mwk))}</Text>
                      <Text style={styles.metaLine} numberOfLines={1}>
                        {item.description?.trim() ? item.description : "Campus delivery around your store"}
                      </Text>
                      <Text style={styles.metaLine}>
                        {item.channel === "food" ? "Food listing" : "Market listing"} | {item.stock_qty ?? "Open"} in stock
                      </Text>
                      {meta?.category ? <Text style={styles.categoryLine}>{meta.category}</Text> : null}
                      {meta?.promotion?.active ? (
                        <Text style={styles.promoLine}>
                          {meta.promotion.title}: {meta.promotion.type === "percent" ? `${meta.promotion.value}% off` : `${money(meta.promotion.value)} off`}
                        </Text>
                      ) : null}
                    </View>
                    {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.productImage} /> : <View style={styles.imageFallback} />}
                  </View>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: item.stock_qty == null ? "70%" : `${Math.max(10, Math.min(100, Math.round((Math.min(item.stock_qty, 12) / 12) * 100)))}%` },
                      ]}
                    />
                  </View>

                  <View style={styles.footerRow}>
                    <View style={[styles.badge, badgeStyle]}>
                      <Text
                        style={[
                          styles.badgeText,
                          badgeStyle === styles.badgeDanger
                            ? styles.badgeTextDanger
                            : badgeStyle === styles.badgeWarning
                              ? styles.badgeTextWarning
                              : badgeStyle === styles.badgeMuted
                                ? styles.badgeTextMuted
                                : styles.badgeTextSoft,
                        ]}
                      >
                        {badgeLabel}
                      </Text>
                    </View>

                    <View style={styles.actionRow}>
                      <Pressable
                        style={styles.actionPill}
                        onPress={() => openProductEditor(item.id)}
                      >
                        <PencilLine size={14} color="#0e2756" />
                        <Text style={styles.actionText}>Edit</Text>
                      </Pressable>
                      <Pressable style={styles.actionPill} onPress={() => void toggleProductVisibility(item.id, item.is_active)}>
                        <Text style={styles.actionText}>{item.is_active ? "Hide" : "Restore"}</Text>
                      </Pressable>
                      <Pressable style={[styles.actionPill, styles.deletePill]} onPress={() => confirmDeleteProduct(item.id, item.name)}>
                        <Trash2 size={14} color="#b03c66" />
                        <Text style={styles.deleteText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}

          {!rows.length ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No products found</Text>
              <Text style={styles.emptySub}>Adjust the filter or add a new product to fill this shelf.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f8fc" },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 122, gap: 14 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pageTitle: { color: "#0e2756", fontSize: 30, fontWeight: "500", letterSpacing: -0.9 },
  topActions: { flexDirection: "row", gap: 10 },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "#dfe8f5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#dbe6f5",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "#dfe8f5",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  searchInput: { flex: 1, color: "#0e2756", fontSize: 15, fontWeight: "500" },
  toolbarRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  smallAction: { borderRadius: 999, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dfe8f5", paddingHorizontal: 14, paddingVertical: 10 },
  smallActionActive: { backgroundColor: "#102a54", borderColor: "#102a54" },
  smallActionText: { color: "#0e2756", fontWeight: "700" },
  smallActionTextActive: { color: "#fff" },
  selectionText: { color: "#6b7c99", fontWeight: "700" },
  filterRow: { gap: 10, paddingRight: 12 },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "#dfe8f5",
  },
  filterPillActive: { backgroundColor: "#102a54", borderColor: "#102a54" },
  filterText: { color: "#6b7c99", fontSize: 16, fontWeight: "500" },
  filterTextActive: { color: "#fff" },
  alertCard: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: "#fff4f8",
    borderWidth: 1,
    borderColor: "#ffd8e7",
    shadowColor: "#f3d7e2",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    gap: 4,
  },
  alertTitle: { color: "#0e2756", fontSize: 18, fontWeight: "700" },
  alertText: { color: "#8d5472", fontSize: 14, fontWeight: "500" },
  list: { gap: 14 },
  bulkCard: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "#dfe8f5",
    padding: 16,
    gap: 10,
  },
  bulkTitle: { color: "#0e2756", fontSize: 16, fontWeight: "800" },
  bulkRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  bulkPill: { borderRadius: 999, backgroundColor: "#eef4ff", paddingHorizontal: 14, paddingVertical: 10 },
  bulkPillText: { color: "#0e2756", fontWeight: "700" },
  card: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "#dfe8f5",
    shadowColor: "#dbe6f5",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  cardSelected: { borderColor: "#ff0f64", borderWidth: 2 },
  cardGlowA: { position: "absolute", top: -26, left: -18, width: 190, height: 160, borderRadius: 90, backgroundColor: "rgba(214,235,255,0.62)" },
  cardGlowB: { position: "absolute", right: -30, bottom: -26, width: 200, height: 170, borderRadius: 100, backgroundColor: "rgba(255,233,242,0.62)" },
  cardBody: { padding: 18, gap: 14 },
  cardHead: { flexDirection: "row", gap: 16, alignItems: "center" },
  cardText: { flex: 1, gap: 6 },
  productName: { color: "#0e2756", fontSize: 20, fontWeight: "700" },
  price: { color: "#1c3f76", fontSize: 16, fontWeight: "600" },
  metaLine: { color: "#6b7c99", fontSize: 14, fontWeight: "500" },
  categoryLine: { color: "#0e2756", fontSize: 13, fontWeight: "700" },
  promoLine: { color: "#ff0f64", fontSize: 13, fontWeight: "700" },
  productImage: { width: 118, height: 118, borderRadius: 26, backgroundColor: "#eef4ff" },
  imageFallback: { width: 118, height: 118, borderRadius: 26, backgroundColor: "#eef4ff" },
  progressTrack: { height: 12, borderRadius: 999, backgroundColor: "#edf3fb", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: "#9ec4ff" },
  footerRow: { gap: 12 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  badgeSoft: { backgroundColor: "#eef4ff" },
  badgeWarning: { backgroundColor: "#fff0df" },
  badgeDanger: { backgroundColor: "#fff0f6" },
  badgeMuted: { backgroundColor: "#eef1f7" },
  badgeText: { fontSize: 13, fontWeight: "600" },
  badgeTextSoft: { color: "#23457b" },
  badgeTextWarning: { color: "#9f6a20" },
  badgeTextDanger: { color: "#c73a70" },
  badgeTextMuted: { color: "#6b7c99" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionPill: {
    minWidth: 104,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.98)",
    borderWidth: 1,
    borderColor: "#dfe8f5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  actionText: { color: "#0e2756", fontSize: 15, fontWeight: "500" },
  deletePill: { backgroundColor: "#fff5f8" },
  deleteText: { color: "#c73a70", fontSize: 15, fontWeight: "500" },
  emptyCard: { borderRadius: 30, padding: 22, backgroundColor: "rgba(255,255,255,0.98)", borderWidth: 1, borderColor: "#dfe8f5", gap: 6 },
  emptyTitle: { color: "#0e2756", fontSize: 20, fontWeight: "700" },
  emptySub: { color: "#6b7c99", fontSize: 14, lineHeight: 20 },
});
