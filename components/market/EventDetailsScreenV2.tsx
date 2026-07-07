import React from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  ImageBackground,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Heart,
  MapPin,
  Share2,
  ShieldCheck,
  Ticket,
  UsersRound,
  Zap,
} from "lucide-react-native";
import { listTicketEvents, type TicketEvent } from "@/lib/tickets";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as BG,
  EYA_BORDER as BORDER,
  EYA_MUTED as MUTED,
  EYA_TEXT as NAVY,
  eventDateLabel,
  eventImageUrl,
  eventLocation,
  eventPriceLabel,
  eventTimeLabel,
  firstAvailableTier,
  money,
} from "@/components/market/ticketingUi";

type IconComponent = React.ComponentType<{ size?: number; color?: string; fill?: string; strokeWidth?: number }>;

type Highlight = {
  id: string;
  title: string;
  subtitle: string;
  Icon: IconComponent;
};

const highlights: Highlight[] = [
  { id: "tickets", title: "Real Tickets", subtitle: "Admin issued", Icon: Ticket },
  { id: "entry", title: "Fast Entry", subtitle: "QR scanning", Icon: Zap },
  { id: "secure", title: "100% Secure", subtitle: "Encrypted payments", Icon: ShieldCheck },
  { id: "vibes", title: "Great Vibes", subtitle: "Unforgettable moments", Icon: UsersRound },
];

export default function EventDetailsScreenV2() {
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const [events, setEvents] = React.useState<TicketEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const loadEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listTicketEvents();
        if (active) setEvents(rows);
      } catch (loadError: any) {
        if (active) setError(loadError?.message || "Could not load ticket event.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadEvents();
    return () => {
      active = false;
    };
  }, []);

  const event = React.useMemo(() => events.find((item) => item.id === eventId) ?? events[0] ?? null, [eventId, events]);

  if (loading) {
    return (
      <View style={styles.centeredRoot}>
        <ActivityIndicator color={ACCENT} />
        <Text style={styles.stateText}>Loading event...</Text>
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.centeredRoot}>
        <Ticket size={34} color={ACCENT} strokeWidth={2.2} />
        <Text style={styles.stateTitle}>Event unavailable</Text>
        <Text style={styles.stateText}>{error || "This ticket event is not published yet."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(178, insets.bottom + 150) }]}
      >
        <Hero event={event} />

        <View style={styles.contentWrap}>
          <View style={styles.dateCard}>
            <InfoRow Icon={CalendarDays} label="Every Weekend" title={eventDateLabel(event)} />
            <InfoRow Icon={Clock3} label="Event Time" title={eventTimeLabel(event)} />
            <InfoRow Icon={MapPin} label="Venue" title={eventLocation(event)} />
          </View>

          <View style={styles.aboutBlock}>
            <Text style={styles.sectionKicker}>About This Event</Text>
            <View style={styles.sectionUnderline} />
            <Text style={styles.aboutText}>{event.description?.trim() || `${event.title} is ready for booking on EYA.`}</Text>
            <Text style={styles.aboutText}>Live performances, good vibes, food, drinks and unforgettable memories.</Text>
          </View>

          <View style={styles.highlightsGrid}>
            {highlights.map((highlight) => (
              <HighlightCard key={highlight.id} highlight={highlight} />
            ))}
          </View>
        </View>
      </ScrollView>

      <AnimatedBookingButton event={event} />
    </View>
  );
}

function Hero({ event }: { event: TicketEvent }) {
  const router = useRouter();

  const shareEvent = React.useCallback(() => {
    void Share.share({
      title: `${event.title} tickets`,
      message: `${event.title}\n${eventDateLabel(event)} • ${eventLocation(event)}`,
    }).catch(() => Alert.alert("Share unavailable", "Could not open sharing on this device."));
  }, [event]);

  return (
    <ImageBackground source={{ uri: eventImageUrl(event, true) }} style={styles.hero} imageStyle={styles.heroImage}>
      <LinearGradient colors={["rgba(246,247,255,0.08)", "rgba(246,247,255,0.23)", BG]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={["top"]} style={styles.heroSafe}>
        <View style={styles.heroTopBar}>
          <Pressable style={styles.heroCircleBtn} onPress={() => router.back()}>
            <ArrowLeft size={22} color={NAVY} strokeWidth={2.4} />
          </Pressable>
          <View style={styles.heroActions}>
            <Pressable style={styles.heroCircleBtn}>
              <Heart size={21} color={ACCENT} fill={ACCENT} strokeWidth={2.2} />
            </Pressable>
            <Pressable style={styles.heroCircleBtn} onPress={shareEvent}>
              <Share2 size={21} color={NAVY} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>

        <View style={styles.heroCopy}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{String(event.category || "Event").toUpperCase()}</Text>
          </View>
          <Text style={styles.heroTitle} numberOfLines={3}>{event.title}</Text>
          <Text style={styles.heroSub}>A music & lifestyle festival experience.</Text>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

function InfoRow({ Icon, label, title }: { Icon: IconComponent; label: string; title: string }) {
  return (
    <View style={styles.infoRow}>
      <Icon size={21} color={ACCENT} strokeWidth={2.2} />
      <View style={styles.infoCopy}>
        <Text style={styles.infoTitle}>{title}</Text>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
    </View>
  );
}

function HighlightCard({ highlight }: { highlight: Highlight }) {
  const { Icon } = highlight;
  return (
    <View style={styles.highlightCard}>
      <View style={styles.highlightIcon}>
        <Icon size={27} color={ACCENT} strokeWidth={2.3} />
      </View>
      <Text style={styles.highlightTitle}>{highlight.title}</Text>
      <Text style={styles.highlightSub}>{highlight.subtitle}</Text>
    </View>
  );
}

function AnimatedBookingButton({ event }: { event: TicketEvent }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tier = firstAvailableTier(event);
  const disabled = !tier?.available;
  const bottom = Math.max(18, insets.bottom + 12);
  const pulse = React.useRef(new Animated.Value(0)).current;
  const pressScale = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (disabled) return undefined;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [disabled, pulse]);

  const ringStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.24, 0.05] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
  };

  const buttonStyle = {
    transform: [
      { scale: pressScale },
      { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.01] }) },
    ],
  };

  const onPressIn = () => {
    Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, speed: 26, bounciness: 7 }).start();
  };

  const onPressOut = () => {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 8 }).start();
  };

  return (
    <View style={[styles.bookingBarOuter, { bottom }]}> 
      {!disabled ? <Animated.View pointerEvents="none" style={[styles.bookPulseRing, ringStyle]} /> : null}
      <Animated.View style={disabled ? undefined : buttonStyle}>
        <Pressable
          disabled={disabled}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={[styles.bookCta, disabled && styles.bookCtaDisabled]}
          onPress={() => router.push({ pathname: "/(student)/market/select-tickets", params: { eventId: event.id } } as any)}
        >
          <View style={styles.bookPriceBlock}>
            <Text style={styles.bookFrom}>FROM</Text>
            <Text style={styles.bookPrice}>{tier?.available ? money(tier.priceMwk) : eventPriceLabel(event)}</Text>
          </View>
          <View style={styles.bookButtonPill}>
            <Text style={styles.bookButtonText}>{disabled ? "Sold out" : "Book Tickets"}</Text>
            <Ticket size={18} color="#ffffff" strokeWidth={2.5} />
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  centeredRoot: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  stateTitle: { color: NAVY, fontSize: 20, fontWeight: "900", textAlign: "center" },
  stateText: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" },
  scrollContent: { backgroundColor: BG },
  hero: { minHeight: 560, backgroundColor: BG },
  heroImage: { resizeMode: "cover" },
  heroSafe: { flex: 1, justifyContent: "space-between" },
  heroTopBar: { paddingHorizontal: 22, paddingTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroActions: { flexDirection: "row", gap: 12 },
  heroCircleBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.88)", alignItems: "center", justifyContent: "center", shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  heroCopy: { paddingHorizontal: 24, paddingBottom: 34, gap: 12 },
  categoryBadge: { alignSelf: "flex-start", minHeight: 30, borderRadius: 999, backgroundColor: ACCENT, justifyContent: "center", paddingHorizontal: 13 },
  categoryText: { color: "#ffffff", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 },
  heroTitle: { color: NAVY, fontSize: 42, lineHeight: 48, fontWeight: "900", maxWidth: 330 },
  heroSub: { color: NAVY, fontSize: 15, lineHeight: 22, fontWeight: "600", maxWidth: 320 },
  contentWrap: { paddingHorizontal: 22, marginTop: -6, gap: 26 },
  dateCard: { borderRadius: 24, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: BORDER, padding: 18, gap: 18, shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  infoCopy: { flex: 1, minWidth: 0 },
  infoTitle: { color: NAVY, fontSize: 15, fontWeight: "900" },
  infoLabel: { color: MUTED, fontSize: 12, fontWeight: "700", marginTop: 5 },
  aboutBlock: { gap: 10 },
  sectionKicker: { color: NAVY, fontSize: 15, fontWeight: "900", letterSpacing: 0.8 },
  sectionUnderline: { width: 42, height: 3, borderRadius: 2, backgroundColor: ACCENT },
  aboutText: { color: NAVY, fontSize: 15, lineHeight: 23, fontWeight: "600" },
  highlightsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  highlightCard: { flexGrow: 1, flexBasis: "46%", minHeight: 134, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.84)", alignItems: "center", justifyContent: "center", padding: 12, shadowColor: "#13285f", shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  highlightIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  highlightTitle: { color: NAVY, fontSize: 15, fontWeight: "900", textAlign: "center" },
  highlightSub: { color: MUTED, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 5 },
  bookingBarOuter: { position: "absolute", left: 18, right: 18, zIndex: 60, elevation: 24 },
  bookPulseRing: { ...StyleSheet.absoluteFillObject, borderRadius: 28, backgroundColor: NAVY },
  bookCta: { minHeight: 92, borderRadius: 24, backgroundColor: NAVY, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, shadowColor: NAVY, shadowOpacity: 0.36, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 16 },
  bookCtaDisabled: { opacity: 0.7, backgroundColor: "#9aa3bd", shadowOpacity: 0.12 },
  bookPriceBlock: { flex: 1, minWidth: 0 },
  bookFrom: { color: "rgba(255,255,255,0.78)", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  bookPrice: { color: "#ffffff", fontSize: 24, lineHeight: 30, fontWeight: "900", marginTop: 3 },
  bookButtonPill: { minHeight: 52, borderRadius: 18, backgroundColor: ACCENT, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, shadowColor: ACCENT, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  bookButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
});
