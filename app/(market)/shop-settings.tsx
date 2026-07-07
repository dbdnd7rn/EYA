import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, ImagePlus } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import { getSellerShopMeta, upsertSellerShopMeta } from "@/lib/sellerEnhancements";
import { getSellerStorefrontMeta, setSellerStorefrontMeta } from "@/lib/sellerStorefront";
import { uploadStorefrontImage } from "@/lib/storefrontUpload";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

export default function SellerShopSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { workspace, updateVendorProfile } = useSellerWorkspace("food");
  const vendor = workspace.vendor;

  const [managerName, setManagerName] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [campus, setCampus] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("Blantyre");
  const [isActive, setIsActive] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [openingHours, setOpeningHours] = useState("Mon - Sun • 8:00 AM - 8:00 PM");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "banner" | "gallery" | null>(null);

  useEffect(() => {
    if (!vendor) return;
    setManagerName(workspace.profile.displayName ?? "");
    setName(vendor.name ?? "");
    setDescription(vendor.description ?? "");
    setCampus(vendor.campus ?? "");
    setArea(vendor.area ?? "");
    setCity(vendor.city ?? "Blantyre");
    setIsActive(vendor.is_active);
  }, [vendor, workspace.profile.displayName]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!vendor?.id) return;
      const meta = await getSellerStorefrontMeta(vendor.id);
      const shopMeta = await getSellerShopMeta(vendor.id);
      if (!active) return;
      setAvatarUrl(meta?.avatarUrl ?? "");
      setBannerUrl(meta?.bannerUrl ?? "");
      setGalleryUrls(meta?.galleryUrls ?? []);
      setOpeningHours(shopMeta?.openingHours ?? "Mon - Sun • 8:00 AM - 8:00 PM");
      setContactPhone(shopMeta?.contactPhone ?? "");
      setContactEmail(shopMeta?.contactEmail ?? user?.email ?? "");
      setWhatsapp(shopMeta?.whatsapp ?? "");
      setSoundAlertsEnabled(shopMeta?.soundAlertsEnabled ?? true);
      setPushNotificationsEnabled(shopMeta?.pushNotificationsEnabled ?? true);
    };
    void run();
    return () => {
      active = false;
    };
  }, [user?.email, vendor?.id]);

  const pickStorefrontImage = async (kind: "avatar" | "banner" | "gallery") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Allow photo access to upload storefront images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.88,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri || !vendor?.id) return;

    setUploading(kind);
    try {
      const url = await uploadStorefrontImage(asset);
      const nextMeta = {
        vendorId: vendor.id,
        avatarUrl: kind === "avatar" ? url : avatarUrl || null,
        bannerUrl: kind === "banner" ? url : bannerUrl || null,
        galleryUrls: kind === "gallery" ? [...galleryUrls, url] : galleryUrls,
      };
      await setSellerStorefrontMeta(nextMeta);
      if (kind === "avatar") setAvatarUrl(url);
      else if (kind === "banner") setBannerUrl(url);
      else setGalleryUrls((current) => [...current, url]);
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message ?? "Could not upload storefront image.");
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    if (!vendor) return;
    if (!managerName.trim()) {
      Alert.alert("Manager name required", "Enter the restaurant manager or account name.");
      return;
    }
    if (!name.trim()) {
      Alert.alert("Shop name required", "Enter the seller or shop name.");
      return;
    }
    if (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) {
      Alert.alert("Valid email required", "Enter a valid business email address.");
      return;
    }
    setSaving(true);
    try {
      const cleanManagerName = managerName.trim();
      const cleanPhone = contactPhone.trim() || null;

      const profileUpdate = await supabase
        .from("profiles")
        .update({ full_name: cleanManagerName, phone: cleanPhone } as never)
        .eq("id", user?.id ?? "");

      if (profileUpdate.error) {
        const parts = cleanManagerName.split(/\s+/).filter(Boolean);
        const first = parts.shift() ?? cleanManagerName;
        const rest = parts.join(" ") || null;
        const fallback = await supabase
          .from("profiles")
          .update({ first_name: first, last_name: rest, surname: rest, phone: cleanPhone } as never)
          .eq("id", user?.id ?? "");
        if (fallback.error) throw fallback.error;
      }

      await updateVendorProfile({
        name,
        description: description.trim() || null,
        campus: campus.trim() || null,
        area: area.trim() || null,
        city: city.trim() || null,
        supports_market: false,
        supports_food: true,
        is_active: isActive,
      });
      await setSellerStorefrontMeta({ vendorId: vendor.id, avatarUrl: avatarUrl || null, bannerUrl: bannerUrl || null, galleryUrls });
      await upsertSellerShopMeta(vendor.id, {
        openingHours: openingHours.trim() || null,
        contactPhone: cleanPhone,
        contactEmail: contactEmail.trim() || null,
        whatsapp: whatsapp.trim() || null,
        soundAlertsEnabled,
        pushNotificationsEnabled,
      });
      Alert.alert("Saved", "Your shop settings have been updated.");
      router.back();
    } catch (err: any) {
      Alert.alert("Save failed", err?.message ?? "Could not update your shop.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="account" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ChevronLeft size={22} color="#102a54" />
          </Pressable>
          <Text style={styles.title}>Restaurant Settings</Text>
          <Pressable style={styles.saveGhost} onPress={submit} disabled={saving || !vendor}>
            <Text style={styles.saveGhostText}>{saving ? "Saving..." : "Save"}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
            <Text style={styles.cardTitle}>Manage your restaurant</Text>
            <Text style={styles.cardSub}>Keep your kitchen details, location, and availability updated for students ordering from the food section.</Text>

            <View style={styles.mediaGrid}>
              <Pressable style={styles.mediaCard} onPress={() => void pickStorefrontImage("avatar")}>
                {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarPreview} /> : <View style={styles.mediaPlaceholder}><ImagePlus size={24} color="#102a54" /></View>}
                <Text style={styles.mediaTitle}>Restaurant avatar</Text>
                <Text style={styles.mediaSub}>{uploading === "avatar" ? "Uploading..." : "Tap to upload"}</Text>
              </Pressable>

              <Pressable style={styles.mediaCard} onPress={() => void pickStorefrontImage("banner")}>
                {bannerUrl ? <Image source={{ uri: bannerUrl }} style={styles.bannerPreview} /> : <View style={styles.mediaPlaceholderWide}><ImagePlus size={24} color="#102a54" /></View>}
                <Text style={styles.mediaTitle}>Restaurant banner</Text>
                <Text style={styles.mediaSub}>{uploading === "banner" ? "Uploading..." : "Tap to upload"}</Text>
              </Pressable>
            </View>

            <View style={styles.gallerySection}>
              <Text style={styles.mediaTitle}>Restaurant gallery</Text>
              <Text style={styles.mediaSub}>Upload many food and ambience photos. They will slide slowly on the student restaurant page.</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
                {galleryUrls.map((url, index) => (
                  <View key={`${url}-${index}`} style={styles.galleryThumbWrap}>
                    <Image source={{ uri: url }} style={styles.galleryThumb} />
                    <Pressable
                      style={styles.galleryRemoveBtn}
                      onPress={async () => {
                        if (!vendor?.id) return;
                        const next = galleryUrls.filter((_, currentIndex) => currentIndex !== index);
                        setGalleryUrls(next);
                        await setSellerStorefrontMeta({ vendorId: vendor.id, avatarUrl: avatarUrl || null, bannerUrl: bannerUrl || null, galleryUrls: next });
                      }}
                    >
                      <Text style={styles.galleryRemoveText}>x</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable style={styles.galleryAddCard} onPress={() => void pickStorefrontImage("gallery")}>
                  <ImagePlus size={22} color="#102a54" />
                  <Text style={styles.galleryAddTitle}>{uploading === "gallery" ? "Uploading..." : "Add photo"}</Text>
                  <Text style={styles.galleryAddSub}>{galleryUrls.length} uploaded</Text>
                </Pressable>
              </ScrollView>
            </View>

            <TextInput value={managerName} onChangeText={setManagerName} placeholder="Manager or account name" placeholderTextColor="#98a3bd" style={styles.input} />
            <TextInput value={name} onChangeText={setName} placeholder="Restaurant name" placeholderTextColor="#98a3bd" style={styles.input} />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Short restaurant description"
              placeholderTextColor="#98a3bd"
              style={[styles.input, styles.textArea]}
              multiline
              textAlignVertical="top"
            />
            <TextInput value={campus} onChangeText={setCampus} placeholder="Campus" placeholderTextColor="#98a3bd" style={styles.input} />
            <TextInput value={area} onChangeText={setArea} placeholder="Area" placeholderTextColor="#98a3bd" style={styles.input} />
            <TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor="#98a3bd" style={styles.input} />
            <TextInput value={openingHours} onChangeText={setOpeningHours} placeholder="Opening hours" placeholderTextColor="#98a3bd" style={styles.input} />
            <TextInput value={contactPhone} onChangeText={setContactPhone} placeholder="Contact phone" placeholderTextColor="#98a3bd" style={styles.input} />
            <TextInput value={contactEmail} onChangeText={setContactEmail} placeholder="Contact email" placeholderTextColor="#98a3bd" style={styles.input} autoCapitalize="none" keyboardType="email-address" />
            <TextInput value={whatsapp} onChangeText={setWhatsapp} placeholder="WhatsApp number" placeholderTextColor="#98a3bd" style={styles.input} />

            <View style={styles.toggleCard}>
              <View style={styles.channelLockRow}>
                <Text style={styles.toggleLabel}>Role channel</Text>
                <Text style={styles.channelLockText}>Food section only</Text>
              </View>
              <ToggleRow label="Shop is active" value={isActive} onValueChange={setIsActive} />
              <ToggleRow label="Order sound alerts" value={soundAlertsEnabled} onValueChange={setSoundAlertsEnabled} />
              <ToggleRow label="Push notifications" value={pushNotificationsEnabled} onValueChange={setPushNotificationsEnabled} />
            </View>

            <Pressable style={[styles.submitBtn, saving && styles.submitBtnDisabled]} onPress={submit} disabled={saving}>
              <Text style={styles.submitBtnText}>{saving ? "Saving..." : "Update restaurant"}</Text>
            </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#dfe4f2", true: "#ffb5d1" }}
        thumbColor={value ? "#ff0f64" : "#ffffff"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f1fb" },
  content: { padding: 18, paddingBottom: 42, gap: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  title: { color: "#102a54", fontSize: 24, fontWeight: "900" },
  saveGhost: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#efe9ff" },
  saveGhostText: { color: "#102a54", fontWeight: "900" },
  card: {
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 18,
    gap: 14,
  },
  cardTitle: { color: "#102a54", fontSize: 24, fontWeight: "900" },
  cardSub: { color: "#7a87a5", fontSize: 14, fontWeight: "700", lineHeight: 20 },
  mediaGrid: { gap: 12 },
  mediaCard: {
    borderRadius: 22,
    backgroundColor: "#f8f9fe",
    borderWidth: 1,
    borderColor: "#e8eaf6",
    padding: 14,
    gap: 10,
  },
  mediaPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#eef3ff",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaPlaceholderWide: {
    width: "100%",
    height: 120,
    borderRadius: 18,
    backgroundColor: "#eef3ff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPreview: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#eef3ff" },
  bannerPreview: { width: "100%", height: 120, borderRadius: 18, backgroundColor: "#eef3ff" },
  mediaTitle: { color: "#102a54", fontWeight: "900", fontSize: 15 },
  mediaSub: { color: "#7a87a5", fontWeight: "700", fontSize: 13 },
  gallerySection: { gap: 8 },
  galleryRow: { gap: 10, paddingRight: 12 },
  galleryThumbWrap: { position: "relative" },
  galleryThumb: { width: 116, height: 116, borderRadius: 18, backgroundColor: "#eef3ff" },
  galleryRemoveBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(16,42,84,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  galleryRemoveText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  galleryAddCard: {
    width: 116,
    height: 116,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dfe7f8",
    backgroundColor: "#f8f9fe",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  galleryAddTitle: { color: "#102a54", fontSize: 13, fontWeight: "900" },
  galleryAddSub: { color: "#7a87a5", fontSize: 11, fontWeight: "700" },
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
  textArea: { minHeight: 120 },
  toggleCard: {
    borderRadius: 22,
    backgroundColor: "#f8f9fe",
    borderWidth: 1,
    borderColor: "#e8eaf6",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  channelLockRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eceffc",
  },
  channelLockText: { color: "#102a54", fontWeight: "900", fontSize: 14 },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
  },
  toggleLabel: { color: "#102a54", fontWeight: "800", fontSize: 15 },
  submitBtn: { borderRadius: 18, backgroundColor: "#102a54", alignItems: "center", paddingVertical: 16 },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: "#fff", fontWeight: "900", fontSize: 17 },
});
