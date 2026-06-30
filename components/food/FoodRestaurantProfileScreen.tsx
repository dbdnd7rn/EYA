import React from "react";
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Bike, ChevronRight, Clock3, Mail, MapPin, MessageCircle, Phone, Plus, ShieldCheck, Star, UtensilsCrossed } from "lucide-react-native";
import { buildFoodSelectionSummary, getDefaultFoodSelections, type FoodMenuSelectionMap } from "@/lib/foodMenu";
import { kwacha } from "@/lib/currency";
import { getFoodRestaurantByVendorId, inferFoodMealType, type FoodCard } from "@/lib/newApp/browse";
import { goBackOrFallback } from "@/lib/navigation";

type Props = {
  fallbackRoute: "/(food)/(tabs)/food" | "/(student)/(tabs)/food";
};

type ServiceMode = "delivery" | "pickup";

function itemRoute(fallbackRoute: Props["fallbackRoute"]) {
  return fallbackRoute === "/(food)/(tabs)/food" ? "/(food)/item/[id]" : "/(student)/food/[id]";
}

function previewOptions(item: FoodCard) {
  return item.menuConfig?.sections
    ?.flatMap((section) => section.options.slice(0, 3).map((option) => option.name))
    .slice(0, 5)
    .join(" - ") || item.menuSummary || item.cuisine;
}

export default function FoodRestaurantProfileScreen({ fallbackRoute }: Props) {
  const router = useRouter();
  const params = useLocalSearchParams<{ vendorId?: string }>();
  const galleryRef = React.useRef<ScrollView | null>(null);
  const { width } = useWindowDimensions();
  const heroWidth = Math.max(280, width);
  const [restaurant, setRestaurant] = React.useState<Awaited<ReturnType<typeof getFoodRestaurantByVendorId>>>(null);
  const [loading, setLoading] = React.useState(true);
  const [galleryIndex, setGalleryIndex] = React.useState(0);
  const [serviceMode, setServiceMode] = React.useState<ServiceMode>("delivery");
  const [selectedBuilderId, setSelectedBuilderId] = React.useState<string | null>(null);
  const [builderSelections, setBuilderSelections] = React.useState<FoodMenuSelectionMap>({});

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

  const foodItems = React.useMemo(() => ((restaurant?.items ?? []) as FoodCard[]), [restaurant]);
  const featuredItems = React.useMemo(() => foodItems.slice(0, 5), [foodItems]);
  const customizableItems = React.useMemo(() => foodItems.filter((item) => item.menuConfig?.sections?.length), [foodItems]);
  const builderItem = React.useMemo(
    () => customizableItems.find((item) => item.id === selectedBuilderId) ?? customizableItems[0] ?? null,
    [customizableItems, selectedBuilderId],
  );

  const galleryImages = React.useMemo(
    () => (restaurant?.galleryImages.length ? restaurant.galleryImages : restaurant ? [restaurant.bannerImage] : []),
    [restaurant],
  );

  React.useEffect(() => {
    const firstBuilder = customizableItems[0] ?? null;
    setSelectedBuilderId(firstBuilder?.id ?? null);
    setBuilderSelections(getDefaultFoodSelections(firstBuilder?.menuConfig));
  }, [restaurant?.id, customizableItems]);

  React.useEffect(() => {
    setGalleryIndex(0);
    if (galleryImages.length <= 1) return;
    const timer = setInterval(() => {
      setGalleryIndex((current) => {
        const next = (current + 1) % galleryImages.length;
        galleryRef.current?.scrollTo({ x: next * heroWidth, animated: true });
        return next;
      });
    }, 5200);
    return () => clearInterval(timer);
  }, [galleryImages, heroWidth]);

  const groupedItems = React.useMemo(
    () =>
      foodItems.reduce<Record<string, FoodCard[]>>((acc, item) => {
        const key = inferFoodMealType(item);
        (acc[key] ||= []).push(item);
        return acc;
      }, {}),
    [foodItems],
  );

  const builderSummary = builderItem
    ? buildFoodSelectionSummary(builderItem.meal, builderItem.mealPrice, builderItem.menuConfig, builderSelections)
    : null;
  const builderDeliveryFee = builderItem && serviceMode === "delivery" ? builderItem.deliveryFee : 0;
  const builderTotal = (builderSummary?.unitPrice ?? 0) + builderDeliveryFee;
  const missingBuilderChoices = Boolean(builderSummary?.missingRequiredSectionIds.length);

  const openItem = (item: FoodCard) => {
    router.push({
      pathname: itemRoute(fallbackRoute),
      params: { id: item.id },
    } as any);
  };

  const selectBuilderItem = (item: FoodCard) => {
    setSelectedBuilderId(item.id);
    setBuilderSelections(getDefaultFoodSelections(item.menuConfig));
  };

  const toggleBuilderOption = (sectionId: string, optionId: string, selection: "single" | "multiple") => {
    setBuilderSelections((current) => {
      const existing = Array.isArray(current[sectionId]) ? current[sectionId] : [];
      if (selection === "single") return { ...current, [sectionId]: [optionId] };
      const next = existing.includes(optionId)
        ? existing.filter((value) => value !== optionId)
        : [...existing, optionId];
      return { ...current, [sectionId]: next };
    });
  };

  const checkoutBuilderMeal = () => {
    if (!builderItem || !builderSummary || missingBuilderChoices || !restaurant?.isOpen) return;
    router.push({
      pathname: "/(student)/checkout",
      params: {
        mode: "food",
        title: builderSummary.itemTitle,
        base: String(builderSummary.unitPrice),
        delivery: String(builderDeliveryFee),
        item_id: builderItem.id,
        vendor_id: builderItem.vendorId,
        channel: "food",
        delivery_mode: serviceMode === "delivery" ? "doorstep" : "pickup",
        food_selection: JSON.stringify(builderSelections),
        food_summary: builderSummary.summaryText,
        food_base_title: builderItem.meal,
      },
    } as any);
  };

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
          <Pressable style={styles.emptyBtn} onPress={() => goBackOrFallback(router, fallbackRoute)}>
            <Text style={styles.emptyBtnText}>Back to food</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <ScrollView
            ref={galleryRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => setGalleryIndex(Math.round(event.nativeEvent.contentOffset.x / heroWidth))}
          >
            {galleryImages.map((imageUrl, index) => (
              <Image key={`${imageUrl}-${index}`} source={{ uri: imageUrl }} style={[styles.heroImage, { width: heroWidth }]} />
            ))}
          </ScrollView>
          <View style={styles.heroOverlay} />
          <View style={styles.heroTopBar}>
            <Pressable style={styles.heroIconButton} onPress={() => goBackOrFallback(router, fallbackRoute)}>
              <ArrowLeft size={20} color="#ffffff" />
            </Pressable>
            <Pressable
              style={styles.heroIconButton}
              onPress={() =>
                router.push({
                  pathname: "/(student)/vendor-chat/[vendorId]",
                  params: { vendorId: restaurant.id, channel: "food" },
                } as any)
              }
            >
              <MessageCircle size={20} color="#ffffff" />
            </Pressable>
          </View>
          <View style={styles.galleryDots}>
            {galleryImages.map((imageUrl, index) => <View key={`${imageUrl}-dot-${index}`} style={[styles.galleryDot, index === galleryIndex && styles.galleryDotActive]} />)}
          </View>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Image source={{ uri: restaurant.avatarImage ?? restaurant.heroImage }} style={styles.avatarImage} />
          </View>
          <Text style={styles.restaurantName}>{restaurant.name}</Text>
          <Text style={styles.restaurantSub}>{restaurant.description}</Text>
          <View style={styles.ratingLine}>
            <Star size={15} color="#f1b634" fill="#f1b634" />
            <Text style={styles.ratingText}>{restaurant.rating.toFixed(1)}</Text>
            <Text style={styles.ratingMuted}>{restaurant.isOpen ? "Open now" : "Closed"} - {restaurant.area}, {restaurant.campus}</Text>
          </View>

          <View style={styles.modeRow}>
            <View style={styles.segmented}>
              {(["delivery", "pickup"] as ServiceMode[]).map((mode) => {
                const active = serviceMode === mode;
                return (
                  <Pressable key={mode} style={[styles.segmentButton, active && styles.segmentButtonActive]} onPress={() => setServiceMode(mode)}>
                    {mode === "delivery" ? <Bike size={15} color={active ? "#0e2756" : "#6d8192"} /> : <UtensilsCrossed size={15} color={active ? "#0e2756" : "#6d8192"} />}
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{mode === "delivery" ? "Delivery" : "Pickup"}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.etaPill}>
              <Clock3 size={15} color="#6d8192" />
              <Text style={styles.etaText}>{foodItems[0]?.etaMins ?? 20} - {(foodItems[0]?.etaMins ?? 20) + 10} min</Text>
            </View>
          </View>
        </View>

        {featuredItems.length ? (
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Featured items</Text>
              <Text style={styles.sectionCount}>{featuredItems.length} picks</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRail}>
              {featuredItems.map((item) => (
                <FeaturedFoodCard key={item.id} item={item} onPress={() => openItem(item)} onBuild={() => (item.hasCustomization ? selectBuilderItem(item) : openItem(item))} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.builderCard}>
          <View style={styles.builderHeader}>
            <View>
              <Text style={styles.sectionTitle}>Build your plate</Text>
              <Text style={styles.builderSub}>Choose a meal base, pick your options, then checkout from here.</Text>
            </View>
            <View style={styles.builderBadge}>
              <Text style={styles.builderBadgeText}>EYA custom</Text>
            </View>
          </View>

          {builderItem && builderSummary ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.builderMealRail}>
                {customizableItems.map((item) => {
                  const active = item.id === builderItem.id;
                  return (
                    <Pressable key={item.id} style={[styles.builderMealChip, active && styles.builderMealChipActive]} onPress={() => selectBuilderItem(item)}>
                      <Text style={[styles.builderMealChipText, active && styles.builderMealChipTextActive]}>{item.meal}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.builderFocus}>
                <Image source={{ uri: builderItem.image }} style={styles.builderImage} />
                <View style={styles.builderFocusCopy}>
                  <Text style={styles.builderMealName}>{builderItem.meal}</Text>
                  <Text style={styles.builderPreview} numberOfLines={2}>{previewOptions(builderItem)}</Text>
                  <Text style={styles.builderPrice}>From {kwacha(builderItem.mealPrice)}</Text>
                </View>
              </View>

              {builderItem.menuConfig?.sections.map((section) => {
                const selectedIds = builderSelections[section.id] ?? [];
                return (
                  <View key={section.id} style={styles.builderSection}>
                    <View style={styles.builderSectionHead}>
                      <Text style={styles.builderSectionTitle}>{section.title}</Text>
                      <Text style={styles.builderSectionMeta}>{section.required ? "Required" : "Optional"} - {section.selection === "single" ? "Pick one" : "Pick any"}</Text>
                    </View>
                    <View style={styles.optionGrid}>
                      {section.options.map((option) => {
                        const selected = selectedIds.includes(option.id);
                        return (
                          <Pressable
                            key={option.id}
                            style={[styles.optionChip, selected && styles.optionChipActive]}
                            onPress={() => toggleBuilderOption(section.id, option.id, section.selection)}
                          >
                            <Text style={[styles.optionName, selected && styles.optionNameActive]}>{option.name}</Text>
                            <Text style={[styles.optionPrice, selected && styles.optionPriceActive]}>
                              {option.priceDelta > 0 ? `+ ${kwacha(option.priceDelta)}` : "Included"}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <View style={styles.currentPlate}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.currentPlateLabel}>Current plate</Text>
                  <Text style={styles.currentPlateName} numberOfLines={2}>{builderSummary.itemTitle}</Text>
                  <Text style={styles.currentPlateMeta}>{serviceMode === "delivery" ? `Delivery +${kwacha(builderDeliveryFee)}` : "Pickup selected"}</Text>
                </View>
                <View style={styles.currentPlateRight}>
                  <Text style={styles.currentPlateTotal}>{kwacha(builderTotal)}</Text>
                  <Pressable
                    style={[styles.checkoutButton, (!restaurant.isOpen || missingBuilderChoices) && styles.checkoutButtonDisabled]}
                    disabled={!restaurant.isOpen || missingBuilderChoices}
                    onPress={checkoutBuilderMeal}
                  >
                    <Text style={styles.checkoutButtonText}>{missingBuilderChoices ? "Complete" : "Checkout"}</Text>
                    {!missingBuilderChoices && restaurant.isOpen ? <ChevronRight size={17} color="#ffffff" /> : null}
                  </Pressable>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.builderEmpty}>
              <ShieldCheck size={21} color="#0f6d80" />
              <Text style={styles.builderEmptyTitle}>Custom meals will appear here</Text>
              <Text style={styles.builderEmptyText}>This restaurant has not added build-your-own options yet. You can still open a menu item and order from its page.</Text>
            </View>
          )}
        </View>

        <View style={styles.menuCard}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Menu</Text>
            <Text style={styles.sectionCount}>{foodItems.length} meals</Text>
          </View>

          {Object.entries(groupedItems).map(([group, items]) => (
            <View key={group} style={styles.groupBlock}>
              <Text style={styles.groupTitle}>{group}</Text>
              <View style={styles.listColumn}>
                {items.map((item) => (
                  <RestaurantListingCard
                    key={item.id}
                    item={item}
                    onPress={() => openItem(item)}
                    onBuild={() => (item.hasCustomization ? selectBuilderItem(item) : openItem(item))}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionTitle}>Restaurant details</Text>
          <View style={styles.infoGrid}>
            <InfoCard icon={<ShieldCheck size={18} color="#0f6d80" />} title="Trusted kitchen" text="Verified restaurant with active student delivery." />
            <InfoCard icon={<Bike size={18} color="#0d7a37" />} title="Delivery support" text="Meals can be delivered near your campus." />
            {restaurant.openingHours ? <InfoCard icon={<Clock3 size={18} color="#86652a" />} title="Opening hours" text={restaurant.openingHours} /> : null}
            {restaurant.contactPhone ? <InfoCard icon={<Phone size={18} color="#0f6d80" />} title="Contact phone" text={restaurant.contactPhone} /> : null}
            {restaurant.contactEmail ? <InfoCard icon={<Mail size={18} color="#16315f" />} title="Contact email" text={restaurant.contactEmail} /> : null}
            <InfoCard icon={<MapPin size={18} color="#16315f" />} title="Location" text={`${restaurant.area}, ${restaurant.campus}`} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeaturedFoodCard({ item, onBuild, onPress }: { item: FoodCard; onBuild: () => void; onPress: () => void }) {
  return (
    <Pressable style={styles.featuredCard} onPress={onPress}>
      <Image source={{ uri: item.image }} style={styles.featuredImage} />
      <View style={styles.featuredCopy}>
        <Text numberOfLines={1} style={styles.featuredName}>{item.meal}</Text>
        <Text style={styles.featuredPrice}>{item.hasCustomization ? `From ${kwacha(item.mealPrice)}` : kwacha(item.mealPrice)}</Text>
      </View>
      <Pressable
        style={styles.plusButton}
        onPress={(event) => {
          event.stopPropagation();
          onBuild();
        }}
      >
        <Plus size={18} color="#0e2756" />
      </Pressable>
    </Pressable>
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

function RestaurantListingCard({ item, onBuild, onPress }: { item: FoodCard; onBuild: () => void; onPress: () => void }) {
  return (
    <Pressable style={styles.listingCard} onPress={onPress}>
      <View style={styles.listingCopy}>
        <Text numberOfLines={1} style={styles.listingName}>{item.meal}</Text>
        <Text numberOfLines={2} style={styles.listingSub}>{previewOptions(item)}</Text>
        <Text style={styles.listingPrice}>{item.hasCustomization ? `From ${kwacha(item.mealPrice)}` : kwacha(item.mealPrice)}</Text>
      </View>
      <View style={styles.listingImageWrap}>
        <Image source={{ uri: item.image }} style={styles.listingImage} />
        <Pressable
          style={styles.rowPlusButton}
          onPress={(event) => {
            event.stopPropagation();
            onBuild();
          }}
        >
          <Plus size={18} color="#0e2756" />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  content: { paddingBottom: 38 },
  heroCard: { height: 228, overflow: "hidden", backgroundColor: "#d9e6ea" },
  heroImage: { height: 228, backgroundColor: "#d9e6ea" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(11,21,39,0.33)" },
  heroTopBar: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(13,24,43,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  galleryDots: {
    position: "absolute",
    right: 16,
    bottom: 18,
    flexDirection: "row",
    gap: 6,
  },
  galleryDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.38)" },
  galleryDotActive: { width: 19, backgroundColor: "#ffffff" },
  profileCard: {
    marginTop: -34,
    marginHorizontal: 16,
    borderRadius: 30,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e6ecfa",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    alignItems: "center",
    gap: 10,
    shadowColor: "#0e2756",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  avatarWrap: {
    position: "absolute",
    top: -44,
    width: 88,
    height: 88,
    borderRadius: 44,
    padding: 5,
    backgroundColor: "#ffffff",
    shadowColor: "#0e2756",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  avatarImage: { width: "100%", height: "100%", borderRadius: 39, backgroundColor: "#d9e6ea" },
  restaurantName: { color: "#0e2756", fontSize: 28, fontWeight: "900", textAlign: "center" },
  restaurantSub: { color: "#6e7892", fontSize: 13, fontWeight: "700", lineHeight: 19, textAlign: "center" },
  ratingLine: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" },
  ratingText: { color: "#0e2756", fontSize: 13, fontWeight: "900" },
  ratingMuted: { color: "#7b879c", fontSize: 12, fontWeight: "700" },
  modeRow: { width: "100%", marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  segmented: {
    flex: 1,
    minHeight: 45,
    borderRadius: 999,
    backgroundColor: "#f4f6fb",
    borderWidth: 1,
    borderColor: "#e7ecfa",
    flexDirection: "row",
    padding: 3,
  },
  segmentButton: { flex: 1, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  segmentButtonActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#0e2756",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  segmentText: { color: "#6d8192", fontSize: 13, fontWeight: "900" },
  segmentTextActive: { color: "#0e2756" },
  etaPill: {
    minHeight: 45,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7ecfa",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  etaText: { color: "#53657a", fontSize: 13, fontWeight: "900" },
  sectionBlock: { paddingTop: 18, gap: 12 },
  sectionHead: { paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { color: "#0e2756", fontSize: 21, fontWeight: "900" },
  sectionCount: { color: "#7b879c", fontSize: 12, fontWeight: "900" },
  featuredRail: { paddingHorizontal: 16, gap: 12 },
  featuredCard: { width: 148, gap: 8, position: "relative" },
  featuredImage: { width: 148, height: 116, borderRadius: 16, backgroundColor: "#e6ecfa" },
  featuredCopy: { gap: 3 },
  featuredName: { color: "#0e2756", fontSize: 14, fontWeight: "900" },
  featuredPrice: { color: "#6e7892", fontSize: 13, fontWeight: "800" },
  plusButton: {
    position: "absolute",
    right: 8,
    top: 84,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0e7f5",
    alignItems: "center",
    justifyContent: "center",
  },
  builderCard: {
    marginTop: 18,
    marginHorizontal: 16,
    borderRadius: 28,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e6ecfa",
    padding: 16,
    gap: 14,
    shadowColor: "#0e2756",
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  builderHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  builderSub: { color: "#6e7892", fontSize: 13, fontWeight: "700", lineHeight: 19, marginTop: 3 },
  builderBadge: { borderRadius: 999, backgroundColor: "#fff1f6", borderWidth: 1, borderColor: "#ffd0df", paddingHorizontal: 10, paddingVertical: 7 },
  builderBadgeText: { color: "#ff0f64", fontSize: 11, fontWeight: "900" },
  builderMealRail: { gap: 8 },
  builderMealChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e1e8f5",
    backgroundColor: "#f8faff",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  builderMealChipActive: { backgroundColor: "#0e2756", borderColor: "#0e2756" },
  builderMealChipText: { color: "#5d6f86", fontSize: 12, fontWeight: "900" },
  builderMealChipTextActive: { color: "#ffffff" },
  builderFocus: { borderRadius: 20, backgroundColor: "#f8faff", borderWidth: 1, borderColor: "#e6ecfa", padding: 10, flexDirection: "row", gap: 11, alignItems: "center" },
  builderImage: { width: 76, height: 76, borderRadius: 16, backgroundColor: "#e6ecfa" },
  builderFocusCopy: { flex: 1, gap: 3 },
  builderMealName: { color: "#0e2756", fontSize: 16, fontWeight: "900" },
  builderPreview: { color: "#6e7892", fontSize: 12, fontWeight: "700", lineHeight: 17 },
  builderPrice: { color: "#0f6d80", fontSize: 14, fontWeight: "900" },
  builderSection: { gap: 9 },
  builderSectionHead: { gap: 3 },
  builderSectionTitle: { color: "#0e2756", fontSize: 15, fontWeight: "900" },
  builderSectionMeta: { color: "#8a94af", fontSize: 12, fontWeight: "800" },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: {
    width: "48%",
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e1e8f5",
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: "center",
    gap: 3,
  },
  optionChipActive: { backgroundColor: "#0e2756", borderColor: "#0e2756" },
  optionName: { color: "#0e2756", fontSize: 13, fontWeight: "900" },
  optionNameActive: { color: "#ffffff" },
  optionPrice: { color: "#7b879c", fontSize: 11, fontWeight: "800" },
  optionPriceActive: { color: "#dce6ff" },
  currentPlate: { borderRadius: 22, backgroundColor: "#0e2756", padding: 14, flexDirection: "row", gap: 12, alignItems: "center" },
  currentPlateLabel: { color: "#bfcfff", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  currentPlateName: { color: "#ffffff", fontSize: 15, fontWeight: "900", marginTop: 2 },
  currentPlateMeta: { color: "#d9e4ff", fontSize: 12, fontWeight: "800", marginTop: 3 },
  currentPlateRight: { alignItems: "flex-end", gap: 7 },
  currentPlateTotal: { color: "#ffffff", fontSize: 18, fontWeight: "900" },
  checkoutButton: { borderRadius: 999, backgroundColor: "#ff0f64", paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 4 },
  checkoutButtonDisabled: { backgroundColor: "#8a94af" },
  checkoutButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  builderEmpty: { borderRadius: 20, backgroundColor: "#f8faff", borderWidth: 1, borderColor: "#e6ecfa", padding: 14, gap: 8, alignItems: "center" },
  builderEmptyTitle: { color: "#0e2756", fontSize: 15, fontWeight: "900" },
  builderEmptyText: { color: "#6e7892", fontSize: 12, fontWeight: "700", lineHeight: 18, textAlign: "center" },
  menuCard: { marginTop: 18, marginHorizontal: 16, borderRadius: 28, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e6ecfa", paddingVertical: 16, gap: 14 },
  groupBlock: { gap: 10 },
  groupTitle: { color: "#0e2756", fontSize: 20, fontWeight: "900", paddingHorizontal: 16 },
  listColumn: { gap: 0 },
  listingCard: { minHeight: 116, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#eef2fb", flexDirection: "row", alignItems: "center", gap: 12 },
  listingCopy: { flex: 1, gap: 5 },
  listingName: { color: "#0e2756", fontSize: 16, fontWeight: "900" },
  listingSub: { color: "#8a94af", fontSize: 13, fontWeight: "700", lineHeight: 18 },
  listingPrice: { color: "#0e2756", fontSize: 14, fontWeight: "900" },
  listingImageWrap: { width: 94, height: 86, position: "relative" },
  listingImage: { width: 94, height: 86, borderRadius: 16, backgroundColor: "#e6ecfa" },
  rowPlusButton: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dfe6f3",
    alignItems: "center",
    justifyContent: "center",
  },
  infoCard: { marginTop: 18, marginHorizontal: 16, borderRadius: 28, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e6ecfa", padding: 16, gap: 14 },
  infoGrid: { gap: 10 },
  infoMiniCard: { borderRadius: 20, backgroundColor: "#f8faff", borderWidth: 1, borderColor: "#e6ecfa", padding: 13, gap: 7 },
  infoIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: "#eef8fb", alignItems: "center", justifyContent: "center" },
  infoTitle: { color: "#0e2756", fontSize: 14, fontWeight: "900" },
  infoText: { color: "#6e7892", fontSize: 12, fontWeight: "700", lineHeight: 18 },
  emptyCard: { flex: 1, margin: 16, borderRadius: 26, backgroundColor: "#fff", borderWidth: 1, borderColor: "#d7e4ea", padding: 20, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyTitle: { color: "#16315f", fontSize: 18, fontWeight: "900" },
  emptySub: { color: "#607784", fontSize: 13, fontWeight: "600", textAlign: "center" },
  emptyBtn: { marginTop: 8, borderRadius: 999, backgroundColor: "#0e2756", paddingHorizontal: 16, paddingVertical: 11 },
  emptyBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  skeletonHero: { height: 250, backgroundColor: "#d8e8ef" },
  skeletonBlock: { marginHorizontal: 16, height: 180, borderRadius: 24, backgroundColor: "#e2eef2", marginTop: 16 },
});
