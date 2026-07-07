import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ChevronRight, Clock3, Heart, Mail, MapPin, MessageCircle, Phone, ShieldCheck, ShoppingBag, Star, Truck } from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import { getMarketShopByVendorId, inferMarketCategory, type MarketCard } from "@/lib/newApp/browse";
import { goBackOrFallback } from "@/lib/navigation";
import { isShopSaved, toggleSavedShop } from "@/lib/marketInterest";

type Props = {
  fallbackRoute: "/(market)/(tabs)/marketplace" | "/(student)/(tabs)/marketplace" | "/(student)/market";
};

export default function MarketShopProfileScreen({ fallbackRoute }: Props) {
  const router = useRouter();
  const params = useLocalSearchParams<{ vendorId?: string }>();
  const isStudentView = fallbackRoute !== "/(market)/(tabs)/marketplace";
  const [shop, setShop] = React.useState<Awaited<ReturnType<typeof getMarketShopByVendorId>>>(null);
  const [loading, setLoading] = React.useState(true);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const next = params.vendorId ? await getMarketShopByVendorId(params.vendorId) : null;
        if (active) setShop(next);
        if (active && params.vendorId) setSaved(await isShopSaved(params.vendorId));
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [params.vendorId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.skeletonHero} />
        <View style={styles.skeletonBlock} />
        <View style={styles.skeletonBlock} />
      </SafeAreaView>
    );
  }

  if (!shop) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Shop unavailable</Text>
          <Text style={styles.emptySub}>This shop profile is not available right now.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const groupedItems = shop.items.reduce<Record<string, MarketCard[]>>((acc, item) => {
    const key = inferMarketCategory(item as MarketCard);
    (acc[key] ||= []).push(item as MarketCard);
    return acc;
  }, {});

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backBtn} onPress={() => goBackOrFallback(router, fallbackRoute as any)}>
          <ArrowLeft size={18} color="#0d3950" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.heroCard}>
          <Image source={{ uri: shop.bannerImage }} style={styles.heroImage} />
          <View style={styles.heroOverlay} />
          <View style={styles.heroBadge}>
            <ShoppingBag size={14} color="#fff" />
            <Text style={styles.heroBadgeText}>Verified shop</Text>
          </View>
          <View style={styles.avatarWrap}>
            <Image source={{ uri: shop.avatarImage ?? shop.heroImage }} style={styles.avatarImage} />
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle}>{shop.name}</Text>
            <View style={styles.metaRow}>
              <MetaPill icon={<Star size={12} color="#ffd166" fill="#ffd166" />} label={shop.rating.toFixed(1)} />
              <MetaPill icon={<MapPin size={12} color="#fff" />} label={`${shop.area}, ${shop.campus}`} />
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>About this shop</Text>
          <Text style={styles.description}>{shop.description}</Text>

          <View style={styles.actionRow}>
            <Pressable
              style={styles.contactBtn}
              onPress={() =>
                router.push({
                  pathname: "/(student)/vendor-chat/[vendorId]",
                  params: {
                    vendorId: shop.id,
                    channel: "market",
                  },
                })
              }
            >
              <MessageCircle size={18} color="#ffffff" />
              <Text style={styles.contactBtnText}>Message</Text>
            </Pressable>
            <Pressable
              style={styles.softActionBtn}
              onPress={() =>
                router.push({
                  pathname: "/(student)/vendor-chat/[vendorId]",
                  params: {
                    vendorId: shop.id,
                    channel: "market",
                    subject: `About ${shop.name}`,
                    message: "Hi, where are you located and what new products do you have?",
                  },
                })
              }
            >
              <Text style={styles.softActionText}>Ask seller</Text>
            </Pressable>
            <Pressable
              style={styles.softActionBtn}
              onPress={async () => {
                const next = await toggleSavedShop(shop.id);
                setSaved(next);
              }}
            >
              <Heart size={16} color={saved ? "#ff0f64" : "#0d3950"} fill={saved ? "#ff0f64" : "transparent"} />
              <Text style={styles.softActionText}>{saved ? "Saved" : "Save shop"}</Text>
            </Pressable>
          </View>

          <View style={styles.infoGrid}>
            <InfoCard icon={<ShieldCheck size={18} color="#0f6d80" />} title="Trusted seller" text="Verified campus shop with active listings." />
            <InfoCard icon={<Truck size={18} color="#0d6d39" />} title="Delivery ready" text="Door delivery available on supported products." />
            {shop.openingHours ? <InfoCard icon={<Clock3 size={18} color="#86652a" />} title="Opening hours" text={shop.openingHours} /> : null}
            {shop.contactPhone ? <InfoCard icon={<Phone size={18} color="#0f6d80" />} title="Contact phone" text={shop.contactPhone} /> : null}
            {shop.contactEmail ? <InfoCard icon={<Mail size={18} color="#0d3950" />} title="Contact email" text={shop.contactEmail} /> : null}
          </View>
        </View>

        <View style={styles.listingsCard}>
          <View style={styles.listingsHead}>
            <Text style={styles.sectionTitle}>New products</Text>
            <Text style={styles.listingsCount}>{shop.items.length} items</Text>
          </View>

          {Object.entries(groupedItems).map(([group, items]) => (
            <View key={group} style={styles.groupBlock}>
              <Text style={styles.groupTitle}>{group}</Text>
              <View style={styles.grid}>
                {items.map((item) => (
                  <ShopListingCard
                    key={item.id}
                    item={item}
                    onPress={() =>
                      router.push({
                        pathname: isStudentView ? "/(student)/market/[id]" : "/(market)/item/[id]",
                        params: { id: item.id },
                      })
                    }
                  />
                ))}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.listingsCard}>
          <View style={styles.listingsHead}>
            <Text style={styles.sectionTitle}>Similar items</Text>
            <Text style={styles.listingsCount}>Picked for you</Text>
          </View>
          <View style={styles.grid}>
            {shop.items.slice(0, 2).map((item) => (
              <ShopListingCard
                key={`${item.id}-similar`}
                item={item as MarketCard}
                onPress={() =>
                  router.push({
                    pathname: isStudentView ? "/(student)/market/[id]" : "/(market)/item/[id]",
                    params: { id: item.id },
                  })
                }
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.metaPill}>
      {icon}
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

function InfoCard({ icon, text, title }: { icon: React.ReactNode; text: string; title: string }) {
  return (
    <View style={styles.infoMiniCard}>
      <View style={styles.infoIcon}>{icon}</View>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function ShopListingCard({ item, onPress }: { item: MarketCard; onPress: () => void }) {
  return (
    <Pressable style={styles.listingCard} onPress={onPress}>
      <Image source={{ uri: item.image }} style={styles.listingImage} />
      <Text numberOfLines={2} style={styles.listingName}>{item.name}</Text>
      <Text style={styles.listingPrice}>{kwacha(item.price)}</Text>
      <View style={styles.listingFooter}>
        <Text style={styles.listingMeta}>{item.area}</Text>
        <ChevronRight size={16} color="#5d88a2" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#edf8fb" },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  backBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d4e6ee",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backText: { color: "#0d3950", fontSize: 13, fontWeight: "800" },
  heroCard: { height: 270, borderRadius: 30, overflow: "hidden", backgroundColor: "#d7edf3" },
  heroImage: { width: "100%", height: "100%", position: "absolute" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(12,29,47,0.34)" },
  heroBadge: {
    marginTop: 16,
    marginLeft: 16,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroBadgeText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  avatarWrap: {
    position: "absolute",
    left: 16,
    bottom: 74,
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 4,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  avatarImage: { width: "100%", height: "100%", borderRadius: 34, backgroundColor: "#d7edf3" },
  heroBottom: { marginTop: "auto", padding: 16, gap: 10 },
  heroTitle: { color: "#fff", fontSize: 31, fontWeight: "900" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaPill: {
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  infoCard: { borderRadius: 28, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e7ee", padding: 16, gap: 14 },
  sectionTitle: { color: "#0d3950", fontSize: 18, fontWeight: "900" },
  description: { color: "#58717d", fontSize: 14, fontWeight: "600", lineHeight: 22 },
  actionRow: { flexDirection: "row", gap: 10 },
  contactBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#0f6d80",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  contactBtnText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  softActionBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d6e8ef",
    backgroundColor: "#f8fcfd",
    paddingHorizontal: 15,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  softActionText: { color: "#0d3950", fontSize: 13, fontWeight: "800" },
  infoGrid: { gap: 10 },
  infoMiniCard: { borderRadius: 22, backgroundColor: "#f6fbfd", borderWidth: 1, borderColor: "#dfeff4", padding: 14, gap: 8 },
  infoIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: "#e8f5f9", alignItems: "center", justifyContent: "center" },
  infoTitle: { color: "#0d3950", fontSize: 15, fontWeight: "900" },
  infoText: { color: "#67808c", fontSize: 13, fontWeight: "600", lineHeight: 19 },
  listingsCard: { borderRadius: 28, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e7ee", padding: 16, gap: 14 },
  listingsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listingsCount: { color: "#67808c", fontSize: 13, fontWeight: "700" },
  groupBlock: { gap: 10 },
  groupTitle: { color: "#47616d", fontSize: 14, fontWeight: "900", textTransform: "uppercase" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  listingCard: { width: "48%", borderRadius: 22, backgroundColor: "#f8fcfd", borderWidth: 1, borderColor: "#e1edf1", padding: 10, gap: 8 },
  listingImage: { width: "100%", height: 120, borderRadius: 16, backgroundColor: "#dbeef3" },
  listingName: { color: "#0d3950", fontSize: 14, fontWeight: "900", minHeight: 38 },
  listingPrice: { color: "#0f6d80", fontSize: 17, fontWeight: "900" },
  listingFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listingMeta: { color: "#6c8490", fontSize: 12, fontWeight: "700" },
  emptyCard: { flex: 1, margin: 16, borderRadius: 26, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e7ee", padding: 20, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyTitle: { color: "#0d3950", fontSize: 18, fontWeight: "900" },
  emptySub: { color: "#607784", fontSize: 13, fontWeight: "600", textAlign: "center" },
  skeletonHero: { margin: 16, height: 260, borderRadius: 28, backgroundColor: "#d8edf2" },
  skeletonBlock: { marginHorizontal: 16, height: 180, borderRadius: 24, backgroundColor: "#e2f1f5", marginTop: 12 },
});
