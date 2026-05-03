import { supabaseNewApp } from "../supabaseNewApp";
import {
  buildDefaultFoodMenuConfig,
  type FoodMenuConfig,
  parseFoodDescription,
  summarizeFoodMenu,
} from "../foodMenu";
import { getSellerProductMetaMap, getSellerShopMeta } from "../sellerEnhancements";
import { getSellerStorefrontMeta } from "../sellerStorefront";
import type { CatalogItemRow, VendorRow } from "./types";

export type MarketCard = {
  id: string;
  vendorId: string;
  name: string;
  vendor: string;
  category: string;
  area: string;
  campus: string;
  price: number;
  deliveryFee: number;
  rating: number;
  image: string;
  description: string;
  listedAt: string;
  refreshedAt: string;
  rankingScore: number;
};

export type FoodCard = {
  id: string;
  vendorId: string;
  name: string;
  cuisine: string;
  area: string;
  campus: string;
  etaMins: number;
  meal: string;
  mealPrice: number;
  deliveryFee: number;
  rating: number;
  isOpen: boolean;
  image: string;
  description: string;
  menuConfig: FoodMenuConfig | null;
  menuSummary: string;
  hasCustomization: boolean;
};

export type VendorCollection = {
  id: string;
  name: string;
  description: string;
  area: string;
  campus: string;
  city: string;
  rating: number;
  isOpen: boolean;
  heroImage: string;
  avatarImage: string | null;
  bannerImage: string;
  openingHours?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  whatsapp?: string | null;
  galleryImages: string[];
  items: (MarketCard | FoodCard)[];
};

export function inferMarketCategory(item: Pick<MarketCard, "name" | "description">) {
  const text = `${item.name} ${item.description}`.toLowerCase();
  if (text.includes("lamp") || text.includes("power") || text.includes("electronic") || text.includes("charger")) return "Electronics";
  if (text.includes("chair") || text.includes("desk") || text.includes("study") || text.includes("book")) return "Study";
  if (text.includes("bedding") || text.includes("room") || text.includes("hostel")) return "Room";
  if (text.includes("shirt") || text.includes("shoe") || text.includes("cloth")) return "Fashion";
  return "Essentials";
}

export function inferFoodMealType(item: Pick<FoodCard, "meal" | "cuisine">) {
  const text = `${item.meal} ${item.cuisine}`.toLowerCase();
  if (text.includes("burger") || text.includes("fast")) return "Fast food";
  if (text.includes("rice") || text.includes("fish") || text.includes("local")) return "Local meals";
  if (text.includes("grill") || text.includes("chicken")) return "Grill";
  return item.cuisine || "Popular";
}

const LEGACY_MARKET_SEED_SIGNATURES = [
  { name: "Study Chair", description: "Comfortable hostel study chair", price_mwk: 45000, stock_qty: 3 },
  { name: "Desk Lamp", description: "Soft light for late reading", price_mwk: 18000, stock_qty: 8 },
  { name: "Microwave", description: "Quick hostel kitchen essential", price_mwk: 5200, stock_qty: 2 },
] as const;

const DEV_FOOD_CARDS: FoodCard[] = [
  {
    id: "dev-food-1",
    vendorId: "dev-food-vendor-1",
    name: "Soche Canteen",
    cuisine: "Local meals",
    area: "Soche East",
    campus: "MUST",
    etaMins: 25,
    meal: "Lunch plate",
    mealPrice: 3500,
    deliveryFee: 1800,
    rating: 4.8,
    isOpen: true,
    image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=80",
    description: "Build your lunch with rice, nsima, spaghetti, or macaroni and add the protein you want.",
    menuConfig: buildDefaultFoodMenuConfig(),
    menuSummary: summarizeFoodMenu(buildDefaultFoodMenuConfig()),
    hasCustomization: true,
  },
  {
    id: "dev-food-2",
    vendorId: "dev-food-vendor-2",
    name: "Poly Kitchen",
    cuisine: "Student plates",
    area: "Namiwawa",
    campus: "MUBAS",
    etaMins: 22,
    meal: "Dinner special",
    mealPrice: 4200,
    deliveryFee: 2000,
    rating: 4.5,
    isOpen: true,
    image: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
    description: "Choose your starch, then add fish, beef, chicken, or sausage depending on your budget.",
    menuConfig: buildDefaultFoodMenuConfig(),
    menuSummary: summarizeFoodMenu(buildDefaultFoodMenuConfig()),
    hasCustomization: true,
  },
  {
    id: "dev-food-3",
    vendorId: "dev-food-vendor-3",
    name: "Hostel Bites",
    cuisine: "Local meals",
    area: "Old Naisi",
    campus: "UNIMA",
    etaMins: 28,
    meal: "Quick plate",
    mealPrice: 3000,
    deliveryFee: 1500,
    rating: 4.6,
    isOpen: true,
    image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
    description: "Affordable plates for study nights with flexible base meals and protein add-ons.",
    menuConfig: buildDefaultFoodMenuConfig(),
    menuSummary: summarizeFoodMenu(buildDefaultFoodMenuConfig()),
    hasCustomization: true,
  },
];

type TrustRow = {
  entity_id: string;
  avg_rating: number | null;
};

const MARKET_PLACEHOLDER = "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1200&q=80";
const FOOD_PLACEHOLDER = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80";

function uniqueImages(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}

function isUnavailableSchemaError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("invalid schema") ||
    normalized.includes("relation") ||
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find the table")
  );
}

function normalizeRating(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return 4.5;
  return Math.max(1, Math.min(5, Number(value)));
}

function hoursSince(iso: string) {
  const value = new Date(iso).getTime();
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - value) / (1000 * 60 * 60));
}

function freshnessScore(refreshedAt: string) {
  const hours = hoursSince(refreshedAt);
  if (!Number.isFinite(hours)) return 0;
  const maxAgeHours = 24 * 30; // fade to 0 by 30 days
  const normalized = Math.min(hours, maxAgeHours) / maxAgeHours;
  return 1 - normalized;
}

function stockSignal(stockQty: number | null) {
  if (stockQty == null) return 0.55;
  if (stockQty <= 0) return 0;
  return Math.min(1, stockQty / 20);
}

function marketRankingScore(input: { refreshedAt: string; rating: number; stockQty: number | null }) {
  const freshness = freshnessScore(input.refreshedAt);
  const trust = normalizeRating(input.rating) / 5;
  const stock = stockSignal(input.stockQty);
  return freshness * 0.62 + trust * 0.25 + stock * 0.13;
}

function isLegacySeededMarketItem(item: CatalogItemRow) {
  if (item.channel !== "market") return false;
  return LEGACY_MARKET_SEED_SIGNATURES.some((seed) =>
    item.name === seed.name
    && (item.description ?? null) === seed.description
    && Number(item.price_mwk) === seed.price_mwk
    && Number(item.stock_qty ?? 0) === seed.stock_qty,
  );
}

function inferCuisine(vendor: VendorRow | undefined) {
  const text = vendor?.description?.trim();
  if (!text) return "Restaurant";
  return text.length > 30 ? `${text.slice(0, 30)}...` : text;
}

function seededEta(itemId: string) {
  let seed = 0;
  for (let i = 0; i < itemId.length; i += 1) seed = (seed * 31 + itemId.charCodeAt(i)) % 97;
  return 18 + (seed % 18);
}

async function fetchChannelRows(channel: "market" | "food"): Promise<{
  items: CatalogItemRow[];
  vendorsById: Map<string, VendorRow>;
  ratingsByVendorId: Map<string, number>;
}> {
  const { data: itemRows, error: itemError } = await supabaseNewApp
    .from("catalog_items")
    .select("id, vendor_id, channel, name, description, price_mwk, stock_qty, image_url, is_active, created_at, updated_at")
    .eq("channel", channel)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (itemError) {
    if (isUnavailableSchemaError(itemError.message)) {
      console.warn(`[newApp] ${itemError.message}`);
      return { items: [], vendorsById: new Map(), ratingsByVendorId: new Map() };
    }
    throw new Error(itemError.message);
  }

  const items = (itemRows ?? []) as CatalogItemRow[];
  const vendorIds = Array.from(new Set(items.map((item) => item.vendor_id)));
  if (!vendorIds.length) {
    return { items, vendorsById: new Map(), ratingsByVendorId: new Map() };
  }

  const { data: vendorRows, error: vendorError } = await supabaseNewApp
    .from("vendors")
    .select("id, owner_id, name, description, supports_market, supports_food, campus, area, city, latitude, longitude, is_active, created_at, updated_at")
    .in("id", vendorIds);
  if (vendorError) {
    if (isUnavailableSchemaError(vendorError.message)) {
      console.warn(`[newApp] ${vendorError.message}`);
      return { items: [], vendorsById: new Map(), ratingsByVendorId: new Map() };
    }
    throw new Error(vendorError.message);
  }

  const { data: trustRows, error: trustError } = await supabaseNewApp
    .from("trust_scores")
    .select("entity_id, avg_rating")
    .eq("entity_type", "vendor")
    .in("entity_id", vendorIds);
  if (trustError) {
    if (isUnavailableSchemaError(trustError.message)) {
      console.warn(`[newApp] ${trustError.message}`);
      return { items: [], vendorsById: new Map(), ratingsByVendorId: new Map() };
    }
    throw new Error(trustError.message);
  }

  return {
    items,
    vendorsById: new Map(((vendorRows ?? []) as VendorRow[]).map((row) => [row.id, row])),
    ratingsByVendorId: new Map(((trustRows ?? []) as TrustRow[]).map((row) => [row.entity_id, normalizeRating(row.avg_rating)])),
  };
}

export async function listMarketCards(): Promise<MarketCard[]> {
  const { items, vendorsById, ratingsByVendorId } = await fetchChannelRows("market");
  const visibleItems = items.filter((item) => !isLegacySeededMarketItem(item));
  const productMeta = await getSellerProductMetaMap(visibleItems.map((item) => item.id));
  const rows = visibleItems.map((item) => {
    const vendor = vendorsById.get(item.vendor_id);
    const rating = ratingsByVendorId.get(item.vendor_id) ?? 4.5;
    const category = productMeta[item.id]?.category?.trim() || inferMarketCategory({ name: item.name, description: item.description ?? "" });
    const refreshedAt = item.updated_at || item.created_at;
    return {
      id: item.id,
      vendorId: item.vendor_id,
      name: item.name,
      vendor: vendor?.name ?? "Campus Vendor",
      category,
      area: vendor?.area ?? "Near campus",
      campus: vendor?.campus ?? "Campus",
      price: Number(item.price_mwk) || 0,
      deliveryFee: 2500,
      rating,
      image: item.image_url ?? MARKET_PLACEHOLDER,
      description: item.description ?? "Available now from trusted campus vendors.",
      listedAt: item.created_at,
      refreshedAt,
      rankingScore: marketRankingScore({
        refreshedAt,
        rating,
        stockQty: item.stock_qty ?? null,
      }),
    };
  });

  return rows.sort(
    (a, b) =>
      b.rankingScore - a.rankingScore ||
      new Date(b.refreshedAt).getTime() - new Date(a.refreshedAt).getTime() ||
      new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime(),
  );
}

export async function getMarketCardById(itemId: string): Promise<MarketCard | null> {
  const items = await listMarketCards();
  return items.find((item) => item.id === itemId) ?? null;
}

export async function listFoodCards(): Promise<FoodCard[]> {
  const { items, vendorsById, ratingsByVendorId } = await fetchChannelRows("food");
  const liveCards = items.map((item) => {
    const vendor = vendorsById.get(item.vendor_id);
    const parsed = parseFoodDescription(item.description);
    return {
      id: item.id,
      vendorId: item.vendor_id,
      name: vendor?.name ?? "Campus Kitchen",
      cuisine: inferCuisine(vendor),
      area: vendor?.area ?? "Near campus",
      campus: vendor?.campus ?? "Campus",
      etaMins: seededEta(item.id),
      meal: item.name,
      mealPrice: Number(item.price_mwk) || 0,
      deliveryFee: 2500,
      rating: ratingsByVendorId.get(item.vendor_id) ?? 4.5,
      isOpen: vendor?.is_active ?? true,
      image: item.image_url ?? FOOD_PLACEHOLDER,
      description: parsed.description || "Fresh meals delivered near your campus.",
      menuConfig: parsed.menuConfig,
      menuSummary: summarizeFoodMenu(parsed.menuConfig),
      hasCustomization: Boolean(parsed.menuConfig?.sections?.length),
    };
  });

  return liveCards.length ? liveCards : DEV_FOOD_CARDS;
}

export async function getFoodCardById(itemId: string): Promise<FoodCard | null> {
  const items = await listFoodCards();
  return items.find((item) => item.id === itemId) ?? null;
}

export async function getMarketShopByVendorId(vendorId: string): Promise<VendorCollection | null> {
  const cards = await listMarketCards();
  const productMeta = await getSellerProductMetaMap(cards.filter((item) => item.vendorId === vendorId).map((item) => item.id));
  const items = cards
    .filter((item) => item.vendorId === vendorId)
    .map((item) => ({
      ...item,
      description:
        productMeta[item.id]?.promotion?.active
          ? `${item.description} • ${productMeta[item.id]?.promotion?.title}`
          : item.description,
    }));
  const focus = items[0];
  if (!focus) return null;
  const storefront = await getSellerStorefrontMeta(vendorId);
  const shopMeta = await getSellerShopMeta(vendorId);
  const avatarImage = storefront?.avatarUrl ?? items[1]?.image ?? focus.image;
  const bannerImage = storefront?.bannerUrl ?? items[2]?.image ?? focus.image;

  return {
    id: vendorId,
    name: focus.vendor,
    description: focus.description,
    area: focus.area,
    campus: focus.campus,
    city: "Blantyre",
    rating: focus.rating,
    isOpen: true,
    heroImage: focus.image,
    avatarImage,
    bannerImage,
    openingHours: shopMeta?.openingHours ?? null,
    contactPhone: shopMeta?.contactPhone ?? null,
    contactEmail: shopMeta?.contactEmail ?? null,
    whatsapp: shopMeta?.whatsapp ?? null,
    galleryImages: uniqueImages([
      storefront?.bannerUrl,
      storefront?.avatarUrl,
      ...items.map((item) => item.image),
    ]),
    items,
  };
}

export async function getFoodRestaurantByVendorId(vendorId: string): Promise<VendorCollection | null> {
  const cards = await listFoodCards();
  const productMeta = await getSellerProductMetaMap(cards.filter((item) => item.vendorId === vendorId).map((item) => item.id));
  const items = cards
    .filter((item) => item.vendorId === vendorId)
    .map((item) => ({
      ...item,
      description:
        productMeta[item.id]?.promotion?.active
          ? `${item.description} • ${productMeta[item.id]?.promotion?.title}`
          : item.description,
    }));
  const focus = items[0];
  if (!focus) return null;
  const storefront = await getSellerStorefrontMeta(vendorId);
  const shopMeta = await getSellerShopMeta(vendorId);
  const avatarImage = storefront?.avatarUrl ?? items[1]?.image ?? focus.image;
  const bannerImage = storefront?.bannerUrl ?? items[2]?.image ?? focus.image;
  const galleryImages = uniqueImages([
    storefront?.bannerUrl,
    ...(storefront?.galleryUrls ?? []),
    storefront?.avatarUrl,
    ...items.map((item) => item.image),
  ]);

  return {
    id: vendorId,
    name: focus.name,
    description: focus.description,
    area: focus.area,
    campus: focus.campus,
    city: "Blantyre",
    rating: focus.rating,
    isOpen: focus.isOpen,
    heroImage: focus.image,
    avatarImage,
    bannerImage,
    openingHours: shopMeta?.openingHours ?? null,
    contactPhone: shopMeta?.contactPhone ?? null,
    contactEmail: shopMeta?.contactEmail ?? null,
    whatsapp: shopMeta?.whatsapp ?? null,
    galleryImages,
    items,
  };
}
