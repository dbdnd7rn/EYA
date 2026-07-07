import React from "react";
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CalendarDays, Clock3, Heart, MapPin, ShieldCheck, Ticket, UsersRound, Zap } from "lucide-react-native";
import type { TicketEvent } from "@/lib/tickets";
import { listTicketEventsSafe } from "@/lib/ticketEventsSafe";
import { EYA_ACCENT as ACCENT, EYA_BG as BG, EYA_BORDER as BORDER, EYA_MUTED as MUTED, EYA_TEXT as TEXT, eventDateLabel, eventImageUrl, eventLocation, eventPriceLabel, eventTimeLabel, firstAvailableTier, money } from "@/components/market/ticketingUi";

type IconComponent = React.ComponentType<{ size?: number; color?: string; fill?: string; strokeWidth?: number }>;

const CTA_BLUE = "#0e2756";

const highlights: { title: string; subtitle: string; Icon: IconComponent }[] = [
  { title: "Real Tickets", subtitle: "Admin issued", Icon: Ticket },
  { title: "Fast Entry", subtitle: "QR scanning", Icon: Zap },
  { title: "100% Secure", subtitle: "Encrypted payments", Icon: ShieldCheck },
  { title: "Great Vibes", subtitle: "Unforgettable moments", Icon: UsersRound },
];

export default function EventDetailsQuickScreen() {
  const insets = useSafeAreaInsets();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const [event, setEvent] = React.useState<TicketEvent | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    void listTicketEventsSafe().then((rows) => {
      if (!active) return;
      setEvent(rows.find((item) => item.id === eventId) ?? rows[0] ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [eventId]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={ACCENT} /><Text style={styles.muted}>Loading event...</Text></View>;
  if (!event) return <View style={styles.center}><Ticket size={34} color={ACCENT} /><Text style={styles.title}>Event unavailable</Text><Text style={styles.muted}>This event is not ready yet.</Text></View>;

  return <View style={styles.root}><StatusBar style="dark" /><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(178, insets.bottom + 152) }]}><Hero event={event} /><View style={styles.content}><View style={styles.dateCard}><InfoRow Icon={CalendarDays} label="Every Weekend" title={eventDateLabel(event)} /><InfoRow Icon={Clock3} label="Event Time" title={eventTimeLabel(event)} /><InfoRow Icon={MapPin} label="Venue" title={eventLocation(event)} /></View><View style={styles.about}><Text style={styles.kicker}>About This Event</Text><View style={styles.underline} /><Text style={styles.aboutText}>{event.description?.trim() || `${event.title} is ready for booking on EYA.`}</Text><Text style={styles.aboutText}>Live performances, good vibes, food, drinks and unforgettable memories.</Text></View><View style={styles.grid}>{highlights.map((item) => <HighlightCard key={item.title} item={item} />)}</View></View></ScrollView><BookBar event={event} /></View>;
}

function Hero({ event }: { event: TicketEvent }) {
  const router = useRouter();
  return <ImageBackground source={{ uri: eventImageUrl(event, true) }} style={styles.hero} imageStyle={styles.heroImage}><LinearGradient colors={["rgba(246,247,255,0.08)", "rgba(246,247,255,0.23)", BG]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFill} /><SafeAreaView edges={["top"]} style={styles.heroSafe}><View style={styles.heroTop}><Pressable style={styles.circle} onPress={() => router.back()}><ArrowLeft color={TEXT} size={22} /></Pressable><Pressable style={styles.circle}><Heart color={ACCENT} fill={ACCENT} size={21} /></Pressable></View><View style={styles.heroCopy}><View style={styles.badge}><Text style={styles.badgeText}>{String(event.category || "Event").toUpperCase()}</Text></View><Text style={styles.heroTitle} numberOfLines={3}>{event.title}</Text><Text style={styles.heroSub}>A music & lifestyle festival experience.</Text></View></SafeAreaView></ImageBackground>;
}

function InfoRow({ Icon, label, title }: { Icon: IconComponent; label: string; title: string }) {
  return <View style={styles.infoRow}><Icon size={21} color={ACCENT} /><View style={styles.infoCopy}><Text style={styles.infoTitle}>{title}</Text><Text style={styles.infoLabel}>{label}</Text></View></View>;
}

function HighlightCard({ item }: { item: { title: string; subtitle: string; Icon: IconComponent } }) {
  const Icon = item.Icon;
  return <View style={styles.highlight}><View style={styles.highlightIcon}><Icon size={27} color={ACCENT} /></View><Text style={styles.highlightTitle}>{item.title}</Text><Text style={styles.highlightSub}>{item.subtitle}</Text></View>;
}

function BookBar({ event }: { event: TicketEvent }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tier = firstAvailableTier(event);
  const disabled = !tier?.available;
  return <View style={[styles.bookOuter, { bottom: Math.max(18, insets.bottom + 12) }]}><Pressable disabled={disabled} style={[styles.book, disabled && styles.bookOff]} onPress={() => router.push({ pathname: "/(student)/market/select-tickets", params: { eventId: event.id } } as any)}><View style={styles.bookPriceBlock}><Text style={styles.bookFrom}>FROM</Text><Text style={styles.bookPrice}>{tier?.available ? money(tier.priceMwk) : eventPriceLabel(event)}</Text></View><View style={styles.bookPill}><Text style={styles.bookText}>{disabled ? "Sold out" : "Book Tickets"}</Text><Ticket color="#fff" size={18} /></View></Pressable></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG }, center: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }, title: { color: TEXT, fontSize: 20, fontWeight: "900", textAlign: "center" }, muted: { color: MUTED, fontSize: 14, fontWeight: "700", textAlign: "center" }, scroll: { backgroundColor: BG }, hero: { minHeight: 560, backgroundColor: BG }, heroImage: { resizeMode: "cover" }, heroSafe: { flex: 1, justifyContent: "space-between" }, heroTop: { paddingHorizontal: 22, paddingTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, circle: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.88)", alignItems: "center", justifyContent: "center", shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 3 }, heroCopy: { paddingHorizontal: 24, paddingBottom: 34, gap: 12 }, badge: { alignSelf: "flex-start", minHeight: 30, borderRadius: 999, backgroundColor: ACCENT, justifyContent: "center", paddingHorizontal: 13 }, badgeText: { color: "#fff", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 }, heroTitle: { color: TEXT, fontSize: 42, lineHeight: 48, fontWeight: "900", maxWidth: 330 }, heroSub: { color: TEXT, fontSize: 15, lineHeight: 22, fontWeight: "600", maxWidth: 320 }, content: { paddingHorizontal: 22, marginTop: -6, gap: 26 }, dateCard: { borderRadius: 24, backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: BORDER, padding: 18, gap: 18, shadowColor: "#13285f", shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 }, infoRow: { flexDirection: "row", alignItems: "center", gap: 13 }, infoCopy: { flex: 1, minWidth: 0 }, infoTitle: { color: TEXT, fontSize: 15, fontWeight: "900" }, infoLabel: { color: MUTED, fontSize: 12, fontWeight: "700", marginTop: 5 }, about: { gap: 10 }, kicker: { color: TEXT, fontSize: 15, fontWeight: "900", letterSpacing: 0.8 }, underline: { width: 42, height: 3, borderRadius: 2, backgroundColor: ACCENT }, aboutText: { color: TEXT, fontSize: 15, lineHeight: 23, fontWeight: "600" }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 }, highlight: { flexGrow: 1, flexBasis: "46%", minHeight: 134, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: "rgba(255,255,255,0.84)", alignItems: "center", justifyContent: "center", padding: 12 }, highlightIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#eef1ff", alignItems: "center", justifyContent: "center", marginBottom: 10 }, highlightTitle: { color: TEXT, fontSize: 15, fontWeight: "900", textAlign: "center" }, highlightSub: { color: MUTED, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 5 }, bookOuter: { position: "absolute", left: 18, right: 18, zIndex: 80, elevation: 28, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.96)", borderWidth: 1, borderColor: "rgba(255,255,255,0.72)", shadowColor: "#13285f", shadowOpacity: 0.2, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, padding: 10 }, book: { minHeight: 76, borderRadius: 22, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 10, gap: 12 }, bookOff: { opacity: 0.7 }, bookPriceBlock: { flex: 1, minWidth: 0 }, bookFrom: { color: MUTED, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 }, bookPrice: { color: CTA_BLUE, fontSize: 24, lineHeight: 30, fontWeight: "900", marginTop: 3 }, bookPill: { minHeight: 58, borderRadius: 20, backgroundColor: CTA_BLUE, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18, shadowColor: CTA_BLUE, shadowOpacity: 0.24, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 8 }, bookText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
