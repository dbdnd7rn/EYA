import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import TopNav from "@/components/TopNav";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type ListingType = "hostel" | "bedsitter";
type Billing = "inclusive" | "exclusive";
type GenderPolicy = "boys" | "girls" | "both";
type OccupancyMode = "single" | "shared";
type ContactMethod = "whatsapp" | "call" | "both";

type AmenityKey =
  | "wifi"
  | "water_included"
  | "electricity_included"
  | "backup_power"
  | "borehole"
  | "water_tank"
  | "geyser"
  | "ceiling"
  | "laundry_service"
  | "bed"
  | "mattress"
  | "wardrobe"
  | "study_desk"
  | "chair"
  | "tv"
  | "fridge"
  | "cooker"
  | "private_kitchen"
  | "shared_kitchen"
  | "private_bathroom"
  | "shared_bathroom"
  | "shower"
  | "bathtub"
  | "toilet_inside"
  | "toilet_outside"
  | "security_guard"
  | "security_cameras"
  | "fenced"
  | "transport_nearby";

type PhotoItem = {
  id: string;
  localUri: string;
  remoteUrl?: string;
  status: "uploading" | "done" | "error";
  error?: string;
};

const FREE_MAX_PHOTOS = 50;

const ROOM_TYPE_OPTIONS = ["Single room", "Double room", "Self-contained", "Shared room"] as const;
const RULE_OPTIONS = ["No smoking", "No loud music", "No pets", "Visitors allowed", "Gate closes at night"] as const;

const AMENITY_GROUPS: Array<{
  title: string;
  mode: "multi" | "single";
  exclusiveKeys?: AmenityKey[];
  items: { key: AmenityKey; label: string }[];
}> = [
  { title: "Essentials", mode: "multi", items: [
    { key: "wifi", label: "Wi-Fi" }, { key: "backup_power", label: "Backup power" }, { key: "borehole", label: "Borehole" },
    { key: "water_tank", label: "Water tank" }, { key: "geyser", label: "Geyser" }, { key: "ceiling", label: "Ceiling" },
    { key: "laundry_service", label: "Laundry service" },
  ]},
  { title: "Furniture", mode: "multi", items: [
    { key: "bed", label: "Bed" }, { key: "mattress", label: "Mattress" }, { key: "wardrobe", label: "Wardrobe" },
    { key: "study_desk", label: "Study desk" }, { key: "chair", label: "Chair" }, { key: "tv", label: "TV" },
  ]},
  { title: "Kitchen", mode: "single", exclusiveKeys: ["private_kitchen", "shared_kitchen"], items: [
    { key: "private_kitchen", label: "Private kitchen" }, { key: "shared_kitchen", label: "Shared kitchen" },
  ]},
  { title: "Kitchen appliances", mode: "multi", items: [
    { key: "fridge", label: "Fridge" }, { key: "cooker", label: "Cooker / stove" },
  ]},
  { title: "Bathroom", mode: "single", exclusiveKeys: ["private_bathroom", "shared_bathroom"], items: [
    { key: "private_bathroom", label: "Private bathroom" }, { key: "shared_bathroom", label: "Shared bathroom" },
  ]},
  { title: "Bathroom features", mode: "multi", items: [
    { key: "shower", label: "Shower" }, { key: "bathtub", label: "Bathtub" },
  ]},
  { title: "Toilet", mode: "single", exclusiveKeys: ["toilet_inside", "toilet_outside"], items: [
    { key: "toilet_inside", label: "Toilet inside" }, { key: "toilet_outside", label: "Toilet outside" },
  ]},
  { title: "Security", mode: "multi", items: [
    { key: "security_guard", label: "Security guard" }, { key: "security_cameras", label: "Security cameras" }, { key: "fenced", label: "Fenced compound" },
  ]},
  { title: "Location", mode: "multi", items: [{ key: "transport_nearby", label: "Transport nearby" }] },
];

function toNum(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function splitCsv(text: string) {
  return text.split(",").map((x) => x.trim()).filter(Boolean);
}

async function uploadListingImageExpo(localUri: string) {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  const folder = process.env.EXPO_PUBLIC_CLOUDINARY_ASSET_FOLDER || "palevel/listings";
  if (!cloudName || !uploadPreset) throw new Error("Cloudinary env vars missing.");

  const form = new FormData();
  form.append("file", { uri: localUri, name: `listing-${Date.now()}.jpg`, type: "image/jpeg" } as any);
  form.append("upload_preset", uploadPreset);
  form.append("folder", folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Image upload failed.");
  return json.secure_url as string;
}

export default function CreateListingScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [listingType, setListingType] = useState<ListingType>("hostel");
  const [campus, setCampus] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [totalRooms, setTotalRooms] = useState("");
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMethod, setContactMethod] = useState<ContactMethod>("whatsapp");
  const [waterBilling, setWaterBilling] = useState<Billing>("exclusive");
  const [electricityBilling, setElectricityBilling] = useState<Billing>("exclusive");
  const [genderPolicy, setGenderPolicy] = useState<GenderPolicy>("both");
  const [occupancyMode, setOccupancyMode] = useState<OccupancyMode>("single");
  const [studentsPerRoom, setStudentsPerRoom] = useState("2");
  const [roomTypes, setRoomTypes] = useState<string[]>([]);
  const [customRoomTypes, setCustomRoomTypes] = useState("");
  const [rules, setRules] = useState<string[]>([]);
  const [customRules, setCustomRules] = useState("");
  const [amenities, setAmenities] = useState<AmenityKey[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [pickingImages, setPickingImages] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locState, setLocState] = useState<"idle" | "getting" | "ok" | "denied" | "error">("idle");
  const [locError, setLocError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const uploadedImageUrls = useMemo(
    () => photos.filter((p) => p.status === "done" && p.remoteUrl).map((p) => p.remoteUrl as string),
    [photos],
  );
  const uploadingCount = useMemo(() => photos.filter((p) => p.status === "uploading").length, [photos]);
  const remainingPhotoSlots = Math.max(0, FREE_MAX_PHOTOS - photos.length);

  const finalRoomTypes = useMemo(() => Array.from(new Set([...roomTypes, ...splitCsv(customRoomTypes)])), [roomTypes, customRoomTypes]);
  const finalRules = useMemo(() => Array.from(new Set([...rules, ...splitCsv(customRules)])), [rules, customRules]);

  const toggleArrayValue = (value: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const toggleAmenityMulti = (key: AmenityKey) => {
    setAmenities((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  const selectExclusiveAmenity = (groupKeys: AmenityKey[], selected: AmenityKey) => {
    setAmenities((prev) => {
      const without = prev.filter((x) => !groupKeys.includes(x));
      if (prev.includes(selected)) return without;
      return [...without, selected];
    });
  };

  const getCurrentLocation = async () => {
    setLocError(null);
    setLocState("getting");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocState("denied");
        setLocError("Location permission denied.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocState("ok");
    } catch {
      setLocState("error");
      setLocError("Could not get your current location.");
    }
  };

  const pickAndUploadImages = async () => {
    if (pickingImages || loading) return;
    setErrorMsg(null);
    if (remainingPhotoSlots <= 0) {
      setErrorMsg(`Photo limit reached (max ${FREE_MAX_PHOTOS}).`);
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      setErrorMsg("Media library permission denied.");
      return;
    }

    setPickingImages(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsMultipleSelection: true,
        selectionLimit: remainingPhotoSlots,
      });
      if (result.canceled || !result.assets?.length) return;

      const picked = result.assets.slice(0, remainingPhotoSlots);
      const batch: PhotoItem[] = picked.map((a, i) => ({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        localUri: a.uri,
        status: "uploading",
      }));
      setPhotos((prev) => [...prev, ...batch]);

      for (const item of batch) {
        try {
          const remoteUrl = await uploadListingImageExpo(item.localUri);
          setPhotos((prev) => prev.map((p) => (p.id === item.id ? { ...p, status: "done", remoteUrl } : p)));
        } catch (e: any) {
          setPhotos((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, status: "error", error: e?.message || "Upload failed" } : p)),
          );
          setErrorMsg(e?.message || "Image upload failed.");
        }
      }
    } finally {
      setPickingImages(false);
    }
  };

  const removePhoto = (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id));

  const retryPhotoUpload = async (id: string) => {
    const target = photos.find((p) => p.id === id);
    if (!target) return;
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, status: "uploading", error: undefined } : p)));
    try {
      const remoteUrl = await uploadListingImageExpo(target.localUri);
      setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, status: "done", remoteUrl } : p)));
    } catch (e: any) {
      setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, status: "error", error: e?.message || "Upload failed" } : p)));
      setErrorMsg(e?.message || "Retry upload failed.");
    }
  };

  const submit = async () => {
    if (!user) return;
    if (!title.trim()) return Alert.alert("Title is required");
    if (!contactPhone.trim()) return Alert.alert("Contact phone is required");
    if (!location) return Alert.alert("Location is required", "Tap 'Use my current location'.");
    if (uploadingCount > 0) return Alert.alert("Please wait", "Some photos are still uploading.");
    if (!uploadedImageUrls.length) return Alert.alert("At least one uploaded photo is required.");

    setLoading(true);
    const payload = {
      landlord_id: user.id,
      title: title.trim(),
      listing_type: listingType,
      campus: campus.trim() || null,
      area: area.trim() || null,
      city: city.trim() || null,
      price_from: toNum(priceFrom),
      total_rooms: toNum(totalRooms),
      room_types: finalRoomTypes.length ? finalRoomTypes : null,
      description: description.trim() || null,
      contact_phone: contactPhone.trim(),
      contact_method: contactMethod,
      water_billing: waterBilling,
      electricity_billing: electricityBilling,
      gender_policy: genderPolicy,
      occupancy_mode: occupancyMode,
      students_per_room: occupancyMode === "shared" ? toNum(studentsPerRoom) ?? 2 : 1,
      rules: finalRules,
      amenities,
      image_urls: uploadedImageUrls,
      latitude: location.lat,
      longitude: location.lng,
      is_active: true,
    };
    const { data, error } = await supabase.from("listings").insert(payload).select("id").single();
    setLoading(false);
    if (error) return Alert.alert(error.message);
    Alert.alert("Listing created");
    if (data?.id) router.replace({ pathname: "/(landlord)/listing/[id]", params: { id: data.id } });
    else router.replace("/(landlord)/(tabs)/listings");
  };
  
  return (
    <SafeAreaView style={styles.root}>
      <TopNav title="Create listing" />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionCard title="Access">
          {errorMsg ? <Notice tone="error" text={errorMsg} /> : null}
          <View style={{ gap: 4 }}>
            <Text style={styles.bigMeta}>Free for all landlords</Text>
            <Text style={styles.meta}>Create and edit unlimited listings.</Text>
            <Text style={styles.meta}>Add up to {FREE_MAX_PHOTOS} photos per listing.</Text>
          </View>
        </SectionCard>

        <SectionCard title="Basic information">
          <Field label="Title"><TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="e.g. Chanco Hostel Rooms" placeholderTextColor="#9aa3bd" /></Field>
          <Field label="Listing type">
            <ChipRow>
              <ChoiceChip label="Hostel" active={listingType === "hostel"} onPress={() => setListingType("hostel")} />
              <ChoiceChip label="Bedsitter" active={listingType === "bedsitter"} onPress={() => setListingType("bedsitter")} />
            </ChipRow>
          </Field>
          <Field label="Campus"><TextInput value={campus} onChangeText={setCampus} style={styles.input} placeholder="Campus" placeholderTextColor="#9aa3bd" /></Field>
          <Field label="Area"><TextInput value={area} onChangeText={setArea} style={styles.input} placeholder="Area" placeholderTextColor="#9aa3bd" /></Field>
          <Field label="City / District"><TextInput value={city} onChangeText={setCity} style={styles.input} placeholder="City or district" placeholderTextColor="#9aa3bd" /></Field>
          <Field label="Price from (MWK)"><TextInput value={priceFrom} onChangeText={setPriceFrom} style={styles.input} keyboardType="numeric" placeholder="0" placeholderTextColor="#9aa3bd" /></Field>
          <Field label="Total rooms"><TextInput value={totalRooms} onChangeText={setTotalRooms} style={styles.input} keyboardType="numeric" placeholder="e.g. 12" placeholderTextColor="#9aa3bd" /></Field>
        </SectionCard>

        <SectionCard title="Photos">
          <Text style={styles.meta}>Upload up to {FREE_MAX_PHOTOS} photo(s) for this listing.</Text>
          <Pressable style={[styles.softBtn, pickingImages && { opacity: 0.6 }]} onPress={pickAndUploadImages} disabled={pickingImages}>
            <Text style={styles.softBtnText}>{pickingImages ? "Picking..." : remainingPhotoSlots > 0 ? "Add photos" : "Photo limit reached"}</Text>
          </Pressable>
          <View style={styles.wrap}>
            {photos.map((photo) => (
              <View key={photo.id} style={styles.photoCard}>
                <Image source={{ uri: photo.remoteUrl || photo.localUri }} style={styles.photo} />
                <View style={styles.photoOverlay}>
                  {photo.status === "uploading" ? <ActivityIndicator color="#fff" size="small" /> : null}
                  {photo.status === "done" ? <Text style={styles.photoBadgeDone}>Uploaded</Text> : null}
                  {photo.status === "error" ? <Text style={styles.photoBadgeErr}>Failed</Text> : null}
                </View>
                <View style={styles.photoActions}>
                  {photo.status === "error" ? (
                    <Pressable onPress={() => retryPhotoUpload(photo.id)} style={styles.photoActionBtn}><Text style={styles.photoActionText}>Retry</Text></Pressable>
                  ) : null}
                  <Pressable onPress={() => removePhoto(photo.id)} style={styles.photoActionBtn}><Text style={styles.photoActionText}>Remove</Text></Pressable>
                </View>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard title="Location">
          <Text style={styles.meta}>Be at the property, then tap the button to save current coordinates.</Text>
          <Pressable style={[styles.softBtn, locState === "getting" && { opacity: 0.7 }]} onPress={getCurrentLocation} disabled={locState === "getting"}>
            <Text style={styles.softBtnText}>{locState === "getting" ? "Getting location..." : "Use my current location"}</Text>
          </Pressable>
          {locError ? <Notice tone="error" text={locError} /> : null}
          <View style={styles.coordWrap}>
            <View style={styles.coordPill}><Text style={styles.coordKey}>Latitude</Text><Text style={styles.coordVal}>{location?.lat?.toFixed(6) ?? "-"}</Text></View>
            <View style={styles.coordPill}><Text style={styles.coordKey}>Longitude</Text><Text style={styles.coordVal}>{location?.lng?.toFixed(6) ?? "-"}</Text></View>
          </View>
        </SectionCard>

        <SectionCard title="Room setup">
          <Field label="Occupancy">
            <ChipRow>
              <ChoiceChip label="Single" active={occupancyMode === "single"} onPress={() => setOccupancyMode("single")} />
              <ChoiceChip label="Shared" active={occupancyMode === "shared"} onPress={() => setOccupancyMode("shared")} />
            </ChipRow>
          </Field>
          {occupancyMode === "shared" ? <Field label="Students per room"><TextInput value={studentsPerRoom} onChangeText={setStudentsPerRoom} style={styles.input} keyboardType="numeric" placeholder="2" placeholderTextColor="#9aa3bd" /></Field> : null}
          <Field label="Room types (tick what applies)">
            <ChipWrap>{ROOM_TYPE_OPTIONS.map((opt) => <TickChip key={opt} label={opt} active={roomTypes.includes(opt)} onPress={() => toggleArrayValue(opt, roomTypes, setRoomTypes)} />)}</ChipWrap>
          </Field>
          <Field label="Extra room types (optional, comma separated)"><TextInput value={customRoomTypes} onChangeText={setCustomRoomTypes} style={styles.input} placeholder="e.g. Executive room" placeholderTextColor="#9aa3bd" /></Field>
        </SectionCard>

        <SectionCard title="Utilities and billing">
          <Field label="Water billing"><ChipRow><ChoiceChip label="Included" active={waterBilling === "inclusive"} onPress={() => setWaterBilling("inclusive")} /><ChoiceChip label="Exclusive" active={waterBilling === "exclusive"} onPress={() => setWaterBilling("exclusive")} /></ChipRow></Field>
          <Field label="Electricity billing"><ChipRow><ChoiceChip label="Included" active={electricityBilling === "inclusive"} onPress={() => setElectricityBilling("inclusive")} /><ChoiceChip label="Exclusive" active={electricityBilling === "exclusive"} onPress={() => setElectricityBilling("exclusive")} /></ChipRow></Field>
        </SectionCard>

        <SectionCard title="Tenant preferences">
          <Field label="Gender policy"><ChipWrap><ChoiceChip label="Boys" active={genderPolicy === "boys"} onPress={() => setGenderPolicy("boys")} /><ChoiceChip label="Girls" active={genderPolicy === "girls"} onPress={() => setGenderPolicy("girls")} /><ChoiceChip label="Both" active={genderPolicy === "both"} onPress={() => setGenderPolicy("both")} /></ChipWrap></Field>
        </SectionCard>

        {AMENITY_GROUPS.map((group) => (
          <SectionCard key={group.title} title={group.title}>
            <ChipWrap>
              {group.items.map((item) => {
                const active = amenities.includes(item.key);
                const onPress = group.mode === "single" ? () => selectExclusiveAmenity(group.exclusiveKeys ?? [], item.key) : () => toggleAmenityMulti(item.key);
                return <TickChip key={item.key} label={item.label} active={active} onPress={onPress} />;
              })}
            </ChipWrap>
          </SectionCard>
        ))}

        <SectionCard title="House rules">
          <Field label="Tick rules that apply"><ChipWrap>{RULE_OPTIONS.map((rule) => <TickChip key={rule} label={rule} active={rules.includes(rule)} onPress={() => toggleArrayValue(rule, rules, setRules)} />)}</ChipWrap></Field>
          <Field label="Extra rules (optional, comma separated)"><TextInput value={customRules} onChangeText={setCustomRules} style={styles.input} placeholder="e.g. No cooking after 10pm" placeholderTextColor="#9aa3bd" /></Field>
        </SectionCard>

        <SectionCard title="Contact">
          <Field label="Phone number"><TextInput value={contactPhone} onChangeText={setContactPhone} style={styles.input} placeholder="+265..." placeholderTextColor="#9aa3bd" keyboardType="phone-pad" /></Field>
          <Field label="Preferred contact method"><ChipWrap><ChoiceChip label="WhatsApp" active={contactMethod === "whatsapp"} onPress={() => setContactMethod("whatsapp")} /><ChoiceChip label="Call" active={contactMethod === "call"} onPress={() => setContactMethod("call")} /><ChoiceChip label="Both" active={contactMethod === "both"} onPress={() => setContactMethod("both")} /></ChipWrap></Field>
        </SectionCard>

        <SectionCard title="Description">
          <TextInput value={description} onChangeText={setDescription} style={[styles.input, styles.textArea]} multiline placeholder="Describe the place..." placeholderTextColor="#9aa3bd" />
        </SectionCard>

        <Pressable style={[styles.submit, loading && { opacity: 0.7 }]} onPress={submit} disabled={loading}>
          <Text style={styles.submitText}>{loading ? "Creating..." : "Create listing"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.card}><Text style={styles.sectionTitle}>{title}</Text><View style={{ gap: 10 }}>{children}</View></View>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ gap: 6 }}><Text style={styles.label}>{label}</Text>{children}</View>;
}

function Notice({ tone, text }: { tone: "error" | "ok" | "note"; text: string }) {
  const map = { error: [styles.errBox, styles.errText], ok: [styles.okBox, styles.okText], note: [styles.noteBox, styles.noteText] } as const;
  return <View style={map[tone][0]}><Text style={map[tone][1]}>{text}</Text></View>;
}

function ChipRow({ children }: { children: React.ReactNode }) { return <View style={styles.row}>{children}</View>; }
function ChipWrap({ children }: { children: React.ReactNode }) { return <View style={styles.wrap}>{children}</View>; }

function ChoiceChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.choiceChip, active && styles.choiceChipOn]}><Text style={[styles.choiceChipText, active && styles.choiceChipTextOn]}>{label}</Text></Pressable>;
}

function TickChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tickChip, active && styles.tickChipOn]}>
      <View style={[styles.tickBox, active && styles.tickBoxOn]}><Text style={[styles.tickMark, active && styles.tickMarkOn]}>{active ? "✓" : ""}</Text></View>
      <Text style={[styles.tickChipText, active && styles.tickChipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 14, gap: 10 },
  sectionTitle: { color: "#0e2756", fontWeight: "900", fontSize: 16 },
  label: { color: "#0e2756", fontWeight: "800", marginTop: 2 },
  bigMeta: { color: "#0e2756", fontWeight: "900", fontSize: 18 },
  meta: { color: "#5f6b85", fontWeight: "700" },
  warnText: { color: "#b0003a", fontWeight: "800" },
  input: { borderWidth: 1, borderColor: "#e1e4ef", borderRadius: 14, backgroundColor: "#f6f7fb", paddingHorizontal: 12, paddingVertical: 12, color: "#0e2756", fontWeight: "700" },
  textArea: { minHeight: 120, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 10 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceChip: { flex: 1, minWidth: 90, borderWidth: 1, borderColor: "#e1e4ef", backgroundColor: "#f6f7fb", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  choiceChipOn: { borderColor: "#ff0f64", backgroundColor: "#fff0f6" },
  choiceChipText: { color: "#0e2756", fontWeight: "800" },
  choiceChipTextOn: { color: "#ff0f64" },
  tickChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#e1e4ef", backgroundColor: "#f6f7fb", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10 },
  tickChipOn: { borderColor: "#ff0f64", backgroundColor: "#fff0f6" },
  tickBox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: "#c6ccdd", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  tickBoxOn: { borderColor: "#ff0f64", backgroundColor: "#ff0f64" },
  tickMark: { color: "transparent", fontWeight: "900", fontSize: 12, lineHeight: 14 },
  tickMarkOn: { color: "#fff" },
  tickChipText: { color: "#0e2756", fontWeight: "700" },
  tickChipTextOn: { color: "#b30048", fontWeight: "800" },
  softBtn: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#e1e4ef" },
  softBtnText: { color: "#0e2756", fontWeight: "900" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  errBox: { borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", borderRadius: 14, padding: 10 },
  errText: { color: "#b0003a", fontWeight: "800" },
  okBox: { borderWidth: 1, borderColor: "#d7f3e3", backgroundColor: "#f1fff7", borderRadius: 14, padding: 10 },
  okText: { color: "#0a6b3d", fontWeight: "800" },
  noteBox: { borderWidth: 1, borderColor: "#e1e4ef", backgroundColor: "#f9fafc", borderRadius: 14, padding: 10 },
  noteText: { color: "#5f6b85", fontWeight: "700" },
  photoCard: { width: 112, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#e1e4ef", backgroundColor: "#fff" },
  photo: { width: "100%", height: 92, backgroundColor: "#eef1fb" },
  photoOverlay: { position: "absolute", top: 6, left: 6, right: 6, flexDirection: "row", alignItems: "center" },
  photoBadgeDone: { backgroundColor: "rgba(10,107,61,0.88)", color: "#fff", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, fontSize: 10, fontWeight: "800" },
  photoBadgeErr: { backgroundColor: "rgba(176,0,58,0.9)", color: "#fff", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, fontSize: 10, fontWeight: "800" },
  photoActions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#eef1fb" },
  photoActionBtn: { flex: 1, paddingVertical: 8, alignItems: "center" },
  photoActionText: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  coordWrap: { gap: 8 },
  coordPill: { borderWidth: 1, borderColor: "#e1e4ef", backgroundColor: "#f6f7fb", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between" },
  coordKey: { color: "#5f6b85", fontWeight: "800" },
  coordVal: { color: "#0e2756", fontWeight: "900" },
  submit: { marginTop: 4, backgroundColor: "#ff0f64", borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  submitText: { color: "#fff", fontWeight: "900" },
});
