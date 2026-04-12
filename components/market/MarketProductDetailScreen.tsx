import React from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, CalendarClock, ChevronRight, Heart, MapPin, MessageCircle, ShieldCheck, Star, Truck } from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import { getMarketCardById, listMarketCards, type MarketCard } from "@/lib/newApp/browse";
import { goBackOrFallback } from "@/lib/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { ensureMarketInterest } from "@/lib/marketInterest";

type Props = {
  fallbackRoute: "/(market)/(tabs)/marketplace" | "/(student)/(tabs)/marketplace";
};

function buildSellerPrompt(item: MarketCard) {
  if (!item.price || item.price <= 0) {
    return `Hi, is "${item.name}" still available, and how much is it?`;
  }
  return `Hi, is "${item.name}" still available?`;
}

function buildSellerSubject(item: MarketCard) {
  return `About: ${item.name}`;
}

export default function MarketProductDetailScreen({ fallbackRoute }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const isStudentView = fallbackRoute === "/(student)/(tabs)/marketplace";
  const params = useLocalSearchParams<{ id?: string }>();
  const [item, setItem] = React.useState<MarketCard | null>(null);
  const [similar, setSimilar] = React.useState<MarketCard[]>([]);
  const [deliver, setDeliver] = React.useState(true);
  const [liked, setLiked] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const found = params.id ? await getMarketCardById(params.id) : null;
        const all = await listMarketCards();
        if (!active) return;
        setItem(found);
        setSimilar(all.filter((row) => row.id !== found?.id).slice(0, 2));
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
        <View style={styles.skeletonHero} />
        <View style={styles.skeletonBlock} />
        <View style={styles.skeletonBlock} />
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Item unavailable</Text>
          <Text style={styles.emptySub}>This product is no longer available. Please browse other listings.</Text>
          <Pressable style={styles.outlineBtn} onPress={() => router.push(fallbackRoute)}>
            <Text style={styles.outlineBtnText}>Back to market</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const total = item.price + (deliver ? item.deliveryFee : 0);

  const ensureInterest = async (mode: "chat" | "request") => {
    if (!user) {
      Alert.alert("Login required", "Please login to continue.");
      return null;
    }
    const req = await ensureMarketInterest({
      itemId: item.id,
      itemName: item.name,
      image: item.image,
      priceMwk: item.price,
      category: item.category,
      vendorId: item.vendorId,
      vendorName: item.vendor,
      customerId: user.id,
      customerName: user.email?.split("@")[0] || "Student",
      area: item.area,
      campus: item.campus,
    });
    if (mode === "request") {
      router.push({ pathname: "/(student)/requests/[requestId]", params: { requestId: req.id } });
    }
    return req;
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable style={styles.iconBtn} onPress={() => goBackOrFallback(router, fallbackRoute)}>
            <ArrowLeft size={18} color="#0b3d4f" />
          </Pressable>
          <Text style={styles.screenTitle} numberOfLines={1}>{item.name}</Text>
          <Pressable style={styles.iconBtn} onPress={() => setLiked((current) => !current)}>
            <Heart size={18} color={liked ? "#ff4b6e" : "#0b3d4f"} fill={liked ? "#ff4b6e" : "transparent"} />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <Image source={{ uri: item.image }} style={styles.heroImage} />
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.price}>{kwacha(item.price)}</Text>

          <View style={styles.statRow}>
            <InfoLine icon={<Star size={14} color="#f5b940" fill="#f5b940" />} text={`Condition: New · ${item.rating.toFixed(1)} rated`} />
            <InfoLine icon={<Truck size={14} color="#0f6d80" />} text={`Delivery: Fast · ${deliver ? "30 mins" : "Pickup only"}`} />
            <InfoLine icon={<MapPin size={14} color="#0f6d80" />} text={`Location: ${item.area}, ${item.campus}`} />
            <InfoLine icon={<ShieldCheck size={14} color="#0d7a37" />} text={`Seller: ${item.vendor} · Verified`} />
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{item.description}</Text>

          <View style={styles.actionRow}>
            <Pressable
              style={styles.shopBtn}
              onPress={() =>
                router.push({
                  pathname: fallbackRoute === "/(market)/(tabs)/marketplace" ? "/(market)/shop/[vendorId]" : "/(student)/market/shop/[vendorId]",
                  params: { vendorId: item.vendorId },
                })
              }
            >
              <Text style={styles.shopBtnText}>View shop</Text>
              <ChevronRight size={18} color="#ffffff" />
            </Pressable>

            {isStudentView ? (
              <Pressable
                style={styles.messageBtn}
                onPress={async () => {
                  const req = await ensureInterest("chat");
                  if (!req) return;
                  router.push({
                    pathname: "/(student)/vendor-chat/[vendorId]",
                    params: {
                      vendorId: item.vendorId,
                      channel: "market",
                      itemId: item.id,
                      requestId: req.id,
                      itemName: item.name,
                      price: String(item.price),
                      image: item.image,
                      category: item.category,
                      vendorName: item.vendor,
                      subject: buildSellerSubject(item),
                      message: buildSellerPrompt(item),
                    },
                  });
                }}
              >
                <MessageCircle size={18} color="#0f6d80" />
                <Text style={styles.messageBtnText}>Ask seller</Text>
              </Pressable>
            ) : null}
          </View>

          {isStudentView ? (
            <View style={styles.requestRow}>
              <Pressable style={styles.interestBtn} onPress={() => void ensureInterest("request")}>
                <Heart size={16} color="#0f6d80" />
                <Text style={styles.interestBtnText}>Mark interested</Text>
              </Pressable>
              <Pressable
                style={styles.pickupBtn}
                onPress={async () => {
                  const req = await ensureInterest("chat");
                  if (!req) return;
                  router.push({
                    pathname: "/(student)/vendor-chat/[vendorId]",
                    params: {
                      vendorId: item.vendorId,
                      channel: "market",
                      itemId: item.id,
                      requestId: req.id,
                      itemName: item.name,
                      price: String(item.price),
                      image: item.image,
                      category: item.category,
                      vendorName: item.vendor,
                      subject: `Pickup for ${item.name}`,
                      message: `Hi, I want to arrange pickup for "${item.name}".`,
                    },
                  });
                }}
              >
                <CalendarClock size={16} color="#102a54" />
                <Text style={styles.pickupBtnText}>Arrange pickup</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable style={[styles.deliveryPill, deliver && styles.deliveryPillActive]} onPress={() => setDeliver((current) => !current)}>
            <Truck size={15} color={deliver ? "#fff" : "#0f6d80"} />
            <Text style={[styles.deliveryPillText, deliver && styles.deliveryPillTextActive]}>
              {deliver ? `Delivery added · ${kwacha(item.deliveryFee)}` : "Add doorstep delivery"}
            </Text>
          </Pressable>
        </View>

        {similar.length ? (
          <View style={styles.similarCard}>
            <Text style={styles.sectionTitle}>Similar Items</Text>
            <View style={styles.similarRow}>
              {similar.map((product) => (
                <Pressable
                  key={product.id}
                  style={styles.similarItem}
                  onPress={() => router.push({ pathname: fallbackRoute === "/(market)/(tabs)/marketplace" ? "/(market)/item/[id]" : "/(student)/market/[id]", params: { id: product.id } })}
                >
                  <Image source={{ uri: product.image }} style={styles.similarImage} />
                  <Text style={styles.similarName} numberOfLines={2}>{product.name}</Text>
                  <Text style={styles.similarPrice}>{kwacha(product.price)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <View>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerPrice}>{kwacha(total)}</Text>
        </View>
        <Pressable
          style={styles.cta}
          onPress={() =>
            router.push({
              pathname: "/(student)/checkout",
              params: {
                mode: "market",
                title: item.name,
                base: String(item.price),
                delivery: String(deliver ? item.deliveryFee : 0),
                item_id: item.id,
                vendor_id: item.vendorId,
                channel: "market",
                delivery_mode: deliver ? "doorstep" : "pickup",
              },
            })
          }
        >
          <Text style={styles.ctaText}>Payments coming soon</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function InfoLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={styles.infoLine}>
      {icon}
      <Text style={styles.infoLineText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eaf7f9" },
  content: { padding: 16, paddingBottom: 128, gap: 14 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  screenTitle: { flex: 1, textAlign: "center", color: "#0b3d4f", fontWeight: "900", fontSize: 16 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f8fdff",
    borderWidth: 1,
    borderColor: "#d0e3e9",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#f6fbfd",
    borderWidth: 1,
    borderColor: "#d3e5eb",
    shadowColor: "#0b3d4f",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroImage: { width: "100%", height: 300 },
  infoCard: {
    borderRadius: 22,
    backgroundColor: "#fcfeff",
    borderWidth: 1,
    borderColor: "#d3e5eb",
    padding: 16,
    gap: 10,
  },
  itemName: { color: "#0b3d4f", fontWeight: "900", fontSize: 22 },
  price: { color: "#0b3d4f", fontWeight: "900", fontSize: 34 },
  statRow: { gap: 10 },
  infoLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoLineText: { color: "#345763", fontWeight: "700", fontSize: 14 },
  divider: { borderTopWidth: 1, borderTopColor: "#e0edf1", marginVertical: 2 },
  sectionTitle: { color: "#0b3d4f", fontWeight: "900", fontSize: 16 },
  description: { color: "#4e7480", fontWeight: "700", fontSize: 14, lineHeight: 21 },
  shopBtn: {
    marginTop: 2,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#0b3d4f",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shopBtnText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  messageBtn: {
    marginTop: 2,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#9dc8d1",
    backgroundColor: "#f7fdff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  messageBtnText: { color: "#0f6d80", fontSize: 14, fontWeight: "900" },
  requestRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  interestBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#b7d5dc",
    backgroundColor: "#f6fcff",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  interestBtnText: { color: "#0f6d80", fontSize: 13, fontWeight: "900" },
  pickupBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f0ddab",
    backgroundColor: "#fff7dd",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pickupBtnText: { color: "#102a54", fontSize: 13, fontWeight: "900" },
  deliveryPill: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#a8c8d2",
    backgroundColor: "#f7fdff",
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deliveryPillActive: { backgroundColor: "#0f6d80", borderColor: "#0f6d80" },
  deliveryPillText: { color: "#0f6d80", fontWeight: "900", fontSize: 13 },
  deliveryPillTextActive: { color: "#fff" },
  similarCard: {
    borderRadius: 22,
    backgroundColor: "#fcfeff",
    borderWidth: 1,
    borderColor: "#d3e5eb",
    padding: 16,
    gap: 12,
  },
  similarRow: { flexDirection: "row", gap: 12 },
  similarItem: { flex: 1, gap: 8 },
  similarImage: { width: "100%", height: 110, borderRadius: 16, backgroundColor: "#dbeef3" },
  similarName: { color: "#0b3d4f", fontWeight: "800", fontSize: 14, minHeight: 38 },
  similarPrice: { color: "#0f6d80", fontWeight: "900", fontSize: 18 },
  footer: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 100,
    borderRadius: 22,
    backgroundColor: "#fcfeff",
    borderWidth: 1,
    borderColor: "#d3e5eb",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    shadowColor: "#0b3d4f",
    shadowOpacity: 0.09,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  footerLabel: { color: "#7c99a2", fontWeight: "800", fontSize: 11, textTransform: "uppercase" },
  footerPrice: { color: "#0b3d4f", fontWeight: "900", fontSize: 30 },
  cta: {
    borderRadius: 999,
    backgroundColor: "#0f6d80",
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: "#0f6d80",
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  ctaText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  emptyCard: {
    flex: 1,
    margin: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#d3e5eb",
    backgroundColor: "#fcfeff",
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: { color: "#0b3d4f", fontWeight: "900", fontSize: 18 },
  emptySub: { color: "#4e7480", fontWeight: "700", fontSize: 13, textAlign: "center" },
  outlineBtn: { borderRadius: 999, backgroundColor: "#0f6d80", paddingHorizontal: 14, paddingVertical: 10 },
  outlineBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  skeletonHero: { margin: 16, height: 300, borderRadius: 28, backgroundColor: "#d8edf2" },
  skeletonBlock: { marginHorizontal: 16, height: 180, borderRadius: 22, backgroundColor: "#e2f1f5", marginTop: 12 },
});
