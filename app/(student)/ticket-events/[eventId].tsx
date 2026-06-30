import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, CalendarDays, MapPin, Ticket } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { kwacha } from "@/lib/currency";
import { listTicketEvents, ticketEvents, type TicketEvent, type TicketTier } from "@/lib/tickets";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

function readParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function eventDateLabel(event: TicketEvent) {
  if (event.dateLabel) return event.dateLabel;
  if (!event.startsAt) return "Date coming soon";
  const date = new Date(event.startsAt);
  if (Number.isNaN(date.getTime())) return "Date coming soon";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function ticketRemainingLabel(tier: TicketTier) {
  if (!tier.available) return "Sold out";
  if (typeof tier.remaining === "number") return `${Math.max(0, tier.remaining)} left`;
  return "Available";
}

export default function StudentTicketEventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const eventId = useMemo(() => readParam(params.eventId), [params.eventId]);
  const { theme } = useStudentTheme();
  const [event, setEvent] = useState<TicketEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    try {
      const liveEvents = await listTicketEvents();
      const found = [...liveEvents, ...ticketEvents].find((item) => item.id === eventId) ?? null;
      setEvent(found);
      if (!found) setNotice("This ticket event could not be found.");
    } catch {
      const found = ticketEvents.find((item) => item.id === eventId) ?? null;
      setEvent(found);
      if (!found) setNotice("This ticket event could not be found.");
      else setNotice("Showing saved event details while live ticket data is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  const availableTiers = useMemo(() => event?.tiers.filter((tier) => tier.available) ?? [], [event]);
  const selectedTier = useMemo(() => availableTiers.find((tier) => tier.id === selectedTierId) ?? availableTiers[0] ?? null, [availableTiers, selectedTierId]);

  useEffect(() => {
    if (!selectedTier && availableTiers[0]) {
      setSelectedTierId(availableTiers[0].id);
    }
  }, [availableTiers, selectedTier]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}> 
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={[styles.backButton, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} />
          <Text style={[styles.backText, { color: theme.text }]}>Tickets</Text>
        </Pressable>

        {loading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading ticket event...</Text>
          </View>
        ) : null}

        {!loading && event ? (
          <>
            <ImageBackground source={{ uri: event.heroImage || event.image }} style={styles.hero} imageStyle={styles.heroImage}>
              <View style={styles.heroShade} />
              <Text style={styles.categoryChip}>{event.category}</Text>
              <View style={styles.heroBottom}>
                <Text style={styles.heroTitle}>{event.title}</Text>
                <View style={styles.heroMetaRow}>
                  <CalendarDays size={15} color="#ffffff" />
                  <Text style={styles.heroMeta}>{eventDateLabel(event)}</Text>
                </View>
                <View style={styles.heroMetaRow}>
                  <MapPin size={15} color="#ffffff" />
                  <Text style={styles.heroMeta}>{event.venue}, {event.city}</Text>
                </View>
              </View>
            </ImageBackground>

            {notice ? (
              <View style={[styles.noticeCard, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}> 
                <Text style={[styles.noticeText, { color: theme.text }]}>{notice}</Text>
              </View>
            ) : null}

            <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
              <Text style={[styles.infoTitle, { color: theme.text }]}>Event details</Text>
              <Text style={[styles.infoText, { color: theme.textMuted }]}>{event.description || "Ticket details and entry instructions will be shown after purchase."}</Text>
            </View>

            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Ticket types</Text>
              <Text style={[styles.sectionSub, { color: theme.textMuted }]}>Availability updates automatically from the ticket backend when connected.</Text>
            </View>

            {event.tiers.map((tier) => {
              const selected = selectedTier?.id === tier.id;
              return (
                <Pressable
                  key={tier.id}
                  disabled={!tier.available}
                  style={[
                    styles.tierCard,
                    { backgroundColor: theme.surface, borderColor: selected ? theme.accent : theme.border, opacity: tier.available ? 1 : 0.55 },
                  ]}
                  onPress={() => setSelectedTierId(tier.id)}
                >
                  <View style={styles.tierTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tierName, { color: theme.text }]}>{tier.name}</Text>
                      <Text style={[styles.tierDescription, { color: theme.textMuted }]}>{tier.description || "Event entry ticket"}</Text>
                    </View>
                    <Text style={[styles.tierPrice, { color: theme.accent }]}>{kwacha(tier.priceMwk)}</Text>
                  </View>
                  <Text style={[styles.remainingText, { color: tier.available ? theme.success : theme.danger }]}>{ticketRemainingLabel(tier)}</Text>
                </Pressable>
              );
            })}

            <View style={[styles.checkoutCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
              <View style={styles.checkoutIconWrap}>
                <Ticket size={22} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.checkoutTitle, { color: theme.text }]}>{selectedTier ? `${selectedTier.name} selected` : "No ticket selected"}</Text>
                <Text style={[styles.checkoutText, { color: theme.textMuted }]}>Payment routes already exist in the backend; this screen keeps event selection reachable and ready for the final checkout UI.</Text>
              </View>
            </View>
          </>
        ) : null}

        {!loading && !event ? (
          <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            <Text style={[styles.infoTitle, { color: theme.text }]}>Event unavailable</Text>
            <Text style={[styles.infoText, { color: theme.textMuted }]}>Go back to tickets and choose another event.</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, paddingBottom: 124, gap: 16 },
  backButton: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  backText: { fontSize: 14, fontWeight: "900" },
  loadingBlock: { minHeight: 360, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 14, fontWeight: "700" },
  hero: { minHeight: 310, borderRadius: 32, overflow: "hidden", padding: 18, justifyContent: "space-between" },
  heroImage: { borderRadius: 32 },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(6, 11, 24, 0.46)" },
  categoryChip: { alignSelf: "flex-start", overflow: "hidden", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.92)", color: "#13285f", paddingHorizontal: 12, paddingVertical: 7, fontSize: 12, fontWeight: "900" },
  heroBottom: { gap: 10 },
  heroTitle: { color: "#ffffff", fontSize: 30, lineHeight: 36, fontWeight: "900" },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  heroMeta: { flex: 1, color: "#ffffff", fontSize: 14, fontWeight: "800" },
  noticeCard: { borderWidth: 1, borderRadius: 22, padding: 14 },
  noticeText: { fontSize: 13, lineHeight: 19, fontWeight: "800" },
  infoCard: { borderWidth: 1, borderRadius: 26, padding: 16, gap: 8 },
  infoTitle: { fontSize: 20, fontWeight: "900" },
  infoText: { fontSize: 14, lineHeight: 21, fontWeight: "700" },
  sectionBlock: { gap: 4 },
  sectionTitle: { fontSize: 22, fontWeight: "900" },
  sectionSub: { fontSize: 13, fontWeight: "700" },
  tierCard: { borderWidth: 1.5, borderRadius: 24, padding: 15, gap: 10 },
  tierTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  tierName: { fontSize: 17, fontWeight: "900" },
  tierDescription: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  tierPrice: { fontSize: 16, fontWeight: "900" },
  remainingText: { fontSize: 12, fontWeight: "900" },
  checkoutCard: { borderWidth: 1, borderRadius: 26, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  checkoutIconWrap: { width: 48, height: 48, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(124,147,255,0.14)" },
  checkoutTitle: { fontSize: 16, fontWeight: "900" },
  checkoutText: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: "700" },
});
