import React, { useMemo, useState } from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { CirclePlus, PencilLine, RefreshCw, Search, Trash2 } from "lucide-react-native";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import { parseFoodDescription, summarizeFoodMenu } from "@/lib/foodMenu";
import type { CatalogItemRow } from "@/lib/newApp/types";

type FilterType = "all" | "live" | "hidden";

function money(value: number) {
  return `MWK ${Math.round(value).toLocaleString()}`;
}

function shortDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "recently";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RestaurantMenuPage() {
  const router = useRouter();
  const pathname = usePathname();
  const isOpenFlow = pathname.startsWith("/sell/");
  const isRestaurantFlow = !isOpenFlow;
  const { workspace, metrics, archiveProduct, saveProduct, setProductActive } = useSellerWorkspace(isRestaurantFlow ? "food" : "market");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const sourceRows = workspace.products;
  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sourceRows.filter((row) => {
      const parsed = isRestaurantFlow ? parseFoodDescription(row.description) : { description: row.description ?? "", menuConfig: null };
      const searchText = [row.name, parsed.description, summarizeFoodMenu(parsed.menuConfig)].join(" ").toLowerCase();
      if (filter === "live" && !row.is_active) return false;
      if (filter === "hidden" && row.is_active) return false;
      if (!term) return true;
      return searchText.includes(term);
    });
  }, [filter, isRestaurantFlow, query, sourceRows]);

  const liveCount = sourceRows.filter((row) => row.is_active).length;
  const hiddenCount = sourceRows.filter((row) => !row.is_active).length;

  const requireSetup = () => {
    if (!workspace.hasVendor) {
      router.push(isOpenFlow ? "/sell/setup" : "/(market)/setup");
      return true;
    }
    return false;
  };

  const toggleItem = async (itemId: string, current: boolean) => {
    if (requireSetup()) return;
    try {
      await setProductActive(itemId, !current);
    } catch (err: any) {
      Alert.alert("Update failed", err?.message ?? "Could not update availability.");
    }
  };

  const editItem = (itemId: string) => {
    if (requireSetup()) return;
    router.push({ pathname: isOpenFlow ? "/sell/add-product" : "/(market)/add-product", params: { itemId } });
  };

  const removeItem = (itemId: string, name: string) => {
    if (requireSetup()) return;
    Alert.alert("Delete item", `Remove ${name} from menu?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await archiveProduct(itemId);
          } catch (err: any) {
            Alert.alert("Delete failed", err?.message ?? "Could not remove this item.");
          }
        },
      },
    ]);
  };

  const addItem = () => {
    if (requireSetup()) return;
    router.push(isOpenFlow ? "/sell/add-product" : "/(market)/add-product");
  };

  const renewItem = async (item: CatalogItemRow) => {
    if (requireSetup()) return;
    try {
      await saveProduct({
        itemId: item.id,
        name: item.name,
        description: item.description ?? null,
        price_mwk: Number(item.price_mwk) || 0,
        stock_qty: item.stock_qty ?? null,
        channel: item.channel,
        image_url: item.image_url ?? null,
        image_urls: item.image_urls ?? (item.image_url ? [item.image_url] : []),
      });
      Alert.alert("Listing renewed", "This item was moved forward in the marketplace feed.");
    } catch (err: any) {
      Alert.alert("Renew failed", err?.message ?? "Could not renew this listing.");
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{isRestaurantFlow ? "Menu" : "Products"}</Text>
          <Pressable style={styles.addIcon} onPress={addItem}>
            <CirclePlus size={20} color="#232c54" />
          </Pressable>
        </View>

        <View style={styles.searchCard}>
          <Search size={17} color="#7a83a8" />
          <TextInput
            placeholder={isRestaurantFlow ? "Search menu items..." : "Search products..."}
            placeholderTextColor="#9aa3bf"
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <View style={styles.filterRow}>
          {(["all", "live", "hidden"] as FilterType[]).map((value) => {
            const active = filter === value;
            return (
              <Pressable key={value} style={[styles.filterPill, active && styles.filterPillActive]} onPress={() => setFilter(value)}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {value === "all" ? "All" : value === "live" ? "Available" : "Hidden"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.metricsRow}>
          <MetricCard label="Live items" value={String(liveCount)} />
          <MetricCard label="Hidden" value={String(hiddenCount)} />
          <MetricCard label="Low stock" value={String(metrics.lowStockCount)} />
        </View>

        {!workspace.hasVendor ? (
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>{isRestaurantFlow ? "Restaurant setup needed" : "Shop setup needed"}</Text>
            <Text style={styles.setupSub}>{isRestaurantFlow ? "Finish setup before publishing menu items and receiving live orders." : "Finish setup before publishing products and receiving live orders."}</Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.push(isOpenFlow ? "/sell/setup" : "/(market)/setup")}>
              <Text style={styles.primaryBtnText}>Go to setup</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredRows.length ? (
              filteredRows.map((item) => (
                (() => {
                  const parsed = isRestaurantFlow ? parseFoodDescription(item.description) : { description: item.description ?? "", menuConfig: null };
                  const menuSummary = summarizeFoodMenu(parsed.menuConfig);
                  const coverImage = item.image_urls?.[0] ?? item.image_url;
                  return (
                    <View key={item.id} style={styles.itemCard}>
                      <View style={styles.itemLeft}>
                        {coverImage ? <Image source={{ uri: coverImage }} style={styles.image} /> : <View style={styles.imageFallback} />}
                        <View style={styles.itemCopy}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.itemPrice}>
                            {isRestaurantFlow && parsed.menuConfig ? "Starts at " : ""}
                            {money(Number(item.price_mwk))}
                          </Text>
                          <Text style={styles.itemMeta}>{parsed.description?.trim() || "No description"}</Text>
                          <Text style={styles.itemDates}>Listed {shortDate(item.created_at)} | Updated {shortDate(item.updated_at)}</Text>
                          {isRestaurantFlow && menuSummary ? <Text style={styles.itemSummary}>{menuSummary}</Text> : null}
                        </View>
                      </View>

                      <View style={styles.itemRight}>
                        <Pressable style={[styles.availabilityPill, item.is_active ? styles.availabilityPillOn : styles.availabilityPillOff]} onPress={() => void toggleItem(item.id, item.is_active)}>
                          <Text style={styles.availabilityText}>{item.is_active ? "ON" : "OFF"}</Text>
                        </Pressable>
                        <Pressable style={styles.renewBtn} onPress={() => void renewItem(item)}>
                          <RefreshCw size={13} color="#2d416f" />
                          <Text style={styles.renewBtnText}>Renew</Text>
                        </Pressable>
                        <View style={styles.inlineActions}>
                          <Pressable style={styles.actionBtn} onPress={() => editItem(item.id)}>
                            <PencilLine size={14} color="#3b4f80" />
                          </Pressable>
                          <Pressable style={styles.actionBtn} onPress={() => removeItem(item.id, item.name)}>
                            <Trash2 size={14} color="#b64670" />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  );
                })()
              ))
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{isRestaurantFlow ? "No matching menu items" : "No matching products"}</Text>
                <Text style={styles.emptySub}>{isRestaurantFlow ? "Try a different search or add a new menu item." : "Try a different search or add a new product."}</Text>
              </View>
            )}
          </View>
        )}

        <Pressable style={styles.primaryBtn} onPress={addItem}>
          <Text style={styles.primaryBtnText}>{isRestaurantFlow ? "+ Add Menu Item" : "+ Add Product"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f1eff9" },
  content: { padding: 18, paddingBottom: 126, gap: 14 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#232c54", fontSize: 38, fontWeight: "900" },
  addIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#dde0f2",
  },
  searchCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { flex: 1, color: "#232c54", fontWeight: "700", fontSize: 15 },
  filterRow: { flexDirection: "row", gap: 8 },
  filterPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d9deef",
    backgroundColor: "#f8f9ff",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterPillActive: { backgroundColor: "#273f73", borderColor: "#273f73" },
  filterText: { color: "#63709a", fontWeight: "800", fontSize: 13 },
  filterTextActive: { color: "#fff" },
  metricsRow: { flexDirection: "row", gap: 10 },
  metricCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    paddingVertical: 11,
    gap: 2,
  },
  metricValue: { color: "#232c54", fontWeight: "900", fontSize: 19 },
  metricLabel: { color: "#7480a3", fontWeight: "700", fontSize: 12 },
  setupCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.97)",
    padding: 16,
    gap: 10,
  },
  setupTitle: { color: "#232c54", fontSize: 20, fontWeight: "900" },
  setupSub: { color: "#68749a", fontSize: 14, fontWeight: "700", lineHeight: 20 },
  list: { gap: 10 },
  itemCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.97)",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  itemLeft: { flexDirection: "row", gap: 10, flex: 1 },
  image: { width: 64, height: 64, borderRadius: 14, backgroundColor: "#eef2fb" },
  imageFallback: { width: 64, height: 64, borderRadius: 14, backgroundColor: "#eef2fb" },
  itemCopy: { flex: 1, gap: 3, justifyContent: "center" },
  itemName: { color: "#232c54", fontSize: 18, fontWeight: "900" },
  itemPrice: { color: "#415484", fontSize: 14, fontWeight: "800" },
  itemMeta: { color: "#7b84aa", fontSize: 12, fontWeight: "700" },
  itemDates: { color: "#8892b2", fontSize: 11, fontWeight: "700" },
  itemSummary: { color: "#2d416f", fontSize: 12, fontWeight: "800", lineHeight: 17, marginTop: 2 },
  itemRight: { alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  availabilityPill: {
    minWidth: 58,
    borderRadius: 999,
    alignItems: "center",
    paddingVertical: 6,
  },
  availabilityPillOn: { backgroundColor: "#57a978" },
  availabilityPillOff: { backgroundColor: "#a8afc7" },
  availabilityText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  renewBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d9deef",
    backgroundColor: "#f8f9ff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  renewBtnText: { color: "#2d416f", fontSize: 12, fontWeight: "800" },
  inlineActions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d9deef",
    backgroundColor: "#f8f9ff",
  },
  emptyCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#dde0f2",
    backgroundColor: "rgba(255,255,255,0.97)",
    padding: 18,
    gap: 6,
  },
  emptyTitle: { color: "#232c54", fontSize: 18, fontWeight: "900" },
  emptySub: { color: "#7b84aa", fontSize: 14, fontWeight: "700" },
  primaryBtn: {
    borderRadius: 18,
    backgroundColor: "#2d416f",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
