import React from "react";
import { ActivityIndicator, Alert, ImageBackground, Platform, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Clock3,
  MapPin,
  Music,
  Share2,
  Sparkles,
  Ticket,
  Trophy,
  UsersRound,
} from "lucide-react-native";
import { listTicketEvents, type TicketEvent } from "@/lib/tickets";
import {
  EYA_ACCENT as ACCENT,
  EYA_BG as CREAM,
  EYA_BORDER as BORDER,
  EYA_MUTED as MUTED,
  EYA_TEXT as BLACK,
  eventDateLabel,
  eventImageUrl,
  eventLocation,
  eventPriceLabel,
  eventTimeLabel,
  firstAvailableTier,
  money,
  uppercase,
} from "@/components/market/ticketingUi";

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}>;

type InfoItem = {
  id: string;
  Icon: IconComponent;
  title: string;
  subtitle: string;
};

type Highlight = {
  id: string;
  title: string;
  subtitle: string;
  Icon: IconComponent;
};

const highlights: Highlight[] = [
  { id: "entry", title: "Real Tickets", subtitle: "Admin issued", Icon: Ticket },
  { id: "access", title: "Fast Entry", subtitle: "QR scanning", Icon: Sparkles },
  { id: "vibes", title: "Live Moments", subtitle: "Great vibes", Icon: Music },
  { id: "premium", title: "Experience", subtitle: "EYA access", Icon: Trophy },
];

function createPurchaseShareLinks(eventId: string) {
  const encodedEventId = encodeURIComponent(eventId);
  const purchasePath = `market/select-tickets?eventId=${encodedEventId}`;
  const appUrl = `eya://${purchasePath}`;
  const webPath = `/${purchasePath}`;
  const webLocation = (globalThis as any)?.location;
  const webUrl = webLocation?.origin ? `${webLocation.origin}${webPath}` : null;

  return { appUrl, webUrl };
}

function isShareCancel(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /cancel|abort|dismiss/i.test(message);
}

function showShareMessage(title: string, message: string) {
  if (Platform.OS === "web") {
    const webAlert = (globalThis as any)?.alert;
    if (typeof webAlert === "function") {
      webAlert(`${title}\n\n${message}`);
      return;
    }
  }

  Alert.alert(title, message);
}

async function copyShareText(value: string) {
  const webNavigator = (globalThis as any)?.navigator;
  if (typeof webNavigator?.clipboard?.writeText === "function") {
    await webNavigator.clipboard.writeText(value);
    return true;
  }

  const webDocument = (globalThis as any)?.document;
  if (!webDocument?.createElement || !webDocument?.body) return false;

  const input = webDocument.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.top = "-1000px";
  input.style.opacity = "0";
  webDocument.body.appendChild(input);
  input.select();

  try {
    return webDocument.execCommand?.("copy") === true;
  } finally {
    webDocument.body.removeChild(input);
  }
}

async function shareEventPurchaseLink(event: TicketEvent) {
  const { appUrl, webUrl } = createPurchaseShareLinks(event.id);
  const shareUrl = webUrl || appUrl;
  const title = `${event.title} tickets`;
  const text = [
    `Buy tickets for ${event.title} on EYA.`,
    `Open in the EYA app: ${appUrl}`,
    webUrl ? `Web link: ${webUrl}` : null,
    `${eventDateLabel(event)} • ${eventLocation(event)}`,
  ].filter(Boolean).join("\n");
  const webNavigator = (globalThis as any)?.navigator;

  if (Platform.OS === "web") {
    if (typeof webNavigator?.share === "function") {
      const shareData = { title, text, url: shareUrl };
      try {
        if (typeof webNavigator.canShare !== "function" || webNavigator.canShare(shareData)) {
          await webNavigator.share(shareData);
          return;
        }
      } catch (error) {
        if (isShareCancel(error)) return;
      }
    }

    const copied = await copyShareText(shareUrl);
    if (copied) {
      showShareMessage("Link copied", "The ticket purchase link has been copied to your clipboard.");
      return;
    }

    throw new Error("Sharing is not available in this browser.");
  }

  await Share.share({
    title,
    message: text,
    url: shareUrl,
  });
}

export default function EventDetailsScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 768;
  const [events, setEvents] = React.useState<TicketEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const heroHeight = isCompact ? Math.min(430, Math.max(386, width * 1.08)) : Math.min(480, Math.max(430, width * 1.15));
  const recommendationWidth = isCompact ? Math.min(176, Math.max(154, width * 0.43)) : Math.min(194, Math.max(168, width * 0.46));

  React.useEffect(() => {
    let active = true;
    const loadEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const liveEvents = await listTicketEvents();
        if (active) setEvents(liveEvents);
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
  const recommendations = React.useMemo(() => events.filter((item) => item.id !== event?.id).slice(0, 8), [event?.id, events]);

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
      <StatusBar style="light" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(178, insets.bottom + 154) }]}>
        <HeroSection compact={isCompact} event={event} height={heroHeight} />

        <View style={styles.contentPanel}>
          <View style={styles.aboutBlock}>
            <Text style={styles.sectionKicker}>ABOUT THIS EVENT</Text>
            <View style={styles.yellowUnderline} />
            <Text style={styles.headline}>{event.title} is ready for booking on EYA.</Text>
            <Text style={styles.description}>
              {event.description?.trim() || `Book official tickets for ${event.title}. Your QR ticket will be issued after payment and can be scanned at the entrance by the event team.`}
            </Text>
          </View>

          <View style={styles.highlightsGrid}>
            {highlights.map((highlight) => (
              <HighlightCard key={highlight.id} highlight={highlight} />
            ))}
          </View>

          {recommendations.length ? (
            <>
              <View style={styles.recommendationHeader}>
                <Text style={styles.recommendationTitle}>YOU MIGHT ALSO LIKE</Text>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => router.push({ pathname: "/(student)/market/tickets", params: { view: "all" } } as any)}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Text style={styles.seeAll}>See all</Text>
                </Pressable>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendationRow}>
                {recommendations.map((item) => (
                  <RecommendationCard key={item.id} item={item} width={recommendationWidth} />
                ))}
              </ScrollView>
            </>
          ) : null}
        </View>
      </ScrollView>

      <StickyBookingBar compact={isCompact} event={event} />
    </View>
  );
}

function HeroSection({ compact, event, height }: { compact: boolean; event: TicketEvent; height: number }) {
  const router = useRouter();
  const sold = event.tiers.reduce((sum, tier) => sum + Number(tier.capacitySold || 0) + Number(tier.capacityReserved || 0), 0);
  const infoItems: InfoItem[] = [
    { id: "date", Icon: CalendarDays, title: eventDateLabel(event), subtitle: eventTimeLabel(event) },
    { id: "place", Icon: MapPin, title: event.venue || "Venue TBA", subtitle: event.city || "City TBA" },
    { id: "going", Icon: UsersRound, title: sold ? `${sold}+` : "Open", subtitle: sold ? "Going" : "Tickets" },
  ];

  return (
    <ImageBackground source={{ uri: eventImageUrl(event, true) }} style={[styles.hero, { height }]} imageStyle={styles.heroImage}>
      <LinearGradient colors={["rgba(0,0,0,0.9)", "rgba(0,0,0,0.48)", "rgba(0,0,0,0.82)"]} locations={[0, 0.48, 1]} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={["rgba(0,0,0,0.88)", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.72)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView edges={["top"]} style={styles.heroSafeArea}>
        <View style={[styles.heroTopBar, compact && styles.heroTopBarCompact]}>
          <Pressable style={({ pressed }) => [styles.backButton, compact && styles.backButtonCompact, pressed && styles.pressed]} onPress={() => router.back()}>
            <ArrowLeft size={compact ? 23 : 25} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
          <View style={styles.heroActions}>
            <Pressable
              accessibilityLabel="Share ticket purchase link"
              style={({ pressed }) => [styles.heroActionButton, compact && styles.heroActionButtonCompact, pressed && styles.pressed]}
              onPress={() => {
                void shareEventPurchaseLink(event).catch((shareError) => {
                  if (!isShareCancel(shareError)) {
                    Alert.alert("Share unavailable", "Could not open sharing on this device. Try again from the EYA app.");
                  }
                });
              }}
            >
              <Share2 size={compact ? 21 : 23} color="#FFFFFF" strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>

        <View style={[styles.heroContent, compact && styles.heroContentCompact]}>
          <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]} numberOfLines={compact ? 3 : 4} adjustsFontSizeToFit minimumFontScale={0.82}>
            {uppercase(event.title)}
          </Text>

          <View style={styles.organizerRow}>
            <Building2 size={18} color="#FFFFFF" strokeWidth={2.1} />
            <Text style={styles.organizerText}>{event.title} Team</Text>
          </View>

          <View style={styles.afterParty}>
            <Text style={styles.afterPartyLabel}>EVENT SCHEDULE</Text>
            <View style={styles.afterPartyTime}>
              <Clock3 size={18} color="#FFFFFF" strokeWidth={2.1} />
              <Text style={styles.afterPartyText}>{eventTimeLabel(event)}</Text>
            </View>
          </View>

          <GlassInfoCard compact={compact} items={infoItems} />
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

function GlassInfoCard({ compact, items }: { compact: boolean; items: InfoItem[] }) {
  return (
    <View style={[styles.glassCard, compact && styles.glassCardCompact]}>
      {items.map(({ Icon, id, subtitle, title }, index) => (
        <View key={id} style={[styles.glassItem, compact && styles.glassItemCompact, index > 0 && styles.glassItemBorder, compact && index > 0 && styles.glassItemBorderCompact]}>
          <Icon size={compact ? 23 : 27} color={ACCENT} strokeWidth={2.4} />
          <View style={styles.glassCopy}>
            <Text style={styles.glassTitle} numberOfLines={2}>{title}</Text>
            <Text style={styles.glassSubtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function HighlightCard({ highlight }: { highlight: Highlight }) {
  const { Icon } = highlight;
  return (
    <View style={styles.highlightCard}>
      <View style={styles.highlightIconCircle}>
        <Icon size={25} color={BLACK} strokeWidth={2.5} />
      </View>
      <Text style={styles.highlightTitle} numberOfLines={1}>{highlight.title}</Text>
      <Text style={styles.highlightSubtitle} numberOfLines={1}>{highlight.subtitle}</Text>
    </View>
  );
}

function RecommendationCard({ item, width }: { item: TicketEvent; width: number }) {
  const router = useRouter();

  return (
    <Pressable
      style={({ pressed }) => [styles.recommendationCard, { width }, pressed && styles.pressed]}
      onPress={() => router.push({ pathname: "/(student)/market/event-details", params: { eventId: item.id } } as any)}
    >
      <ImageBackground source={{ uri: eventImageUrl(item) }} imageStyle={styles.recommendationImage} style={styles.recommendationImageWrap}>
        <LinearGradient colors={["rgba(0,0,0,0.04)", "rgba(0,0,0,0.32)"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      </ImageBackground>
      <View style={styles.recommendationBody}>
        <Text style={styles.recommendationCardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.recommendationMetaRow}>
          <CalendarDays size={14} color={MUTED} strokeWidth={2.1} />
          <Text style={styles.recommendationMeta} numberOfLines={1}>{eventDateLabel(item)}</Text>
        </View>
        <View style={styles.recommendationMetaRow}>
          <MapPin size={14} color={MUTED} strokeWidth={2.1} />
          <Text style={styles.recommendationMeta} numberOfLines={1}>{eventLocation(item)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function StickyBookingBar({ compact, event }: { compact: boolean; event: TicketEvent }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(14, insets.bottom + 8);
  const tier = firstAvailableTier(event);
  const disabled = !tier?.available;

  return (
    <View style={[styles.bookingBarOuter, { bottom }]}>
      <View style={[styles.bookingBar, compact && styles.bookingBarCompact]}>
        <View style={styles.bookingPrice}>
          <Text style={styles.bookingFrom}>FROM</Text>
          <Text style={[styles.bookingAmount, compact && styles.bookingAmountCompact]}>{tier?.available ? money(tier.priceMwk) : eventPriceLabel(event)}</Text>
        </View>
        <Pressable
          disabled={disabled}
          style={({ pressed }) => [styles.bookButton, compact && styles.bookButtonCompact, disabled && styles.bookButtonDisabled, pressed && !disabled && styles.pressed]}
          onPress={() => router.push({ pathname: "/(student)/market/select-tickets", params: { eventId: event.id } } as any)}
        >
          <Ticket size={compact ? 18 : 21} color={BLACK} strokeWidth={2.7} />
          <Text style={[styles.bookButtonText, compact && styles.bookButtonTextCompact]}>{disabled ? "SOLD OUT" : "BOOK TICKETS"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  centeredRoot: { flex: 1, backgroundColor: CREAM, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  stateTitle: { color: BLACK, fontSize: 19, fontWeight: "900", textAlign: "center" },
  stateText: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" },
  scrollContent: { backgroundColor: "#050505" },
  hero: { width: "100%", backgroundColor: "#050505" },
  heroImage: { resizeMode: "cover" },
  heroSafeArea: { flex: 1 },
  heroTopBar: { paddingHorizontal: 20, paddingTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroTopBarCompact: { paddingHorizontal: 14, paddingTop: 8 },
  backButton: { width: 56, height: 56, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  backButtonCompact: { width: 48, height: 48, borderRadius: 16 },
  heroActions: { flexDirection: "row", gap: 12 },
  heroActionButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroActionButtonCompact: { width: 48, height: 48, borderRadius: 24 },
  heroContent: { flex: 1, paddingHorizontal: 20, justifyContent: "flex-end", paddingBottom: 42 },
  heroContentCompact: { paddingHorizontal: 14, paddingBottom: 26 },
  heroTitle: { color: "#FFFFFF", fontSize: 45, lineHeight: 51, fontWeight: "900", letterSpacing: 0 },
  heroTitleCompact: { fontSize: 34, lineHeight: 39 },
  organizerRow: { marginTop: 18, flexDirection: "row", alignItems: "center", gap: 9 },
  organizerText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  afterParty: { marginTop: 26, gap: 9 },
  afterPartyLabel: { color: ACCENT, fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
  afterPartyTime: { flexDirection: "row", alignItems: "center", gap: 10 },
  afterPartyText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  glassCard: { minHeight: 92, marginTop: 28, borderRadius: 21, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(5,5,5,0.56)", flexDirection: "row", overflow: "hidden" },
  glassCardCompact: { minHeight: 0, marginTop: 20, borderRadius: 19, flexDirection: "column" },
  glassItem: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 14 },
  glassItemCompact: { minHeight: 56, paddingHorizontal: 13, paddingVertical: 10 },
  glassItemBorder: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.17)" },
  glassItemBorderCompact: { borderLeftWidth: 0, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.17)" },
  glassCopy: { flex: 1, minWidth: 0 },
  glassTitle: { color: "#FFFFFF", fontSize: 13, lineHeight: 17, fontWeight: "900" },
  glassSubtitle: { color: "rgba(255,255,255,0.82)", fontSize: 12, lineHeight: 17, fontWeight: "600", marginTop: 2 },
  contentPanel: { marginTop: -24, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: CREAM, paddingTop: 36, paddingBottom: 28 },
  aboutBlock: { paddingHorizontal: 22 },
  sectionKicker: { color: MUTED, fontSize: 13, fontWeight: "800", letterSpacing: 2 },
  yellowUnderline: { width: 35, height: 4, borderRadius: 2, backgroundColor: ACCENT, marginTop: 10, marginBottom: 17 },
  headline: { color: BLACK, fontSize: 24, lineHeight: 31, fontWeight: "900", maxWidth: 350 },
  description: { color: MUTED, fontSize: 16, lineHeight: 26, fontWeight: "500", marginTop: 18 },
  highlightsGrid: { paddingHorizontal: 22, marginTop: 28, flexDirection: "row", flexWrap: "wrap", gap: 12 },
  highlightCard: { flexGrow: 1, flexBasis: "47%", minHeight: 142, borderRadius: 21, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.78)", alignItems: "center", justifyContent: "center", padding: 14, shadowColor: "#13285f", shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  highlightIconCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  highlightTitle: { color: BLACK, fontSize: 16, fontWeight: "900" },
  highlightSubtitle: { color: MUTED, fontSize: 13, fontWeight: "600", marginTop: 5 },
  recommendationHeader: { marginTop: 36, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recommendationTitle: { color: MUTED, fontSize: 14, fontWeight: "900", letterSpacing: 1.7 },
  seeAll: { color: ACCENT, fontSize: 15, fontWeight: "900" },
  recommendationRow: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 12, gap: 16 },
  recommendationCard: { borderRadius: 17, overflow: "hidden", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: BORDER, shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  recommendationImageWrap: { height: 152 },
  recommendationImage: { borderTopLeftRadius: 17, borderTopRightRadius: 17 },
  recommendationBody: { minHeight: 128, padding: 14, gap: 10 },
  recommendationCardTitle: { color: BLACK, fontSize: 16, lineHeight: 21, fontWeight: "900", marginBottom: 2 },
  recommendationMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  recommendationMeta: { flex: 1, color: MUTED, fontSize: 12, fontWeight: "700" },
  bookingBarOuter: { position: "absolute", left: 12, right: 12 },
  bookingBar: { minHeight: 92, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.98)", borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, shadowColor: "#13285f", shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 10 },
  bookingBarCompact: { minHeight: 82, borderRadius: 24, gap: 9, paddingHorizontal: 12 },
  bookingPrice: { flex: 1, minWidth: 96 },
  bookingFrom: { color: MUTED, fontSize: 12, fontWeight: "900", letterSpacing: 1.3, marginBottom: 5 },
  bookingAmount: { color: BLACK, fontSize: 24, fontWeight: "900" },
  bookingAmountCompact: { fontSize: 19 },
  bookButton: { flex: 1.35, minHeight: 62, borderRadius: 17, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 12 },
  bookButtonCompact: { flex: 1.15, minHeight: 56, borderRadius: 16, gap: 7, paddingHorizontal: 8 },
  bookButtonDisabled: { opacity: 0.56 },
  bookButtonText: { color: BLACK, fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  bookButtonTextCompact: { fontSize: 12, letterSpacing: 0.5 },
  pressed: { opacity: 0.72 },
});
