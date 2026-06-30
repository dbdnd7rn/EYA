import React from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, MapPin, Plus, Save, Ticket, Trash2, Upload } from "lucide-react-native";
import {
  listAdminTicketEvents,
  listAdminTicketOrders,
  upsertAdminTicketEvent,
  upsertAdminTicketTier,
  type AdminTicketEvent,
  type AdminTicketOrderSummary,
} from "@/lib/adminControlApi";
import { kwacha } from "@/lib/currency";
import { ticketPriceLabel, type TicketTier } from "@/lib/tickets";
import { useAuth } from "@/providers/AuthProvider";

type TicketStatus = "draft" | "published" | "cancelled" | "archived";

type EventDraft = {
  id: string;
  title: string;
  category: string;
  description: string;
  dateLabel: string;
  startsAt: string;
  endsAt: string;
  venue: string;
  city: string;
  image: string;
  heroImage: string;
  status: TicketStatus;
};

type TierDraft = {
  id: string;
  name: string;
  description: string;
  priceMwk: string;
  capacityTotal: string;
  available: boolean;
};

type UploadAsset = { uri: string; fileName?: string | null; mimeType?: string | null };
type EventImageKind = "card" | "hero";

const EMPTY_EVENT: EventDraft = {
  id: "",
  title: "",
  category: "Music",
  description: "",
  dateLabel: "",
  startsAt: "",
  endsAt: "",
  venue: "",
  city: "",
  image: "",
  heroImage: "",
  status: "draft",
};

const EMPTY_TIER: TierDraft = {
  id: "",
  name: "Standard",
  description: "",
  priceMwk: "",
  capacityTotal: "",
  available: true,
};

const STATUSES: TicketStatus[] = ["draft", "published", "cancelled", "archived"];

function eventToDraft(event: AdminTicketEvent): EventDraft {
  return {
    id: event.id,
    title: event.title,
    category: event.category || "Music",
    description: event.description || "",
    dateLabel: event.dateLabel || "",
    startsAt: event.startsAt || "",
    endsAt: event.endsAt || "",
    venue: event.venue || "",
    city: event.city || "",
    image: event.image || "",
    heroImage: event.heroImage || event.image || "",
    status: STATUSES.includes(event.status as TicketStatus) ? (event.status as TicketStatus) : "draft",
  };
}

function tierToDraft(tier: TicketTier): TierDraft {
  return {
    id: tier.id,
    name: tier.name,
    description: tier.description || "",
    priceMwk: String(tier.priceMwk || ""),
    capacityTotal: String(tier.capacityTotal || ""),
    available: tier.available !== false,
  };
}

function moneyInput(value: string) {
  const amount = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function integerInput(value: string) {
  const amount = Math.floor(Number(String(value || "").replace(/[^\d]/g, "")));
  return Number.isFinite(amount) ? amount : 0;
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/^\w/, (value) => value.toUpperCase());
}

function noticeErrorText(error: unknown, fallback: string) {
  const clean = (value: string) => {
    const text = value
      .replace(/TypeError:\s*Network request failed\s+TypeError:\s*Network request failed/i, "Network request failed")
      .replace(/TypeError:\s*/gi, "")
      .split(/\s+at\s+(?:anonymous|[A-Za-z_$])/)[0]
      .split(/\n\s*at\s+/)[0]
      .trim();
    return text || fallback;
  };

  if (!error) return fallback;
  if (typeof error === "string") return clean(error);
  if (error instanceof Error) return clean(error.message || fallback);
  if (typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    const text = [value.code, value.message, value.details, value.hint]
      .filter((part) => typeof part === "string" && part.trim().length > 0)
      .join(" ");
    return clean(text || fallback);
  }
  return clean(String(error) || fallback);
}

function getTicketImageUploadMeta(asset: UploadAsset, kind: EventImageKind) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const safeExt = ext === "heic" || ext === "heif" ? "jpg" : ext;
  return {
    name: `ticket-${kind}-${Date.now()}.${safeExt}`,
    type: asset.mimeType || (safeExt === "png" ? "image/png" : safeExt === "webp" ? "image/webp" : "image/jpeg"),
  };
}

async function uploadTicketEventImage(asset: UploadAsset, kind: EventImageKind) {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) throw new Error("Cloudinary upload is not configured.");

  const meta = getTicketImageUploadMeta(asset, kind);
  const form = new FormData();
  form.append("file", { uri: asset.uri, name: meta.name, type: meta.type } as any);
  form.append("upload_preset", uploadPreset);
  form.append("folder", "eya/tickets");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Could not upload ticket image.");
  return String(json.secure_url ?? "");
}

export default function AdminTicketingScreen() {
  const router = useRouter();
  const { user, session } = useAuth();
  const [events, setEvents] = React.useState<AdminTicketEvent[]>([]);
  const [orders, setOrders] = React.useState<AdminTicketOrderSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = React.useState("");
  const [eventDraft, setEventDraft] = React.useState<EventDraft>(EMPTY_EVENT);
  const [tierDraft, setTierDraft] = React.useState<TierDraft>(EMPTY_TIER);
  const [loading, setLoading] = React.useState(true);
  const [savingEvent, setSavingEvent] = React.useState(false);
  const [savingTier, setSavingTier] = React.useState(false);
  const [uploadingImage, setUploadingImage] = React.useState<EventImageKind | null>(null);
  const [notice, setNotice] = React.useState<{ type: "success" | "error"; text: string } | null>(null);
  const selectedEventIdRef = React.useRef("");
  const creatingEventRef = React.useRef(false);

  const selectedEvent = React.useMemo(() => {
    return events.find((event) => event.id === selectedEventId) ?? null;
  }, [events, selectedEventId]);

  const load = React.useCallback(
    async (preferredEventId?: string) => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const [nextEvents, nextOrders] = await Promise.all([
          listAdminTicketEvents({ userId: user.id, accessToken: session?.access_token, limit: 200 }),
          listAdminTicketOrders({ userId: user.id, accessToken: session?.access_token, limit: 30 }),
        ]);
        setEvents(nextEvents);
        setOrders(nextOrders);
        const shouldStayCreating = creatingEventRef.current && !preferredEventId;
        const nextSelected = shouldStayCreating
          ? null
          : nextEvents.find((event) => event.id === preferredEventId)
            ?? nextEvents.find((event) => event.id === selectedEventIdRef.current)
            ?? nextEvents[0]
            ?? null;
        if (nextSelected) {
          creatingEventRef.current = false;
          selectedEventIdRef.current = nextSelected.id;
          setSelectedEventId(nextSelected.id);
          setEventDraft(eventToDraft(nextSelected));
        } else {
          selectedEventIdRef.current = "";
          setSelectedEventId("");
          setEventDraft(EMPTY_EVENT);
        }
      } catch (error) {
        setNotice({ type: "error", text: noticeErrorText(error, "Could not load ticket admin data.") });
      } finally {
        setLoading(false);
      }
    },
    [session?.access_token, user?.id],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  const selectEvent = (event: AdminTicketEvent) => {
    creatingEventRef.current = false;
    selectedEventIdRef.current = event.id;
    setSelectedEventId(event.id);
    setEventDraft(eventToDraft(event));
    setTierDraft(EMPTY_TIER);
    setNotice(null);
  };

  const newEvent = () => {
    creatingEventRef.current = true;
    selectedEventIdRef.current = "";
    setSelectedEventId("");
    setEventDraft(EMPTY_EVENT);
    setTierDraft(EMPTY_TIER);
    setNotice(null);
  };

  const saveEvent = async () => {
    if (!user?.id) return;
    const required = [eventDraft.title, eventDraft.dateLabel, eventDraft.venue, eventDraft.city, eventDraft.image, eventDraft.heroImage];
    if (required.some((value) => !value.trim())) {
      setNotice({ type: "error", text: "Title, date, venue, city, card image, and hero image are required." });
      return;
    }

    try {
      setSavingEvent(true);
      setNotice(null);
      const saved = await upsertAdminTicketEvent({
        id: eventDraft.id || null,
        title: eventDraft.title.trim(),
        category: eventDraft.category.trim() || "Music",
        description: eventDraft.description.trim() || null,
        dateLabel: eventDraft.dateLabel.trim(),
        startsAt: eventDraft.startsAt.trim() || null,
        endsAt: eventDraft.endsAt.trim() || null,
        venue: eventDraft.venue.trim(),
        city: eventDraft.city.trim(),
        image: eventDraft.image.trim(),
        heroImage: eventDraft.heroImage.trim(),
        status: eventDraft.status,
        userId: user.id,
        accessToken: session?.access_token,
      });
      const savedId = String(saved.event?.id || eventDraft.id || "");
      creatingEventRef.current = false;
      selectedEventIdRef.current = savedId;
      setNotice({ type: "success", text: eventDraft.status === "published" ? "Ticket listing published." : "Ticket listing saved." });
      await load(savedId);
    } catch (error) {
      setNotice({ type: "error", text: noticeErrorText(error, "Could not save ticket listing.") });
    } finally {
      setSavingEvent(false);
    }
  };

  const pickEventImage = async (kind: EventImageKind) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "Allow photo access to upload the ticket image.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.88,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets?.[0]) return;

      setUploadingImage(kind);
      setNotice(null);
      const imageUrl = await uploadTicketEventImage(result.assets[0], kind);
      setEventDraft((draft) => ({
        ...draft,
        image: kind === "card" ? imageUrl : draft.image,
        heroImage: kind === "hero" ? imageUrl : draft.heroImage || imageUrl,
      }));
    } catch (error) {
      const message = noticeErrorText(error, "Could not upload ticket image.");
      setNotice({ type: "error", text: message });
      Alert.alert("Upload failed", message);
    } finally {
      setUploadingImage((current) => (current === kind ? null : current));
    }
  };

  const saveTier = async () => {
    if (!user?.id) return;
    const eventId = selectedEventId || eventDraft.id;
    const priceMwk = moneyInput(tierDraft.priceMwk);
    const capacityTotal = integerInput(tierDraft.capacityTotal);
    if (!eventId) {
      setNotice({ type: "error", text: "Save the event before adding ticket prices." });
      return;
    }
    if (!tierDraft.name.trim() || priceMwk < 0 || capacityTotal < 1) {
      setNotice({ type: "error", text: "Ticket name, price, and capacity are required." });
      return;
    }

    try {
      setSavingTier(true);
      setNotice(null);
      await upsertAdminTicketTier({
        id: tierDraft.id || null,
        eventId,
        name: tierDraft.name.trim(),
        description: tierDraft.description.trim(),
        priceMwk,
        capacityTotal,
        available: tierDraft.available,
        userId: user.id,
        accessToken: session?.access_token,
      });
      setTierDraft(EMPTY_TIER);
      setNotice({ type: "success", text: "Ticket price saved." });
      await load(eventId);
    } catch (error) {
      setNotice({ type: "error", text: noticeErrorText(error, "Could not save ticket price.") });
    } finally {
      setSavingTier(false);
    }
  };

  const totalCapacity = selectedEvent?.tiers.reduce((sum, tier) => sum + Number(tier.capacityTotal || 0), 0) ?? 0;
  const totalSold = selectedEvent?.tiers.reduce((sum, tier) => sum + Number(tier.capacitySold || 0), 0) ?? 0;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color="#102a54" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Admin ticketing</Text>
            <Text style={styles.title}>Events, prices, and check-ins</Text>
          </View>
          <Pressable style={styles.scanBtn} onPress={() => router.push("/admin/ticket-scanner")}>
            <Ticket size={18} color="#ffffff" />
          </Pressable>
        </View>

        {notice ? (
          <View style={[styles.notice, notice.type === "success" ? styles.noticeSuccess : styles.noticeError]}>
            {notice.type === "success" ? <CheckCircle2 size={17} color="#087443" /> : <Ticket size={17} color="#b42318" />}
            <Text style={[styles.noticeText, notice.type === "success" ? styles.noticeSuccessText : styles.noticeErrorText]}>{notice.text}</Text>
          </View>
        ) : null}

        <View style={styles.metricsRow}>
          <MetricCard label="Listings" value={String(events.length)} />
          <MetricCard label="Capacity" value={String(totalCapacity)} />
          <MetricCard label="Sold" value={String(totalSold)} />
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Ticket listings</Text>
          <Pressable style={styles.smallAction} onPress={newEvent}>
            <Plus size={16} color="#5c6ee6" />
            <Text style={styles.smallActionText}>New</Text>
          </Pressable>
        </View>

        <View style={styles.eventList}>
          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color="#5c6ee6" />
              <Text style={styles.loadingText}>Loading ticket listings...</Text>
            </View>
          ) : events.length ? (
            events.map((event) => (
              <Pressable key={event.id} style={[styles.eventCard, event.id === selectedEventId && styles.eventCardActive]} onPress={() => selectEvent(event)}>
                <Image source={{ uri: event.image }} style={styles.eventImage} />
                <View style={styles.eventCopy}>
                  <View style={styles.eventTop}>
                    <Text style={styles.statusPill}>{statusLabel(event.status || "draft")}</Text>
                    <Text style={styles.eventPrice}>{ticketPriceLabel(event)}</Text>
                  </View>
                  <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
                  <InfoRow icon={<CalendarDays size={13} color="#6a7590" />} text={event.dateLabel} />
                  <InfoRow icon={<MapPin size={13} color="#6a7590" />} text={`${event.venue}, ${event.city}`} />
                </View>
                <ChevronRight size={20} color="#8d99b3" />
              </Pressable>
            ))
          ) : (
            <View style={styles.loadingCard}>
              <Text style={styles.emptyTitle}>No ticket listings yet</Text>
              <Text style={styles.loadingText}>Create the first event, add ticket prices, then publish it for students.</Text>
            </View>
          )}
        </View>

        <View style={styles.editorCard}>
          <Text style={styles.sectionTitle}>{eventDraft.id ? "Edit event" : "Create event"}</Text>
          <Field label="Title" value={eventDraft.title} onChangeText={(title) => setEventDraft((draft) => ({ ...draft, title }))} placeholder="Event or concert name" />
          <View style={styles.twoCols}>
            <Field label="Category" value={eventDraft.category} onChangeText={(category) => setEventDraft((draft) => ({ ...draft, category }))} placeholder="Music" />
            <Field label="Date label" value={eventDraft.dateLabel} onChangeText={(dateLabel) => setEventDraft((draft) => ({ ...draft, dateLabel }))} placeholder="25 May 2026" />
          </View>
          <Field label="Description" value={eventDraft.description} onChangeText={(description) => setEventDraft((draft) => ({ ...draft, description }))} placeholder="What students should know before buying" multiline />
          <View style={styles.twoCols}>
            <Field label="Venue" value={eventDraft.venue} onChangeText={(venue) => setEventDraft((draft) => ({ ...draft, venue }))} placeholder="BICC" />
            <Field label="City" value={eventDraft.city} onChangeText={(city) => setEventDraft((draft) => ({ ...draft, city }))} placeholder="Lilongwe" />
          </View>
          <ImageUploadField
            label="Card image"
            value={eventDraft.image}
            uploading={uploadingImage === "card"}
            onUpload={() => void pickEventImage("card")}
            onRemove={() => setEventDraft((draft) => ({ ...draft, image: "", heroImage: draft.heroImage === draft.image ? "" : draft.heroImage }))}
          />
          <ImageUploadField
            label="Hero image"
            value={eventDraft.heroImage}
            uploading={uploadingImage === "hero"}
            onUpload={() => void pickEventImage("hero")}
            onRemove={() => setEventDraft((draft) => ({ ...draft, heroImage: "" }))}
          />

          <Text style={styles.inputLabel}>Status</Text>
          <View style={styles.statusRow}>
            {STATUSES.map((status) => (
              <Pressable key={status} style={[styles.statusChoice, eventDraft.status === status && styles.statusChoiceActive]} onPress={() => setEventDraft((draft) => ({ ...draft, status }))}>
                <Text style={[styles.statusChoiceText, eventDraft.status === status && styles.statusChoiceTextActive]}>{statusLabel(status)}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={[styles.primaryBtn, savingEvent && styles.disabled]} onPress={saveEvent} disabled={savingEvent}>
            {savingEvent ? <ActivityIndicator color="#ffffff" size="small" /> : <Save size={17} color="#ffffff" />}
            <Text style={styles.primaryBtnText}>{savingEvent ? "Saving..." : eventDraft.status === "published" ? "Save and publish" : "Save event"}</Text>
          </Pressable>
        </View>

        <View style={styles.editorCard}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Ticket prices</Text>
            {tierDraft.id ? (
              <Pressable style={styles.smallAction} onPress={() => setTierDraft(EMPTY_TIER)}>
                <Plus size={16} color="#5c6ee6" />
                <Text style={styles.smallActionText}>New price</Text>
              </Pressable>
            ) : null}
          </View>

          {selectedEvent ? (
            <View style={styles.tierList}>
              {selectedEvent.tiers.map((tier) => (
                <Pressable key={tier.id} style={styles.tierRow} onPress={() => setTierDraft(tierToDraft(tier))}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tierName}>{tier.name}</Text>
                    <Text style={styles.tierMeta}>{tier.description || "No description"}</Text>
                  </View>
                  <View style={styles.tierRight}>
                    <Text style={styles.tierPrice}>{kwacha(tier.priceMwk)}</Text>
                    <Text style={styles.tierMeta}>{Number(tier.capacitySold || 0)} / {Number(tier.capacityTotal || 0)} sold</Text>
                  </View>
                </Pressable>
              ))}
              {!selectedEvent.tiers.length ? <Text style={styles.loadingText}>No prices yet. Add Standard, VIP, Early Bird, or any ticket type.</Text> : null}
            </View>
          ) : (
            <Text style={styles.loadingText}>Save or select an event before adding ticket prices.</Text>
          )}

          <Field label="Ticket name" value={tierDraft.name} onChangeText={(name) => setTierDraft((draft) => ({ ...draft, name }))} placeholder="Standard" />
          <Field label="Description" value={tierDraft.description} onChangeText={(description) => setTierDraft((draft) => ({ ...draft, description }))} placeholder="General event entry" />
          <View style={styles.twoCols}>
            <Field label="Price MWK" value={tierDraft.priceMwk} onChangeText={(priceMwk) => setTierDraft((draft) => ({ ...draft, priceMwk }))} placeholder="50000" keyboardType="numeric" />
            <Field label="Capacity" value={tierDraft.capacityTotal} onChangeText={(capacityTotal) => setTierDraft((draft) => ({ ...draft, capacityTotal }))} placeholder="500" keyboardType="numeric" />
          </View>
          <Pressable style={styles.availabilityRow} onPress={() => setTierDraft((draft) => ({ ...draft, available: !draft.available }))}>
            <View style={[styles.checkbox, tierDraft.available && styles.checkboxActive]} />
            <Text style={styles.availabilityText}>Available for sale</Text>
          </Pressable>
          <Pressable style={[styles.primaryBtn, savingTier && styles.disabled]} onPress={saveTier} disabled={savingTier}>
            {savingTier ? <ActivityIndicator color="#ffffff" size="small" /> : <Save size={17} color="#ffffff" />}
            <Text style={styles.primaryBtnText}>{savingTier ? "Saving..." : tierDraft.id ? "Save price" : "Add price"}</Text>
          </Pressable>
        </View>

        <View style={styles.editorCard}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Recent ticket orders</Text>
            <ClipboardList size={19} color="#5c6ee6" />
          </View>
          <View style={styles.orderList}>
            {orders.map((order) => (
              <View key={order.id} style={styles.orderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderTitle}>{order.event?.title ?? "Ticket order"}</Text>
                  <Text style={styles.orderMeta}>{order.user?.full_name || order.user?.email || "Buyer"} - {order.tier?.name ?? "Ticket"}</Text>
                </View>
                <View style={styles.orderRight}>
                  <Text style={styles.orderAmount}>{kwacha(Number(order.total_mwk || 0))}</Text>
                  <Text style={styles.orderMeta}>{statusLabel(order.payment_status)}</Text>
                </View>
              </View>
            ))}
            {!orders.length ? <Text style={styles.loadingText}>Ticket purchases will appear here after students buy.</Text> : null}
          </View>
        </View>
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

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8d99b3"
        keyboardType={keyboardType}
        multiline={multiline}
        style={[styles.input, multiline && styles.multilineInput]}
      />
    </View>
  );
}

function ImageUploadField({
  label,
  value,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string;
  value: string;
  uploading: boolean;
  onUpload: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Pressable style={[styles.imageUploadCard, uploading && styles.disabled]} onPress={onUpload} disabled={uploading}>
        {value ? (
          <Image source={{ uri: value }} style={styles.imageUploadPreview} resizeMode="cover" />
        ) : (
          <View style={styles.imageUploadEmpty}>
            {uploading ? <ActivityIndicator color="#5c6ee6" /> : <Upload size={22} color="#5c6ee6" />}
            <Text style={styles.imageUploadTitle}>{uploading ? "Uploading image..." : `Upload ${label.toLowerCase()}`}</Text>
            <Text style={styles.imageUploadSub}>Choose a photo from this device</Text>
          </View>
        )}
      </Pressable>
      {value ? (
        <View style={styles.imageActionsRow}>
          <Pressable style={styles.imageActionBtn} onPress={onUpload} disabled={uploading}>
            {uploading ? <ActivityIndicator color="#5c6ee6" size="small" /> : <Upload size={15} color="#5c6ee6" />}
            <Text style={styles.imageActionText}>{uploading ? "Uploading..." : "Replace"}</Text>
          </Pressable>
          <Pressable style={[styles.imageActionBtn, styles.imageRemoveBtn]} onPress={onRemove} disabled={uploading}>
            <Trash2 size={15} color="#b42318" />
            <Text style={[styles.imageActionText, styles.imageRemoveText]}>Remove</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={styles.infoRow}>
      {icon}
      <Text style={styles.infoText} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f7ff" },
  content: { padding: 16, paddingBottom: 42, gap: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 4 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e0e6f5", alignItems: "center", justifyContent: "center" },
  scanBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#5c6ee6", alignItems: "center", justifyContent: "center" },
  kicker: { color: "#73809d", fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  title: { color: "#102a54", fontSize: 25, lineHeight: 30, fontWeight: "900" },
  notice: { borderRadius: 18, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  noticeSuccess: { backgroundColor: "#f0fff7", borderColor: "#b8efd2" },
  noticeError: { backgroundColor: "#fff4f3", borderColor: "#ffd1cc" },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "800" },
  noticeSuccessText: { color: "#087443" },
  noticeErrorText: { color: "#b42318" },
  metricsRow: { flexDirection: "row", gap: 10 },
  metricCard: { flex: 1, borderRadius: 20, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e0e6f5", padding: 14, gap: 3 },
  metricValue: { color: "#102a54", fontSize: 21, fontWeight: "900" },
  metricLabel: { color: "#73809d", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  sectionTitle: { color: "#102a54", fontSize: 18, fontWeight: "900" },
  smallAction: { minHeight: 38, borderRadius: 14, backgroundColor: "#eef2ff", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  smallActionText: { color: "#5c6ee6", fontSize: 12, fontWeight: "900" },
  eventList: { gap: 10 },
  loadingCard: { borderRadius: 22, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e0e6f5", padding: 18, alignItems: "center", gap: 8 },
  loadingText: { color: "#6a7590", fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center" },
  emptyTitle: { color: "#102a54", fontSize: 17, fontWeight: "900", textAlign: "center" },
  eventCard: { borderRadius: 22, borderWidth: 1, borderColor: "#e0e6f5", backgroundColor: "#ffffff", padding: 10, flexDirection: "row", alignItems: "center", gap: 11 },
  eventCardActive: { borderColor: "#5c6ee6", backgroundColor: "#f9fbff" },
  eventImage: { width: 72, height: 82, borderRadius: 16, backgroundColor: "#eef2ff" },
  eventCopy: { flex: 1, gap: 5 },
  eventTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  statusPill: { overflow: "hidden", borderRadius: 999, backgroundColor: "#eef2ff", color: "#5c6ee6", paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: "900" },
  eventPrice: { color: "#102a54", fontSize: 12, fontWeight: "900" },
  eventTitle: { color: "#102a54", fontSize: 15, lineHeight: 19, fontWeight: "900" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  infoText: { flex: 1, color: "#6a7590", fontSize: 12, fontWeight: "700" },
  editorCard: { borderRadius: 26, borderWidth: 1, borderColor: "#e0e6f5", backgroundColor: "#ffffff", padding: 16, gap: 13 },
  twoCols: { flexDirection: "row", gap: 10 },
  field: { flex: 1, gap: 6 },
  inputLabel: { color: "#102a54", fontSize: 12, fontWeight: "900", textTransform: "uppercase" },
  input: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: "#dfe5f4", backgroundColor: "#fbfcff", paddingHorizontal: 13, color: "#102a54", fontSize: 14, fontWeight: "800" },
  multilineInput: { minHeight: 90, paddingTop: 12, textAlignVertical: "top" },
  imageUploadCard: {
    minHeight: 164,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dfe5f4",
    backgroundColor: "#fbfcff",
    overflow: "hidden",
  },
  imageUploadPreview: { width: "100%", height: 178, backgroundColor: "#eef2ff" },
  imageUploadEmpty: {
    minHeight: 164,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  imageUploadTitle: { color: "#102a54", fontSize: 14, fontWeight: "900", textAlign: "center" },
  imageUploadSub: { color: "#6a7590", fontSize: 12, fontWeight: "700", textAlign: "center" },
  imageActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  imageActionBtn: {
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dfe5f4",
    backgroundColor: "#eef2ff",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  imageActionText: { color: "#5c6ee6", fontSize: 12, fontWeight: "900" },
  imageRemoveBtn: { backgroundColor: "#fff4f3", borderColor: "#ffd1cc" },
  imageRemoveText: { color: "#b42318" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusChoice: { borderRadius: 999, borderWidth: 1, borderColor: "#dfe5f4", backgroundColor: "#fbfcff", paddingHorizontal: 12, paddingVertical: 9 },
  statusChoiceActive: { borderColor: "#5c6ee6", backgroundColor: "#eef2ff" },
  statusChoiceText: { color: "#6a7590", fontSize: 12, fontWeight: "900" },
  statusChoiceTextActive: { color: "#5c6ee6" },
  primaryBtn: { minHeight: 52, borderRadius: 17, backgroundColor: "#5c6ee6", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.62 },
  tierList: { gap: 9 },
  tierRow: { borderRadius: 18, borderWidth: 1, borderColor: "#e0e6f5", backgroundColor: "#fbfcff", padding: 12, flexDirection: "row", gap: 10 },
  tierName: { color: "#102a54", fontSize: 14, fontWeight: "900" },
  tierMeta: { marginTop: 3, color: "#6a7590", fontSize: 12, fontWeight: "700" },
  tierRight: { alignItems: "flex-end", justifyContent: "space-between" },
  tierPrice: { color: "#102a54", fontSize: 14, fontWeight: "900" },
  availabilityRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: "#cfd8eb", backgroundColor: "#ffffff" },
  checkboxActive: { borderColor: "#5c6ee6", backgroundColor: "#5c6ee6" },
  availabilityText: { color: "#102a54", fontSize: 13, fontWeight: "900" },
  orderList: { gap: 9 },
  orderRow: { borderRadius: 18, backgroundColor: "#fbfcff", borderWidth: 1, borderColor: "#e0e6f5", padding: 12, flexDirection: "row", gap: 12 },
  orderTitle: { color: "#102a54", fontSize: 14, fontWeight: "900" },
  orderMeta: { marginTop: 3, color: "#6a7590", fontSize: 12, fontWeight: "700" },
  orderRight: { alignItems: "flex-end", justifyContent: "space-between" },
  orderAmount: { color: "#102a54", fontSize: 13, fontWeight: "900" },
});
