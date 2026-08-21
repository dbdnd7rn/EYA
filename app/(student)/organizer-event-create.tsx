import React from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { ArrowLeft, CalendarDays, CheckCircle2, ImagePlus, MapPin, Send, ShieldAlert, Ticket } from "lucide-react-native";
import {
  createMyTicketEventDraft,
  getMyOrganizerEventDetail,
  submitMyTicketEvent,
  updateMyTicketEventDraft,
  upsertMyTicketTier,
} from "@/lib/organizerTicketingApi";
import { getMyTicketOrganizerAccess } from "@/lib/ticketOrganizerAccess";

const BG = "#f5f7fc";
const CARD = "#ffffff";
const TEXT = "#102a54";
const MUTED = "#6e7892";
const ACCENT = "#5e73dd";
const BORDER = "#e4e8f2";

type UploadKind = "card" | "hero";
type UploadAsset = { uri: string; fileName?: string | null; mimeType?: string | null };

function parseMalawiLocalDateTime(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:00+02:00`;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function malawiInputFromIso(value?: string | null) {
  if (!value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const malawi = new Date(time + 2 * 60 * 60 * 1000);
  return malawi.toISOString().slice(0, 16).replace("T", " ");
}

function imageMeta(asset: UploadAsset, kind: UploadKind) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const safeExt = ext === "heic" || ext === "heif" ? "jpg" : ext;
  return {
    name: `organizer-ticket-${kind}-${Date.now()}.${safeExt}`,
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
  form.append("folder", "eya/tickets/organizers");
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Could not upload event image.");
  return String(json.secure_url ?? "");
}

function numberValue(value: string) {
  const n = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function OrganizerEventCreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string }>();
  const routeEventId = typeof params.eventId === "string" ? params.eventId : "";
  const isRevision = Boolean(routeEventId);

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
  const [tierName, setTierName] = React.useState("General");
  const [tierDescription, setTierDescription] = React.useState("");
  const [tierPrice, setTierPrice] = React.useState("");
  const [tierCapacity, setTierCapacity] = React.useState("");
  const [tierId, setTierId] = React.useState<string | null>(null);
  const [reviewNote, setReviewNote] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState<UploadKind | null>(null);
  const [loadingExisting, setLoadingExisting] = React.useState(true);
  const [accessChecked, setAccessChecked] = React.useState(false);
  const [hasAccess, setHasAccess] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [eventId, setEventId] = React.useState<string | null>(routeEventId || null);
  const [readyToSubmit, setReadyToSubmit] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoadingExisting(true);
        const access = await getMyTicketOrganizerAccess();
        if (!active) return;
        setHasAccess(Boolean(access));
        setAccessChecked(true);
        if (!access || !routeEventId) return;

        const event = await getMyOrganizerEventDetail(routeEventId);
        if (!active) return;
        if (event.status !== "draft" && event.status !== "changes_requested") {
          Alert.alert("Event locked", "This event cannot be edited in its current status.", [{ text: "Back", onPress: () => router.back() }]);
          return;
        }
        setTitle(event.title);
        setCategory(event.category || "Music");
        setDescription(event.description || "");
        setDateLabel(event.date_label || "");
        setStartsAt(malawiInputFromIso(event.starts_at));
        setEndsAt(malawiInputFromIso(event.ends_at));
        setVenue(event.venue || "");
        setCity(event.city || "");
        setCardImage(event.image_url || "");
        setHeroImage(event.hero_image_url || event.image_url || "");
        setReviewNote(event.review_note || null);
        const firstTier = event.tiers?.[0];
        if (firstTier) {
          setTierId(firstTier.id);
          setTierName(firstTier.name || "General");
          setTierDescription(firstTier.description || "");
          setTierPrice(String(firstTier.price_mwk ?? ""));
          setTierCapacity(String(firstTier.capacity_total ?? ""));
        }
      } catch (e: any) {
        if (!active) return;
        setAccessChecked(true);
        setHasAccess(false);
        Alert.alert("Organizer access unavailable", e?.message || "Try again.");
      } finally {
        if (active) setLoadingExisting(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [routeEventId, router]);

  const pickImage = async (kind: UploadKind) => {
    if (!hasAccess) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Allow photo access to upload the event image.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.88,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploading(kind);
      const url = await uploadEventImage(result.assets[0], kind);
      kind === "card" ? setCardImage(url) : setHeroImage(url);
      setReadyToSubmit(false);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message || "Could not upload image.");
    } finally {
      setUploading(null);
    }
  };

  const saveDraft = async () => {
    if (!hasAccess) return;
    const startIso = parseMalawiLocalDateTime(startsAt);
    const endIso = endsAt.trim() ? parseMalawiLocalDateTime(endsAt) : null;
    const price = numberValue(tierPrice);
    const capacity = Math.floor(numberValue(tierCapacity));

    if (!title.trim() || !dateLabel.trim() || !venue.trim() || !city.trim()) {
      Alert.alert("Missing event details", "Add event name, display date, venue, and city.");
      return;
    }
    if (!startIso) {
      Alert.alert("Start time required", "Use YYYY-MM-DD HH:mm, for example 2026-09-06 18:00.");
      return;
    }
    if (endsAt.trim() && !endIso) {
      Alert.alert("Check end time", "Use YYYY-MM-DD HH:mm for the end time too.");
      return;
    }
    if (!cardImage || !heroImage) {
      Alert.alert("Images required", "Upload both the event card image and hero image.");
      return;
    }
    if (!tierName.trim() || capacity < 1 || price < 0) {
      Alert.alert("Ticket type required", "Add the first ticket name, price, and capacity.");
      return;
    }

    try {
      setSaving(true);
      const input = {
        title,
        category,
        description,
        dateLabel,
        startsAt: startIso,
        endsAt: endIso,
        venue,
        city,
        imageUrl: cardImage,
        heroImageUrl: heroImage,
      };
      const event = eventId
        ? await updateMyTicketEventDraft(eventId, input)
        : await createMyTicketEventDraft(input);
      const tier = await upsertMyTicketTier({
        eventId: event.event_id,
        tierId,
        name: tierName,
        description: tierDescription,
        priceMwk: price,
        capacityTotal: capacity,
      });
      setEventId(event.event_id);
      setTierId(tier.tier_id);
      setReviewNote(null);
      setReadyToSubmit(true);
      Alert.alert(isRevision ? "Revisions saved" : "Draft saved", "The event is still private. Submit it when you are ready for EYA Admin review.");
    } catch (e: any) {
      Alert.alert("Could not save draft", e?.message || "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!hasAccess || !eventId || !readyToSubmit) return;
    try {
      setSubmitting(true);
      await submitMyTicketEvent(eventId);
      setSubmitted(true);
    } catch (e: any) {
      Alert.alert("Could not submit", e?.message || "Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingExisting) {
    return <SafeAreaView style={styles.root}><View style={styles.loadingWrap}><ActivityIndicator color={ACCENT} /><Text style={styles.loadingText}>Checking Organizer Workspace...</Text></View></SafeAreaView>;
  }

  if (accessChecked && !hasAccess) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.blockedWrap}>
          <View style={styles.blockedIcon}><ShieldAlert size={36} color="#a35b00" /></View>
          <Text style={styles.blockedTitle}>Organizer access unavailable</Text>
          <Text style={styles.blockedText}>Event creation is private and invite-only. EYA Admin must activate a temporary Organizer Workspace for this account.</Text>
          <Pressable style={styles.blockedBtn} onPress={() => router.back()}><Text style={styles.blockedBtnText}>Return to EYA</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.successWrap}>
          <View style={styles.successIcon}><CheckCircle2 size={42} color="#087443" /></View>
          <Text style={styles.successTitle}>Sent to EYA for review</Text>
          <Text style={styles.successText}>The event is not visible to customers yet. Admin must approve it before it becomes published.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace("/(student)/organizer-events" as any)}><Text style={styles.primaryText}>Back to Event Studio</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}><ArrowLeft size={21} color={TEXT} /></Pressable>
          <View style={{ flex: 1 }}><Text style={styles.kicker}>Organizer Event Studio</Text><Text style={styles.title}>{isRevision ? "Revise event" : "Create event"}</Text></View>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Temporary, Admin-controlled access</Text>
          <Text style={styles.noticeText}>This workspace works only while the EYA Admin grant is active. Saving creates or updates a private draft; customers see it only after Admin approval.</Text>
        </View>

        {reviewNote ? <View style={styles.reviewBox}><Text style={styles.reviewKicker}>EYA REQUESTED CHANGES</Text><Text style={styles.reviewCopy}>{reviewNote}</Text></View> : null}

        <Section title="Event details" icon={<CalendarDays size={18} color={ACCENT} />}>
          <Field label="Event name" value={title} onChangeText={(v) => { setTitle(v); setReadyToSubmit(false); }} placeholder="Melodies & Mimosas" />
          <Field label="Category" value={category} onChangeText={(v) => { setCategory(v); setReadyToSubmit(false); }} placeholder="Music" />
          <Field label="Description" value={description} onChangeText={(v) => { setDescription(v); setReadyToSubmit(false); }} placeholder="Tell attendees what to expect" multiline />
          <Field label="Display date" value={dateLabel} onChangeText={(v) => { setDateLabel(v); setReadyToSubmit(false); }} placeholder="6 September 2026" />
          <Field label="Start date & time" value={startsAt} onChangeText={(v) => { setStartsAt(v); setReadyToSubmit(false); }} placeholder="2026-09-06 18:00" autoCapitalize="none" />
          <Field label="End date & time (optional)" value={endsAt} onChangeText={(v) => { setEndsAt(v); setReadyToSubmit(false); }} placeholder="2026-09-07 01:00" autoCapitalize="none" />
        </Section>

        <Section title="Venue" icon={<MapPin size={18} color={ACCENT} />}>
          <Field label="Venue" value={venue} onChangeText={(v) => { setVenue(v); setReadyToSubmit(false); }} placeholder="BICC" />
          <Field label="City" value={city} onChangeText={(v) => { setCity(v); setReadyToSubmit(false); }} placeholder="Lilongwe" />
        </Section>

        <Section title="Event images" icon={<ImagePlus size={18} color={ACCENT} />}>
          <ImagePickerCard label="Card image" uri={cardImage} busy={uploading === "card"} onPress={() => void pickImage("card")} />
          <ImagePickerCard label="Hero image" uri={heroImage} busy={uploading === "hero"} onPress={() => void pickImage("hero")} />
        </Section>

        <Section title="Primary ticket type" icon={<Ticket size={18} color={ACCENT} />}>
          <Field label="Ticket name" value={tierName} onChangeText={(v) => { setTierName(v); setReadyToSubmit(false); }} placeholder="General" />
          <Field label="Description" value={tierDescription} onChangeText={(v) => { setTierDescription(v); setReadyToSubmit(false); }} placeholder="General admission" />
          <Field label="Price (MWK)" value={tierPrice} onChangeText={(v) => { setTierPrice(v); setReadyToSubmit(false); }} placeholder="50000" keyboardType="numeric" />
          <Field label="Capacity" value={tierCapacity} onChangeText={(v) => { setTierCapacity(v); setReadyToSubmit(false); }} placeholder="500" keyboardType="numeric" />
        </Section>

        <Pressable style={[styles.primaryBtn, saving && styles.disabled]} disabled={saving || !!uploading} onPress={() => void saveDraft()}>
          {saving ? <ActivityIndicator color="#fff" /> : <Ticket size={18} color="#fff" />}
          <Text style={styles.primaryText}>{saving ? "Saving..." : isRevision ? "Save revisions" : "Save private draft"}</Text>
        </Pressable>

        {eventId && readyToSubmit ? (
          <View style={styles.readyCard}>
            <CheckCircle2 size={24} color="#087443" />
            <View style={{ flex: 1 }}><Text style={styles.readyTitle}>Draft ready</Text><Text style={styles.readyText}>These saved details are ready to be submitted for EYA review.</Text></View>
          </View>
        ) : null}

        {eventId && readyToSubmit ? (
          <Pressable style={[styles.submitBtn, submitting && styles.disabled]} disabled={submitting} onPress={() => void submit()}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Send size={18} color="#fff" />}
            <Text style={styles.primaryText}>{submitting ? "Submitting..." : isRevision ? "Resubmit to EYA Admin" : "Submit to EYA Admin"}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHead}>{icon}<Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, multiline, ...input } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...input} multiline={multiline} placeholderTextColor="#9aa3b8" style={[styles.input, multiline && styles.multiline]} /></View>;
}

function ImagePickerCard({ label, uri, busy, onPress }: { label: string; uri: string; busy: boolean; onPress: () => void }) {
  return <Pressable style={styles.imageCard} onPress={onPress} disabled={busy}>{uri ? <Image source={{ uri }} style={styles.preview} /> : <View style={styles.imageEmpty}><ImagePlus size={25} color={ACCENT} /></View>}<View style={{ flex: 1 }}><Text style={styles.imageLabel}>{label}</Text><Text style={styles.imageSub}>{busy ? "Uploading..." : uri ? "Tap to replace" : "Tap to upload"}</Text></View>{busy ? <ActivityIndicator color={ACCENT} /> : null}</Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 18, paddingBottom: 80, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  kicker: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  title: { color: TEXT, fontSize: 27, fontWeight: "900", marginTop: 2 },
  notice: { backgroundColor: "#eef1ff", borderRadius: 20, padding: 15, gap: 5 },
  noticeTitle: { color: ACCENT, fontSize: 13, fontWeight: "900" },
  noticeText: { color: "#4f5d7a", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  reviewBox: { backgroundColor: "#fff4df", borderRadius: 20, padding: 15, gap: 5 },
  reviewKicker: { color: "#a35b00", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  reviewCopy: { color: "#754500", fontSize: 13, lineHeight: 19, fontWeight: "800" },
  section: { backgroundColor: CARD, borderRadius: 24, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 13 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: TEXT, fontSize: 17, fontWeight: "900" },
  field: { gap: 6 },
  label: { color: MUTED, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  input: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", paddingHorizontal: 14, color: TEXT, fontSize: 14, fontWeight: "700" },
  multiline: { minHeight: 98, paddingTop: 14, textAlignVertical: "top" },
  imageCard: { minHeight: 86, borderRadius: 18, borderWidth: 1, borderColor: BORDER, backgroundColor: "#fbfcff", padding: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  preview: { width: 76, height: 64, borderRadius: 12, backgroundColor: "#e9edf5" },
  imageEmpty: { width: 76, height: 64, borderRadius: 12, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  imageLabel: { color: TEXT, fontSize: 14, fontWeight: "900" },
  imageSub: { color: MUTED, fontSize: 11, fontWeight: "700", marginTop: 3 },
  primaryBtn: { minHeight: 54, borderRadius: 27, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  submitBtn: { minHeight: 56, borderRadius: 28, backgroundColor: "#102a54", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  primaryText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.6 },
  readyCard: { borderRadius: 20, backgroundColor: "#e9f8ef", padding: 15, flexDirection: "row", alignItems: "center", gap: 10 },
  readyTitle: { color: "#087443", fontSize: 14, fontWeight: "900" },
  readyText: { color: "#39745a", fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: MUTED, fontSize: 13, fontWeight: "800" },
  blockedWrap: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center", gap: 13 },
  blockedIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#fff4df", alignItems: "center", justifyContent: "center" },
  blockedTitle: { color: TEXT, fontSize: 23, fontWeight: "900", textAlign: "center" },
  blockedText: { color: MUTED, fontSize: 14, lineHeight: 20, fontWeight: "700", textAlign: "center", maxWidth: 360 },
  blockedBtn: { minHeight: 48, borderRadius: 24, backgroundColor: "#eef1ff", paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  blockedBtnText: { color: ACCENT, fontSize: 13, fontWeight: "900" },
  successWrap: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center", gap: 14 },
  successIcon: { width: 84, height: 84, borderRadius: 42, backgroundColor: "#e4f7ec", alignItems: "center", justifyContent: "center" },
  successTitle: { color: TEXT, fontSize: 25, fontWeight: "900", textAlign: "center" },
  successText: { color: MUTED, fontSize: 14, lineHeight: 20, fontWeight: "700", textAlign: "center", maxWidth: 360 },
});
