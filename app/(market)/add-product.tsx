import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { ChevronLeft, Check, ImagePlus, Package2, ShoppingBag, Sparkles, Tag, Trash2 } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import {
  getSellerProductMeta,
  logInventoryHistory,
  setSellerProductCategory,
  setSellerProductCondition,
  setSellerProductPromotion,
  type InventoryHistoryEntry,
} from "@/lib/sellerEnhancements";
import type { SalesChannel } from "@/lib/newApp/types";

const categoryOptions = [
  { id: "Essentials", label: "Essentials", note: "Daily campus needs" },
  { id: "Study", label: "Study", note: "Books and desk items" },
  { id: "Electronics", label: "Electronics", note: "Gadgets and accessories" },
  { id: "Fashion", label: "Fashion", note: "Clothes and style" },
];

const conditionOptions = [
  { id: "Brand new", note: "Fresh stock, never used" },
  { id: "Like new", note: "Barely used, clean look" },
  { id: "Used (Good)", note: "Light use, still works great" },
  { id: "Used (Fair)", note: "Visible wear but functional" },
];

function getUploadFileMeta(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const mime = asset.mimeType || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  return {
    name: `seller-product-${Date.now()}.${ext === "heic" || ext === "heif" ? "jpg" : ext}`,
    type: mime,
  };
}

async function uploadProductImage(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) throw new Error("Cloudinary env vars missing.");

  const meta = getUploadFileMeta(asset);
  const form = new FormData();
  form.append("file", { uri: asset.uri, name: meta.name, type: meta.type } as any);
  form.append("upload_preset", uploadPreset);
  form.append("folder", "pamaketi/products");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Image upload failed.");
  return json.secure_url as string;
}

export default function AddProductPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ itemId?: string }>();
  const { workspace, saveProduct, archiveProduct } = useSellerWorkspace();
  const editing = useMemo(() => workspace.products.find((item) => item.id === params.itemId), [params.itemId, workspace.products]);
  const isOpenFlow = pathname.startsWith("/sell/");
  const productsRoute = isOpenFlow ? "/sell/products" : "/(market)/(tabs)/products";
  const homeRoute = isOpenFlow ? "/(student)/(tabs)/marketplace" : "/(market)/(tabs)/dashboard";

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState("Essentials");
  const [condition, setCondition] = useState("Brand new");
  const [promotionTitle, setPromotionTitle] = useState("");
  const [promotionType, setPromotionType] = useState<"percent" | "flat">("percent");
  const [promotionValue, setPromotionValue] = useState("");
  const [inventoryHistory, setInventoryHistory] = useState<InventoryHistoryEntry[]>([]);
  const [channel, setChannel] = useState<SalesChannel>("market");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishedProductName, setPublishedProductName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!editing) return;
      setName(editing.name);
      setPrice(String(Math.round(Number(editing.price_mwk))));
      setDescription(editing.description ?? "");
      setStock(editing.stock_qty == null ? "" : String(editing.stock_qty));
      setChannel(editing.channel);
      setImageUrl(editing.image_url ?? "");
      const meta = await getSellerProductMeta(editing.id);
      if (!active) return;
      setCategory(meta?.category ?? "Essentials");
      setCondition(meta?.condition ?? "Brand new");
      setPromotionTitle(meta?.promotion?.title ?? "");
      setPromotionType(meta?.promotion?.type ?? "percent");
      setPromotionValue(meta?.promotion?.value != null ? String(meta.promotion.value) : "");
      setInventoryHistory(meta?.inventoryHistory ?? []);
    };
    void run();
    return () => {
      active = false;
    };
  }, [editing]);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow photo access to upload product images.");
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

    setUploadingImage(true);
    try {
      const url = await uploadProductImage(asset);
      setImageUrl(url);
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message ?? "Could not upload image.");
    } finally {
      setUploadingImage(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Enter a product name.");
      return;
    }
    if (!price.trim() || Number(price) <= 0) {
      Alert.alert("Invalid price", "Enter a valid amount in MWK.");
      return;
    }

    setSaving(true);
    try {
      const saved = await saveProduct({
        itemId: editing?.id,
        name,
        price_mwk: Number(price),
        description: description.trim() || null,
        stock_qty: stock.trim() ? Number(stock) : null,
        channel,
        image_url: imageUrl.trim() || null,
      });
      const productId = (saved as { id?: string } | null)?.id ?? editing?.id;
      if (productId) {
        await setSellerProductCategory(productId, category);
        await setSellerProductCondition(productId, condition);
        await setSellerProductPromotion(
          productId,
          promotionTitle.trim() && Number(promotionValue) > 0
            ? {
                title: promotionTitle.trim(),
                type: promotionType,
                value: Number(promotionValue),
                active: true,
              }
            : null,
        );
        await logInventoryHistory(productId, stock.trim() ? Number(stock) : null, editing ? "Updated stock from product editor" : "Initial stock added");
      }

      if (editing) {
        router.replace(productsRoute);
        return;
      }

      setPublishedProductName(name.trim());
    } catch (err: any) {
      Alert.alert("Save failed", err?.message ?? "Could not save product.");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setPublishedProductName(null);
    setName("");
    setPrice("");
    setDescription("");
    setStock("");
    setCategory("Essentials");
    setCondition("Brand new");
    setPromotionTitle("");
    setPromotionValue("");
    setImageUrl("");
  };

  const deleteListing = () => {
    if (!editing) return;
    Alert.alert(
      "Delete listing",
      `Remove ${editing.name} from your listings? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setSaving(true);
              await archiveProduct(editing.id);
              router.replace(productsRoute);
            } catch (err: any) {
              Alert.alert("Delete failed", err?.message ?? "Could not remove this listing.");
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  if (publishedProductName) {
    return (
      <SafeAreaView style={styles.root}>
        <SoftPageGlow variant="home" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.backBtn} onPress={() => router.replace(productsRoute)}>
            <ChevronLeft size={22} color="#102a54" />
          </Pressable>

          <View style={styles.successWrap}>
            <View style={styles.successCheck}>
              <Check size={36} color="#fff" />
            </View>
            <Text style={styles.successTitle}>Product listed!</Text>
            <Text style={styles.successSub}>{publishedProductName} is now ready for customers to discover on EYA.</Text>

            <View style={styles.successArt}>
              <View style={styles.successBlob} />
              <View style={styles.successCard}>
                <Package2 size={44} color="#102a54" />
                <Text style={styles.successCardText}>{publishedProductName}</Text>
              </View>
            </View>

            <Pressable style={styles.primaryBtn} onPress={resetForm}>
              <Text style={styles.primaryBtnText}>Add another product</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => router.replace(homeRoute)}>
              <Text style={styles.secondaryBtnText}>{isOpenFlow ? "Back to marketplace" : "Go to dashboard"}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="home" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ChevronLeft size={22} color="#102a54" />
          </Pressable>
          <Text style={styles.title}>{editing ? "Edit product" : "Add product"}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.subtitle}>Fill out the form below to list your item for sale.</Text>

        <View style={styles.imageHero}>
          <View style={styles.imageHeroBackdrop} />
          {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.heroPreviewImage} /> : <ImagePlus size={42} color="#102a54" />}
          <Pressable style={styles.uploadBtn} onPress={pickImage} disabled={uploadingImage || !workspace.hasVendor}>
            <Text style={styles.uploadBtnText}>{uploadingImage ? "Uploading..." : imageUrl ? "Change product photo" : "Upload product photos"}</Text>
          </Pressable>
          <Text style={styles.uploadHint}>Up to 5 photos. First photo will be the cover.</Text>
        </View>

        <View style={styles.formCard}>
          <Field label="Product name" icon={<Tag size={18} color="#102a54" />}>
            <TextInput value={name} onChangeText={setName} placeholder="Product name..." placeholderTextColor="#98a3bd" style={styles.input} />
          </Field>

          <View style={styles.priceRow}>
            <View style={styles.currencyBox}>
              <Text style={styles.currencyText}>MWK</Text>
            </View>
            <TextInput value={price} onChangeText={setPrice} placeholder="Enter price..." keyboardType="numeric" placeholderTextColor="#98a3bd" style={[styles.input, styles.priceInput]} />
          </View>

          <Field label="Stock quantity" icon={<Package2 size={18} color="#102a54" />}>
            <TextInput value={stock} onChangeText={setStock} placeholder="How many do you have?" keyboardType="numeric" placeholderTextColor="#98a3bd" style={styles.input} />
          </Field>

          <Field label="Category" icon={<Sparkles size={18} color="#102a54" />}>
            <View style={styles.optionGrid}>
              {categoryOptions.map((item) => {
                const active = item.id === category;
                return (
                  <Pressable key={item.id} style={[styles.optionCard, active && styles.optionCardActive]} onPress={() => setCategory(item.id)}>
                    <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{item.label}</Text>
                    <Text style={[styles.optionNote, active && styles.optionNoteActive]}>{item.note}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Condition" icon={<Check size={18} color="#102a54" />}>
            <View style={styles.conditionList}>
              {conditionOptions.map((item) => {
                const active = item.id === condition;
                return (
                  <Pressable key={item.id} style={[styles.conditionCard, active && styles.conditionCardActive]} onPress={() => setCondition(item.id)}>
                    <View style={styles.conditionCopy}>
                      <Text style={[styles.conditionTitle, active && styles.conditionTitleActive]}>{item.id}</Text>
                      <Text style={[styles.conditionNote, active && styles.conditionNoteActive]}>{item.note}</Text>
                    </View>
                    {active ? <Check size={18} color="#102a54" /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Description" icon={<Tag size={18} color="#102a54" />}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your product details..."
              placeholderTextColor="#98a3bd"
              style={[styles.input, styles.textArea]}
              multiline
              textAlignVertical="top"
            />
          </Field>

          <Field label="Sales channel" icon={<ShoppingBag size={18} color="#102a54" />}>
            <View style={styles.channelRow}>
              {(["market", "food"] as SalesChannel[]).map((value) => {
                const active = value === channel;
                return (
                  <Pressable key={value} style={[styles.channelBtn, active && styles.channelBtnActive]} onPress={() => setChannel(value)}>
                    <Text style={[styles.channelText, active && styles.channelTextActive]}>{value === "market" ? "Market" : "Food"}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Promotion" icon={<Sparkles size={18} color="#102a54" />}>
            <TextInput value={promotionTitle} onChangeText={setPromotionTitle} placeholder="Promo title" placeholderTextColor="#98a3bd" style={styles.input} />
            <View style={styles.channelRow}>
              {(["percent", "flat"] as const).map((value) => {
                const active = value === promotionType;
                return (
                  <Pressable key={value} style={[styles.channelBtn, active && styles.channelBtnActive]} onPress={() => setPromotionType(value)}>
                    <Text style={[styles.channelText, active && styles.channelTextActive]}>{value === "percent" ? "Percent off" : "Flat off"}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput value={promotionValue} onChangeText={setPromotionValue} placeholder={promotionType === "percent" ? "Discount percent" : "Discount amount (MWK)"} keyboardType="numeric" placeholderTextColor="#98a3bd" style={styles.input} />
          </Field>
        </View>

        {editing ? (
          <View style={styles.historyCard}>
            <Text style={styles.historyTitle}>Inventory history</Text>
            {inventoryHistory.length ? (
              inventoryHistory.slice(0, 5).map((entry) => (
                <View key={entry.id} style={styles.historyRow}>
                  <View>
                    <Text style={styles.historyQty}>{entry.quantity == null ? "Open stock" : `${entry.quantity} in stock`}</Text>
                    <Text style={styles.historyReason}>{entry.reason}</Text>
                  </View>
                  <Text style={styles.historyDate}>{new Date(entry.changedAt).toLocaleDateString()}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.historyReason}>No inventory changes logged yet.</Text>
            )}
          </View>
        ) : null}

        <Pressable style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]} onPress={submit} disabled={saving}>
          <Text style={styles.primaryBtnText}>{saving ? "Saving..." : editing ? "Update product" : "List product"}</Text>
        </Pressable>
        {editing ? (
          <Pressable style={[styles.dangerBtn, saving && styles.primaryBtnDisabled]} onPress={deleteListing} disabled={saving}>
            <Trash2 size={18} color="#b03c66" />
            <Text style={styles.dangerBtnText}>Delete listing</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ children, icon, label }: { children: React.ReactNode; icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <View style={styles.fieldIcon}>{icon}</View>
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f1fb" },
  content: { padding: 18, paddingBottom: 42, gap: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  headerSpacer: { width: 42, height: 42 },
  title: { color: "#102a54", fontSize: 30, fontWeight: "900" },
  subtitle: { color: "#7a87a5", fontSize: 15, fontWeight: "700", lineHeight: 22 },
  imageHero: {
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 20,
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  imageHeroBackdrop: { position: "absolute", width: 240, height: 240, borderRadius: 120, backgroundColor: "#dce8ff", top: -80, opacity: 0.7 },
  heroPreviewImage: { width: 180, height: 180, borderRadius: 28, backgroundColor: "#eef3ff" },
  uploadBtn: {
    borderRadius: 999,
    backgroundColor: "#102a54",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  uploadBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  uploadHint: { color: "#7a87a5", fontWeight: "700", fontSize: 13, textAlign: "center" },
  formCard: {
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 16,
    gap: 16,
  },
  field: { gap: 10 },
  fieldHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  fieldIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#edf3ff", alignItems: "center", justifyContent: "center" },
  fieldLabel: { color: "#102a54", fontSize: 16, fontWeight: "900" },
  input: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: "#102a54",
    fontWeight: "700",
    fontSize: 15,
  },
  textArea: { minHeight: 120 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  currencyBox: {
    width: 78,
    borderRadius: 18,
    backgroundColor: "#edf3ff",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  currencyText: { color: "#102a54", fontWeight: "900", fontSize: 16 },
  priceInput: { flex: 1 },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  optionCard: {
    width: "48%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e1e7fb",
    backgroundColor: "#f8faff",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  optionCardActive: { backgroundColor: "#102a54", borderColor: "#102a54" },
  optionTitle: { color: "#102a54", fontSize: 15, fontWeight: "900" },
  optionTitleActive: { color: "#fff" },
  optionNote: { color: "#7a87a5", fontSize: 12, fontWeight: "700" },
  optionNoteActive: { color: "#d6def6" },
  conditionList: { gap: 10 },
  conditionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e1e7fb",
    backgroundColor: "#f8faff",
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  conditionCardActive: { borderColor: "#b7caf6", backgroundColor: "#edf3ff" },
  conditionCopy: { flex: 1, gap: 3 },
  conditionTitle: { color: "#102a54", fontSize: 15, fontWeight: "900" },
  conditionTitleActive: { color: "#102a54" },
  conditionNote: { color: "#7a87a5", fontSize: 12, fontWeight: "700" },
  conditionNoteActive: { color: "#60749b" },
  channelRow: { flexDirection: "row", gap: 10 },
  channelBtn: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    paddingVertical: 12,
    alignItems: "center",
  },
  channelBtnActive: { backgroundColor: "#102a54", borderColor: "#102a54" },
  channelText: { color: "#102a54", fontWeight: "900" },
  channelTextActive: { color: "#fff" },
  historyCard: {
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 14,
    gap: 10,
  },
  historyTitle: { color: "#102a54", fontSize: 15, fontWeight: "900" },
  historyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: "#f1eefc", paddingTop: 10 },
  historyQty: { color: "#102a54", fontWeight: "800" },
  historyReason: { color: "#7a87a5", fontWeight: "700", fontSize: 12, marginTop: 3 },
  historyDate: { color: "#7a87a5", fontWeight: "700", fontSize: 12 },
  primaryBtn: { borderRadius: 999, backgroundColor: "#102a54", alignItems: "center", paddingVertical: 17 },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 18 },
  successWrap: {
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 20,
    gap: 16,
    alignItems: "center",
  },
  successCheck: { width: 76, height: 76, borderRadius: 38, backgroundColor: "#7cb6ff", alignItems: "center", justifyContent: "center" },
  successTitle: { color: "#102a54", fontSize: 34, fontWeight: "900", textAlign: "center" },
  successSub: { color: "#7a87a5", fontSize: 16, fontWeight: "700", textAlign: "center", lineHeight: 24 },
  successArt: { width: "100%", minHeight: 210, borderRadius: 28, backgroundColor: "#f7f7ff", overflow: "hidden", justifyContent: "center", alignItems: "center" },
  successBlob: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "#dce8ff", opacity: 0.8 },
  successCard: {
    width: 210,
    height: 146,
    borderRadius: 28,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e9ff",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  successCardText: { color: "#102a54", fontSize: 18, fontWeight: "900", textAlign: "center", paddingHorizontal: 16 },
  secondaryBtn: {
    width: "100%",
    borderRadius: 999,
    backgroundColor: "#eef2fb",
    borderWidth: 1,
    borderColor: "#dfe7f8",
    alignItems: "center",
    paddingVertical: 16,
  },
  secondaryBtnText: { color: "#102a54", fontWeight: "900", fontSize: 17 },
  dangerBtn: {
    borderRadius: 999,
    backgroundColor: "#fff5f8",
    borderWidth: 1,
    borderColor: "#ffd4e3",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    flexDirection: "row",
    gap: 8,
  },
  dangerBtnText: { color: "#b03c66", fontWeight: "900", fontSize: 16 },
});
