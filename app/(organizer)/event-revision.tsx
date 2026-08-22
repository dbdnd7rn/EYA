import React from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ArrowLeft, CheckCircle2, ImagePlus, Plus, RefreshCw, Send, Ticket, Trash2 } from "lucide-react-native";
import {
  getMyTicketEventRevision,
  removeMyTicketEventRevisionTier,
  submitMyTicketEventRevision,
  updateMyTicketEventRevision,
  upsertMyTicketEventRevisionTier,
  type OrganizerTicketRevisionDetail,
} from "@/lib/organizerTicketingApi";

const BG = "#f5f7fc";
const CARD = "#fff";
const TEXT = "#102a54";
const MUTED = "#6e7892";
const ACCENT = "#5e73dd";
const BORDER = "#e4e8f2";

type LocalTier = {
  id: string;
  persisted: boolean;
  name: string;
  description: string;
  price: string;
  capacity: string;
  available: boolean;
  saleStarts: string;
  saleEnds: string;
  sortOrder: number;
};

type UploadKind = "card" | "hero";
type UploadAsset = { uri: string; fileName?: string | null; mimeType?: string | null };

function parseMalawiLocalDateTime(value: string) {
  if (!value.trim()) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute] = match;
  const time = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:00+02:00`);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function malawiInputFromIso(value?: string | null) {
  if (!value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  return new Date(time + 2 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

function numberValue(value: string) {
  const n = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function imageMeta(asset: UploadAsset, kind: UploadKind) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const safeExt = ext === "heic" || ext === "heif" ? "jpg" : ext;
  return {
    name: `organizer-ticket-revision-${kind}-${Date.now()}.${safeExt}`,
    type: asset.mimeType || (safeExt === "png" ? "image/png" : safeExt === "webp" ? "image/webp" : "image/jpeg"),
  };
}

async function uploadEventImage(asset: UploadAsset, kind: UploadKind) {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) throw new Error("Ticket image upload is not configured.");
  const meta = imageMeta(asset, kind);
  const form = new FormData();
  form.append("file", { uri: asset.uri, name: meta.name, type: meta.type } as any);
  form.append("upload_preset", uploadPreset);
  form.append("folder", "eya/tickets/organizers/revisions");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Could not upload event image.");
  return String(json.secure_url ?? "");
}

export default function OrganizerEventRevisionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ revisionId?: string }>();
  const revisionId = typeof params.revisionId === "string" ? params.revisionId : "";
  const [revision, setRevision] = React.useState<OrganizerTicketRevisionDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploading, setUploading] = React.useState<UploadKind | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("Music");
  const [description, setDescription] = React.useState("");
  const [dateLabel, setDateLabel] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [endsAt, setEndsAt] = React.useState("");
  const [venue, setVenue] = React.useState("");
  const [city, setCity] = React.useState("");
  const [cardImage, setCardImage] = React.useState("");
  const [heroImage, setHeroImage] = React.useState("");
  const [tiers, setTiers] = React.useState<LocalTier[]>([]);

  const hydrate = React.useCallback((data: OrganizerTicketRevisionDetail) => {
    setRevision(data);
    setTitle(data.title);
    setCategory(data.category || "Music");
    setDescription(data.description || "");
    setDateLabel(data.date_label || "");
    setStartsAt(malawiInputFromIso(data.starts_at));
    setEndsAt(malawiInputFromIso(data.ends_at));
    setVenue(data.venue || "");
    setCity(data.city || "");
    setCardImage(data.image_url || "");
    setHeroImage(data.hero_image_url || "");
    setTiers(data.tiers.map((tier) => ({
      id: tier.id,
      persisted: true,
      name: tier.name,
      description: tier.description || "",
      price: String(tier.price_mwk),
      capacity: String(tier.capacity_total),
      available: tier.available,
      saleStarts: malawiInputFromIso(tier.sale_starts_at),
      saleEnds: malawiInputFromIso(tier.sale_ends_at),
      sortOrder: tier.sort_order,
    })));
    setDirty(false);
  }, []);

  const load = React.useCallback(async () => {
    if (!revisionId) return;
    try {
      setLoading(true);
      hydrate(await getMyTicketEventRevision(revisionId));
    } catch (e: any) {
      Alert.alert("Could not load revision", e?.message || "Try again.", [{ text: "Back", onPress: () => router.back() }]);
    } finally {
      setLoading(false);
    }
  }, [hydrate, revisionId, router]);

  React.useEffect(() => { void load(); }, [load]);

  const editable = revision?.status === "draft" || revision?.status === "changes_requested";
  const change = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => { setter(value); setDirty(true); };

  const patchTier = (id: string, patch: Partial<LocalTier>) => {
    setTiers((current) => current.map((tier) => tier.id === id ? { ...tier, ...patch } : tier));
    setDirty(true);
  };

  const addTier = () => {
    setTiers((current) => [...current, { id: `new-${Date.now()}`, persisted: false, name: "New Ticket", description: "", price: "", capacity: "", available: true, saleStarts: "", saleEnds: "", sortOrder: (current.length + 1) * 100 }]);
    setDirty(true);
  };

  const removeTier = async (tier: LocalTier) => {
    if (!editable) return;
    if (!tier.persisted) {
      setTiers((current) => current.filter((row) => row.id !== tier.id));
      setDirty(true);
      return;
    }
    Alert.alert("Remove ticket from proposed version?", "Existing live tickets are not deleted. For an already-live tier EYA will propose disabling future sales, subject to Admin approval.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        try {
          await removeMyTicketEventRevisionTier(tier.id);
          await load();
        } catch (e: any) {
          Alert.alert("Could not update revision", e?.message || "Try again.");
        }
      } },
    ]);
  };

  const pickImage = async (kind: UploadKind) => {
    if (!editable) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return Alert.alert("Permission required", "Allow photo access to change the event image.");
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.88 });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(kind);
      const url = await uploadEventImage(result.assets[0], kind);
      if (kind === "card") change(setCardImage, url); else change(setHeroImage, url);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message || "Could not upload image.");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!revision || !editable) return;
    const startIso = parseMalawiLocalDateTime(startsAt);
    const endIso = parseMalawiLocalDateTime(endsAt);
    if (!title.trim() || !dateLabel.trim() || !venue.trim() || !city.trim()) return Alert.alert("Missing details", "Event name, display date, venue and city are required.");
    if (!startIso) return Alert.alert("Start time required", "Use YYYY-MM-DD HH:mm.");
    if (endsAt.trim() && endIso === undefined) return Alert.alert("Check end time", "Use YYYY-MM-DD HH:mm.");
    if (!cardImage || !heroImage) return Alert.alert("Images required", "Card and hero images are required.");
    if (!tiers.length) return Alert.alert("Ticket required", "Keep at least one ticket type in the proposed version.");

    for (const tier of tiers) {
      const price = numberValue(tier.price);
      const capacity = Math.floor(numberValue(tier.capacity));
      const saleStart = parseMalawiLocalDateTime(tier.saleStarts);
      const saleEnd = parseMalawiLocalDateTime(tier.saleEnds);
      if (!tier.name.trim() || price < 0 || capacity < 1) return Alert.alert("Check ticket terms", `Add a valid name, price and capacity for ${tier.name || "the ticket"}.`);
      if (tier.saleStarts.trim() && saleStart === undefined) return Alert.alert("Check sale start", `Use YYYY-MM-DD HH:mm for ${tier.name}.`);
      if (tier.saleEnds.trim() && saleEnd === undefined) return Alert.alert("Check sale end", `Use YYYY-MM-DD HH:mm for ${tier.name}.`);
    }

    try {
      setSaving(true);
      await updateMyTicketEventRevision(revision.id, { title, category, description, dateLabel, startsAt: startIso, endsAt: endIso || null, venue, city, imageUrl: cardImage, heroImageUrl: heroImage });
      for (const tier of tiers) {
        await upsertMyTicketEventRevisionTier({
          revisionId: revision.id,
          revisionTierId: tier.persisted ? tier.id : null,
          name: tier.name,
          description: tier.description,
          priceMwk: numberValue(tier.price),
          capacityTotal: Math.floor(numberValue(tier.capacity)),
          available: tier.available,
          saleStartsAt: parseMalawiLocalDateTime(tier.saleStarts) || null,
          saleEndsAt: parseMalawiLocalDateTime(tier.saleEnds) || null,
          sortOrder: tier.sortOrder,
        });
      }
      await load();
      Alert.alert("Revision saved", "The customer-facing live version has not changed. Submit this revision when it is ready for EYA Admin review.");
    } catch (e: any) {
      Alert.alert("Could not save revision", e?.message || "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!revision || !editable || dirty) return;
    Alert.alert("Submit proposed changes?", `Customers will keep seeing V${revision.base_version_number}. EYA Admin must approve this revision before anything changes publicly.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Submit to EYA", onPress: async () => {
        try {
          setSubmitting(true);
          await submitMyTicketEventRevision(revision.id);
          await load();
        } catch (e: any) {
          Alert.alert("Could not submit revision", e?.message || "Try again.");
        } finally {
          setSubmitting(false);
        }
      } },
    ]);
  };

  if (loading || !revision) return <SafeAreaView style={styles.root}><View style={styles.loading}><ActivityIndicator color={ACCENT} /><Text style={styles.loadingText}>Loading proposed version...</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><Pressable style={styles.iconBtn} onPress={() => router.back()}><ArrowLeft size={21} color={TEXT} /></Pressable><View style={{ flex: 1 }}><Text style={styles.kicker}>Live event revision</Text><Text style={styles.title}>Proposed V{revision.base_version_number + 1}</Text></View></View>

        <View style={styles.liveNotice}><RefreshCw size={19} color="#087443" /><View style={{ flex: 1 }}><Text style={styles.liveTitle}>V{revision.base_version_number} stays live</Text><Text style={styles.liveText}>Saving or submitting this page does not change what customers see or pay. Only EYA Admin approval can activate V{revision.base_version_number + 1}.</Text></View></View>
        {revision.review_note ? <View style={styles.reviewNote}><Text style={styles.reviewLabel}>EYA REVIEW NOTE</Text><Text style={styles.reviewText}>{revision.review_note}</Text></View> : null}
        {!editable ? <View style={styles.locked}><Text style={styles.lockedTitle}>{revision.status === "pending_review" ? "Revision under Admin review" : `Revision ${revision.status}`}</Text><Text style={styles.lockedText}>The live approved event continues operating independently.</Text></View> : null}

        <Section title="Event details">
          <Field label="Event name" value={title} editable={editable} onChangeText={(v) => change(setTitle, v)} />
          <Field label="Category" value={category} editable={editable} onChangeText={(v) => change(setCategory, v)} />
          <Field label="Description" value={description} editable={editable} multiline onChangeText={(v) => change(setDescription, v)} />
          <Field label="Display date" value={dateLabel} editable={editable} onChangeText={(v) => change(setDateLabel, v)} />
          <Field label="Start" value={startsAt} editable={editable} placeholder="YYYY-MM-DD HH:mm" onChangeText={(v) => change(setStartsAt, v)} />
          <Field label="End" value={endsAt} editable={editable} placeholder="YYYY-MM-DD HH:mm" onChangeText={(v) => change(setEndsAt, v)} />
          <Field label="Venue" value={venue} editable={editable} onChangeText={(v) => change(setVenue, v)} />
          <Field label="City" value={city} editable={editable} onChangeText={(v) => change(setCity, v)} />
        </Section>

        <Section title="Event images">
          <ImageCard label="Card image" uri={cardImage} busy={uploading === "card"} editable={editable} onPress={() => void pickImage("card")} />
          <ImageCard label="Hero image" uri={heroImage} busy={uploading === "hero"} editable={editable} onPress={() => void pickImage("hero")} />
        </Section>

        <View style={styles.sectionHeadRow}><Text style={styles.sectionHeading}>Ticket terms</Text>{editable ? <Pressable style={styles.addTier} onPress={addTier}><Plus size={15} color={ACCENT} /><Text style={styles.addTierText}>Add ticket</Text></Pressable> : null}</View>
        {tiers.map((tier, index) => (
          <View key={tier.id} style={styles.ticketCard}>
            <View style={styles.ticketHead}><View style={{ flex: 1 }}><Text style={styles.ticketTitle}>Ticket {index + 1}</Text><Text style={styles.ticketSub}>{tier.persisted ? "Copied from live approved version" : "New proposed ticket"}</Text></View>{editable ? <Pressable onPress={() => void removeTier(tier)} hitSlop={10}><Trash2 size={18} color="#a32929" /></Pressable> : null}</View>
            <Field label="Ticket name" value={tier.name} editable={editable} onChangeText={(v) => patchTier(tier.id, { name: v })} />
            <Field label="Description" value={tier.description} editable={editable} onChangeText={(v) => patchTier(tier.id, { description: v })} />
            <Field label="Price MWK" value={tier.price} editable={editable} keyboardType="numeric" onChangeText={(v) => patchTier(tier.id, { price: v })} />
            <Field label="Capacity" value={tier.capacity} editable={editable} keyboardType="numeric" onChangeText={(v) => patchTier(tier.id, { capacity: v })} />
            <Field label="Sale starts" value={tier.saleStarts} editable={editable} placeholder="YYYY-MM-DD HH:mm" onChangeText={(v) => patchTier(tier.id, { saleStarts: v })} />
            <Field label="Sale ends" value={tier.saleEnds} editable={editable} placeholder="YYYY-MM-DD HH:mm" onChangeText={(v) => patchTier(tier.id, { saleEnds: v })} />
            <View style={styles.switchRow}><Text style={styles.switchLabel}>Available for sale in proposed version</Text><Switch value={tier.available} disabled={!editable} onValueChange={(v) => patchTier(tier.id, { available: v })} /></View>
          </View>
        ))}

        {editable ? <>
          <Pressable style={[styles.saveBtn, (saving || uploading) && styles.disabled]} disabled={saving || !!uploading} onPress={() => void save()}>{saving ? <ActivityIndicator color="#fff" /> : <CheckCircle2 size={18} color="#fff" />}<Text style={styles.btnText}>{dirty ? "Save proposed version" : "Saved"}</Text></Pressable>
          <Pressable style={[styles.submitBtn, (dirty || submitting) && styles.disabled]} disabled={dirty || submitting} onPress={() => void submit()}>{submitting ? <ActivityIndicator color="#fff" /> : <Send size={18} color="#fff" />}<Text style={styles.btnText}>Submit V{revision.base_version_number + 1} to EYA Admin</Text></Pressable>
          {dirty ? <Text style={styles.hint}>Save your latest changes before submitting.</Text> : null}
        </> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionHeading}>{title}</Text>{children}</View>; }
function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) { const { label, multiline, ...input } = props; return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...input} multiline={multiline} placeholderTextColor="#9aa3b8" style={[styles.input, multiline && styles.multiline, input.editable === false && styles.readonly]} /></View>; }
function ImageCard({ label, uri, busy, editable, onPress }: { label: string; uri: string; busy: boolean; editable: boolean; onPress: () => void }) { return <Pressable style={styles.imageCard} onPress={onPress} disabled={!editable || busy}>{uri ? <Image source={{ uri }} style={styles.image} /> : <View style={styles.imageEmpty}><ImagePlus size={23} color={ACCENT} /></View>}<View style={{ flex: 1 }}><Text style={styles.imageTitle}>{label}</Text><Text style={styles.imageSub}>{busy ? "Uploading..." : editable ? "Tap to replace in proposed version" : "Approved proposed image"}</Text></View>{busy ? <ActivityIndicator color={ACCENT} /> : null}</Pressable>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, content: { padding: 18, paddingBottom: 90, gap: 14 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }, loadingText: { color: MUTED, fontWeight: "800" },
  header: { flexDirection: "row", alignItems: "center", gap: 12 }, iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" }, kicker: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1 }, title: { color: TEXT, fontSize: 25, fontWeight: "900" },
  liveNotice: { backgroundColor: "#e8f7ee", borderRadius: 20, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 }, liveTitle: { color: "#087443", fontSize: 13, fontWeight: "900" }, liveText: { color: "#39745a", fontSize: 11, lineHeight: 17, fontWeight: "700", marginTop: 3 }, reviewNote: { backgroundColor: "#fff4df", borderRadius: 18, padding: 13, gap: 4 }, reviewLabel: { color: "#a35b00", fontSize: 9, fontWeight: "900" }, reviewText: { color: "#754500", fontSize: 12, lineHeight: 18, fontWeight: "800" }, locked: { backgroundColor: "#eef1ff", borderRadius: 18, padding: 14 }, lockedTitle: { color: ACCENT, fontWeight: "900" }, lockedText: { color: MUTED, fontSize: 11, lineHeight: 17, fontWeight: "700", marginTop: 3 },
  section: { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: BORDER, padding: 15, gap: 12 }, sectionHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, sectionHeading: { color: TEXT, fontSize: 17, fontWeight: "900" }, addTier: { backgroundColor: "#eef1ff", borderRadius: 18, minHeight: 36, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 5 }, addTierText: { color: ACCENT, fontSize: 10, fontWeight: "900" },
  field: { gap: 5 }, label: { color: MUTED, fontSize: 9, fontWeight: "900", letterSpacing: 0.7, textTransform: "uppercase" }, input: { minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", paddingHorizontal: 13, color: TEXT, fontSize: 13, fontWeight: "700" }, multiline: { minHeight: 88, paddingTop: 12, textAlignVertical: "top" }, readonly: { backgroundColor: "#f4f5f8", color: "#59647d" },
  imageCard: { minHeight: 82, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", padding: 9, flexDirection: "row", alignItems: "center", gap: 11 }, image: { width: 72, height: 62, borderRadius: 11, backgroundColor: "#e8ebf3" }, imageEmpty: { width: 72, height: 62, borderRadius: 11, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" }, imageTitle: { color: TEXT, fontSize: 13, fontWeight: "900" }, imageSub: { color: MUTED, fontSize: 10, lineHeight: 15, fontWeight: "700", marginTop: 2 },
  ticketCard: { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: BORDER, padding: 15, gap: 11 }, ticketHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 }, ticketTitle: { color: TEXT, fontSize: 15, fontWeight: "900" }, ticketSub: { color: MUTED, fontSize: 10, fontWeight: "700", marginTop: 2 }, switchRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, switchLabel: { flex: 1, color: TEXT, fontSize: 11, fontWeight: "800" },
  saveBtn: { minHeight: 54, borderRadius: 27, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, submitBtn: { minHeight: 56, borderRadius: 28, backgroundColor: "#102a54", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, btnText: { color: "#fff", fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.5 }, hint: { color: MUTED, textAlign: "center", fontSize: 10, fontWeight: "700" },
});
