import React from "react";
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Bike, ChevronRight, Clock3, Mail, MapPin, MessageCircle, Phone, ShieldCheck, Star, UtensilsCrossed } from "lucide-react-native";
import { kwacha } from "@/lib/currency";
import { getFoodRestaurantByVendorId, inferFoodMealType, type FoodCard } from "@/lib/newApp/browse";
import { goBackOrFallback } from "@/lib/navigation";

type Props = {
  fallbackRoute: "/(food)/(tabs)/food" | "/(student)/(tabs)/food";
};

export default function FoodRestaurantProfileScreen({ fallbackRoute }: Props) {
  const router = useRouter();
  const params = useLocalSearchParams<{ vendorId?: string }>();
  const [restaurant, setRestaurant] = React.useState<Awaited<ReturnType<typeof getFoodRestaurantByVendorId>>>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const next = params.vendorId ? await getFoodRestaurantByVendorId(params.vendorId) : null;
        if (active) setRestaurant(next);
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

  if (!restaurant) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Restaurant unavailable</Text>
          <Text style={styles.emptySub}>This restaurant profile is not available right now.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const groupedItems = restaurant.items.reduce<Record<string, FoodCard[]>>((acc, item) => {
    const key = inferFoodMealType(item as FoodCard);
    (acc[key] ||= []).push(item as FoodCard);
    return acc;
  }, {});

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backBtn} onPress={() => goBackOrFallback(router, fallbackRoute)}>
          <ArrowLeft size={18} color="#16315f" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.heroCard}>
          <Image source={{ uri: restaurant.bannerImage }} style={styles.heroImage} />
          <View style={styles.heroOverlay} />
          <View style={styles.heroBadge}>
            <UtensilsCrossed size={14} color="#fff" />
            <Text style={styles.heroBadgeText}>Restaurant profile</Text>
          </View>
          <View style={styles.avatarWrap}>
            <Image source={{ uri: restaurant.avatarImage ?? restaurant.heroImage }} style={styles.avatarImage} />
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle}>{restaurant.name}</Text>
            <View style={styles.metaRow}>
              <MetaPill icon={<Star size={12} color="#ffd166" fill="#ffd166" />} label={restaurant.rating.toFixed(1)} />
              <MetaPill icon={<Clock3 size={12} color="#fff" />} label={restaurant.isOpen ? "Open now" : "Closed"} />
              <MetaPill icon={<MapPin size={12} color="#fff" />} label={`${restaurant.area}, ${restaurant.campus}`} />
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>About this restaurant</Text>
          <Text style={styles.description}>{restaurant.description}</Text>

          <View style={styles.actionRow}>
            <Pressable
              style={styles.contactBtn}
              onPress={() =>
                router.push({
                  pathname: "/(student)/vendor-chat/[vendorId]",
                  params: {
                    vendorId: restaurant.id,
                    channel: "food",
                  },
                })
              }
            >
              <MessageCircle size={18} color="#ffffff" />
              <Text style={styles.contactBtnText}>Contact restaurant</Text>
            </Pressable>
          </View>

          <View style={styles.infoGrid}>
            <InfoCard icon={<ShieldCheck size={18} color="#0f6d80" />} title="Trusted kitchen" text="Verified restaurant with active student delivery." />
            <InfoCard icon={<Bike size={18} color="#0d7a37" />} title="Delivery support" text="Meals can be delivered near your campus." />
            {restaurant.openingHours ? <InfoCard icon={<Clock3 size={18} color="#86652a" />} title="Opening hours" text={restaurant.openingHours} /> : null}
            {restaurant.contactPhone ? <InfoCard icon={<Phone size={18} color="#0f6d80" />} title="Contact phone" text={restaurant.contactPhone} /> : null}
            {restaurant.contactEmail ? <InfoCard icon={<Mail size={18} color="#16315f" />} title="Contact email" text={restaurant.contactEmail} /> : null}
          </View>
        </View>

        <View style={styles.listingsCard}>
          <View style={styles.listingsHead}>
            <Text style={styles.sectionTitle}>Menu listings</Text>
            <Text style={styles.listingsCount}>{restaurant.items.length} meals</Text>
          </View>

          {Object.entries(groupedItems).map(([group, items]) => (
            <View key={group} style={styles.groupBlock}>
              <Text style={styles.groupTitle}>{group}</Text>
              <View style={styles.listColumn}>
                {items.map((item) => (
                  <RestaurantListingCard
                    key={item.id}
                    item={item}
                    onPress={() =>
                      router.push({
                        pathname: fallbackRoute === "/(food)/(tabs)/food" ? "/(food)/item/[id]" : "/(student)/food/[id]",
                        params: { id: item.id },
                      })
                    }
                  />
                ))}
              </View>
            </View>
          ))}
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

function RestaurantListingCard({ item, onPress }: { item: FoodCard; onPress: () => void }) {
  return (
    <Pressable style={styles.listingCard} onPress={onPress}>
      <Image source={{ uri: item.image }} style={styles.listingImage} />
      <View style={styles.listingCopy}>
        <Text numberOfLines={1} style={styles.listingName}>{item.meal}</Text>
        <Text numberOfLines={1} style={styles.listingSub}>{item.cuisine}</Text>
        <Text style={styles.listingPrice}>{kwacha(item.mealPrice)}</Text>
      </View>
      <ChevronRight size={18} color="#7a8ea4" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef6f8" },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  backBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d7e4ea",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backText: { color: "#16315f", fontSize: 13, fontWeight: "800" },
  heroCard: { height: 280, borderRadius: 30, overflow: "hidden", backgroundColor: "#d9e6ea" },
  heroImage: { width: "100%", height: "100%", position: "absolute" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(18,31,58,0.34)" },
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
    bottom: 78,
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 4,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  avatarImage: { width: "100%", height: "100%", borderRadius: 34, backgroundColor: "#d9e6ea" },
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
  infoCard: { borderRadius: 28, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e4ea", padding: 16, gap: 14 },
  sectionTitle: { color: "#16315f", fontSize: 18, fontWeight: "900" },
  description: { color: "#607784", fontSize: 14, fontWeight: "600", lineHeight: 22 },
  actionRow: { flexDirection: "row", gap: 10 },
  contactBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#16315f",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  contactBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  infoGrid: { gap: 10 },
  infoMiniCard: { borderRadius: 22, backgroundColor: "#f7fbfc", borderWidth: 1, borderColor: "#dfebef", padding: 14, gap: 8 },
  infoIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: "#e7f4f6", alignItems: "center", justifyContent: "center" },
  infoTitle: { color: "#16315f", fontSize: 15, fontWeight: "900" },
  infoText: { color: "#64808c", fontSize: 13, fontWeight: "600", lineHeight: 19 },
  listingsCard: { borderRadius: 28, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e4ea", padding: 16, gap: 14 },
  listingsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listingsCount: { color: "#6d8192", fontSize: 13, fontWeight: "700" },
  groupBlock: { gap: 10 },
  groupTitle: { color: "#556b79", fontSize: 14, fontWeight: "900", textTransform: "uppercase" },
  listColumn: { gap: 12 },
  listingCard: { borderRadius: 22, backgroundColor: "#f8fcfd", borderWidth: 1, borderColor: "#e1edf1", padding: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  listingImage: { width: 84, height: 84, borderRadius: 16, backgroundColor: "#dde8eb" },
  listingCopy: { flex: 1, gap: 4 },
  listingName: { color: "#16315f", fontSize: 15, fontWeight: "900" },
  listingSub: { color: "#7a8b98", fontSize: 13, fontWeight: "700" },
  listingPrice: { color: "#0f6d80", fontSize: 17, fontWeight: "900" },
  emptyCard: { flex: 1, margin: 16, borderRadius: 26, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e4ea", padding: 20, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyTitle: { color: "#16315f", fontSize: 18, fontWeight: "900" },
  emptySub: { color: "#607784", fontSize: 13, fontWeight: "600", textAlign: "center" },
  skeletonHero: { margin: 16, height: 260, borderRadius: 28, backgroundColor: "#d8e8ef" },
  skeletonBlock: { marginHorizontal: 16, height: 180, borderRadius: 24, backgroundColor: "#e2eef2", marginTop: 12 },
});
