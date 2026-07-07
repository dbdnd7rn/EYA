import React from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, CalendarClock, ChevronLeft, ChevronRight, Heart, MapPin, MessageCircle, ShieldCheck, Star, Truck, X } from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import { getMarketCardById, listMarketCards, type MarketCard } from "@/lib/newApp/browse";
import { goBackOrFallback } from "@/lib/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { ensureMarketInterest } from "@/lib/marketInterest";

type Props = {
  fallbackRoute: "/(market)/(tabs)/marketplace" | "/(student)/(tabs)/marketplace" | "/(student)/market";
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

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "recently";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function MarketProductDetailScreen({ fallbackRoute }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const isStudentView = fallbackRoute !== "/(market)/(tabs)/marketplace";
  const params = useLocalSearchParams<{ id?: string }>();
  const [item, setItem] = React.useState<MarketCard | null>(null);
  const [similar, setSimilar] = React.useState<MarketCard[]>([]);
  const [deliver, setDeliver] = React.useState(true);
  const [liked, setLiked] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = React.useState(0);
  const [photoViewerOpen, setPhotoViewerOpen] = React.useState(false);

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

  React.useEffect(() => {
    setSelectedPhotoIndex(0);
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
          <Pressable style={styles.outlineBtn} onPress={() => router.push(fallbackRoute as any)}>
            <Text style={styles.outlineBtnText}>Back to market</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const total = item.price + (deliver ? item.deliveryFee : 0);
  const photos = item.images?.length ? item.images : [item.image];
  const activePhotoIndex = Math.min(selectedPhotoIndex, Math.max(photos.length - 1, 0));
  const selectedPhoto = photos[activePhotoIndex] ?? item.image;
  const openPhotoViewer = (index = activePhotoIndex) => {
    setSelectedPhotoIndex(index);
    setPhotoViewerOpen(true);
  };
  const showPreviousPhoto = () => setSelectedPhotoIndex((current) => (current + photos.length - 1) % photos.length);
  const showNextPhoto = () => setSelectedPhotoIndex((current) => (current + 1) % photos.length);

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
          <Pressable style={styles.iconBtn} onPress={() => goBackOrFallback(router, fallbackRoute as any)}>
            <ArrowLeft size={18} color="#0b3d4f" />
          </Pressable>
          <Text style={styles.screenTitle} numberOfLines={1}>{item.name}</Text>
          <Pressable style={styles.iconBtn} onPress={() => setLiked((current) => !current)}>
            <Heart size={18} color={liked ? "#ff4b6e" : "#0b3d4f"} fill={liked ? "#ff4b6e" : "transparent"} />
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel="Open product image"
          style={styles.heroCard}
          onPress={() => openPhotoViewer(activePhotoIndex)}
        >
          <Image source={{ uri: selectedPhoto }} style={styles.heroImage} />
          {photos.length > 1 ? (
            <View style={styles.photoCountBadge}>
              <Text style={styles.photoCountText}>{activePhotoIndex + 1}/{photos.length}</Text>
            </View>
          ) : null}
        </Pressable>
        {photos.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnailRow}>
            {photos.map((photo, index) => {
              const active = index === activePhotoIndex;
              return (
                <Pressable
                  key={`${photo}-${index}`}
                  style={[styles.thumbnail, active && styles.thumbnailActive]}
                  onPress={() => openPhotoViewer(index)}
                >
                  <Image source={{ uri: photo }} style={styles.thumbnailImage} />
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.infoCard}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.price}>{kwacha(item.price)}</Text>

          <View style={styles.statRow}>
            <InfoLine icon={<Star size={14} color="#f5b940" fill="#f5b940" />} text={`Condition: New - ${item.rating.toFixed(1)} rated`} />
            <InfoLine icon={<Truck size={14} color="#0f6d80" />} text={`Delivery: Fast - ${deliver ? "30 mins" : "Pickup only"}`} />
            <InfoLine icon={<MapPin size={14} color="#0f6d80" />} text={`Location: ${item.area}, ${item.campus}`} />
            <InfoLine icon={<CalendarClock size={14} color="#102a54" />} text={`Listed on ${formatDateLabel(item.listedAt)} | refreshed ${formatDateLabel(item.refreshedAt)}`} />
            <InfoLine icon={<ShieldCheck size={14} color="#0d7a37" />} text={`Seller: ${item.vendor} - Verified`} />
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{item.description}</Text>

          <View style={styles.actionRow}>
            <Pressable
              style={styles.shopBtn}
              onPress={() =>
                router.push({
                  pathname: isStudentView ? "/(student)/market/shop/[vendorId]" : "/(market)/shop/[vendorId]",
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
              {deliver ? `Delivery added - ${kwacha(item.deliveryFee)}` : "Add doorstep delivery"}
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
                  onPress={() => router.push({ pathname: isStudentView ? "/(student)/market/[id]" : "/(market)/item/[id]", params: { id: product.id } })}
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
          <Text style={styles.ctaText}>Checkout</Text>
        </Pressable>
      </View>

      <Modal visible={photoViewerOpen} animationType="fade" transparent onRequestClose={() => setPhotoViewerOpen(false)}>
        <SafeAreaView style={styles.photoViewer}>
          <View style={styles.photoViewerTopBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close image viewer" style={styles.photoViewerIconBtn} onPress={() => setPhotoViewerOpen(false)}>
              <X size={20} color="#ffffff" />
            </Pressable>
            <Text style={styles.photoViewerTitle} numberOfLines={1}>{item.name}</Text>
            <View style={styles.photoViewerCountBadge}>
              <Text style={styles.photoViewerCountText}>{activePhotoIndex + 1}/{photos.length}</Text>
            </View>
          </View>

          <View style={styles.photoViewerImageWrap}>
            {photos.length > 1 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Previous image" style={[styles.photoViewerNavBtn, styles.photoViewerNavLeft]} onPress={showPreviousPhoto}>
                <ChevronLeft size={24} color="#ffffff" />
              </Pressable>
            ) : null}
            <Image source={{ uri: selectedPhoto }} style={styles.photoViewerImage} resizeMode="contain" />
            {photos.length > 1 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Next image" style={[styles.photoViewerNavBtn, styles.photoViewerNavRight]} onPress={showNextPhoto}>
                <ChevronRight size={24} color="#ffffff" />
              </Pressable>
            ) : null}
          </View>

          {photos.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoViewerThumbRow}>
              {photos.map((photo, index) => {
                const active = index === activePhotoIndex;
                return (
                  <Pressable key={`viewer-${photo}-${index}`} style={[styles.photoViewerThumb, active && styles.photoViewerThumbActive]} onPress={() => setSelectedPhotoIndex(index)}>
                    <Image source={{ uri: photo }} style={styles.photoViewerThumbImage} />
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
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
  photoViewer: { flex: 1, backgroundColor: "#050b12" },
  photoViewerTopBar: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  photoViewerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.13)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoViewerTitle: { flex: 1, color: "#ffffff", fontSize: 15, fontWeight: "900", textAlign: "center" },
  photoViewerCountBadge: {
    minWidth: 40,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.13)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  photoViewerCountText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  photoViewerImageWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  photoViewerImage: { width: "100%", height: "100%" },
  photoViewerNavBtn: {
    position: "absolute",
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoViewerNavLeft: { left: 12 },
  photoViewerNavRight: { right: 12 },
  photoViewerThumbRow: { gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18 },
  photoViewerThumb: {
    width: 64,
    height: 58,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  photoViewerThumbActive: { borderColor: "#ffffff" },
  photoViewerThumbImage: { width: "100%", height: "100%" },
  photoCountBadge: {
    position: "absolute",
    right: 12,
    bottom: 12,
    borderRadius: 999,
    backgroundColor: "rgba(11,61,79,0.84)",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  photoCountText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  thumbnailRow: { gap: 10, paddingHorizontal: 2, paddingVertical: 2, paddingRight: 12 },
  thumbnail: {
    width: 78,
    height: 72,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
    backgroundColor: "#dbeef3",
  },
  thumbnailActive: { borderColor: "#0f6d80" },
  thumbnailImage: { width: "100%", height: "100%" },
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
