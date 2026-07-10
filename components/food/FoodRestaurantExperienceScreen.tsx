import React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  Bike,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Heart,
  Mail,
  MapPin,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Star,
  UtensilsCrossed,
  X,
} from "lucide-react-native";
import {
  buildFoodSelectionSummary,
  getDefaultFoodSelections,
  type FoodMenuSelectionMap,
} from "@/lib/foodMenu";
import { kwacha } from "@/lib/currency";
import {
  getFoodRestaurantByVendorId,
  inferFoodMealType,
  type FoodCard,
} from "@/lib/newApp/browse";
import { goBackOrFallback } from "@/lib/navigation";

type Props = {
  fallbackRoute: "/(food)/(tabs)/food" | "/(student)/(tabs)/food";
};

type ServiceMode = "delivery" | "pickup";

type BasketItem = {
  item: FoodCard;
  selections: FoodMenuSelectionMap;
  quantity: number;
  note: string;
};

const COLORS = {
  background: "#f5f3fb",
  surface: "#ffffff",
  surfaceMuted: "#f6f8fc",
  navy: "#102b66",
  navySoft: "#18366f",
  teal: "#0f8f8d",
  tealSoft: "#e5f6f4",
  text: "#102b5e",
  muted: "#74809b",
  border: "#e5e9f4",
  gold: "#f3b83f",
  green: "#24a76b",
  danger: "#d94d61",
} as const;

function itemRoute(fallbackRoute: Props["fallbackRoute"]) {
  return fallbackRoute === "/(food)/(tabs)/food"
    ? "/(food)/item/[id]"
    : "/(student)/food/[id]";
}

function previewOptions(item: FoodCard) {
  return (
    item.menuConfig?.sections
      ?.flatMap((section) => section.options.slice(0, 3).map((option) => option.name))
      .slice(0, 5)
      .join(" • ") ||
    item.menuSummary ||
    item.cuisine
  );
}

export default function FoodRestaurantExperienceScreen({ fallbackRoute }: Props) {
  const router = useRouter();
  const params = useLocalSearchParams<{ vendorId?: string }>();
  const [restaurant, setRestaurant] = React.useState<Awaited<ReturnType<typeof getFoodRestaurantByVendorId>>>(null);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState("Popular");
  const [serviceMode, setServiceMode] = React.useState<ServiceMode>("delivery");
  const [favorite, setFavorite] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);
  const [selectedItem, setSelectedItem] = React.useState<FoodCard | null>(null);
  const [selectionMap, setSelectionMap] = React.useState<FoodMenuSelectionMap>({});
  const [quantity, setQuantity] = React.useState(1);
  const [note, setNote] = React.useState("");
  const [basket, setBasket] = React.useState<BasketItem | null>(null);

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
  const groupedItems = React.useMemo(
    () =>
      foodItems.reduce<Record<string, FoodCard[]>>((acc, item) => {
        const key = inferFoodMealType(item);
        (acc[key] ||= []).push(item);
        return acc;
      }, {}),
    [foodItems],
  );
  const categories = React.useMemo(() => ["Popular", ...Object.keys(groupedItems)], [groupedItems]);
  const popularItems = React.useMemo(() => foodItems.slice(0, 5), [foodItems]);

  const visibleItems = React.useMemo(() => {
    const source = activeCategory === "Popular" ? foodItems : groupedItems[activeCategory] ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return source;
    return source.filter((item) =>
      [item.meal, item.cuisine, item.description, item.menuSummary]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [activeCategory, foodItems, groupedItems, query]);

  const selectedSummary = React.useMemo(
    () =>
      selectedItem
        ? buildFoodSelectionSummary(
            selectedItem.meal,
            selectedItem.mealPrice,
            selectedItem.menuConfig,
            selectionMap,
          )
        : null,
    [selectedItem, selectionMap],
  );

  const basketSummary = React.useMemo(
    () =>
      basket
        ? buildFoodSelectionSummary(
            basket.item.meal,
            basket.item.mealPrice,
            basket.item.menuConfig,
            basket.selections,
          )
        : null,
    [basket],
  );

  const selectedDeliveryFee = selectedItem && serviceMode === "delivery" ? selectedItem.deliveryFee : 0;
  const selectedTotal = (selectedSummary?.unitPrice ?? 0) * quantity + selectedDeliveryFee;
  const basketDeliveryFee = basket && serviceMode === "delivery" ? basket.item.deliveryFee : 0;
  const basketTotal = (basketSummary?.unitPrice ?? 0) * (basket?.quantity ?? 0) + basketDeliveryFee;
  const missingChoices = Boolean(selectedSummary?.missingRequiredSectionIds.length);

  const openCustomizer = (item: FoodCard) => {
    setSelectedItem(item);
    setSelectionMap(getDefaultFoodSelections(item.menuConfig));
    setQuantity(1);
    setNote("");
  };

  const toggleOption = (sectionId: string, optionId: string, selection: "single" | "multiple") => {
    setSelectionMap((current) => {
      const existing = Array.isArray(current[sectionId]) ? current[sectionId] : [];
      if (selection === "single") return { ...current, [sectionId]: [optionId] };
      const next = existing.includes(optionId)
        ? existing.filter((value) => value !== optionId)
        : [...existing, optionId];
      return { ...current, [sectionId]: next };
    });
  };

  const addToBasket = () => {
    if (!selectedItem || !selectedSummary || missingChoices || !restaurant?.isOpen) return;
    setBasket({
      item: selectedItem,
      selections: selectionMap,
      quantity,
      note: note.trim(),
    });
    setSelectedItem(null);
  };

  const checkoutBasket = () => {
    if (!basket || !basketSummary || !restaurant?.isOpen) return;
    const foodSummary = [basketSummary.summaryText, basket.note ? `Note: ${basket.note}` : ""]
      .filter(Boolean)
      .join(" | ");
    router.push({
      pathname: "/(student)/checkout",
      params: {
        mode: "food",
        title: basketSummary.itemTitle,
        base: String(basketSummary.unitPrice),
        delivery: String(basketDeliveryFee),
        quantity: String(basket.quantity),
        item_id: basket.item.id,
        vendor_id: basket.item.vendorId,
        channel: "food",
        delivery_mode: serviceMode === "delivery" ? "doorstep" : "pickup",
        food_selection: JSON.stringify(basket.selections),
        food_summary: foodSummary,
        food_base_title: basket.item.meal,
      },
    } as any);
  };

  const openItemPage = (item: FoodCard) => {
    router.push({ pathname: itemRoute(fallbackRoute), params: { id: item.id } } as any);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={COLORS.teal} />
        <Text style={styles.loadingText}>Opening restaurant...</Text>
      </SafeAreaView>
    );
  }

  if (!restaurant) {
    return (
      <SafeAreaView style={styles.loadingRoot}>
        <View style={styles.emptyCard}>
          <UtensilsCrossed size={30} color={COLORS.teal} />
          <Text style={styles.emptyTitle}>Restaurant unavailable</Text>
          <Text style={styles.emptyText}>This food provider is not available right now.</Text>
          <Pressable style={styles.primaryButton} onPress={() => goBackOrFallback(router, fallbackRoute)}>
            <Text style={styles.primaryButtonText}>Back to food</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const eta = foodItems[0]?.etaMins ?? 25;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={[styles.content, basket ? styles.contentWithBasket : null]}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[2]}
      >
        <View style={styles.hero}>
          <Image source={{ uri: restaurant.bannerImage || restaurant.heroImage }} style={styles.heroImage} />
          <View style={styles.heroOverlay} />
          <View style={styles.heroActions}>
            <Pressable style={styles.heroButton} onPress={() => goBackOrFallback(router, fallbackRoute)}>
              <ArrowLeft size={21} color="#ffffff" />
            </Pressable>
            <View style={styles.heroRightActions}>
              <Pressable
                style={styles.heroButton}
                onPress={() =>
                  router.push({
                    pathname: "/(student)/vendor-chat/[vendorId]",
                    params: { vendorId: restaurant.id, channel: "food" },
                  } as any)
                }
              >
                <MessageCircle size={20} color="#ffffff" />
              </Pressable>
              <Pressable style={styles.heroButton} onPress={() => setFavorite((current) => !current)}>
                <Heart size={20} color="#ffffff" fill={favorite ? "#ffffff" : "transparent"} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatarShell}>
            <Image source={{ uri: restaurant.avatarImage ?? restaurant.heroImage }} style={styles.avatar} />
          </View>
          <Text style={styles.restaurantName}>{restaurant.name}</Text>
          <Text style={styles.restaurantDescription} numberOfLines={2}>{restaurant.description}</Text>

          <View style={styles.restaurantMeta}>
            <View style={styles.metaItem}>
              <Star size={15} color={COLORS.gold} fill={COLORS.gold} />
              <Text style={styles.metaStrong}>{restaurant.rating.toFixed(1)}</Text>
            </View>
            <View style={styles.openDot} />
            <Text style={[styles.metaStrong, { color: restaurant.isOpen ? COLORS.green : COLORS.danger }]}>
              {restaurant.isOpen ? "Open now" : "Closed"}
            </Text>
            <View style={styles.metaItem}>
              <MapPin size={14} color={COLORS.muted} />
              <Text style={styles.metaText}>{restaurant.area}, {restaurant.campus}</Text>
            </View>
          </View>

          <View style={styles.fulfilmentRow}>
            <View style={styles.modeSwitch}>
              <Pressable
                style={[styles.modeButton, serviceMode === "delivery" && styles.modeButtonActive]}
                onPress={() => setServiceMode("delivery")}
              >
                <Bike size={15} color={serviceMode === "delivery" ? COLORS.navy : COLORS.muted} />
                <Text style={[styles.modeText, serviceMode === "delivery" && styles.modeTextActive]}>Delivery</Text>
              </Pressable>
              <Pressable
                style={[styles.modeButton, serviceMode === "pickup" && styles.modeButtonActive]}
                onPress={() => setServiceMode("pickup")}
              >
                <UtensilsCrossed size={15} color={serviceMode === "pickup" ? COLORS.navy : COLORS.muted} />
                <Text style={[styles.modeText, serviceMode === "pickup" && styles.modeTextActive]}>Pickup</Text>
              </Pressable>
            </View>
            <View style={styles.etaPill}>
              <Clock3 size={15} color={COLORS.muted} />
              <Text style={styles.etaText}>{eta}–{eta + 10} min</Text>
            </View>
          </View>
        </View>

        <View style={styles.stickyTools}>
          <View style={styles.searchBox}>
            <Search size={19} color={COLORS.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${restaurant.name}`}
              placeholderTextColor="#929bb0"
              style={styles.searchInput}
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={10}>
                <X size={18} color={COLORS.muted} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRail}>
            {categories.map((category) => {
              const active = category === activeCategory;
              return (
                <Pressable
                  key={category}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => setActiveCategory(category)}
                >
                  <Text style={[styles.categoryText, active && styles.categoryTextActive]}>{category}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {activeCategory === "Popular" && !query && popularItems.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Popular near campus</Text>
                <Text style={styles.sectionSubtitle}>Quick picks students order most</Text>
              </View>
              <Text style={styles.sectionCount}>{popularItems.length} picks</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.popularRail}>
              {popularItems.map((item) => (
                <PopularCard
                  key={item.id}
                  item={item}
                  onOpen={() => openItemPage(item)}
                  onAdd={() => openCustomizer(item)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.menuSection}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>{activeCategory === "Popular" ? "Full menu" : activeCategory}</Text>
              <Text style={styles.sectionSubtitle}>{visibleItems.length} meal{visibleItems.length === 1 ? "" : "s"} available</Text>
            </View>
          </View>

          <View style={styles.menuList}>
            {visibleItems.map((item) => (
              <MenuRow
                key={item.id}
                item={item}
                onOpen={() => openItemPage(item)}
                onAdd={() => openCustomizer(item)}
              />
            ))}
            {!visibleItems.length ? (
              <View style={styles.noResults}>
                <Search size={24} color={COLORS.muted} />
                <Text style={styles.noResultsTitle}>No meals found</Text>
                <Text style={styles.noResultsText}>Try another search or menu category.</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Pressable style={styles.aboutCard} onPress={() => setShowDetails((current) => !current)}>
          <View style={styles.aboutTop}>
            <View style={styles.aboutIcon}>
              <ShieldCheck size={20} color={COLORS.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.aboutTitle}>About this kitchen</Text>
              <Text style={styles.aboutSubtitle}>Verified provider, contact details and opening hours</Text>
            </View>
            <ChevronDown
              size={20}
              color={COLORS.muted}
              style={{ transform: [{ rotate: showDetails ? "180deg" : "0deg" }] }}
            />
          </View>

          {showDetails ? (
            <View style={styles.detailsGrid}>
              <DetailRow icon={<MapPin size={17} color={COLORS.teal} />} label="Location" value={`${restaurant.area}, ${restaurant.campus}`} />
              {restaurant.openingHours ? <DetailRow icon={<Clock3 size={17} color={COLORS.teal} />} label="Opening hours" value={restaurant.openingHours} /> : null}
              {restaurant.contactPhone ? <DetailRow icon={<Phone size={17} color={COLORS.teal} />} label="Phone" value={restaurant.contactPhone} /> : null}
              {restaurant.contactEmail ? <DetailRow icon={<Mail size={17} color={COLORS.teal} />} label="Email" value={restaurant.contactEmail} /> : null}
            </View>
          ) : null}
        </Pressable>
      </ScrollView>

      {basket && basketSummary ? (
        <View style={styles.basketDock}>
          <Pressable style={styles.basketButton} onPress={checkoutBasket}>
            <View style={styles.basketIcon}>
              <ShoppingBag size={20} color="#ffffff" />
            </View>
            <View style={styles.basketCopy}>
              <Text style={styles.basketTitle}>View basket</Text>
              <Text style={styles.basketMeta}>{basket.quantity} item{basket.quantity === 1 ? "" : "s"} • {serviceMode}</Text>
            </View>
            <Text style={styles.basketTotal}>{kwacha(basketTotal)}</Text>
            <ChevronRight size={21} color="#ffffff" />
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={Boolean(selectedItem)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalEyebrow}>CUSTOMIZE MEAL</Text>
                <Text style={styles.modalTitle}>{selectedItem?.meal ?? "Meal"}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setSelectedItem(null)}>
                <X size={20} color={COLORS.navy} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
              {selectedItem ? (
                <>
                  <Image source={{ uri: selectedItem.image }} style={styles.modalImage} />
                  <View style={styles.modalMealTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalMealName}>{selectedItem.meal}</Text>
                      <Text style={styles.modalMealDescription} numberOfLines={3}>{selectedItem.description}</Text>
                    </View>
                    <Text style={styles.modalBasePrice}>From {kwacha(selectedItem.mealPrice)}</Text>
                  </View>

                  <View style={styles.quantityCard}>
                    <Text style={styles.quantityLabel}>Quantity</Text>
                    <View style={styles.quantityControl}>
                      <Pressable style={styles.quantityButton} onPress={() => setQuantity((value) => Math.max(1, value - 1))}>
                        <Minus size={17} color={COLORS.navy} />
                      </Pressable>
                      <Text style={styles.quantityValue}>{quantity}</Text>
                      <Pressable style={[styles.quantityButton, styles.quantityButtonActive]} onPress={() => setQuantity((value) => Math.min(20, value + 1))}>
                        <Plus size={17} color="#ffffff" />
                      </Pressable>
                    </View>
                  </View>

                  {selectedItem.menuConfig?.sections.map((section) => {
                    const selectedIds = selectionMap[section.id] ?? [];
                    return (
                      <View key={section.id} style={styles.optionSection}>
                        <View style={styles.optionSectionHeader}>
                          <View>
                            <Text style={styles.optionSectionTitle}>{section.title}</Text>
                            <Text style={styles.optionSectionMeta}>{section.required ? "Required" : "Optional"} • {section.selection === "single" ? "Pick one" : "Pick any"}</Text>
                          </View>
                          {section.required ? <View style={styles.requiredPill}><Text style={styles.requiredText}>Required</Text></View> : null}
                        </View>

                        <View style={styles.optionGrid}>
                          {section.options.map((option) => {
                            const active = selectedIds.includes(option.id);
                            return (
                              <Pressable
                                key={option.id}
                                style={[styles.optionCard, active && styles.optionCardActive]}
                                onPress={() => toggleOption(section.id, option.id, section.selection)}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.optionName, active && styles.optionNameActive]}>{option.name}</Text>
                                  <Text style={[styles.optionPrice, active && styles.optionPriceActive]}>
                                    {option.priceDelta > 0 ? `+ ${kwacha(option.priceDelta)}` : "Included"}
                                  </Text>
                                </View>
                                {active ? (
                                  <View style={styles.checkCircle}>
                                    <Check size={14} color={COLORS.navy} />
                                  </View>
                                ) : null}
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}

                  <View style={styles.noteSection}>
                    <Text style={styles.optionSectionTitle}>Special instructions</Text>
                    <Text style={styles.optionSectionMeta}>Optional • The kitchen will see this note</Text>
                    <TextInput
                      value={note}
                      onChangeText={setNote}
                      placeholder="e.g. No onions, less salt..."
                      placeholderTextColor="#9aa3b6"
                      multiline
                      maxLength={180}
                      style={styles.noteInput}
                    />
                    <Text style={styles.noteCount}>{note.length}/180</Text>
                  </View>
                </>
              ) : null}
            </ScrollView>

            <View style={styles.modalFooter}>
              <View>
                <Text style={styles.modalTotalLabel}>Current total</Text>
                <Text style={styles.modalTotal}>{kwacha(selectedTotal)}</Text>
              </View>
              <Pressable
                style={[styles.addBasketButton, (missingChoices || !restaurant.isOpen) && styles.addBasketButtonDisabled]}
                disabled={missingChoices || !restaurant.isOpen}
                onPress={addToBasket}
              >
                <Text style={styles.addBasketText}>
                  {!restaurant.isOpen ? "Kitchen closed" : missingChoices ? "Complete choices" : "Add to basket"}
                </Text>
                {!missingChoices && restaurant.isOpen ? <ShoppingBag size={18} color="#ffffff" /> : null}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function PopularCard({ item, onAdd, onOpen }: { item: FoodCard; onAdd: () => void; onOpen: () => void }) {
  return (
    <Pressable style={styles.popularCard} onPress={onOpen}>
      <Image source={{ uri: item.image }} style={styles.popularImage} />
      <View style={styles.popularCopy}>
        <Text style={styles.popularName} numberOfLines={1}>{item.meal}</Text>
        <Text style={styles.popularDescription} numberOfLines={1}>{previewOptions(item)}</Text>
        <Text style={styles.popularPrice}>{item.hasCustomization ? `From ${kwacha(item.mealPrice)}` : kwacha(item.mealPrice)}</Text>
      </View>
      <Pressable
        style={styles.addCircle}
        onPress={(event) => {
          event.stopPropagation();
          onAdd();
        }}
      >
        <Plus size={19} color="#ffffff" />
      </Pressable>
    </Pressable>
  );
}

function MenuRow({ item, onAdd, onOpen }: { item: FoodCard; onAdd: () => void; onOpen: () => void }) {
  return (
    <Pressable style={styles.menuRow} onPress={onOpen}>
      <View style={styles.menuRowCopy}>
        <Text style={styles.menuName} numberOfLines={1}>{item.meal}</Text>
        <Text style={styles.menuDescription} numberOfLines={2}>{previewOptions(item)}</Text>
        <View style={styles.menuPriceRow}>
          <Text style={styles.menuPrice}>{item.hasCustomization ? `From ${kwacha(item.mealPrice)}` : kwacha(item.mealPrice)}</Text>
          {item.hasCustomization ? <Text style={styles.customizableText}>Customizable</Text> : null}
        </View>
      </View>
      <View style={styles.menuImageWrap}>
        <Image source={{ uri: item.image }} style={styles.menuImage} />
        <Pressable
          style={styles.menuAddButton}
          onPress={(event) => {
            event.stopPropagation();
            onAdd();
          }}
        >
          <Plus size={18} color={COLORS.navy} />
        </Pressable>
      </View>
    </Pressable>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  loadingRoot: { flex: 1, backgroundColor: COLORS.background, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  loadingText: { color: COLORS.muted, fontSize: 14, fontWeight: "700" },
  content: { paddingBottom: 36 },
  contentWithBasket: { paddingBottom: 132 },
  hero: { height: 250, overflow: "hidden", backgroundColor: COLORS.navy },
  heroImage: { width: "100%", height: "100%" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(7,18,42,0.44)" },
  heroActions: { position: "absolute", top: 16, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroRightActions: { flexDirection: "row", gap: 10 },
  heroButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(9,25,52,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", alignItems: "center", justifyContent: "center" },
  profileCard: { marginTop: -40, marginHorizontal: 16, borderRadius: 30, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, alignItems: "center", gap: 9, shadowColor: COLORS.navy, shadowOpacity: 0.11, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  avatarShell: { position: "absolute", top: -45, width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.surface, padding: 5, shadowColor: COLORS.navy, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  avatar: { width: "100%", height: "100%", borderRadius: 40, backgroundColor: COLORS.surfaceMuted },
  restaurantName: { color: COLORS.text, fontSize: 29, fontWeight: "900", textAlign: "center", letterSpacing: -0.5 },
  restaurantDescription: { color: COLORS.muted, fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center" },
  restaurantMeta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaStrong: { color: COLORS.text, fontSize: 13, fontWeight: "900" },
  metaText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  openDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green, marginLeft: 2 },
  fulfilmentRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  modeSwitch: { flex: 1, minHeight: 47, borderRadius: 999, backgroundColor: COLORS.surfaceMuted, borderWidth: 1, borderColor: COLORS.border, padding: 3, flexDirection: "row" },
  modeButton: { flex: 1, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  modeButtonActive: { backgroundColor: COLORS.surface, shadowColor: COLORS.navy, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  modeText: { color: COLORS.muted, fontSize: 13, fontWeight: "900" },
  modeTextActive: { color: COLORS.navy },
  etaPill: { minHeight: 47, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13 },
  etaText: { color: COLORS.muted, fontSize: 13, fontWeight: "900" },
  stickyTools: { backgroundColor: COLORS.background, paddingTop: 16, paddingBottom: 10, gap: 10, zIndex: 10 },
  searchBox: { marginHorizontal: 16, minHeight: 54, borderRadius: 19, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: "700", paddingVertical: 12 },
  categoryRail: { paddingHorizontal: 16, gap: 9 },
  categoryChip: { minHeight: 42, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  categoryChipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  categoryText: { color: COLORS.text, fontSize: 13, fontWeight: "900" },
  categoryTextActive: { color: "#ffffff" },
  section: { paddingTop: 10, gap: 12 },
  sectionHeader: { paddingHorizontal: 16, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 23, fontWeight: "900", letterSpacing: -0.4 },
  sectionSubtitle: { color: COLORS.muted, fontSize: 12, fontWeight: "700", marginTop: 3 },
  sectionCount: { color: COLORS.teal, fontSize: 12, fontWeight: "900" },
  popularRail: { paddingHorizontal: 16, gap: 12 },
  popularCard: { width: 176, borderRadius: 22, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden", position: "relative" },
  popularImage: { width: "100%", height: 124, backgroundColor: COLORS.surfaceMuted },
  popularCopy: { padding: 12, gap: 4 },
  popularName: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  popularDescription: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  popularPrice: { color: COLORS.teal, fontSize: 14, fontWeight: "900", marginTop: 3 },
  addCircle: { position: "absolute", right: 10, top: 103, width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.teal, borderWidth: 3, borderColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  menuSection: { paddingTop: 22, gap: 12 },
  menuList: { marginHorizontal: 16, borderRadius: 26, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },
  menuRow: { minHeight: 146, padding: 14, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  menuRowCopy: { flex: 1, gap: 6 },
  menuName: { color: COLORS.text, fontSize: 18, fontWeight: "900" },
  menuDescription: { color: COLORS.muted, fontSize: 13, lineHeight: 18, fontWeight: "700" },
  menuPriceRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  menuPrice: { color: COLORS.teal, fontSize: 15, fontWeight: "900" },
  customizableText: { color: COLORS.navySoft, fontSize: 10, fontWeight: "900", backgroundColor: COLORS.tealSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  menuImageWrap: { width: 116, height: 112, position: "relative" },
  menuImage: { width: "100%", height: "100%", borderRadius: 18, backgroundColor: COLORS.surfaceMuted },
  menuAddButton: { position: "absolute", right: -5, bottom: -5, width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", shadowColor: COLORS.navy, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  noResults: { padding: 30, alignItems: "center", gap: 8 },
  noResultsTitle: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  noResultsText: { color: COLORS.muted, fontSize: 13, fontWeight: "700", textAlign: "center" },
  aboutCard: { marginTop: 18, marginHorizontal: 16, borderRadius: 24, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 16, gap: 14 },
  aboutTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  aboutIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.tealSoft, alignItems: "center", justifyContent: "center" },
  aboutTitle: { color: COLORS.text, fontSize: 17, fontWeight: "900" },
  aboutSubtitle: { color: COLORS.muted, fontSize: 12, lineHeight: 17, fontWeight: "700", marginTop: 2 },
  detailsGrid: { gap: 10, paddingTop: 4 },
  detailRow: { borderRadius: 18, backgroundColor: COLORS.surfaceMuted, borderWidth: 1, borderColor: COLORS.border, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
  detailIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.tealSoft, alignItems: "center", justifyContent: "center" },
  detailLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  detailValue: { color: COLORS.text, fontSize: 14, fontWeight: "800", marginTop: 2 },
  basketDock: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(245,243,251,0.96)", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },
  basketButton: { minHeight: 74, borderRadius: 25, backgroundColor: COLORS.navy, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12, shadowColor: COLORS.navy, shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 8 },
  basketIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.teal, alignItems: "center", justifyContent: "center" },
  basketCopy: { flex: 1 },
  basketTitle: { color: "#ffffff", fontSize: 17, fontWeight: "900" },
  basketMeta: { color: "#cbd6ef", fontSize: 12, fontWeight: "700", marginTop: 2 },
  basketTotal: { color: "#ffffff", fontSize: 18, fontWeight: "900" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(5,13,29,0.48)", justifyContent: "flex-end" },
  modalSheet: { maxHeight: "92%", backgroundColor: COLORS.background, borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: "hidden" },
  modalHandle: { width: 50, height: 5, borderRadius: 3, backgroundColor: "#c8cedc", alignSelf: "center", marginTop: 10 },
  modalHeader: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  modalEyebrow: { color: COLORS.teal, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  modalTitle: { color: COLORS.text, fontSize: 24, fontWeight: "900", marginTop: 2 },
  closeButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  modalContent: { paddingHorizontal: 16, paddingBottom: 18, gap: 16 },
  modalImage: { width: "100%", height: 220, borderRadius: 24, backgroundColor: COLORS.surfaceMuted },
  modalMealTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  modalMealName: { color: COLORS.text, fontSize: 23, fontWeight: "900" },
  modalMealDescription: { color: COLORS.muted, fontSize: 13, lineHeight: 19, fontWeight: "700", marginTop: 4 },
  modalBasePrice: { color: COLORS.teal, fontSize: 15, fontWeight: "900", marginTop: 4 },
  quantityCard: { minHeight: 62, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quantityLabel: { color: COLORS.text, fontSize: 16, fontWeight: "900" },
  quantityControl: { flexDirection: "row", alignItems: "center", gap: 14 },
  quantityButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surfaceMuted, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  quantityButtonActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  quantityValue: { minWidth: 20, textAlign: "center", color: COLORS.text, fontSize: 17, fontWeight: "900" },
  optionSection: { gap: 10 },
  optionSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  optionSectionTitle: { color: COLORS.text, fontSize: 19, fontWeight: "900" },
  optionSectionMeta: { color: COLORS.muted, fontSize: 12, fontWeight: "700", marginTop: 2 },
  requiredPill: { borderRadius: 999, backgroundColor: COLORS.tealSoft, paddingHorizontal: 9, paddingVertical: 6 },
  requiredText: { color: COLORS.teal, fontSize: 10, fontWeight: "900" },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  optionCard: { width: "48.5%", minHeight: 74, borderRadius: 19, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, padding: 13, flexDirection: "row", alignItems: "center", gap: 8 },
  optionCardActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  optionName: { color: COLORS.text, fontSize: 15, fontWeight: "900" },
  optionNameActive: { color: "#ffffff" },
  optionPrice: { color: COLORS.muted, fontSize: 12, fontWeight: "800", marginTop: 3 },
  optionPriceActive: { color: "#d9e3ff" },
  checkCircle: { width: 25, height: 25, borderRadius: 13, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  noteSection: { gap: 7 },
  noteInput: { minHeight: 86, borderRadius: 19, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, color: COLORS.text, fontSize: 14, fontWeight: "700", paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: "top" },
  noteCount: { alignSelf: "flex-end", color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  modalFooter: { minHeight: 86, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14 },
  modalTotalLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  modalTotal: { color: COLORS.text, fontSize: 23, fontWeight: "900", marginTop: 2 },
  addBasketButton: { minHeight: 54, borderRadius: 18, backgroundColor: COLORS.teal, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  addBasketButtonDisabled: { backgroundColor: "#9ca8b9" },
  addBasketText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  emptyCard: { width: "100%", maxWidth: 430, borderRadius: 28, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", padding: 24, gap: 10 },
  emptyTitle: { color: COLORS.text, fontSize: 21, fontWeight: "900" },
  emptyText: { color: COLORS.muted, fontSize: 13, fontWeight: "700", textAlign: "center" },
  primaryButton: { minHeight: 50, borderRadius: 17, backgroundColor: COLORS.teal, alignItems: "center", justifyContent: "center", paddingHorizontal: 22, marginTop: 4 },
  primaryButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
});
