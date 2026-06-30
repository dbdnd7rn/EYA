import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { ChevronLeft, Check, ImagePlus, Package2, ShoppingBag, Sparkles, Tag, Trash2 } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import {
  buildDefaultFoodMenuConfig,
  buildFoodSelectionSummary,
  encodeFoodDescription,
  parseFoodDescription,
  summarizeFoodMenu,
  type FoodMenuConfig,
} from "@/lib/foodMenu";
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

const menuCategoryOptions = [
  { id: "Lunch", label: "Lunch", note: "Midday rush menu" },
  { id: "Dinner", label: "Dinner", note: "Evening meals and combos" },
  { id: "Snacks", label: "Snacks", note: "Quick bites and sides" },
  { id: "Drinks", label: "Drinks", note: "Cold and hot drinks" },
];

const menuConditionOptions = [
  { id: "Ready fast", note: "Good for quick prep and dispatch" },
  { id: "Popular combo", note: "Best for bundles and high volume" },
  { id: "Fresh daily", note: "Prepared fresh for each session" },
  { id: "Large portion", note: "Heavy meal for group or late study" },
];

type EditableMenuOption = {
  id: string;
  name: string;
  priceDelta: string;
};

function makeEditableOption(name = "", priceDelta = 0): EditableMenuOption {
  return {
    id: `menu-option-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    priceDelta: priceDelta > 0 ? String(Math.round(priceDelta)) : "",
  };
}

function menuConfigToEditorState(menuConfig: FoodMenuConfig | null | undefined) {
  const defaultConfig = buildDefaultFoodMenuConfig();
  const singleSection = menuConfig?.sections.find((section) => section.selection === "single") ?? defaultConfig.sections[0];
  const multipleSection = menuConfig?.sections.find((section) => section.selection === "multiple") ?? defaultConfig.sections[1];
  return {
    baseOptions: singleSection.options.map((option) => makeEditableOption(option.name, option.priceDelta)),
    addonOptions: multipleSection.options.map((option) => makeEditableOption(option.name, option.priceDelta)),
  };
}

function editorStateToMenuConfig(baseOptions: EditableMenuOption[], addonOptions: EditableMenuOption[]): FoodMenuConfig | null {
  const cleanBaseOptions = baseOptions
    .map((option, index) => ({
      id: option.id || `base-${index + 1}`,
      name: option.name.trim(),
      priceDelta: Number(option.priceDelta || 0) || 0,
    }))
    .filter((option) => option.name);

  const cleanAddonOptions = addonOptions
    .map((option, index) => ({
      id: option.id || `addon-${index + 1}`,
      name: option.name.trim(),
      priceDelta: Math.max(0, Number(option.priceDelta || 0) || 0),
    }))
    .filter((option) => option.name);

  if (!cleanBaseOptions.length && !cleanAddonOptions.length) return null;

  return {
    version: 1,
    sections: [
      ...(cleanBaseOptions.length
        ? [{
            id: "base-choice",
            title: "Choose your base",
            selection: "single" as const,
            required: true,
            options: cleanBaseOptions,
          }]
        : []),
      ...(cleanAddonOptions.length
        ? [{
            id: "extras",
            title: "Add extras",
            selection: "multiple" as const,
            required: false,
            options: cleanAddonOptions,
          }]
        : []),
    ],
  };
}

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
  form.append("folder", "eya/products");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Image upload failed.");
  return json.secure_url as string;
}

function uniqueImageUrls(values: (string | null | undefined)[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const url = value?.trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    output.push(url);
  });
  return output;
}

export default function AddProductPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ itemId?: string }>();
  const isOpenFlow = pathname.startsWith("/sell/");
  const isRestaurantFlow = !isOpenFlow;
  const { workspace, saveProduct, archiveProduct } = useSellerWorkspace(isRestaurantFlow ? "food" : "market");
  const editing = useMemo(() => workspace.products.find((item) => item.id === params.itemId), [params.itemId, workspace.products]);
  const productsRoute = isOpenFlow ? "/sell/products" : "/(market)/(tabs)/products";
  const homeRoute = isOpenFlow ? "/(student)/market" : "/(market)/(tabs)/dashboard";
  const activeCategoryOptions = isRestaurantFlow ? menuCategoryOptions : categoryOptions;
  const activeConditionOptions = isRestaurantFlow ? menuConditionOptions : conditionOptions;

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState(isRestaurantFlow ? "Lunch" : "Essentials");
  const [condition, setCondition] = useState(isRestaurantFlow ? "Ready fast" : "Brand new");
  const [promotionTitle, setPromotionTitle] = useState("");
  const [promotionType, setPromotionType] = useState<"percent" | "flat">("percent");
  const [promotionValue, setPromotionValue] = useState("");
  const [inventoryHistory, setInventoryHistory] = useState<InventoryHistoryEntry[]>([]);
  const [channel, setChannel] = useState<SalesChannel>(isRestaurantFlow ? "food" : "market");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishedProductName, setPublishedProductName] = useState<string | null>(null);
  const [baseOptions, setBaseOptions] = useState<EditableMenuOption[]>(() => menuConfigToEditorState(isRestaurantFlow ? buildDefaultFoodMenuConfig() : null).baseOptions);
  const [addonOptions, setAddonOptions] = useState<EditableMenuOption[]>(() => menuConfigToEditorState(isRestaurantFlow ? buildDefaultFoodMenuConfig() : null).addonOptions);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!editing) return;
      setName(editing.name);
      setPrice(String(Math.round(Number(editing.price_mwk))));
      const parsedDescription = isRestaurantFlow ? parseFoodDescription(editing.description) : { description: editing.description ?? "", menuConfig: null };
      setDescription(parsedDescription.description ?? "");
      setStock(editing.stock_qty == null ? "" : String(editing.stock_qty));
      setChannel(editing.channel);
      setImageUrls(uniqueImageUrls([...(editing.image_urls ?? []), editing.image_url]));
      if (isRestaurantFlow) {
        const menuState = menuConfigToEditorState(parsedDescription.menuConfig);
        setBaseOptions(menuState.baseOptions);
        setAddonOptions(menuState.addonOptions);
      }
      const meta = await getSellerProductMeta(editing.id);
      if (!active) return;
      setCategory(meta?.category ?? (isRestaurantFlow ? "Lunch" : "Essentials"));
      setCondition(meta?.condition ?? (isRestaurantFlow ? "Ready fast" : "Brand new"));
      setPromotionTitle(meta?.promotion?.title ?? "");
      setPromotionType(meta?.promotion?.type ?? "percent");
      setPromotionValue(meta?.promotion?.value != null ? String(meta.promotion.value) : "");
      setInventoryHistory(meta?.inventoryHistory ?? []);
    };
    void run();
    return () => {
      active = false;
    };
  }, [editing, isRestaurantFlow]);

  const mealBuilderConfig = useMemo(
    () => (isRestaurantFlow ? editorStateToMenuConfig(baseOptions, addonOptions) : null),
    [addonOptions, baseOptions, isRestaurantFlow],
  );
  const mealBuilderSummary = useMemo(() => summarizeFoodMenu(mealBuilderConfig), [mealBuilderConfig]);
  const previewSelection = useMemo(
    () =>
      isRestaurantFlow
        ? buildFoodSelectionSummary(name.trim() || "Meal", Number(price) || 0, mealBuilderConfig, {
            "base-choice": baseOptions[0]?.name.trim() ? [baseOptions[0].id] : [],
            extras: addonOptions[0]?.name.trim() ? [addonOptions[0].id] : [],
          })
        : null,
    [addonOptions, baseOptions, isRestaurantFlow, mealBuilderConfig, name, price],
  );
  const coverImageUrl = imageUrls[0] ?? "";

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow photo access to upload product images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 0,
      quality: 0.88,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return;
    const assets = (result.assets ?? []).filter((asset) => !!asset?.uri);
    if (!assets.length) return;

    setUploadingImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (const asset of assets) {
        uploadedUrls.push(await uploadProductImage(asset));
      }
      setImageUrls((current) => uniqueImageUrls([...current, ...uploadedUrls]));
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message ?? "Could not upload images.");
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = (url: string) => {
    setImageUrls((current) => current.filter((value) => value !== url));
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
      const encodedDescription = isRestaurantFlow
        ? encodeFoodDescription(description, mealBuilderConfig)
        : description.trim() || null;
      const saved = await saveProduct({
        itemId: editing?.id,
        name,
        price_mwk: Number(price),
        description: encodedDescription,
        stock_qty: stock.trim() ? Number(stock) : null,
        channel,
        image_url: coverImageUrl || null,
        image_urls: imageUrls,
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
        await logInventoryHistory(productId, stock.trim() ? Number(stock) : null, editing ? (isRestaurantFlow ? "Updated meal availability from menu editor" : "Updated stock from product editor") : (isRestaurantFlow ? "Initial meal availability added" : "Initial stock added"));
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
    setCategory(isRestaurantFlow ? "Lunch" : "Essentials");
    setCondition(isRestaurantFlow ? "Ready fast" : "Brand new");
    setPromotionTitle("");
    setPromotionValue("");
    setImageUrls([]);
    if (isRestaurantFlow) {
      const menuState = menuConfigToEditorState(buildDefaultFoodMenuConfig());
      setBaseOptions(menuState.baseOptions);
      setAddonOptions(menuState.addonOptions);
    }
  };

  const updateMenuOption = (
    setter: React.Dispatch<React.SetStateAction<EditableMenuOption[]>>,
    optionId: string,
    field: keyof Pick<EditableMenuOption, "name" | "priceDelta">,
    value: string,
  ) => {
    setter((current) => current.map((option) => (option.id === optionId ? { ...option, [field]: value } : option)));
  };

  const removeMenuOption = (setter: React.Dispatch<React.SetStateAction<EditableMenuOption[]>>, optionId: string) => {
    setter((current) => current.filter((option) => option.id !== optionId));
  };

  const addPresetOptions = (
    setter: React.Dispatch<React.SetStateAction<EditableMenuOption[]>>,
    presets: { name: string; priceDelta?: number }[],
  ) => {
    setter((current) => {
      const existing = new Set(current.map((option) => option.name.trim().toLowerCase()).filter(Boolean));
      const additions = presets
        .filter((preset) => !existing.has(preset.name.trim().toLowerCase()))
        .map((preset) => makeEditableOption(preset.name, preset.priceDelta ?? 0));
      return additions.length ? [...current, ...additions] : current;
    });
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
            <Text style={styles.successTitle}>{isRestaurantFlow ? "Menu item listed!" : "Product listed!"}</Text>
            <Text style={styles.successSub}>{publishedProductName} is now ready for {isRestaurantFlow ? "students ordering from the food section" : "customers to discover on EYA"}.</Text>

            <View style={styles.successArt}>
              <View style={styles.successBlob} />
              <View style={styles.successCard}>
                <Package2 size={44} color="#102a54" />
                <Text style={styles.successCardText}>{publishedProductName}</Text>
              </View>
            </View>

            <Pressable style={styles.primaryBtn} onPress={resetForm}>
              <Text style={styles.primaryBtnText}>{isRestaurantFlow ? "Add another menu item" : "Add another product"}</Text>
            </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => router.replace(homeRoute as any)}>
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
          <Text style={styles.title}>{editing ? (isRestaurantFlow ? "Edit menu item" : "Edit product") : (isRestaurantFlow ? "Add menu item" : "Add product")}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.subtitle}>{isRestaurantFlow ? "Fill out the form below to publish this meal into the student food section." : "Fill out the form below to list your item for sale."}</Text>

        <View style={styles.imageHero}>
          <View style={styles.imageHeroBackdrop} />
          {coverImageUrl ? <Image source={{ uri: coverImageUrl }} style={styles.heroPreviewImage} /> : <ImagePlus size={42} color="#102a54" />}
          {imageUrls.length ? (
            <View style={styles.photoGrid}>
              {imageUrls.map((url, index) => (
                <View key={`${url}-${index}`} style={styles.photoTile}>
                  <Image source={{ uri: url }} style={styles.photoTileImage} />
                  {index === 0 ? (
                    <View style={styles.coverBadge}>
                      <Text style={styles.coverBadgeText}>Cover</Text>
                    </View>
                  ) : null}
                  <Pressable style={styles.removePhotoBtn} onPress={() => removeImage(url)}>
                    <Trash2 size={13} color="#ffffff" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable style={styles.uploadBtn} onPress={pickImage} disabled={uploadingImage || !workspace.hasVendor}>
            <Text style={styles.uploadBtnText}>{uploadingImage ? "Uploading..." : imageUrls.length ? `Add more ${isRestaurantFlow ? "menu" : "product"} photos` : `Upload ${isRestaurantFlow ? "menu" : "product"} photos`}</Text>
          </Pressable>
          <Text style={styles.uploadHint}>{imageUrls.length ? `${imageUrls.length} photos selected` : "No photos selected"}</Text>
        </View>

        <View style={styles.formCard}>
          <Field label={isRestaurantFlow ? "Meal name" : "Product name"} icon={<Tag size={18} color="#102a54" />}>
            <TextInput value={name} onChangeText={setName} placeholder={isRestaurantFlow ? "Meal name..." : "Product name..."} placeholderTextColor="#98a3bd" style={styles.input} />
          </Field>

          <View style={styles.priceRow}>
            <View style={styles.currencyBox}>
              <Text style={styles.currencyText}>MWK</Text>
            </View>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder={isRestaurantFlow ? "Starting plate price..." : "Enter price..."}
              keyboardType="numeric"
              placeholderTextColor="#98a3bd"
              style={[styles.input, styles.priceInput]}
            />
          </View>

          <Field label={isRestaurantFlow ? "Meals available" : "Stock quantity"} icon={<Package2 size={18} color="#102a54" />}>
            <TextInput value={stock} onChangeText={setStock} placeholder={isRestaurantFlow ? "How many plates can you serve?" : "How many do you have?"} keyboardType="numeric" placeholderTextColor="#98a3bd" style={styles.input} />
          </Field>

          <Field label={isRestaurantFlow ? "Menu category" : "Category"} icon={<Sparkles size={18} color="#102a54" />}>
            <View style={styles.optionGrid}>
              {activeCategoryOptions.map((item) => {
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

          <Field label={isRestaurantFlow ? "Kitchen tag" : "Condition"} icon={<Check size={18} color="#102a54" />}>
            <View style={styles.conditionList}>
              {activeConditionOptions.map((item) => {
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

          <Field label={isRestaurantFlow ? "Menu description" : "Description"} icon={<Tag size={18} color="#102a54" />}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={isRestaurantFlow ? "Describe ingredients, sides, or what makes this meal worth ordering..." : "Describe your product details..."}
              placeholderTextColor="#98a3bd"
              style={[styles.input, styles.textArea]}
              multiline
              textAlignVertical="top"
            />
          </Field>

          {isRestaurantFlow ? (
            <Field label="Meal builder" icon={<Sparkles size={18} color="#102a54" />}>
              <View style={styles.builderCard}>
                <Text style={styles.builderTitle}>Flexible plate setup</Text>
                <Text style={styles.builderText}>
                  Students will start with the base price, choose one main starch like rice or nsima, then add protein options such as chicken, beef, fish, or sausage.
                </Text>

                <View style={styles.presetWrap}>
                  <Text style={styles.builderLabel}>Quick base presets</Text>
                  <View style={styles.presetRow}>
                    {["Rice", "Nsima", "Spaghetti", "Macaroni"].map((preset) => (
                      <Pressable
                        key={preset}
                        style={styles.presetPill}
                        onPress={() => addPresetOptions(setBaseOptions, [{ name: preset }])}
                      >
                        <Text style={styles.presetPillText}>{preset}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.builderSection}>
                  <Text style={styles.builderLabel}>Choose your base</Text>
                  <Text style={styles.builderHint}>Students must pick one of these options.</Text>
                  <View style={styles.optionEditorList}>
                    {baseOptions.map((option) => (
                      <View key={option.id} style={styles.optionEditorRow}>
                        <TextInput
                          value={option.name}
                          onChangeText={(value) => updateMenuOption(setBaseOptions, option.id, "name", value)}
                          placeholder="Base option"
                          placeholderTextColor="#98a3bd"
                          style={[styles.input, styles.optionEditorInput]}
                        />
                        <TextInput
                          value={option.priceDelta}
                          onChangeText={(value) => updateMenuOption(setBaseOptions, option.id, "priceDelta", value)}
                          placeholder="0"
                          keyboardType="numeric"
                          placeholderTextColor="#98a3bd"
                          style={[styles.input, styles.optionEditorPrice]}
                        />
                        <Pressable style={styles.optionDeleteBtn} onPress={() => removeMenuOption(setBaseOptions, option.id)}>
                          <Trash2 size={16} color="#b03c66" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                  <Pressable style={styles.builderAddBtn} onPress={() => setBaseOptions((current) => [...current, makeEditableOption()])}>
                    <Text style={styles.builderAddText}>+ Add base option</Text>
                  </Pressable>
                </View>

                <View style={styles.presetWrap}>
                  <Text style={styles.builderLabel}>Quick protein presets</Text>
                  <View style={styles.presetRow}>
                    {[
                      { name: "Chicken", priceDelta: 2500 },
                      { name: "Beef", priceDelta: 2200 },
                      { name: "Sausage", priceDelta: 1800 },
                      { name: "Fish", priceDelta: 2800 },
                    ].map((preset) => (
                      <Pressable
                        key={preset.name}
                        style={styles.presetPill}
                        onPress={() => addPresetOptions(setAddonOptions, [preset])}
                      >
                        <Text style={styles.presetPillText}>{preset.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.builderSection}>
                  <Text style={styles.builderLabel}>Optional add-ons</Text>
                  <Text style={styles.builderHint}>Set extra amounts for proteins, vegetables, or other upgrades.</Text>
                  <View style={styles.optionEditorList}>
                    {addonOptions.map((option) => (
                      <View key={option.id} style={styles.optionEditorRow}>
                        <TextInput
                          value={option.name}
                          onChangeText={(value) => updateMenuOption(setAddonOptions, option.id, "name", value)}
                          placeholder="Add-on"
                          placeholderTextColor="#98a3bd"
                          style={[styles.input, styles.optionEditorInput]}
                        />
                        <TextInput
                          value={option.priceDelta}
                          onChangeText={(value) => updateMenuOption(setAddonOptions, option.id, "priceDelta", value)}
                          placeholder="Extra MWK"
                          keyboardType="numeric"
                          placeholderTextColor="#98a3bd"
                          style={[styles.input, styles.optionEditorPrice]}
                        />
                        <Pressable style={styles.optionDeleteBtn} onPress={() => removeMenuOption(setAddonOptions, option.id)}>
                          <Trash2 size={16} color="#b03c66" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                  <Pressable style={styles.builderAddBtn} onPress={() => setAddonOptions((current) => [...current, makeEditableOption()])}>
                    <Text style={styles.builderAddText}>+ Add add-on</Text>
                  </Pressable>
                </View>

                <View style={styles.builderPreviewCard}>
                  <Text style={styles.builderPreviewTitle}>Preview for students</Text>
                  <Text style={styles.builderPreviewPrimary}>
                    {previewSelection?.itemTitle ?? (name.trim() || "Meal")}
                  </Text>
                  <Text style={styles.builderPreviewPrice}>Starts at MWK {Math.round(Number(price) || 0).toLocaleString()}</Text>
                  <Text style={styles.builderPreviewText}>
                    {mealBuilderSummary || "Add base meals and extras to show a live food builder in the student app."}
                  </Text>
                </View>
              </View>
            </Field>
          ) : null}

          {isRestaurantFlow ? (
            <Field label="Sales channel" icon={<ShoppingBag size={18} color="#102a54" />}>
              <View style={styles.channelBtnActive}>
                <Text style={styles.channelTextActive}>Food section only</Text>
              </View>
            </Field>
          ) : (
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
          )}

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
          <Text style={styles.primaryBtnText}>{saving ? "Saving..." : editing ? (isRestaurantFlow ? "Update menu item" : "Update product") : (isRestaurantFlow ? "List menu item" : "List product")}</Text>
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
  photoGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  photoTile: {
    width: 76,
    height: 76,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#eef3ff",
    borderWidth: 1,
    borderColor: "#dfe7f8",
  },
  photoTileImage: { width: "100%", height: "100%" },
  coverBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    borderRadius: 999,
    backgroundColor: "rgba(16,42,84,0.88)",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  coverBadgeText: { color: "#ffffff", fontSize: 10, fontWeight: "900" },
  removePhotoBtn: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(176,60,102,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
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
  builderCard: {
    borderRadius: 22,
    backgroundColor: "#f8faff",
    borderWidth: 1,
    borderColor: "#e1e7fb",
    padding: 14,
    gap: 14,
  },
  builderTitle: { color: "#102a54", fontSize: 17, fontWeight: "900" },
  builderText: { color: "#67779c", fontSize: 13, fontWeight: "700", lineHeight: 20 },
  presetWrap: { gap: 8 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  presetPill: {
    borderRadius: 999,
    backgroundColor: "#edf3ff",
    borderWidth: 1,
    borderColor: "#dbe6ff",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presetPillText: { color: "#102a54", fontSize: 12, fontWeight: "900" },
  builderSection: { gap: 8 },
  builderLabel: { color: "#102a54", fontSize: 14, fontWeight: "900" },
  builderHint: { color: "#7a87a5", fontSize: 12, fontWeight: "700" },
  optionEditorList: { gap: 8 },
  optionEditorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  optionEditorInput: { flex: 1 },
  optionEditorPrice: { width: 110 },
  optionDeleteBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ffd4e3",
    backgroundColor: "#fff5f8",
    alignItems: "center",
    justifyContent: "center",
  },
  builderAddBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#102a54",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  builderAddText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  builderPreviewCard: {
    borderRadius: 20,
    backgroundColor: "#102a54",
    padding: 14,
    gap: 6,
  },
  builderPreviewTitle: { color: "#bcd0ff", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  builderPreviewPrimary: { color: "#fff", fontSize: 17, fontWeight: "900" },
  builderPreviewPrice: { color: "#d9e6ff", fontSize: 14, fontWeight: "800" },
  builderPreviewText: { color: "#d1dbf6", fontSize: 12, fontWeight: "700", lineHeight: 18 },
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
