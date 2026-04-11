import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Check, ChevronLeft, ChevronRight, CreditCard, ImagePlus, MapPin, ShoppingBag, Store } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import SoftPageGlow from "@/components/SoftPageGlow";
import { createVendor, listMyVendors, updateVendor } from "@/lib/newApp/vendors";
import { getSellerStorefrontMeta, setSellerStorefrontMeta } from "@/lib/sellerStorefront";
import { uploadStorefrontImage } from "@/lib/storefrontUpload";
import { useAuth } from "@/providers/AuthProvider";

type Step = "intro" | "form" | "done";

type ShopCategoryOption = {
  id: string;
  label: string;
  hint: string;
};

const shopCategories: ShopCategoryOption[] = [
  { id: "Essentials", label: "Essentials", hint: "Daily campus basics" },
  { id: "Electronics", label: "Electronics", hint: "Devices and accessories" },
  { id: "Fashion", label: "Fashion", hint: "Clothes and style" },
  { id: "Study", label: "Study", hint: "Books and learning tools" },
];

const featureItems = [
  {
    id: "reach",
    title: "Reach students near your campus",
    sub: "Turn your account into a campus shop in a few steps.",
    icon: <MapPin size={22} color="#102a54" />,
  },
  {
    id: "orders",
    title: "Manage orders in one place",
    sub: "Keep products, customer chats, and selling updates inside the app.",
    icon: <Store size={22} color="#102a54" />,
  },
  {
    id: "paid",
    title: "Get ready to publish products",
    sub: "Finish your shop first, then add your first item with category and pricing.",
    icon: <CreditCard size={22} color="#102a54" />,
  },
];

export default function SellerSetupPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const isOpenFlow = pathname.startsWith("/sell/");
  const defaultName = useMemo(() => {
    const raw = user?.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "My Shop";
    return raw
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }, [user?.email]);

  const [step, setStep] = useState<Step>("intro");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [name, setName] = useState(defaultName);
  const [sellerName, setSellerName] = useState(defaultName);
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [campus, setCampus] = useState("MUST");
  const [area, setArea] = useState("Soche");
  const [city, setCity] = useState("Blantyre");
  const [selectedCategory, setSelectedCategory] = useState("Essentials");
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    let active = true;
    const loadExistingVendor = async () => {
      if (!user?.id) return;
      try {
        const vendors = await listMyVendors(user.id);
        const current = vendors.find((item) => item.supports_market) ?? vendors[0] ?? null;
        if (!active || !current) return;
        setVendorId(current.id);
        setName(current.name || defaultName);
        setSellerName(current.name || defaultName);
        setDescription(current.description ?? "");
        setCampus(current.campus ?? "MUST");
        setArea(current.area ?? "Soche");
        setCity(current.city ?? "Blantyre");
        const storefront = await getSellerStorefrontMeta(current.id);
        if (!active) return;
        setAvatarUrl(storefront?.avatarUrl ?? "");
        setBannerUrl(storefront?.bannerUrl ?? "");
      } catch {
        // Keep the onboarding flow usable even if the vendor query fails.
      }
    };
    void loadExistingVendor();
    return () => {
      active = false;
    };
  }, [defaultName, user?.id]);

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Allow photo access to upload your shop profile picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setUploadingAvatar(true);
    try {
      const url = await uploadStorefrontImage(asset);
      setAvatarUrl(url);
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message ?? "Could not upload shop profile picture.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const submit = async () => {
    if (!user) return;
    if (!name.trim()) {
      Alert.alert("Shop name required", "Enter a shop name before continuing.");
      return;
    }
    if (!sellerName.trim()) {
      Alert.alert("Seller name required", "Enter the seller full name.");
      return;
    }

    setSaving(true);
    try {
      const descriptionWithCategory = `${description.trim() || "Campus seller storefront"}\nCategory: ${selectedCategory}\nOwner: ${sellerName.trim()}${phone.trim() ? `\nPhone: ${phone.trim()}` : ""}`;
      const updatePayload = {
        name: name.trim(),
        description: descriptionWithCategory,
        campus: campus.trim() || null,
        area: area.trim() || null,
        city: city.trim() || null,
        supports_market: true,
        supports_food: false,
        is_active: true,
      };

      let resolvedVendorId = vendorId;
      if (!resolvedVendorId) {
        const vendors = await listMyVendors(user.id);
        const current = vendors.find((item) => item.supports_market) ?? null;
        if (current) resolvedVendorId = current.id;
      }

      const vendor = resolvedVendorId
        ? await updateVendor(resolvedVendorId, updatePayload)
        : await createVendor(user.id, {
            name: updatePayload.name,
            description: updatePayload.description,
            campus: updatePayload.campus,
            area: updatePayload.area,
            city: updatePayload.city,
            supports_market: true,
            supports_food: false,
          });

      setVendorId(vendor.id);
      const existingStorefront = await getSellerStorefrontMeta(vendor.id).catch(() => null);
      await setSellerStorefrontMeta({
        vendorId: vendor.id,
        avatarUrl: (avatarUrl || existingStorefront?.avatarUrl) ?? null,
        bannerUrl: (bannerUrl || existingStorefront?.bannerUrl) ?? null,
      });
      setStep("done");
    } catch (err: any) {
      Alert.alert("Setup failed", err?.message ?? "Could not create seller profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="account" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => (step === "intro" ? router.back() : setStep(step === "done" ? "form" : "intro"))}>
            <ChevronLeft size={22} color="#102a54" />
          </Pressable>
          <Text style={styles.headerTag}>Sell on EYA</Text>
        </View>

        {step === "intro" ? (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroBadge}>
                <ShoppingBag size={18} color="#102a54" />
                <Text style={styles.heroBadgeText}>{vendorId ? "Shop already created" : "Start selling"}</Text>
              </View>
              <Text style={styles.heroTitle}>{vendorId ? "Your shop is ready" : "Open your own campus shop"}</Text>
              <Text style={styles.heroSub}>
                {vendorId
                  ? "You already have a shop. Add another product or update your shop details anytime."
                  : "Create your shop, add products, receive orders, and manage everything with EYA's marketplace tools."}
              </Text>
              <View style={styles.heroArt}>
                <View style={styles.heroBlobA} />
                <View style={styles.heroBlobB} />
                <View style={styles.heroStoreCard}>
                  <Store size={34} color="#102a54" />
                  <Text style={styles.heroStoreText}>{vendorId ? name : "Your shop"}</Text>
                </View>
              </View>
            </View>

            <View style={styles.featureList}>
              {featureItems.map((item) => (
                <View key={item.id} style={styles.featureCard}>
                  <View style={styles.featureIcon}>{item.icon}</View>
                  <View style={styles.featureCopy}>
                    <Text style={styles.featureTitle}>{item.title}</Text>
                    <Text style={styles.featureSub}>{item.sub}</Text>
                  </View>
                  <ChevronRight size={18} color="#8fa0c0" />
                </View>
              ))}
            </View>

            <Pressable
              style={styles.primaryBtn}
              onPress={() => (vendorId ? router.replace(isOpenFlow ? "/sell/add-product" : "/(market)/add-product") : setStep("form"))}
            >
              <Text style={styles.primaryBtnText}>{vendorId ? "Add a product" : "Open my shop"}</Text>
            </Pressable>
            {vendorId ? (
              <Pressable style={styles.secondaryBtn} onPress={() => setStep("form")}>
                <Text style={styles.secondaryBtnText}>Edit shop details</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.secondaryGhost}
              onPress={() => router.replace(isOpenFlow ? "/(student)/(tabs)/marketplace" : "/(market)/(tabs)/dashboard")}
            >
              <Text style={styles.secondaryGhostText}>{isOpenFlow ? "Back to marketplace" : "Go to dashboard"}</Text>
            </Pressable>
          </>
        ) : null}

        {step === "form" ? (
          <>
            <View style={styles.formIntro}>
              <Text style={styles.formTitle}>{vendorId ? "Update your shop" : "Setup your shop"}</Text>
              <Text style={styles.formSub}>
                {vendorId
                  ? "Edit your shop details. Your products stay in the same shop - you can add as many as you want."
                  : "Use your EYA colors and campus details to create a seller space that is ready for publishing."}
              </Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.fieldLabel}>Shop profile picture</Text>
              <Pressable style={styles.avatarPicker} onPress={() => void pickAvatar()} disabled={uploadingAvatar}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarPreview} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <ImagePlus size={26} color="#102a54" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.avatarTitle}>{avatarUrl ? "Change profile picture" : "Upload profile picture"}</Text>
                  <Text style={styles.avatarSub}>{uploadingAvatar ? "Uploading..." : "Square photo looks best"}</Text>
                </View>
              </Pressable>

              <Field label="Shop name">
                <TextInput value={name} onChangeText={setName} placeholder="Shop name" placeholderTextColor="#98a3bd" style={styles.input} />
              </Field>

              <Field label="Seller full name">
                <TextInput value={sellerName} onChangeText={setSellerName} placeholder="Seller full name" placeholderTextColor="#98a3bd" style={styles.input} />
              </Field>

              <Field label="Phone number">
                <TextInput value={phone} onChangeText={setPhone} placeholder="+265..." keyboardType="phone-pad" placeholderTextColor="#98a3bd" style={styles.input} />
              </Field>

              <View style={styles.row}>
                <View style={styles.rowCol}>
                  <Field label="Campus">
                    <TextInput value={campus} onChangeText={setCampus} placeholder="Campus" placeholderTextColor="#98a3bd" style={styles.input} />
                  </Field>
                </View>
                <View style={styles.rowCol}>
                  <Field label="Area">
                    <TextInput value={area} onChangeText={setArea} placeholder="Area" placeholderTextColor="#98a3bd" style={styles.input} />
                  </Field>
                </View>
              </View>

              <Field label="City">
                <TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor="#98a3bd" style={styles.input} />
              </Field>

              <Field label="Shop category">
                <View style={styles.categoryChipGrid}>
                  {shopCategories.map((item) => {
                    const active = item.id === selectedCategory;
                    return (
                      <Pressable key={item.id} style={[styles.categoryChip, active && styles.categoryChipActive]} onPress={() => setSelectedCategory(item.id)}>
                        <Text style={[styles.categoryChipLabel, active && styles.categoryChipLabelActive]}>{item.label}</Text>
                        <Text style={[styles.categoryChipHint, active && styles.categoryChipHintActive]}>{item.hint}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              <Field label="Shop description">
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Briefly describe what you will be selling..."
                  placeholderTextColor="#98a3bd"
                  style={[styles.input, styles.textArea]}
                  multiline
                  textAlignVertical="top"
                />
              </Field>

              <Pressable style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]} onPress={submit} disabled={saving}>
                <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Continue"}</Text>
              </Pressable>
              <Pressable style={styles.secondaryGhost} onPress={() => setStep("intro")}>
                <Text style={styles.secondaryGhostText}>Back</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {step === "done" ? (
          <View style={styles.doneWrap}>
            <View style={styles.doneCheck}>
              <Check size={38} color="#fff" />
            </View>
            <Text style={styles.doneTitle}>Your shop is ready</Text>
            <Text style={styles.doneSub}>You can now add products, receive orders, and manage your seller space from one place.</Text>

            <View style={styles.doneArt}>
              <View style={styles.doneArtCircle} />
              <View style={styles.doneArtCard}>
                <ShoppingBag size={40} color="#102a54" />
                <Text style={styles.doneArtText}>{name}</Text>
              </View>
            </View>

            <Pressable style={styles.primaryBtn} onPress={() => router.replace(isOpenFlow ? "/sell/add-product" : "/(market)/add-product")}>
              <Text style={styles.primaryBtnText}>Add a product</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => router.replace(isOpenFlow ? "/(student)/(tabs)/marketplace" : "/(market)/(tabs)/dashboard")}>
              <Text style={styles.secondaryBtnText}>{isOpenFlow ? "Back to marketplace" : "Go to dashboard"}</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f1fb" },
  content: { padding: 18, paddingBottom: 42, gap: 18 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  headerTag: { color: "#7a87a5", fontSize: 14, fontWeight: "800" },
  avatarPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 14,
    marginBottom: 6,
  },
  avatarPreview: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#eef3ff" },
  avatarPlaceholder: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#eef3ff", alignItems: "center", justifyContent: "center" },
  avatarTitle: { color: "#102a54", fontSize: 16, fontWeight: "900" },
  avatarSub: { color: "#7a87a5", fontSize: 12, fontWeight: "700", marginTop: 4 },
  heroCard: {
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 20,
    gap: 14,
  },
  heroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#edf3ff",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroBadgeText: { color: "#102a54", fontWeight: "900", fontSize: 13 },
  heroTitle: { color: "#102a54", fontSize: 38, fontWeight: "900", lineHeight: 42 },
  heroSub: { color: "#7382a2", fontSize: 16, fontWeight: "700", lineHeight: 24 },
  heroArt: { marginTop: 8, minHeight: 170, borderRadius: 26, backgroundColor: "#f7f6ff", overflow: "hidden", justifyContent: "center", alignItems: "center" },
  heroBlobA: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "#dbe8ff", left: -36, bottom: -84, opacity: 0.7 },
  heroBlobB: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "#ffd7e8", right: -26, top: -40, opacity: 0.6 },
  heroStoreCard: {
    width: 152,
    height: 152,
    borderRadius: 34,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e5ecff",
  },
  heroStoreText: { color: "#102a54", fontSize: 18, fontWeight: "900" },
  featureList: { gap: 12 },
  featureCard: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIcon: { width: 50, height: 50, borderRadius: 18, backgroundColor: "#edf3ff", alignItems: "center", justifyContent: "center" },
  featureCopy: { flex: 1, gap: 4 },
  featureTitle: { color: "#102a54", fontSize: 18, fontWeight: "900" },
  featureSub: { color: "#7a87a5", fontSize: 13, fontWeight: "700", lineHeight: 18 },
  formIntro: { gap: 6 },
  formTitle: { color: "#102a54", fontSize: 34, fontWeight: "900" },
  formSub: { color: "#7a87a5", fontSize: 15, fontWeight: "700", lineHeight: 22 },
  formCard: {
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 18,
    gap: 14,
  },
  field: { gap: 8 },
  fieldLabel: { color: "#102a54", fontSize: 16, fontWeight: "900" },
  input: {
    borderRadius: 18,
    backgroundColor: "#f8f9fe",
    borderWidth: 1,
    borderColor: "#e8eaf6",
    paddingHorizontal: 16,
    paddingVertical: 15,
    color: "#102a54",
    fontWeight: "700",
  },
  textArea: { minHeight: 110 },
  row: { flexDirection: "row", gap: 12 },
  rowCol: { flex: 1 },
  categoryChipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  categoryChip: {
    width: "48%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e1e7fb",
    backgroundColor: "#f8faff",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  categoryChipActive: { backgroundColor: "#102a54", borderColor: "#102a54" },
  categoryChipLabel: { color: "#102a54", fontSize: 15, fontWeight: "900" },
  categoryChipLabelActive: { color: "#fff" },
  categoryChipHint: { color: "#7a87a5", fontSize: 12, fontWeight: "700" },
  categoryChipHintActive: { color: "#d6def6" },
  primaryBtn: { borderRadius: 999, backgroundColor: "#102a54", alignItems: "center", paddingVertical: 17, marginTop: 6 },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 18 },
  secondaryGhost: { alignItems: "center", paddingVertical: 8 },
  secondaryGhostText: { color: "#62739a", fontWeight: "800", fontSize: 16 },
  doneWrap: {
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 20,
    gap: 16,
    alignItems: "center",
  },
  doneCheck: { width: 78, height: 78, borderRadius: 39, backgroundColor: "#7cb6ff", alignItems: "center", justifyContent: "center" },
  doneTitle: { color: "#102a54", fontSize: 34, fontWeight: "900", textAlign: "center" },
  doneSub: { color: "#7a87a5", fontSize: 16, fontWeight: "700", lineHeight: 24, textAlign: "center" },
  doneArt: { width: "100%", minHeight: 220, borderRadius: 28, backgroundColor: "#f7f7ff", overflow: "hidden", justifyContent: "center", alignItems: "center" },
  doneArtCircle: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "#dce8ff", opacity: 0.8 },
  doneArtCard: {
    width: 200,
    height: 140,
    borderRadius: 26,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3e9ff",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  doneArtText: { color: "#102a54", fontSize: 20, fontWeight: "900" },
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
});
