import React from "react";
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  BadgeCheck,
  Bike,
  ChevronRight,
  Clock3,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Star,
  Store,
} from "lucide-react-native";
import { goBackOrFallback } from "@/lib/navigation";
import { kwacha } from "@/lib/currency";
import { getFoodCardById, type FoodCard } from "@/lib/newApp/browse";

type Props = {
  fallbackRoute: "/(food)/(tabs)/food" | "/(student)/(tabs)/food";
};

function buildSellerPrompt(item: FoodCard) {
  if (!item.mealPrice || item.mealPrice <= 0) {
    return `Hi, is "${item.name}" available right now, and how much is it?`;
  }
  return `Hi, is "${item.name}" available right now?`;
}

function buildSellerSubject(item: FoodCard) {
  return `About: ${item.name}`;
}

export default function FoodDetailScreen({ fallbackRoute }: Props) {
  const router = useRouter();
  const isStudentView = fallbackRoute === "/(student)/(tabs)/food";
  const params = useLocalSearchParams<{ id?: string }>();
  const [item, setItem] = React.useState<FoodCard | null>(null);
  const [deliver, setDeliver] = React.useState(true);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const found = params.id ? await getFoodCardById(params.id) : null;
        if (active) setItem(found);
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [params.id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.skeletonWrap}>
          <View style={styles.skeletonHero} />
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Meal unavailable</Text>
          <Text style={styles.emptySub}>This menu item is no longer available. Browse nearby food spots instead.</Text>
          <Pressable style={styles.emptyBtn} onPress={() => router.push(fallbackRoute)}>
            <Text style={styles.emptyBtnText}>Back to food</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const total = item.mealPrice + (deliver ? item.deliveryFee : 0);

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backBtn} onPress={() => goBackOrFallback(router, fallbackRoute)}>
          <ArrowLeft size={18} color="#16315f" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.heroCard}>
          <Image source={{ uri: item.image }} style={styles.heroImage} />
          <View style={styles.heroOverlay} />
          <View style={styles.heroTop}>
            <Text style={[styles.statusChip, !item.isOpen && styles.statusChipClosed]}>{item.isOpen ? "Open now" : "Closed"}</Text>
            <View style={styles.heroVendorPill}>
              <Store size={14} color="#ffffff" />
              <Text style={styles.heroVendorText}>{item.cuisine}</Text>
            </View>
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle}>{item.name}</Text>
            <Text style={styles.heroMeal}>{item.meal}</Text>
            <View style={styles.heroMeta}>
              <MetaPill icon={<Star size={12} color="#f1b634" fill="#f1b634" />} label={item.rating.toFixed(1)} />
              <MetaPill icon={<Clock3 size={12} color="#ffffff" />} label={`${item.etaMins} mins`} />
              <MetaPill icon={<MapPin size={12} color="#ffffff" />} label={`${item.area}, ${item.campus}`} />
            </View>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.priceLabel}>Meal price</Text>
              <Text style={styles.priceValue}>{kwacha(item.mealPrice)}</Text>
            </View>
            <View style={styles.deliveryBubble}>
              <Text style={styles.deliveryBubbleTitle}>Delivery fee</Text>
              <Text style={styles.deliveryBubbleValue}>{kwacha(item.deliveryFee)}</Text>
            </View>
          </View>

          <Text style={styles.description}>{item.description}</Text>

          <View style={styles.infoGrid}>
            <InfoCard icon={<ShieldCheck size={18} color="#0f6d80" />} title="Restaurant verified" text="Trusted campus vendor with active delivery support." />
            <InfoCard icon={<BadgeCheck size={18} color="#0d7a37" />} title="Reliable ETA" text={`${item.etaMins} minute estimate based on current distance.`} />
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={styles.restaurantBtn}
              onPress={() =>
                router.push({
                  pathname: fallbackRoute === "/(food)/(tabs)/food" ? "/(food)/restaurant/[vendorId]" : "/(student)/food/restaurant/[vendorId]",
                  params: { vendorId: item.vendorId },
                })
              }
            >
              <Text style={styles.restaurantBtnText}>View restaurant</Text>
              <ChevronRight size={18} color="#ffffff" />
            </Pressable>

            {isStudentView ? (
              <Pressable
                style={styles.messageBtn}
                onPress={() =>
                  router.push({
                    pathname: "/(student)/vendor-chat/[vendorId]",
                    params: {
                      vendorId: item.vendorId,
                      channel: "food",
                      itemId: item.id,
                      subject: buildSellerSubject(item),
                      message: buildSellerPrompt(item),
                    },
                  })
                }
              >
                <MessageCircle size={18} color="#16315f" />
                <Text style={styles.messageBtnText}>Ask seller</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable style={[styles.deliveryToggle, deliver && styles.deliveryToggleActive]} onPress={() => setDeliver((current) => !current)}>
            <View style={styles.deliveryToggleLeft}>
              <Bike size={18} color={deliver ? "#ffffff" : "#0f6d80"} />
              <View>
                <Text style={[styles.deliveryToggleTitle, deliver && styles.deliveryToggleTitleActive]}>
                  {deliver ? "Door delivery selected" : "Add door delivery"}
                </Text>
                <Text style={[styles.deliveryToggleSub, deliver && styles.deliveryToggleSubActive]}>
                  {deliver ? `${kwacha(item.deliveryFee)} included in total` : "Pickup only if left off"}
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color={deliver ? "#ffffff" : "#0f6d80"} />
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerTotal}>{kwacha(total)}</Text>
        </View>
        <Pressable
          style={[styles.cta, !item.isOpen && styles.ctaDisabled]}
          disabled={!item.isOpen}
          onPress={() =>
            item.isOpen &&
            router.push({
              pathname: "/(student)/checkout",
              params: {
                mode: "food",
                title: item.name,
                base: String(item.mealPrice),
                delivery: String(deliver ? item.deliveryFee : 0),
                item_id: item.id,
                vendor_id: item.vendorId,
                channel: "food",
                delivery_mode: deliver ? "doorstep" : "pickup",
              },
            })
          }
        >
          <Text style={styles.ctaText}>{item.isOpen ? "Proceed to checkout" : "Currently closed"}</Text>
          {item.isOpen ? <ChevronRight size={20} color="#ffffff" /> : null}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function MetaPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.metaPill}>
      {icon}
      <Text style={styles.metaPillText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function InfoCard({ icon, text, title }: { icon: React.ReactNode; text: string; title: string }) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoIcon}>{icon}</View>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef6f8" },
  content: { padding: 16, paddingBottom: 132, gap: 16 },
  skeletonWrap: { padding: 16, gap: 12 },
  skeletonHero: { height: 280, borderRadius: 30, backgroundColor: "#d8e8ef" },
  skeletonCard: { height: 140, borderRadius: 28, backgroundColor: "#d8e8ef" },
  emptyCard: { flex: 1, margin: 16, borderRadius: 28, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dbe6eb", padding: 20, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyTitle: { color: "#16315f", fontWeight: "900", fontSize: 20 },
  emptySub: { color: "#58707e", fontWeight: "600", fontSize: 13, textAlign: "center", lineHeight: 20 },
  emptyBtn: { marginTop: 8, borderRadius: 999, backgroundColor: "#16315f", paddingHorizontal: 16, paddingVertical: 10 },
  emptyBtnText: { color: "#ffffff", fontWeight: "900", fontSize: 13 },
  backBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d5e1e7",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  backText: { color: "#16315f", fontWeight: "800", fontSize: 13 },
  heroCard: {
    height: 300,
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: "#bfd7de",
  },
  heroImage: { width: "100%", height: "100%", position: "absolute" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(12,24,48,0.36)" },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 16 },
  statusChip: {
    backgroundColor: "#e9fbef",
    color: "#0d7a37",
    fontWeight: "900",
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: "hidden",
  },
  statusChipClosed: { backgroundColor: "#ffe5ec", color: "#b9375a" },
  heroVendorPill: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroVendorText: { color: "#ffffff", fontWeight: "800", fontSize: 12 },
  heroBottom: { marginTop: "auto", padding: 16, gap: 8 },
  heroTitle: { color: "#ffffff", fontWeight: "900", fontSize: 32 },
  heroMeal: { color: "#edf5ff", fontWeight: "700", fontSize: 15 },
  heroMeta: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metaPill: {
    maxWidth: 130,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaPillText: { color: "#ffffff", fontWeight: "800", fontSize: 11, flexShrink: 1 },
  summaryCard: {
    borderRadius: 30,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    padding: 18,
    gap: 16,
  },
  summaryTop: { flexDirection: "row", justifyContent: "space-between", gap: 16, alignItems: "flex-start" },
  priceLabel: { color: "#58707e", fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  priceValue: { color: "#16315f", fontWeight: "900", fontSize: 30, marginTop: 4 },
  deliveryBubble: {
    borderRadius: 22,
    backgroundColor: "#16315f",
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 124,
  },
  deliveryBubbleTitle: { color: "#d8e7ff", fontWeight: "700", fontSize: 11 },
  deliveryBubbleValue: { color: "#ffffff", fontWeight: "900", fontSize: 18, marginTop: 2 },
  description: { color: "#58707e", fontWeight: "600", fontSize: 14, lineHeight: 22 },
  infoGrid: { gap: 10 },
  infoCard: {
    borderRadius: 22,
    backgroundColor: "#f5fafb",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    padding: 14,
    gap: 8,
  },
  infoIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: "#e7f4f6", alignItems: "center", justifyContent: "center" },
  infoTitle: { color: "#16315f", fontWeight: "900", fontSize: 15 },
  infoText: { color: "#5b7380", fontWeight: "600", fontSize: 13, lineHeight: 19 },
  restaurantBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#16315f",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  restaurantBtnText: { color: "#ffffff", fontWeight: "900", fontSize: 14 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  messageBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c7d6de",
    backgroundColor: "#f7fbfc",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  messageBtnText: { color: "#16315f", fontWeight: "900", fontSize: 14 },
  deliveryToggle: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#d2e1e7",
    backgroundColor: "#f8fcfd",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  deliveryToggleActive: { backgroundColor: "#0f6d80", borderColor: "#0f6d80" },
  deliveryToggleLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  deliveryToggleTitle: { color: "#0f6d80", fontWeight: "900", fontSize: 15 },
  deliveryToggleTitleActive: { color: "#ffffff" },
  deliveryToggleSub: { color: "#5b7380", fontWeight: "600", fontSize: 12, marginTop: 2 },
  deliveryToggleSubActive: { color: "#d7f7ff" },
  footer: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 100,
    borderRadius: 28,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerLabel: { color: "#58707e", fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
  footerTotal: { color: "#16315f", fontWeight: "900", fontSize: 22, marginTop: 2 },
  cta: {
    borderRadius: 999,
    backgroundColor: "#0f6d80",
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ctaDisabled: { backgroundColor: "#a0b6bd" },
  ctaText: { color: "#ffffff", fontWeight: "900", fontSize: 14 },
});
