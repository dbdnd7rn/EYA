import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ImagePlus,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Ticket,
  Trash2,
  X,
} from "lucide-react-native";
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
const SOFT = "#f9faff";
const SUCCESS = "#087443";

type Step = "basics" | "schedule" | "media" | "tickets" | "review";
type UploadKind = "card" | "hero";
type SelectOption = { id: string; label: string; subtitle?: string };
type EventImage = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "basics", label: "Basics" },
  { id: "schedule", label: "When & where" },
  { id: "media", label: "Media" },
  { id: "tickets", label: "Tickets" },
  { id: "review", label: "Review" },
];

const EVENT_CATEGORIES: SelectOption[] = [
  { id: "Music", label: "Music", subtitle: "Concerts, live music and listening events" },
  { id: "Nightlife", label: "Nightlife", subtitle: "Club nights, parties and social events" },
  { id: "Sports", label: "Sports", subtitle: "Matches, tournaments and fitness events" },
  { id: "Arts & Culture", label: "Arts & Culture", subtitle: "Art, theatre, fashion and cultural events" },
  { id: "Comedy", label: "Comedy", subtitle: "Stand-up, showcases and comedy nights" },
  { id: "Festival", label: "Festival", subtitle: "Multi-act and multi-day experiences" },
  { id: "Conference", label: "Conference", subtitle: "Business, professional and networking events" },
  { id: "Education", label: "Education", subtitle: "Workshops, classes and learning events" },
  { id: "Community", label: "Community", subtitle: "Community and public-interest gatherings" },
  { id: "Food & Drink", label: "Food & Drink", subtitle: "Food festivals, tastings and dining events" },
  { id: "Other", label: "Other", subtitle: "Anything that does not fit the categories above" },
];

const MALAWI_PLACES: SelectOption[] = [
  "Balaka",
  "Blantyre",
  "Chikwawa",
  "Chiradzulu",
  "Chitipa",
  "Dedza",
  "Dowa",
  "Karonga",
  "Kasungu",
  "Likoma",
  "Lilongwe",
  "Machinga",
  "Mangochi",
  "Mchinji",
  "Mulanje",
  "Mwanza",
  "Mzimba",
  "Mzuzu",
  "Neno",
  "Nkhata Bay",
  "Nkhotakota",
  "Nsanje",
  "Ntcheu",
  "Ntchisi",
  "Phalombe",
  "Rumphi",
  "Salima",
  "Thyolo",
  "Zomba",
].map((label) => ({ id: label, label }));

const TICKET_TYPES: SelectOption[] = [
  { id: "General", label: "General Admission", subtitle: "Standard event entry" },
  { id: "VIP", label: "VIP", subtitle: "Premium access or benefits" },
  { id: "Early Bird", label: "Early Bird", subtitle: "Limited early-sale allocation" },
  { id: "Student", label: "Student", subtitle: "Student-priced admission" },
  { id: "Table", label: "Table", subtitle: "Table or group allocation" },
  { id: "Free Entry", label: "Free Entry", subtitle: "No ticket charge" },
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatLongDate(value: Date | null) {
  if (!value) return "";
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDateTime(value: Date | null) {
  if (!value) return "Choose date & time";
  const date = value.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${date} • ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function toMalawiIso(value: Date | null) {
  if (!value) return null;
  const local = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:00+02:00`;
  const parsed = Date.parse(local);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function malawiDateFromIso(value?: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const shifted = new Date(parsed + 2 * 60 * 60 * 1000);
  return new Date(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    shifted.getUTCHours(),
    shifted.getUTCMinutes(),
  );
}

function addHours(value: Date, hours: number) {
  const next = new Date(value);
  next.setHours(next.getHours() + hours);
  return next;
}

function defaultStartDate() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(18, 0, 0, 0);
  return value;
}

function numberValue(value: string) {
  const n = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isRemoteImage(uri: string) {
  return /^https?:\/\//i.test(uri);
}

function imageMeta(asset: EventImage, kind: UploadKind) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const safeExt = ext === "heic" || ext === "heif" ? "jpg" : ext;
  return {
    name: `eya-ticket-${kind}-${Date.now()}.${safeExt}`,
    type: asset.mimeType || (safeExt === "png" ? "image/png" : safeExt === "webp" ? "image/webp" : "image/jpeg"),
  };
}

async function uploadEventImage(asset: EventImage, kind: UploadKind) {
  if (isRemoteImage(asset.uri)) return asset.uri;

  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error("Event image upload is not configured on this device.");
  }

  const meta = imageMeta(asset, kind);
  const form = new FormData();

  if (Platform.OS === "web") {
    const imageResponse = await fetch(asset.uri);
    if (!imageResponse.ok) throw new Error("Could not read the selected image.");
    const blob = await imageResponse.blob();
    form.append("file", blob, meta.name);
  } else {
    form.append("file", { uri: asset.uri, name: meta.name, type: meta.type } as any);
  }

  form.append("upload_preset", uploadPreset);
  form.append("folder", "eya/tickets/organizers");

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const json = await response.json();
  if (!response.ok || !json?.secure_url) {
    throw new Error(json?.error?.message || "Could not upload the event image.");
  }
  return String(json.secure_url);
}

export default function OrganizerEventStudio() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string }>();
  const routeEventId = typeof params.eventId === "string" ? params.eventId : "";
  const isRevision = Boolean(routeEventId);

  const [step, setStep] = React.useState<Step>("basics");
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("Music");
  const [description, setDescription] = React.useState("");
  const [startsAt, setStartsAt] = React.useState<Date | null>(null);
  const [endsAt, setEndsAt] = React.useState<Date | null>(null);
  const [venue, setVenue] = React.useState("");
  const [city, setCity] = React.useState("");
  const [cardImage, setCardImage] = React.useState<EventImage | null>(null);
  const [heroImage, setHeroImage] = React.useState<EventImage | null>(null);
  const [tierName, setTierName] = React.useState("General");
  const [tierDescription, setTierDescription] = React.useState("");
  const [tierPrice, setTierPrice] = React.useState("");
  const [tierCapacity, setTierCapacity] = React.useState("");
  const [tierId, setTierId] = React.useState<string | null>(null);
  const [reviewNote, setReviewNote] = React.useState<string | null>(null);
  const [mediaSheet, setMediaSheet] = React.useState<UploadKind | null>(null);
  const [loadingExisting, setLoadingExisting] = React.useState(true);
  const [accessChecked, setAccessChecked] = React.useState(false);
  const [hasAccess, setHasAccess] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [eventId, setEventId] = React.useState<string | null>(routeEventId || null);
  const [readyToSubmit, setReadyToSubmit] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const stepIndex = STEPS.findIndex((item) => item.id === step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;
  const dateLabel = formatLongDate(startsAt);

  const markDirty = React.useCallback(() => setReadyToSubmit(false), []);

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
          Alert.alert("Event locked", "This event cannot be edited in its current status.", [
            { text: "Back", onPress: () => router.back() },
          ]);
          return;
        }

        setTitle(event.title);
        setCategory(event.category || "Music");
        setDescription(event.description || "");
        setStartsAt(malawiDateFromIso(event.starts_at));
        setEndsAt(malawiDateFromIso(event.ends_at));
        setVenue(event.venue || "");
        setCity(event.city || "");
        setCardImage(event.image_url ? { uri: event.image_url } : null);
        setHeroImage(event.hero_image_url ? { uri: event.hero_image_url } : event.image_url ? { uri: event.image_url } : null);
        setReviewNote(event.review_note || null);

        const firstTier = [...(event.tiers || [])].sort((a, b) => a.sort_order - b.sort_order)[0];
        if (firstTier) {
          setTierId(firstTier.id);
          setTierName(firstTier.name || "General");
          setTierDescription(firstTier.description || "");
          setTierPrice(String(firstTier.price_mwk ?? ""));
          setTierCapacity(String(firstTier.capacity_total ?? ""));
        }
      } catch (error: any) {
        if (!active) return;
        setAccessChecked(true);
        setHasAccess(false);
        Alert.alert("Organizer access unavailable", error?.message || "Try again.");
      } finally {
        if (active) setLoadingExisting(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [routeEventId, router]);

  async function pickImage(kind: UploadKind) {
    if (!hasAccess) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Photo access required", "Allow photo access to choose an event image.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: kind === "hero" ? [16, 9] : [4, 3],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 12 * 1024 * 1024) {
        Alert.alert("Image too large", "Choose an image smaller than 12 MB.");
        return;
      }

      const next: EventImage = {
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
      };

      if (kind === "card") {
        setCardImage(next);
        setHeroImage((current) => current || next);
      } else {
        setHeroImage(next);
      }
      markDirty();
      setMediaSheet(null);
    } catch (error: any) {
      Alert.alert("Could not choose image", error?.message || "Try another image.");
    }
  }

  function removeImage(kind: UploadKind) {
    if (kind === "card") {
      setCardImage((current) => {
        setHeroImage((hero) => (hero?.uri === current?.uri ? null : hero));
        return null;
      });
    } else {
      setHeroImage(null);
    }
    markDirty();
    setMediaSheet(null);
  }

  function useCardForHero() {
    if (!cardImage) return;
    setHeroImage(cardImage);
    markDirty();
    setMediaSheet(null);
  }

  function setStart(value: Date | null) {
    if (!value) return;
    setStartsAt(value);
    setEndsAt((current) => (!current || current.getTime() <= value.getTime() ? addHours(value, 3) : current));
    markDirty();
  }

  function validate(target: Step) {
    if (target === "basics") {
      if (title.trim().length < 3) throw new Error("Add a clear event name.");
      if (!category.trim()) throw new Error("Choose an event category.");
    }
    if (target === "schedule") {
      if (!startsAt) throw new Error("Choose the event start date and time.");
      if (endsAt && endsAt.getTime() <= startsAt.getTime()) throw new Error("End time must be after the start time.");
      if (!venue.trim()) throw new Error("Add the venue name.");
      if (!city.trim()) throw new Error("Choose the event city or district.");
    }
    if (target === "media") {
      if (!cardImage?.uri) throw new Error("Add the event card image.");
      if (!heroImage?.uri) throw new Error("Add a wide hero image, or use the card image for both.");
    }
    if (target === "tickets") {
      const price = numberValue(tierPrice);
      const capacity = Math.floor(numberValue(tierCapacity));
      if (!tierName.trim()) throw new Error("Choose a ticket type.");
      if (price < 0) throw new Error("Ticket price cannot be negative.");
      if (capacity < 1) throw new Error("Ticket capacity must be at least 1.");
    }
  }

  function next() {
    try {
      validate(step);
      setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].id);
    } catch (error: any) {
      Alert.alert("Complete this step", error?.message || "Review the details above.");
    }
  }

  async function resolveImages() {
    if (!cardImage || !heroImage) throw new Error("Event images are missing.");

    if (cardImage.uri === heroImage.uri) {
      const url = await uploadEventImage(cardImage, "card");
      const remote = { uri: url };
      setCardImage(remote);
      setHeroImage(remote);
      return { cardUrl: url, heroUrl: url };
    }

    const [cardUrl, heroUrl] = await Promise.all([
      uploadEventImage(cardImage, "card"),
      uploadEventImage(heroImage, "hero"),
    ]);
    setCardImage({ uri: cardUrl });
    setHeroImage({ uri: heroUrl });
    return { cardUrl, heroUrl };
  }

  async function saveDraft() {
    if (!hasAccess || saving) return;

    try {
      STEPS.filter((item) => item.id !== "review").forEach((item) => validate(item.id));
      if (!startsAt) throw new Error("Choose the event start date and time.");

      setSaving(true);
      const { cardUrl, heroUrl } = await resolveImages();
      const startIso = toMalawiIso(startsAt);
      const endIso = toMalawiIso(endsAt);
      if (!startIso) throw new Error("Could not read the selected start date.");

      const input = {
        title,
        category,
        description,
        dateLabel: formatLongDate(startsAt),
        startsAt: startIso,
        endsAt: endIso,
        venue,
        city,
        imageUrl: cardUrl,
        heroImageUrl: heroUrl,
      };

      const event = eventId
        ? await updateMyTicketEventDraft(eventId, input)
        : await createMyTicketEventDraft(input);

      setEventId(event.event_id);

      const tier = await upsertMyTicketTier({
        eventId: event.event_id,
        tierId,
        name: tierName,
        description: tierDescription,
        priceMwk: numberValue(tierPrice),
        capacityTotal: Math.floor(numberValue(tierCapacity)),
      });

      setTierId(tier.tier_id);
      setReviewNote(null);
      setReadyToSubmit(true);
      Alert.alert(
        isRevision ? "Revisions saved" : "Private draft saved",
        "Nothing is published yet. Review the saved draft, then submit it to EYA Admin when you are ready.",
      );
    } catch (error: any) {
      Alert.alert("Could not save draft", error?.message || "Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    if (!hasAccess || !eventId || !readyToSubmit || submitting) return;
    try {
      setSubmitting(true);
      await submitMyTicketEvent(eventId);
      setSubmitted(true);
    } catch (error: any) {
      Alert.alert("Could not submit", error?.message || "Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingExisting) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={ACCENT} />
          <Text style={styles.loadingText}>Opening Event Studio...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (accessChecked && !hasAccess) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.blockedWrap}>
          <View style={styles.blockedIcon}><ShieldAlert size={36} color="#a35b00" /></View>
          <Text style={styles.blockedTitle}>Organizer access unavailable</Text>
          <Text style={styles.blockedText}>Event creation is private and invite-only. EYA Admin must activate Organizer Workspace access for this account.</Text>
          <Pressable style={styles.blockedBtn} onPress={() => router.back()}><Text style={styles.blockedBtnText}>Return to EYA</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (submitted) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.successWrap}>
          <View style={styles.successIcon}><CheckCircle2 size={42} color={SUCCESS} /></View>
          <Text style={styles.successTitle}>Sent to EYA for review</Text>
          <Text style={styles.successText}>The event is still private. EYA Admin must approve it before customers can see it.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace("/(student)/organizer-events" as any)}><Text style={styles.primaryText}>Back to Event Studio</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()}><ArrowLeft size={21} color={TEXT} /></Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>Organizer Event Studio</Text>
            <Text style={styles.title}>{isRevision ? "Revise event" : "Create event"}</Text>
          </View>
        </View>

        <View style={styles.progressCard}>
          <View style={styles.progressTop}>
            <Text style={styles.progressTitle}>Step {stepIndex + 1} of {STEPS.length}</Text>
            <Text style={styles.progressPercent}>{Math.round(progress)}%</Text>
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepRow}>
            {STEPS.map((item, index) => {
              const active = item.id === step;
              const complete = index < stepIndex;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    if (index <= stepIndex) setStep(item.id);
                  }}
                  style={[styles.stepPill, active && styles.stepPillActive, complete && styles.stepPillComplete]}
                >
                  {complete ? <Check size={12} color={SUCCESS} /> : null}
                  <Text style={[styles.stepText, active && styles.stepTextActive, complete && styles.stepTextComplete]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {reviewNote ? (
          <View style={styles.reviewBox}>
            <Text style={styles.reviewKicker}>EYA REQUESTED CHANGES</Text>
            <Text style={styles.reviewCopy}>{reviewNote}</Text>
          </View>
        ) : null}

        {step === "basics" ? (
          <StudioCard icon={<Sparkles size={19} color={ACCENT} />} title="Event identity" body="Start with the information customers use to understand your event.">
            <Field label="Event name" value={title} onChangeText={(value) => { setTitle(value); markDirty(); }} placeholder="Melodies & Mimosas" />
            <SelectSheetField
              label="Category"
              value={category}
              options={EVENT_CATEGORIES}
              placeholder="Choose event category"
              searchable={false}
              onChange={(value) => { setCategory(value); markDirty(); }}
            />
            <Field label="Description" value={description} onChangeText={(value) => { setDescription(value); markDirty(); }} placeholder="Tell attendees what makes this event worth attending" multiline />
            <InfoBox text="You will not type a display date. EYA creates it automatically from the start date you choose next." />
          </StudioCard>
        ) : null}

        {step === "schedule" ? (
          <StudioCard icon={<CalendarDays size={19} color={ACCENT} />} title="When & where" body="Choose dates and times instead of typing them manually.">
            <DateTimeSheetField
              label="Starts"
              value={startsAt}
              onChange={setStart}
              placeholder="Choose start date & time"
            />
            <DateTimeSheetField
              label="Ends"
              value={endsAt}
              onChange={(value) => { setEndsAt(value); markDirty(); }}
              placeholder="Choose end date & time"
              optional
              fallback={startsAt ? addHours(startsAt, 3) : undefined}
            />
            {startsAt ? (
              <View style={styles.autoDateCard}>
                <CalendarDays size={17} color={ACCENT} />
                <View style={styles.autoDateCopy}>
                  <Text style={styles.autoDateLabel}>Customer display date</Text>
                  <Text style={styles.autoDateValue}>{dateLabel}</Text>
                </View>
                <View style={styles.autoBadge}><Text style={styles.autoBadgeText}>AUTO</Text></View>
              </View>
            ) : null}
            <Field label="Venue" value={venue} onChangeText={(value) => { setVenue(value); markDirty(); }} placeholder="e.g. BICC, Civo Stadium, Sunbird Mount Soche" />
            <SelectSheetField
              label="City / district"
              value={city}
              options={MALAWI_PLACES}
              placeholder="Choose location"
              searchable
              onChange={(value) => { setCity(value); markDirty(); }}
            />
          </StudioCard>
        ) : null}

        {step === "media" ? (
          <StudioCard icon={<ImagePlus size={19} color={ACCENT} />} title="Event media" body="Choose photos first. EYA uploads them safely only when you save the draft.">
            <View style={styles.mediaGrid}>
              <MediaCard title="Event card" body="4:3 cover for event lists" image={cardImage} onPress={() => setMediaSheet("card")} />
              <MediaCard title="Hero image" body="16:9 wide event header" image={heroImage} onPress={() => setMediaSheet("hero")} />
            </View>
            <InfoBox text="Tip: choose the event card first. EYA can reuse it as the hero image, so one good image is enough to continue." />
          </StudioCard>
        ) : null}

        {step === "tickets" ? (
          <StudioCard icon={<Ticket size={19} color={ACCENT} />} title="Primary ticket" body="Set the first ticket allocation customers will be able to buy after approval.">
            <SelectSheetField
              label="Ticket type"
              value={tierName}
              options={TICKET_TYPES}
              placeholder="Choose ticket type"
              searchable={false}
              onChange={(value) => {
                setTierName(value);
                if (value === "Free Entry") setTierPrice("0");
                markDirty();
              }}
            />
            <Field label="Ticket description" value={tierDescription} onChangeText={(value) => { setTierDescription(value); markDirty(); }} placeholder="What this ticket includes" />
            <View style={styles.twoCol}>
              <Field label="Price (MWK)" value={tierPrice} onChangeText={(value) => { setTierPrice(value.replace(/[^\d]/g, "")); markDirty(); }} placeholder="50000" keyboardType="numeric" />
              <Field label="Capacity" value={tierCapacity} onChangeText={(value) => { setTierCapacity(value.replace(/[^\d]/g, "")); markDirty(); }} placeholder="500" keyboardType="numeric" />
            </View>
            <InfoBox text="Payment methods are configured separately. Creating an event here does not change or trigger the payment system." />
          </StudioCard>
        ) : null}

        {step === "review" ? (
          <StudioCard icon={<CheckCircle2 size={19} color={SUCCESS} />} title="Review private draft" body="Check what will be sent to EYA Admin. Saving does not publish the event.">
            <ReviewRow label="Event" value={`${title || "Unnamed event"} • ${category}`} done={title.trim().length >= 3} />
            <ReviewRow label="Schedule" value={startsAt ? `${formatShortDateTime(startsAt)}${endsAt ? ` → ${formatShortDateTime(endsAt)}` : ""}` : "Start date missing"} done={Boolean(startsAt)} />
            <ReviewRow label="Venue" value={venue && city ? `${venue}, ${city}` : "Venue or location missing"} done={Boolean(venue && city)} />
            <ReviewRow label="Media" value={cardImage && heroImage ? "Card and hero images ready" : "Event images incomplete"} done={Boolean(cardImage && heroImage)} />
            <ReviewRow label="Ticket" value={`${ticketDisplayName(tierName)} • K${numberValue(tierPrice).toLocaleString()} • ${Math.floor(numberValue(tierCapacity)).toLocaleString()} available`} done={Boolean(tierName && numberValue(tierCapacity) >= 1)} />
            <View style={styles.adminNotice}>
              <ShieldAlert size={20} color={ACCENT} />
              <View style={styles.adminNoticeCopy}>
                <Text style={styles.adminNoticeTitle}>EYA approval stays in control</Text>
                <Text style={styles.adminNoticeText}>Save this as a private draft first. Only after you submit it can EYA Admin review and approve it for customers.</Text>
              </View>
            </View>

            <Pressable style={[styles.primaryBtn, saving && styles.disabled]} disabled={saving} onPress={() => void saveDraft()}>
              {saving ? <ActivityIndicator color="#fff" /> : <Ticket size={18} color="#fff" />}
              <Text style={styles.primaryText}>{saving ? "Saving & uploading..." : isRevision ? "Save revisions" : "Save private draft"}</Text>
            </Pressable>

            {eventId && readyToSubmit ? (
              <View style={styles.readyCard}>
                <CheckCircle2 size={23} color={SUCCESS} />
                <View style={styles.readyCopy}>
                  <Text style={styles.readyTitle}>Saved and ready</Text>
                  <Text style={styles.readyText}>The private draft is saved. You can now send this exact version for EYA review.</Text>
                </View>
              </View>
            ) : null}

            {eventId && readyToSubmit ? (
              <Pressable style={[styles.submitBtn, submitting && styles.disabled]} disabled={submitting} onPress={() => void submit()}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Send size={18} color="#fff" />}
                <Text style={styles.primaryText}>{submitting ? "Submitting..." : isRevision ? "Resubmit to EYA Admin" : "Submit to EYA Admin"}</Text>
              </Pressable>
            ) : null}
          </StudioCard>
        ) : null}

        <View style={styles.actions}>
          {stepIndex > 0 ? (
            <Pressable style={styles.secondaryBtn} onPress={() => setStep(STEPS[stepIndex - 1].id)}>
              <ChevronLeft size={17} color={TEXT} />
              <Text style={styles.secondaryText}>Back</Text>
            </Pressable>
          ) : <View />}
          {stepIndex < STEPS.length - 1 ? (
            <Pressable style={styles.continueBtn} onPress={next}>
              <Text style={styles.primaryText}>Continue</Text>
              <ChevronRight size={17} color="#fff" />
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <MediaActionSheet
        kind={mediaSheet}
        image={mediaSheet === "card" ? cardImage : heroImage}
        canUseCard={Boolean(cardImage)}
        onClose={() => setMediaSheet(null)}
        onChoose={(kind) => void pickImage(kind)}
        onUseCard={useCardForHero}
        onRemove={removeImage}
      />
    </SafeAreaView>
  );
}

function ticketDisplayName(value: string) {
  return TICKET_TYPES.find((item) => item.id === value)?.label || value || "Ticket";
}

function StudioCard({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIcon}>{icon}</View>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionBody}>{body}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, multiline, style, ...input } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...input} multiline={multiline} placeholderTextColor="#9aa3b8" style={[styles.input, multiline && styles.multiline, style]} />
    </View>
  );
}

function SelectSheetField({ label, value, options, placeholder, onChange, searchable = true }: { label: string; value: string; options: SelectOption[]; placeholder: string; onChange: (value: string) => void; searchable?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = options.find((item) => item.id === value) || (value ? { id: value, label: value } : null);
  const allOptions = selected && !options.some((item) => item.id === selected.id) ? [selected, ...options] : options;
  const filtered = allOptions.filter((item) => `${item.label} ${item.subtitle || ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.selectField} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={styles.selectCopy}>
          <Text style={[styles.selectValue, !selected && styles.selectPlaceholder]} numberOfLines={1}>{selected?.label || placeholder}</Text>
          {selected?.subtitle ? <Text style={styles.selectSubtitle} numberOfLines={1}>{selected.subtitle}</Text> : null}
        </View>
        <ChevronDown size={18} color={MUTED} />
      </Pressable>

      <BottomSheet visible={open} kicker="SELECT" title={label} onClose={close}>
        {searchable ? (
          <View style={styles.searchBox}>
            <Search size={17} color={MUTED} />
            <TextInput value={query} onChangeText={setQuery} placeholder={`Search ${label.toLowerCase()}…`} placeholderTextColor="#9aa3b8" style={styles.searchInput} autoCapitalize="none" autoCorrect={false} />
            {query ? <Pressable hitSlop={8} onPress={() => setQuery("")}><X size={18} color={MUTED} /></Pressable> : null}
          </View>
        ) : null}
        <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {filtered.map((item) => {
            const active = item.id === value;
            return (
              <Pressable key={item.id} style={[styles.optionRow, active && styles.optionRowActive]} onPress={() => { onChange(item.id); close(); }}>
                <View style={styles.optionCopy}>
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{item.label}</Text>
                  {item.subtitle ? <Text style={styles.optionSubtitle}>{item.subtitle}</Text> : null}
                </View>
                <View style={[styles.optionDot, active && styles.optionDotActive]}>{active ? <Check size={13} color="#fff" /> : null}</View>
              </Pressable>
            );
          })}
          {!filtered.length ? <View style={styles.emptyOptions}><Text style={styles.emptyOptionsText}>No matching options.</Text></View> : null}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

function DateTimeSheetField({ label, value, onChange, placeholder, optional = false, fallback }: { label: string; value: Date | null; onChange: (value: Date | null) => void; placeholder: string; optional?: boolean; fallback?: Date }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Date>(value || fallback || defaultStartDate());
  const [month, setMonth] = React.useState<Date>(new Date((value || fallback || defaultStartDate()).getFullYear(), (value || fallback || defaultStartDate()).getMonth(), 1));

  function show() {
    const seed = value || fallback || defaultStartDate();
    setDraft(new Date(seed));
    setMonth(new Date(seed.getFullYear(), seed.getMonth(), 1));
    setOpen(true);
  }

  function chooseDay(day: number) {
    const next = new Date(draft);
    next.setFullYear(month.getFullYear(), month.getMonth(), day);
    setDraft(next);
  }

  function chooseHour(hour: number) {
    const next = new Date(draft);
    next.setHours(hour);
    setDraft(next);
  }

  function chooseMinute(minute: number) {
    const next = new Date(draft);
    next.setMinutes(minute, 0, 0);
    setDraft(next);
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{optional ? " (optional)" : ""}</Text>
      <Pressable style={styles.dateField} onPress={show} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={styles.dateIcon}><CalendarDays size={18} color={ACCENT} /></View>
        <View style={styles.selectCopy}>
          <Text style={[styles.selectValue, !value && styles.selectPlaceholder]}>{value ? formatShortDateTime(value) : placeholder}</Text>
          <Text style={styles.selectSubtitle}>Malawi time (CAT)</Text>
        </View>
        <ChevronDown size={18} color={MUTED} />
      </Pressable>

      <BottomSheet visible={open} kicker="DATE & TIME" title={label} onClose={() => setOpen(false)}>
        <View style={styles.monthHeader}>
          <Pressable style={styles.monthBtn} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} color={TEXT} /></Pressable>
          <Text style={styles.monthTitle}>{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</Text>
          <Pressable style={styles.monthBtn} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} color={TEXT} /></Pressable>
        </View>

        <View style={styles.weekRow}>{["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <Text key={`${day}-${index}`} style={styles.weekDay}>{day}</Text>)}</View>
        <View style={styles.calendarGrid}>
          {calendarCells(month).map((day, index) => {
            const active = day === draft.getDate() && month.getMonth() === draft.getMonth() && month.getFullYear() === draft.getFullYear();
            return day ? (
              <Pressable key={`${day}-${index}`} style={[styles.dayCell, active && styles.dayCellActive]} onPress={() => chooseDay(day)}>
                <Text style={[styles.dayText, active && styles.dayTextActive]}>{day}</Text>
              </Pressable>
            ) : <View key={`empty-${index}`} style={styles.dayCell} />;
          })}
        </View>

        <View style={styles.timeHeader}><Clock3 size={17} color={ACCENT} /><Text style={styles.timeTitle}>Time</Text><Text style={styles.timeValue}>{pad(draft.getHours())}:{pad(draft.getMinutes())}</Text></View>
        <Text style={styles.timeHelper}>Hour</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeRow}>
          {Array.from({ length: 24 }, (_, hour) => hour).map((hour) => {
            const active = draft.getHours() === hour;
            return <Pressable key={hour} style={[styles.timeChip, active && styles.timeChipActive]} onPress={() => chooseHour(hour)}><Text style={[styles.timeChipText, active && styles.timeChipTextActive]}>{pad(hour)}</Text></Pressable>;
          })}
        </ScrollView>
        <Text style={styles.timeHelper}>Minutes</Text>
        <View style={styles.minuteRow}>
          {[0, 15, 30, 45].map((minute) => {
            const active = draft.getMinutes() === minute;
            return <Pressable key={minute} style={[styles.minuteChip, active && styles.timeChipActive]} onPress={() => chooseMinute(minute)}><Text style={[styles.timeChipText, active && styles.timeChipTextActive]}>:{pad(minute)}</Text></Pressable>;
          })}
        </View>

        <View style={styles.sheetActions}>
          {optional ? <Pressable style={styles.clearBtn} onPress={() => { onChange(null); setOpen(false); }}><Text style={styles.clearBtnText}>No end time</Text></Pressable> : null}
          <Pressable style={styles.sheetPrimary} onPress={() => { onChange(new Date(draft)); setOpen(false); }}><Check size={17} color="#fff" /><Text style={styles.primaryText}>Use this time</Text></Pressable>
        </View>
      </BottomSheet>
    </View>
  );
}

function calendarCells(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const jsDay = new Date(year, monthIndex, 1).getDay();
  const mondayOffset = (jsDay + 6) % 7;
  const cells: Array<number | null> = Array(mondayOffset).fill(null);
  for (let day = 1; day <= days; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function MediaCard({ title, body, image, onPress }: { title: string; body: string; image: EventImage | null; onPress: () => void }) {
  return (
    <Pressable style={styles.mediaCard} onPress={onPress}>
      {image?.uri ? <Image source={{ uri: image.uri }} style={styles.mediaPreview} /> : <View style={styles.mediaEmpty}><ImagePlus size={29} color={ACCENT} /></View>}
      <View style={styles.mediaTextWrap}>
        <Text style={styles.mediaTitle}>{title}</Text>
        <Text style={styles.mediaBody}>{image?.uri ? "Tap for image options" : body}</Text>
      </View>
      <View style={styles.mediaAdd}><ChevronRight size={16} color={ACCENT} /></View>
    </Pressable>
  );
}

function MediaActionSheet({ kind, image, canUseCard, onClose, onChoose, onUseCard, onRemove }: { kind: UploadKind | null; image: EventImage | null; canUseCard: boolean; onClose: () => void; onChoose: (kind: UploadKind) => void; onUseCard: () => void; onRemove: (kind: UploadKind) => void }) {
  if (!kind) return null;
  return (
    <BottomSheet visible kicker="EVENT MEDIA" title={kind === "card" ? "Event card image" : "Hero image"} onClose={onClose}>
      {image?.uri ? <Image source={{ uri: image.uri }} style={styles.sheetPreview} /> : <View style={styles.sheetPreviewEmpty}><ImagePlus size={34} color={ACCENT} /></View>}
      <Pressable style={styles.actionRow} onPress={() => onChoose(kind)}><View style={styles.actionIcon}><ImagePlus size={19} color={ACCENT} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>{image ? "Choose another photo" : "Choose from photos"}</Text><Text style={styles.actionSub}>Preview now; upload happens when the draft is saved.</Text></View><ChevronRight size={17} color={MUTED} /></Pressable>
      {kind === "hero" && canUseCard ? <Pressable style={styles.actionRow} onPress={onUseCard}><View style={styles.actionIcon}><Sparkles size={19} color={ACCENT} /></View><View style={styles.actionCopy}><Text style={styles.actionTitle}>Use event card image</Text><Text style={styles.actionSub}>Reuse one image for both placements.</Text></View><ChevronRight size={17} color={MUTED} /></Pressable> : null}
      {image ? <Pressable style={[styles.actionRow, styles.dangerRow]} onPress={() => onRemove(kind)}><View style={[styles.actionIcon, styles.dangerIcon]}><Trash2 size={19} color="#b42318" /></View><View style={styles.actionCopy}><Text style={styles.dangerTitle}>Remove image</Text><Text style={styles.actionSub}>You can choose another one before saving.</Text></View></Pressable> : null}
    </BottomSheet>
  );
}

function BottomSheet({ visible, kicker, title, onClose, children }: { visible: boolean; kicker: string; title: string; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]} onPress={(event) => event.stopPropagation()}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeadCopy}>
                <Text style={styles.sheetKicker}>{kicker}</Text>
                <Text style={styles.sheetTitle}>{title}</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}><X size={20} color={TEXT} /></Pressable>
            </View>
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function InfoBox({ text }: { text: string }) {
  return <View style={styles.infoBox}><Sparkles size={16} color={ACCENT} /><Text style={styles.infoText}>{text}</Text></View>;
}

function ReviewRow({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <View style={styles.reviewRow}>
      <View style={[styles.reviewStatus, done && styles.reviewStatusDone]}>{done ? <Check size={14} color="#fff" /> : null}</View>
      <View style={styles.reviewRowCopy}><Text style={styles.reviewRowLabel}>{label}</Text><Text style={styles.reviewRowValue}>{value}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  content: { padding: 18, paddingBottom: 80, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerCopy: { flex: 1 },
  iconBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  kicker: { color: ACCENT, fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  title: { color: TEXT, fontSize: 28, fontWeight: "900", marginTop: 2 },
  progressCard: { backgroundColor: CARD, borderRadius: 22, borderWidth: 1, borderColor: BORDER, padding: 14, gap: 10 },
  progressTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: { color: TEXT, fontSize: 12, fontWeight: "900" },
  progressPercent: { color: ACCENT, fontSize: 11, fontWeight: "900" },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: "#edf0f7", overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 999, backgroundColor: ACCENT },
  stepRow: { gap: 8, paddingRight: 8 },
  stepPill: { minHeight: 31, borderRadius: 999, paddingHorizontal: 11, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, flexDirection: "row", alignItems: "center", gap: 5 },
  stepPillActive: { backgroundColor: "#eef1ff", borderColor: "#cbd2fb" },
  stepPillComplete: { backgroundColor: "#e9f8ef", borderColor: "#cbe9d7" },
  stepText: { color: MUTED, fontSize: 10, fontWeight: "900" },
  stepTextActive: { color: ACCENT },
  stepTextComplete: { color: SUCCESS },
  reviewBox: { backgroundColor: "#fff4df", borderRadius: 20, padding: 15, gap: 5 },
  reviewKicker: { color: "#a35b00", fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  reviewCopy: { color: "#754500", fontSize: 13, lineHeight: 19, fontWeight: "800" },
  section: { backgroundColor: CARD, borderRadius: 25, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 15 },
  sectionHead: { flexDirection: "row", alignItems: "flex-start", gap: 11, marginBottom: 2 },
  sectionIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: TEXT, fontSize: 18, fontWeight: "900" },
  sectionBody: { color: MUTED, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 3 },
  field: { gap: 6, flex: 1 },
  label: { color: MUTED, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 },
  input: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, paddingHorizontal: 14, color: TEXT, fontSize: 14, fontWeight: "700" },
  multiline: { minHeight: 108, paddingTop: 14, textAlignVertical: "top" },
  twoCol: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  selectField: { minHeight: 55, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  selectCopy: { flex: 1, minWidth: 0 },
  selectValue: { color: TEXT, fontSize: 14, fontWeight: "900" },
  selectPlaceholder: { color: "#9aa3b8" },
  selectSubtitle: { color: MUTED, fontSize: 10, fontWeight: "700", marginTop: 3 },
  dateField: { minHeight: 62, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, padding: 9, flexDirection: "row", alignItems: "center", gap: 10 },
  dateIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  autoDateCard: { minHeight: 58, borderRadius: 17, backgroundColor: "#eef1ff", padding: 11, flexDirection: "row", alignItems: "center", gap: 10 },
  autoDateCopy: { flex: 1 },
  autoDateLabel: { color: MUTED, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  autoDateValue: { color: TEXT, fontSize: 14, fontWeight: "900", marginTop: 2 },
  autoBadge: { borderRadius: 999, backgroundColor: "#dfe4ff", paddingHorizontal: 8, paddingVertical: 5 },
  autoBadgeText: { color: ACCENT, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  mediaGrid: { gap: 10 },
  mediaCard: { minHeight: 103, borderRadius: 19, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, padding: 9, flexDirection: "row", alignItems: "center", gap: 11 },
  mediaPreview: { width: 94, height: 82, borderRadius: 14, backgroundColor: "#e9edf5" },
  mediaEmpty: { width: 94, height: 82, borderRadius: 14, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  mediaTextWrap: { flex: 1 },
  mediaTitle: { color: TEXT, fontSize: 14, fontWeight: "900" },
  mediaBody: { color: MUTED, fontSize: 10, lineHeight: 15, fontWeight: "700", marginTop: 3 },
  mediaAdd: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  infoBox: { borderRadius: 17, backgroundColor: "#f0f3ff", padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  infoText: { flex: 1, color: "#56627c", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  reviewRow: { minHeight: 59, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, padding: 11, flexDirection: "row", alignItems: "center", gap: 10 },
  reviewStatus: { width: 27, height: 27, borderRadius: 14, borderWidth: 2, borderColor: "#c9cfdb", alignItems: "center", justifyContent: "center" },
  reviewStatusDone: { backgroundColor: SUCCESS, borderColor: SUCCESS },
  reviewRowCopy: { flex: 1 },
  reviewRowLabel: { color: TEXT, fontSize: 12, fontWeight: "900" },
  reviewRowValue: { color: MUTED, fontSize: 10, lineHeight: 15, fontWeight: "700", marginTop: 2 },
  adminNotice: { borderRadius: 18, backgroundColor: "#eef1ff", padding: 13, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  adminNoticeCopy: { flex: 1 },
  adminNoticeTitle: { color: ACCENT, fontSize: 12, fontWeight: "900" },
  adminNoticeText: { color: "#56627c", fontSize: 10, lineHeight: 15, fontWeight: "700", marginTop: 3 },
  actions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  secondaryBtn: { minHeight: 50, borderRadius: 25, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  secondaryText: { color: TEXT, fontSize: 13, fontWeight: "900" },
  continueBtn: { minHeight: 50, borderRadius: 25, backgroundColor: ACCENT, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginLeft: "auto" },
  primaryBtn: { minHeight: 54, borderRadius: 27, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  submitBtn: { minHeight: 56, borderRadius: 28, backgroundColor: TEXT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.6 },
  readyCard: { borderRadius: 18, backgroundColor: "#e9f8ef", padding: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  readyCopy: { flex: 1 },
  readyTitle: { color: SUCCESS, fontSize: 13, fontWeight: "900" },
  readyText: { color: "#39745a", fontSize: 10, lineHeight: 15, fontWeight: "700", marginTop: 2 },
  modalRoot: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(16,42,84,0.42)", justifyContent: "flex-end" },
  sheet: { maxHeight: "90%", backgroundColor: CARD, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: "#ffffff", paddingHorizontal: 16, paddingTop: 10, shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 18 },
  handle: { width: 46, height: 5, borderRadius: 999, backgroundColor: "#d6dbe8", alignSelf: "center", marginBottom: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 13 },
  sheetHeadCopy: { flex: 1 },
  sheetKicker: { color: ACCENT, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  sheetTitle: { color: TEXT, fontSize: 20, fontWeight: "900", marginTop: 3 },
  closeBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: SOFT, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center" },
  searchBox: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, marginBottom: 11 },
  searchInput: { flex: 1, color: TEXT, fontSize: 13, fontWeight: "700", paddingVertical: 0 },
  sheetList: { maxHeight: 430 },
  sheetListContent: { paddingBottom: 6 },
  optionRow: { minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, padding: 11, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  optionRowActive: { backgroundColor: "#eef1ff", borderColor: "#cbd2fb" },
  optionCopy: { flex: 1 },
  optionLabel: { color: TEXT, fontSize: 13, fontWeight: "900" },
  optionLabelActive: { color: ACCENT },
  optionSubtitle: { color: MUTED, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 2 },
  optionDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#ccd2df", alignItems: "center", justifyContent: "center" },
  optionDotActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  emptyOptions: { minHeight: 100, alignItems: "center", justifyContent: "center" },
  emptyOptionsText: { color: MUTED, fontSize: 12, fontWeight: "800" },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  monthBtn: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, alignItems: "center", justifyContent: "center" },
  monthTitle: { color: TEXT, fontSize: 15, fontWeight: "900" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekDay: { width: "14.285%", textAlign: "center", color: MUTED, fontSize: 10, fontWeight: "900" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 11 },
  dayCell: { width: "14.285%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 999 },
  dayCellActive: { backgroundColor: ACCENT },
  dayText: { color: TEXT, fontSize: 12, fontWeight: "800" },
  dayTextActive: { color: "#fff", fontWeight: "900" },
  timeHeader: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10 },
  timeTitle: { color: TEXT, fontSize: 13, fontWeight: "900" },
  timeValue: { color: ACCENT, fontSize: 13, fontWeight: "900", marginLeft: "auto" },
  timeHelper: { color: MUTED, fontSize: 9, fontWeight: "900", textTransform: "uppercase", marginTop: 8, marginBottom: 6 },
  timeRow: { gap: 7, paddingRight: 10 },
  timeChip: { minWidth: 45, height: 39, borderRadius: 13, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, alignItems: "center", justifyContent: "center" },
  timeChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  timeChipText: { color: TEXT, fontSize: 12, fontWeight: "900" },
  timeChipTextActive: { color: "#fff" },
  minuteRow: { flexDirection: "row", gap: 8 },
  minuteChip: { flex: 1, height: 41, borderRadius: 13, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, alignItems: "center", justifyContent: "center" },
  sheetActions: { flexDirection: "row", gap: 9, marginTop: 15 },
  clearBtn: { minHeight: 49, borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  clearBtnText: { color: MUTED, fontSize: 12, fontWeight: "900" },
  sheetPrimary: { flex: 1, minHeight: 49, borderRadius: 24, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16 },
  sheetPreview: { width: "100%", height: 185, borderRadius: 19, backgroundColor: "#e9edf5", marginBottom: 11 },
  sheetPreviewEmpty: { width: "100%", height: 150, borderRadius: 19, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", marginBottom: 11 },
  actionRow: { minHeight: 67, borderRadius: 17, borderWidth: 1, borderColor: BORDER, backgroundColor: SOFT, padding: 10, marginBottom: 9, flexDirection: "row", alignItems: "center", gap: 10 },
  actionIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center" },
  actionCopy: { flex: 1 },
  actionTitle: { color: TEXT, fontSize: 12, fontWeight: "900" },
  actionSub: { color: MUTED, fontSize: 9, lineHeight: 13, fontWeight: "700", marginTop: 2 },
  dangerRow: { backgroundColor: "#fff7f6", borderColor: "#f6d5d0" },
  dangerIcon: { backgroundColor: "#feeceb" },
  dangerTitle: { color: "#b42318", fontSize: 12, fontWeight: "900" },
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
