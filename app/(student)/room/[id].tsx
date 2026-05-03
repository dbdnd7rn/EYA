/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Armchair,
  BadgeCheck,
  Bath,
  BatteryCharging,
  Bed,
  Bus,
  ClipboardList,
  CookingPot,
  Droplets,
  Fence,
  Flame,
  Refrigerator,
  ShieldCheck,
  ShowerHead,
  Star,
  Tv,
  Video,
  WashingMachine,
  Waves,
  Wifi,
  Zap,
  ArrowLeft,
  MessageCircle,
  Heart,
  Phone,
} from "lucide-react-native";
import RoomLocationMap from "@/components/RoomLocationMap";
import { formatCacheTime, getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { notifyEnquiryParticipant, previewEnquiryText } from "@/lib/enquiryNotifications";
import { getSavedStatusWithPending, queueOfflineSaveToggle } from "@/lib/savedRoomsOffline";
import { supabase } from "@/lib/supabase";
import { goBackOrFallback } from "@/lib/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";

type Role = "student" | "landlord" | "admin";
type Billing = "inclusive" | "exclusive";
type OccupancyMode = "single" | "shared";
type ListingType = "hostel" | "bedsitter";
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

const AMENITY_GROUPS: { title: string; items: { key: AmenityKey; label: string }[] }[] = [
  { title: "Essentials", items: [
    { key: "wifi", label: "Wi-Fi" }, { key: "water_included", label: "Water included" }, { key: "electricity_included", label: "Electricity included" },
    { key: "backup_power", label: "Backup power" }, { key: "borehole", label: "Borehole" }, { key: "water_tank", label: "Water tank" },
    { key: "geyser", label: "Geyser (hot water)" }, { key: "ceiling", label: "Ceiling" }, { key: "laundry_service", label: "Laundry service" },
  ]},
  { title: "Furniture", items: [
    { key: "bed", label: "Bed" }, { key: "mattress", label: "Mattress" }, { key: "wardrobe", label: "Wardrobe" },
    { key: "study_desk", label: "Study desk" }, { key: "chair", label: "Chair" }, { key: "tv", label: "TV" },
  ]},
  { title: "Kitchen & appliances", items: [
    { key: "fridge", label: "Fridge" }, { key: "cooker", label: "Cooker / stove" }, { key: "private_kitchen", label: "Private kitchen" }, { key: "shared_kitchen", label: "Shared kitchen" },
  ]},
  { title: "Bathroom", items: [
    { key: "private_bathroom", label: "Private bathroom" }, { key: "shared_bathroom", label: "Shared bathroom" }, { key: "shower", label: "Shower" },
    { key: "bathtub", label: "Bathtub" }, { key: "toilet_inside", label: "Toilet inside" }, { key: "toilet_outside", label: "Toilet outside" },
  ]},
  { title: "Security", items: [
    { key: "security_guard", label: "Security guard" }, { key: "security_cameras", label: "Security cameras" }, { key: "fenced", label: "Fenced compound" },
  ]},
  { title: "Location", items: [{ key: "transport_nearby", label: "Transport nearby" }] },
];

const AMENITY_ICONS: Partial<Record<AmenityKey, any>> = {
  wifi: Wifi,
  water_included: Droplets,
  electricity_included: Zap,
  backup_power: BatteryCharging,
  borehole: Waves,
  water_tank: Droplets,
  geyser: Flame,
  ceiling: ClipboardList,
  laundry_service: WashingMachine,
  bed: Bed,
  mattress: Bed,
  wardrobe: ClipboardList,
  study_desk: ClipboardList,
  chair: Armchair,
  tv: Tv,
  fridge: Refrigerator,
  cooker: CookingPot,
  private_kitchen: CookingPot,
  shared_kitchen: CookingPot,
  private_bathroom: Bath,
  shared_bathroom: Bath,
  shower: ShowerHead,
  bathtub: Bath,
  toilet_inside: Bath,
  toilet_outside: Bath,
  security_guard: ShieldCheck,
  security_cameras: Video,
  fenced: Fence,
  transport_nearby: Bus,
};

type Listing = {
  id: string;
  landlord_id: string | null;
  title: string;
  contact_phone: string | null;
  contact_method: "whatsapp" | "call" | "both" | null;
  description: string | null;
  amenities?: string[] | null;
  listing_type: ListingType;
  campus: string | null;
  area: string | null;
  city: string | null;
  price_from: number | null;
  total_rooms: number | null;
  room_types: string[] | null;
  image_urls: string[] | null;
  latitude: number | null;
  longitude: number | null;
  occupancy_mode: OccupancyMode | null;
  students_per_room: number | null;
  gender_policy?: string | null;
  rules?: string[] | null;
  water_billing?: Billing | null;
  electricity_billing?: Billing | null;
};

type ReviewRow = {
  id: string;
  listing_id: string;
  student_id: string | null;
  rating: number | null;
  comment: string | null;
  created_at: string | null;
};

function formatPrice(amount?: number | null) {
  if (!amount) return "Ask landlord";
  return `K${Number(amount).toLocaleString("en-MW")}`;
}

function buildLandlordPrompt(listing: Listing) {
  if (!listing.price_from || listing.price_from <= 0) {
    return `Hi, is "${listing.title}" still available, and how much is it per month?`;
  }
  return `Hi, is "${listing.title}" still available?`;
}

function toDialPhone(phone?: string | null) {
  const clean = String(phone ?? "").trim();
  if (!clean) return null;
  return clean.startsWith("+") ? clean : `+${clean}`;
}

function toWhatsAppPhone(phone?: string | null) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits || null;
}

function safeNum(n: any) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function describeBilling(billing?: Billing | null, fallbackAmenity?: boolean) {
  if (billing === "inclusive") return "Included in rent";
  if (billing === "exclusive") return "Pay separately";
  if (fallbackAmenity) return "Included in rent";
  return "Not specified";
}

function StarsRow({ avg }: { avg: number }) {
  const rounded = Math.round(avg);
  const full = Math.max(0, Math.min(5, rounded));
  const empty = 5 - full;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f${i}`} size={14} color="#ff0f64" fill="#ff0f64" />
      ))}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e${i}`} size={14} color="#c3c9d9" />
      ))}
    </View>
  );
}

function AmenityRowIcon({ amenity }: { amenity: AmenityKey }) {
  const Icon = AMENITY_ICONS[amenity];
  if (!Icon) {
    return (
      <View style={styles.amenityIconWrap}>
        <BadgeCheck size={16} color="#ff0f64" />
      </View>
    );
  }

  return (
    <View style={styles.amenityIconWrap}>
      <Icon size={16} color="#ff0f64" />
    </View>
  );
}

export default function RoomDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : null;
  const { user } = useAuth();
  const { isOnline } = useNetwork();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [listingCacheTime, setListingCacheTime] = useState<number | null>(null);
  const [usingCachedListing, setUsingCachedListing] = useState(false);

  const [uid, setUid] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [reviewsCacheTime, setReviewsCacheTime] = useState<number | null>(null);
  const [ratingAvg, setRatingAvg] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);

  const [myRating, setMyRating] = useState(0);
  const [myComment, setMyComment] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  const [showEnquiry, setShowEnquiry] = useState(false);
  const [enquiryText, setEnquiryText] = useState("");
  const [sendingEnquiry, setSendingEnquiry] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportCategory, setReportCategory] = useState("scam");
  const [reportMessage, setReportMessage] = useState("");
  const [sendingReport, setSendingReport] = useState(false);
  const [reportDone, setReportDone] = useState<string | null>(null);
  const [showAllAmenities, setShowAllAmenities] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verifLoading, setVerifLoading] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const sectionStep = 0.08;
  const sectionWindow = 0.24;

  const photos = listing?.image_urls ?? [];
  const primaryPhoto = photos[0] ?? null;
  const amenitiesSet = useMemo(() => new Set((listing?.amenities ?? []).filter(Boolean)), [listing?.amenities]);
  const totalAmenitiesCount = (listing?.amenities ?? []).length;
  const collapsedAmenitiesLimit = 8;

  const waterLabel = describeBilling(listing?.water_billing ?? null, amenitiesSet.has("water_included"));
  const electricityLabel = describeBilling(listing?.electricity_billing ?? null, amenitiesSet.has("electricity_included"));

  const mapsHref = listing?.latitude != null && listing?.longitude != null
    ? `https://www.google.com/maps?q=${listing.latitude},${listing.longitude}`
    : null;

  const occupancyLabel = listing?.occupancy_mode === "shared"
    ? `Shared - up to ${listing.students_per_room ?? "-"} students/room`
    : "Single - 1 student/room";
  const dialPhone = toDialPhone(listing?.contact_phone);
  const whatsappPhone = toWhatsAppPhone(listing?.contact_phone);

  const amenitySections = useMemo(() => {
    let remaining = showAllAmenities ? Number.MAX_SAFE_INTEGER : collapsedAmenitiesLimit;

    return AMENITY_GROUPS.map((group) => {
      const present = group.items.filter((it) => (listing?.amenities ?? []).includes(it.key));
      if (!present.length) return null;

      if (showAllAmenities) {
        return { group, shown: present, hiddenCount: 0 };
      }

      if (remaining <= 0) {
        return { group, shown: [] as typeof present, hiddenCount: present.length };
      }

      const shown = present.slice(0, remaining);
      remaining -= shown.length;
      return { group, shown, hiddenCount: present.length - shown.length };
    }).filter(Boolean) as { group: typeof AMENITY_GROUPS[number]; shown: { key: AmenityKey; label: string }[]; hiddenCount: number }[];
  }, [listing?.amenities, showAllAmenities]);

  const sectionAnim = (index: number) => ({
    opacity: reveal.interpolate({
      inputRange: [index * sectionStep, index * sectionStep + sectionWindow],
      outputRange: [0, 1],
      extrapolate: "clamp",
    }),
    transform: [
      {
        translateY: reveal.interpolate({
          inputRange: [index * sectionStep, index * sectionStep + sectionWindow],
          outputRange: [16, 0],
          extrapolate: "clamp",
        }),
      },
    ],
  });

  const computeSummary = (rows: ReviewRow[]) => {
    const vals = rows.map((r) => safeNum(r.rating)).filter((x) => x >= 1 && x <= 5);
    const count = vals.length;
    const avg = count ? vals.reduce((a, b) => a + b, 0) / count : 0;
    setRatingCount(count);
    setRatingAvg(avg);
  };

  const loadAuth = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const authUser = data.user;

      if (!authUser) {
        setUid(null);
        setRole(null);
        return;
      }

      setUid(authUser.id);

      const { data: prof } = await supabase.from("profiles").select("role").eq("id", authUser.id).maybeSingle();
      setRole(((prof?.role as Role) ?? "student") as Role);
    } catch {
      // Keep local auth state best-effort when offline.
    }
  };

  const loadListing = async (opts?: { silent?: boolean }) => {
    if (!id) {
      setErr("Missing room id.");
      setLoading(false);
      return null;
    }

    if (!opts?.silent) setLoading(true);
    setErr(null);

    try {
      const { data, error } = await supabase
        .from("listings")
        .select("id, landlord_id, title, contact_phone, contact_method, description, listing_type, campus, area, city, price_from, total_rooms, room_types, image_urls, latitude, longitude, occupancy_mode, students_per_room, gender_policy, rules, amenities, water_billing, electricity_billing")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setErr("Room not found.");
        setListing(null);
        if (!opts?.silent) setLoading(false);
        return null;
      }

      setListing(data as Listing);
      setUsingCachedListing(false);
      setListingCacheTime(Date.now());
      await setCachedJson(`room_detail:${id}`, data as Listing);
      if (!opts?.silent) setLoading(false);
      return data as Listing;
    } catch (e: any) {
      const cached = await getCachedJson<Listing>(`room_detail:${id}`);
      if (cached?.data) {
        setListing(cached.data);
        setUsingCachedListing(true);
        setListingCacheTime(cached.ts);
        setErr(null);
        if (!opts?.silent) setLoading(false);
        return cached.data;
      }

      setErr(e?.message ?? "Failed to load room.");
      setListing(null);
      if (!opts?.silent) setLoading(false);
      return null;
    }
  };

  const loadReviews = async () => {
    if (!id) return;

    setReviewsLoading(true);

    try {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, listing_id, student_id, rating, comment, created_at")
        .eq("listing_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as ReviewRow[];
      setReviews(rows);
      computeSummary(rows);
      setReviewsCacheTime(Date.now());
      await setCachedJson(`room_reviews:${id}`, rows);
    } catch {
      const cached = await getCachedJson<ReviewRow[]>(`room_reviews:${id}`);
      const rows = cached?.data ?? [];
      setReviews(rows);
      computeSummary(rows);
      setReviewsCacheTime(cached?.ts ?? null);
    } finally {
      setReviewsLoading(false);
    }
  };

  const loadVerifiedForLandlord = async (landlordId: string | null) => {
    if (!landlordId) {
      setIsVerified(false);
      return;
    }
    setVerifLoading(true);
    const { data, error } = await supabase
      .from("landlord_public_verification")
      .select("is_verified")
      .eq("landlord_id", landlordId)
      .maybeSingle();
    setIsVerified(!error && Boolean((data as any)?.is_verified));
    setVerifLoading(false);
  };

  const loadMyReview = async (userId: string) => {
    if (!id) return;

    const { data } = await supabase.from("reviews").select("rating, comment").eq("listing_id", id).eq("student_id", userId).maybeSingle();

    if (data) {
      setMyRating(Math.max(0, Math.min(5, safeNum((data as any).rating))));
      setMyComment(((data as any).comment ?? "").toString());
      return;
    }

    setMyRating(0);
    setMyComment("");
  };

  const checkSaved = async (userId: string) => {
    if (!id) return;
    if (!isOnline) {
      setSaved(await getSavedStatusWithPending(userId, id));
      return;
    }

    const { data } = await supabase.from("saved_rooms").select("id").eq("student_id", userId).eq("listing_id", id).maybeSingle();
    setSaved(!!data);
  };

  const toggleSave = async () => {
    if (!uid || role !== "student") {
      Alert.alert("Login as a student to save rooms");
      return;
    }
    if (!id) {
      Alert.alert("Missing room id.");
      return;
    }

    setSaving(true);

    if (!isOnline) {
      const nextSaved = !saved;
      await queueOfflineSaveToggle({
        studentId: uid,
        listingId: id,
        nextSaved,
        snapshot: listing
          ? {
              id: listing.id,
              title: listing.title,
              listing_type: listing.listing_type,
              campus: listing.campus,
              area: listing.area,
              city: listing.city,
              price_from: listing.price_from,
              room_types: listing.room_types ?? null,
              image_urls: listing.image_urls ?? null,
              latitude: listing.latitude,
              longitude: listing.longitude,
              created_at: null,
            }
          : null,
      });
      setSaved(nextSaved);
      setSaving(false);
      Alert.alert("Offline", nextSaved ? "Room saved offline. It will sync when you're back online." : "Removal queued. It will sync when you're back online.");
      return;
    }

    if (saved) {
      const { error } = await supabase.from("saved_rooms").delete().eq("student_id", uid).eq("listing_id", id);
      if (error) {
        Alert.alert(error.message);
        setSaving(false);
        return;
      }
      setSaved(false);
    } else {
      const { error } = await supabase.from("saved_rooms").insert({ student_id: uid, listing_id: id });
      if (error) {
        Alert.alert(error.message);
        setSaving(false);
        return;
      }
      setSaved(true);
    }

    setSaving(false);
  };

  const submitReview = async () => {
    if (!isOnline) return Alert.alert("Offline", "Submitting reviews needs internet.");
    if (!id) return;

    if (!uid) return Alert.alert("Please login as a student to write a review.");
    if (role !== "student") return Alert.alert("Only students can write reviews.");
    if (myRating < 1 || myRating > 5) return Alert.alert("Please select a rating (1-5).");

    setSavingReview(true);

    const { error } = await supabase.from("reviews").upsert(
      {
        student_id: uid,
        listing_id: id,
        landlord_id: listing?.landlord_id ?? null,
        rating: myRating,
        comment: myComment.trim() ? myComment.trim() : null,
      },
      { onConflict: "student_id,listing_id" },
    );

    setSavingReview(false);

    if (error) return Alert.alert(error.message);

    Alert.alert("Review saved");
    await loadReviews();
  };

  const submitEnquiry = async () => {
    if (!isOnline) {
      Alert.alert("Offline", "Sending enquiries needs internet.");
      return;
    }
    if (!uid || !listing?.landlord_id) return;

    const trimmedMessage = enquiryText.trim();
    if (!trimmedMessage) return;

    setSendingEnquiry(true);

    const { data, error } = await supabase
      .from("enquiries")
      .insert({
        student_id: uid,
        landlord_id: listing.landlord_id,
        listing_id: listing.id,
        message: trimmedMessage,
        status: "new",
      })
      .select()
      .single();

    setSendingEnquiry(false);

    if (error) return Alert.alert(error.message);

    setShowEnquiry(false);
    setEnquiryText("");

    if (data?.id) {
      await Promise.allSettled([
        supabase.from("messages").insert({
          enquiry_id: data.id,
          sender_id: uid,
          receiver_id: listing.landlord_id,
          sender_role: "student",
          receiver_role: "landlord",
          message_type: "text",
          content: trimmedMessage,
          image_url: null,
        }),
        notifyEnquiryParticipant({
          recipientId: listing.landlord_id,
          recipientRole: "landlord",
          enquiryId: data.id,
          listingId: listing.id,
          listingTitle: listing.title,
          title: "New room enquiry",
          message: `${listing.title}: ${previewEnquiryText(trimmedMessage)}`,
          extraData: {
            senderRole: "student",
          },
        }),
      ]);

      router.push({ pathname: "/(student)/chat/[enquiryId]", params: { enquiryId: data.id } });
    }
  };

  const submitReport = async () => {
    if (!isOnline) {
      Alert.alert("Offline", "Reporting listings needs internet.");
      return;
    }
    if (!uid || !listing?.id || !reportMessage.trim()) return;

    setSendingReport(true);
    setReportDone(null);

    const { error } = await supabase.from("listing_reports").insert({
      listing_id: listing.id,
      reporter_id: uid,
      category: reportCategory,
      message: reportMessage.trim(),
    });

    if (error) {
      setReportDone(error.message);
      setSendingReport(false);
      return;
    }

    setReportDone("Report submitted. Thanks for helping!");
    setReportMessage("");
    setSendingReport(false);
    setTimeout(() => setShowReport(false), 800);
  };

  useEffect(() => {
    const init = async () => {
      setSaved(false);
      setMyRating(0);
      setMyComment("");
      await loadAuth();
      const listingData = await loadListing();
      await loadVerifiedForLandlord(listingData?.landlord_id ?? null);
      await loadReviews();

      const authUserId = user?.id;
      if (authUserId) {
        await loadMyReview(authUserId);
        await checkSaved(authUserId);
      }
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void (async () => {
        await loadAuth();
        await loadVerifiedForLandlord(listing?.landlord_id ?? null);

        const { data } = await supabase.auth.getUser();
        if (data.user?.id) {
          await loadMyReview(data.user.id);
          await checkSaved(data.user.id);
        } else {
          setSaved(false);
          setMyRating(0);
          setMyComment("");
        }
      })();
    });

    return () => sub.subscription.unsubscribe();
  }, [id, user?.id]);

  const refreshAll = async () => {
    if (loading) return;
    setRefreshing(true);
    try {
      const listingData = await loadListing({ silent: true });
      await loadVerifiedForLandlord(listingData?.landlord_id ?? null);
      await loadReviews();
      const authUserId = user?.id;
      if (authUserId) {
        await loadMyReview(authUserId);
        await checkSaved(authUserId);
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (loading || !listing) return;
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [loading, listing?.id, reveal]);

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.skeletonWrap}>
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={[styles.skeletonCard, i === 0 ? styles.skeletonHero : null]} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor="#ff0f64" />}
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => goBackOrFallback(router, "/(student)/(tabs)/rooms")} style={styles.backRow}>
          <ArrowLeft size={16} color="#0e2756" />
          <Text style={styles.backText}>Back to Stay</Text>
        </Pressable>

        {err ? (
          <View style={styles.errorBox}><Text style={styles.errorText}>{err}</Text></View>
        ) : null}
        {usingCachedListing && listingCacheTime ? (
          <Text style={styles.cacheMeta}>Cached room data from {formatCacheTime(listingCacheTime)}</Text>
        ) : null}

        {!listing ? null : (
          <>
            <Animated.View style={[styles.heroWrap, sectionAnim(0)]}>
              {primaryPhoto ? (
                <Image source={{ uri: primaryPhoto }} style={styles.hero} resizeMode="cover" />
              ) : (
                <View style={[styles.hero, styles.heroPlaceholder]}>
                  <Text style={{ color: "#0e2756", fontWeight: "700" }}>No photo yet</Text>
                </View>
              )}
              {isVerified ? (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedBadgeText}>VERIFIED</Text>
                </View>
              ) : null}
            </Animated.View>

            {photos.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingRight: 6 }}
                snapToInterval={98}
                decelerationRate="fast"
                disableIntervalMomentum
              >
                {photos.slice(0, 10).map((p, i) => (
                  <View key={`${p}-${i}`} style={styles.thumb}><Image source={{ uri: p }} style={styles.thumbImg} resizeMode="cover" /></View>
                ))}
              </ScrollView>
            ) : null}

            <Animated.View style={[styles.card, sectionAnim(1)]}>
              <View style={styles.titleTagRow}>
                <Text style={styles.typeText}>{listing.listing_type === "hostel" ? "Hostel" : "Bedsitter"}</Text>
                {isVerified ? (
                  <View style={styles.inlineVerifiedPill}>
                    <BadgeCheck size={12} color="#fff" />
                    <Text style={styles.inlineVerifiedPillText}>Verified</Text>
                  </View>
                ) : null}
                {verifLoading ? <Text style={styles.smallMuted}>Checking verification...</Text> : null}
              </View>
              <Text style={styles.title}>{listing.title}</Text>
              <Text style={styles.muted}>{[listing.area, listing.city, listing.campus].filter(Boolean).join(" â€¢ ") || "Location on enquiry"}</Text>
              <View style={styles.quickStatsRow}>
                <View style={styles.quickStat}>
                  <Text style={styles.quickStatLabel}>Price</Text>
                  <Text style={styles.quickStatValue}>{formatPrice(listing.price_from)}</Text>
                  <Text style={styles.quickStatSub}>/ month</Text>
                </View>
                <View style={styles.quickStat}>
                  <Text style={styles.quickStatLabel}>Occupancy</Text>
                  <Text style={styles.quickStatValueSm} numberOfLines={2}>{occupancyLabel}</Text>
                </View>
              </View>
              {listing.description ? <Text style={styles.desc}>{listing.description}</Text> : null}
            </Animated.View>

            <Animated.View style={[styles.card, sectionAnim(2)]}>
              <Text style={styles.sectionTitle}>Room details</Text>
              <Text style={styles.sectionSub}>Billing, occupancy and room setup.</Text>
              <View style={styles.detailGrid}>
                <View style={styles.detailCell}>
                  <Text style={styles.detailCellLabel}>Occupancy</Text>
                  <Text style={styles.detailCellValue}>{occupancyLabel}</Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.detailCellLabel}>Tenants allowed</Text>
                  <Text style={styles.detailCellValue}>{listing.gender_policy ?? "-"}</Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.detailCellLabel}>Water</Text>
                  <Text style={styles.detailCellValue}>{waterLabel}</Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.detailCellLabel}>Electricity</Text>
                  <Text style={styles.detailCellValue}>{electricityLabel}</Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.detailCellLabel}>Room types</Text>
                  <Text style={styles.detailCellValue}>{listing.room_types?.join(", ") || "On enquiry"}</Text>
                </View>
                <View style={styles.detailCell}>
                  <Text style={styles.detailCellLabel}>Total rooms</Text>
                  <Text style={styles.detailCellValue}>{String(listing.total_rooms ?? "-")}</Text>
                </View>
              </View>
            </Animated.View>
            {!!listing.amenities?.length && (
              <Animated.View style={[styles.card, sectionAnim(3)]}>
                <View style={styles.sectionHeadRow}>
                  <View>
                    <Text style={styles.sectionTitle}>Amenities</Text>
                    <Text style={styles.sectionSub}>What this place includes.</Text>
                  </View>
                  <Text style={styles.countPill}>{listing.amenities.length} items</Text>
                </View>
                <View style={{ gap: 12, marginTop: 4 }}>
                  {amenitySections.map(({ group, shown, hiddenCount }) => {
                    if (!showAllAmenities && shown.length === 0) return null;
                    return (
                      <View key={group.title} style={{ gap: 8 }}>
                        <Text style={styles.groupTitle}>{group.title}</Text>
                        <View style={styles.amenityGrid}>
                          {shown.map((it) => (
                            <View key={it.key} style={styles.amenityChip}>
                              <AmenityRowIcon amenity={it.key} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.amenityLabel}>{it.label}</Text>
                                <Text style={styles.amenitySub}>{group.title}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                        {!showAllAmenities && hiddenCount > 0 ? (
                          <Text style={styles.smallMuted}>+ {hiddenCount} more in {group.title}</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
                {totalAmenitiesCount > collapsedAmenitiesLimit ? (
                  <Pressable style={[styles.showMoreBtn, { marginTop: 8 }]} onPress={() => setShowAllAmenities((v) => !v)}>
                    <Text style={styles.showMoreBtnText}>
                      {showAllAmenities ? "Show less amenities" : `Show ${totalAmenitiesCount - collapsedAmenitiesLimit} more amenities`}
                    </Text>
                  </Pressable>
                ) : null}
              </Animated.View>
            )}

            {!!listing.rules?.length && (
              <Animated.View style={[styles.card, sectionAnim(4)]}>
                <Text style={styles.sectionTitle}>Rules</Text>
                <View style={{ gap: 6, marginTop: 8 }}>
                  {listing.rules.map((r, i) => (
                    <Text key={`${r}-${i}`} style={styles.meta}>- {r}</Text>
                  ))}
                </View>
              </Animated.View>
            )}

            <Animated.View style={[styles.card, sectionAnim(5)]}>
              <Text style={styles.sectionTitle}>Location</Text>
              <Text style={styles.sectionSub}>
                {[listing.area, listing.city, listing.campus].filter(Boolean).join(" â€¢ ") || "Location on enquiry"}
              </Text>

              {listing.latitude != null && listing.longitude != null ? (
                <RoomLocationMap
                  latitude={listing.latitude}
                  longitude={listing.longitude}
                  title={listing.title}
                  description={[listing.area, listing.city, listing.campus].filter(Boolean).join(", ")}
                  mapsHref={mapsHref}
                />
              ) : (
                <View style={styles.mapPlaceholder}>
                  <Text style={styles.mapPlaceholderTitle}>Map location not available</Text>
                  <Text style={styles.mapPlaceholderSub}>Ask the landlord for the exact pin when enquiring.</Text>
                </View>
              )}
            </Animated.View>

            <Animated.View style={[styles.card, sectionAnim(6)]}>
              <Text style={styles.sectionTitle}>Reviews</Text>
              {reviewsCacheTime ? <Text style={styles.smallMuted}>Reviews cache: {formatCacheTime(reviewsCacheTime)}</Text> : null}
              {ratingCount > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <StarsRow avg={ratingAvg} />
                  <Text style={{ fontWeight: "900", color: "#0e2756" }}>{ratingAvg.toFixed(1)}</Text>
                  <Text style={{ color: "#5f6b85", fontWeight: "700" }}>({ratingCount})</Text>
                </View>
              ) : (
                <Text style={styles.sectionSub}>No reviews yet</Text>
              )}

              <View style={styles.ratingRow}>
                {Array.from({ length: 5 }).map((_, i) => {
                  const v = i + 1;
                  const active = myRating >= v;
                  return (
                    <Pressable key={v} onPress={() => setMyRating(v)} style={{ paddingHorizontal: 2 }}>
                      <Star size={24} color={active ? "#ff0f64" : "#c3c9d9"} fill={active ? "#ff0f64" : "transparent"} />
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                value={myComment}
                onChangeText={setMyComment}
                placeholder="Share your experience..."
                placeholderTextColor="#9aa3bd"
                style={[styles.input, { minHeight: 100 }]}
                multiline
              />

              <Pressable style={styles.btnNavy} onPress={submitReview} disabled={savingReview}>
                <Text style={styles.btnText}>{savingReview ? "Saving..." : "Save review"}</Text>
              </Pressable>

              {reviewsLoading ? (
                <ActivityIndicator style={{ marginTop: 10 }} color="#ff0f64" />
              ) : (
                <View style={{ gap: 10, marginTop: 10 }}>
                  {reviews.map((r) => (
                    <View key={r.id} style={styles.reviewItem}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Text style={{ color: "#0e2756", fontWeight: "800", fontSize: 12 }}>Student</Text>
                        <Text style={styles.smallMuted}>{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</Text>
                      </View>
                      <Text style={{ marginTop: 6, color: "#0e2756", fontWeight: "700" }}>{safeNum(r.rating).toFixed(1)} / 5</Text>
                      {r.comment ? <Text style={{ marginTop: 6, color: "#0e2756" }}>{r.comment}</Text> : null}
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>

            <Animated.View style={[styles.card, sectionAnim(7)]}>
              <Text style={styles.sectionTitle}>Move-in readiness</Text>
              <Text style={styles.sectionSub}>Checklist to protect yourself before payment.</Text>
              <View style={{ gap: 6, marginTop: 8 }}>
                <Text style={styles.meta}>- Visit the room physically or by live video call first.</Text>
                <Text style={styles.meta}>- Confirm landlord identity and exact room terms in writing.</Text>
                <Text style={styles.meta}>- Keep payment proof and signed agreement copy.</Text>
                <Text style={styles.meta}>- Take move-in photos for inventory and damage records.</Text>
              </View>
            </Animated.View>

            <Animated.View style={[styles.card, sectionAnim(8)]}>
              <Text style={styles.sectionTitle}>Actions</Text>
              <Text style={styles.sectionSub}>Enquire first, then choose your preferred contact method.</Text>
              <View style={{ gap: 10, marginTop: 10 }}>
                <Pressable
                  style={[styles.btnPink, styles.btnPrimary]}
                  onPress={() => {
                    if (!uid || role !== "student") {
                      Alert.alert("Login as a student to send enquiries");
                      return;
                    }
                    setEnquiryText((current) => (current.trim() ? current : buildLandlordPrompt(listing)));
                    setShowEnquiry(true);
                  }}
                >
                  <View style={styles.btnRow}>
                    <MessageCircle size={15} color="#fff" />
                    <Text style={styles.btnText}>Ask landlord</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={[styles.btnNavy, styles.btnSecondary]}
                  onPress={() =>
                    router.push({
                      pathname: "/(student)/checkout",
                      params: {
                        mode: "stay",
                        title: listing.title,
                        base: String(listing.price_from ?? 0),
                        delivery: "0",
                        escrow: "1",
                      },
                    })
                  }
                >
                  <View style={styles.btnRow}>
                    <ShieldCheck size={15} color="#fff" />
                    <Text style={styles.btnText}>Reserve with escrow</Text>
                  </View>
                </Pressable>

                {listing.contact_phone ? (
                  <>
                    {(listing.contact_method === "call" || listing.contact_method === "both") && dialPhone && (
                      <Pressable style={[styles.btnNavy, styles.btnSecondary]} onPress={() => Linking.openURL(`tel:${dialPhone}`)}>
                        <View style={styles.btnRow}>
                          <Phone size={15} color="#fff" />
                          <Text style={styles.btnText}>Call landlord</Text>
                        </View>
                      </Pressable>
                    )}

                    {(listing.contact_method === "whatsapp" || listing.contact_method === "both") && whatsappPhone && (
                      <Pressable style={styles.btnGreen} onPress={() => Linking.openURL(`https://wa.me/${whatsappPhone}`)}>
                        <Text style={styles.btnText}>Chat on WhatsApp</Text>
                      </Pressable>
                    )}
                  </>
                ) : (
                  <Text style={{ marginTop: 2, color: "#5f6b85", fontWeight: "700" }}>Contact details not provided.</Text>
                )}

                <Pressable style={[styles.btnNavy, saved ? styles.btnNavySaved : styles.btnTertiary]} onPress={toggleSave} disabled={saving}>
                  <View style={styles.btnRow}>
                    <Heart size={15} color={saved ? "#0e2756" : "#fff"} />
                    <Text style={[styles.btnText, saved ? { color: "#0e2756" } : null]}>{saving ? "Saving..." : saved ? "Saved" : "Save room"}</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={styles.btnReport}
                  onPress={() => {
                    if (!uid) {
                      Alert.alert("Login to report a listing");
                      return;
                    }
                    setShowReport(true);
                  }}
                >
                  <Text style={styles.btnReportText}>Report listing</Text>
                </Pressable>
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>

      <Modal visible={showReport} transparent animationType="slide" onRequestClose={() => setShowReport(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Report this listing</Text>
            <Text style={styles.sectionSub}>Help us keep EYA safe.</Text>
            {reportDone ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteText}>{reportDone}</Text>
              </View>
            ) : null}

            <TextInput
              value={reportCategory}
              onChangeText={setReportCategory}
              placeholder="Category (e.g. scam, fake_photos)"
              placeholderTextColor="#9aa3bd"
              style={styles.input}
            />

            <TextInput
              value={reportMessage}
              onChangeText={setReportMessage}
              placeholder="Explain what happened..."
              placeholderTextColor="#9aa3bd"
              style={[styles.input, { minHeight: 120 }]}
              multiline
            />

            <View style={styles.modalRow}>
              <Pressable style={styles.btnSoft} onPress={() => setShowReport(false)}>
                <Text style={styles.btnSoftText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.btnPink, (!reportMessage.trim() || sendingReport || !uid) ? { opacity: 0.55 } : null]}
                onPress={submitReport}
                disabled={sendingReport || !reportMessage.trim() || !uid}
              >
                <Text style={styles.btnText}>{sendingReport ? "Sending..." : "Submit report"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showEnquiry} transparent animationType="slide" onRequestClose={() => setShowEnquiry(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enquire about {listing?.title}</Text>
            <TextInput
              value={enquiryText}
              onChangeText={setEnquiryText}
              placeholder="Hi, is this room still available?"
              placeholderTextColor="#9aa3bd"
              style={[styles.input, { minHeight: 120 }]}
              multiline
            />

            <View style={styles.modalRow}>
              <Pressable style={styles.btnSoft} onPress={() => setShowEnquiry(false)}>
                <Text style={styles.btnSoftText}>Cancel</Text>
              </Pressable>

              <Pressable style={[styles.btnPink, (!enquiryText.trim() || sendingEnquiry) ? { opacity: 0.55 } : null]} onPress={submitEnquiry} disabled={sendingEnquiry || !enquiryText.trim()}>
                <Text style={styles.btnText}>{sendingEnquiry ? "Sending..." : "Send"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f4f7" },
  skeletonWrap: { padding: 16, gap: 10 },
  skeletonCard: { height: 92, borderRadius: 18, backgroundColor: "#dde6ff" },
  skeletonHero: { height: 240, borderRadius: 22 },
  content: { padding: 16, gap: 12, paddingBottom: 118 },
  backRow: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dfe5f4",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  backText: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  errorBox: { borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { color: "#b0003a", fontWeight: "900" },
  cacheMeta: { color: "#5f6b85", fontWeight: "700", fontSize: 12 },
  heroWrap: { position: "relative" },
  verifiedBadge: { position: "absolute", top: 12, right: 12, backgroundColor: "#0e2756", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  verifiedBadgeText: { color: "#fff", fontWeight: "900", fontSize: 11 },
  hero: { width: "100%", height: 250, borderRadius: 22, backgroundColor: "#c8d6ff" },
  heroPlaceholder: { alignItems: "center", justifyContent: "center" },
  thumb: { width: 92, height: 68, borderRadius: 14, overflow: "hidden", backgroundColor: "#c8d6ff" },
  thumbImg: { width: "100%", height: "100%" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e7ebf5",
    padding: 14,
    gap: 8,
    shadowColor: "#0e2756",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  titleTagRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  typeText: { color: "#ff0f64", fontWeight: "900", fontSize: 12 },
  inlineVerifiedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0e2756",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  inlineVerifiedPillText: { color: "#fff", fontWeight: "900", fontSize: 11 },
  verifiedPill: { backgroundColor: "#0e2756", color: "#fff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: "hidden", fontSize: 11, fontWeight: "900" },
  title: { fontSize: 26, fontWeight: "900", color: "#0e2756", lineHeight: 31 },
  muted: { color: "#5f6b85", fontWeight: "700", fontSize: 13, lineHeight: 19 },
  quickStatsRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  quickStat: {
    flex: 1,
    backgroundColor: "#f6f7fb",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e1e4ef",
    padding: 10,
  },
  quickStatLabel: { color: "#5f6b85", fontWeight: "800", fontSize: 11, textTransform: "uppercase" },
  quickStatValue: { color: "#0e2756", fontWeight: "900", fontSize: 17, marginTop: 3 },
  quickStatValueSm: { color: "#0e2756", fontWeight: "800", fontSize: 13, marginTop: 3, lineHeight: 18 },
  quickStatSub: { color: "#5f6b85", fontWeight: "700", fontSize: 11 },
  desc: { color: "#0e2756", fontWeight: "600", marginTop: 6, lineHeight: 20 },
  sectionTitle: { color: "#0e2756", fontWeight: "900", fontSize: 17, lineHeight: 22 },
  sectionSub: { color: "#5f6b85", fontWeight: "700", marginTop: 4, fontSize: 13, lineHeight: 18 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  detailCell: {
    width: "48.5%",
    backgroundColor: "#f6f7fb",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e1e4ef",
    padding: 10,
  },
  detailCellLabel: { color: "#5f6b85", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  detailCellValue: { color: "#0e2756", fontSize: 12, fontWeight: "700", marginTop: 4 },
  sectionHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  countPill: { color: "#ff0f64", backgroundColor: "#fff0f6", borderWidth: 1, borderColor: "#ffd1e3", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontWeight: "800", fontSize: 11, overflow: "hidden" },
  groupTitle: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  amenityGrid: { gap: 8 },
  amenityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e9edf7",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  amenityIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#fff0f6",
    borderWidth: 1,
    borderColor: "#ffd1e3",
    alignItems: "center",
    justifyContent: "center",
  },
  amenityLabel: { color: "#0e2756", fontWeight: "700" },
  amenitySub: { color: "#5f6b85", fontSize: 11 },
  meta: { color: "#0e2756", fontWeight: "700", marginTop: 4 },
  price: { color: "#0e2756", fontWeight: "900", marginTop: 8 },
  priceSub: { color: "#5f6b85", fontWeight: "700", fontSize: 12 },
  btnNavy: { backgroundColor: "#0e2756", borderRadius: 16, paddingVertical: 12, alignItems: "center" },
  btnNavySaved: { backgroundColor: "#f6f7fb", borderWidth: 1, borderColor: "#e1e4ef" },
  btnPink: { backgroundColor: "#ff0f64", borderRadius: 16, paddingVertical: 12, alignItems: "center" },
  btnPrimary: {
    shadowColor: "#ff0f64",
    shadowOpacity: 0.26,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  btnSecondary: {
    borderWidth: 1,
    borderColor: "#1a3f82",
  },
  btnTertiary: {
    backgroundColor: "#16315f",
  },
  showMoreBtn: {
    backgroundColor: "#fff0f6",
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffd4e3",
  },
  showMoreBtnText: { color: "#b0003a", fontWeight: "900" },
  btnGreen: { backgroundColor: "#25D366", borderRadius: 16, paddingVertical: 12, alignItems: "center" },
  btnReport: { backgroundColor: "#fff0f6", borderRadius: 16, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#ffd4e3" },
  btnReportText: { color: "#b0003a", fontWeight: "900" },
  btnSoft: { backgroundColor: "#f6f7fb", borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", borderWidth: 1, borderColor: "#e1e4ef" },
  btnSoftText: { color: "#0e2756", fontWeight: "900" },
  btnText: { color: "#fff", fontWeight: "900" },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  mapCard: {
    marginTop: 10,
    height: 210,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e1e4ef",
    backgroundColor: "#eef1fb",
  },
  map: { width: "100%", height: "100%" },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center",
    padding: 14,
  },
  mapOverlayBtn: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#e7eaf6",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  mapOverlayBtnText: { color: "#0e2756", fontWeight: "900" },
  mapPlaceholder: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e1e4ef",
    backgroundColor: "#f6f7fb",
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  mapPlaceholderTitle: { color: "#0e2756", fontWeight: "900" },
  mapPlaceholderSub: { color: "#5f6b85", fontWeight: "600", fontSize: 12 },
  ratingRow: { flexDirection: "row", gap: 6, marginTop: 6, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#e1e4ef", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#f6f7fb", color: "#0e2756", fontWeight: "700", minHeight: 46 },
  reviewItem: { backgroundColor: "#f6f7fb", borderRadius: 16, padding: 12, borderWidth: 1, borderColor: "#e1e4ef" },
  smallMuted: { color: "#9aa3bd", fontSize: 11, fontWeight: "800" },
  noteBox: { borderWidth: 1, borderColor: "#e1e4ef", backgroundColor: "#f6f7fb", borderRadius: 14, padding: 10 },
  noteText: { color: "#0e2756", fontWeight: "700" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", paddingHorizontal: 16 },
  modalCard: { backgroundColor: "#fff", borderRadius: 22, padding: 14, gap: 10 },
  modalRow: { flexDirection: "row", gap: 10, justifyContent: "flex-end" },
  modalTitle: { color: "#0e2756", fontWeight: "900", fontSize: 18 },
});



