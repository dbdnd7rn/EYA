import { supabaseNewApp } from "../supabaseNewApp";
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
  items: Array<MarketCard | FoodCard>;
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

const DEV_MARKET_CARDS: MarketCard[] = [
  {
    id: "dev-market-1",
    vendorId: "dev-market-vendor-1",
    name: "Desk lamp",
    vendor: "Campus Tech Shop",
    category: "Electronics",
    area: "Chitawira",
    campus: "MUST",
    price: 18000,
    deliveryFee: 2500,
    rating: 4.6,
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=80",
    description: "Bright LED desk lamp suitable for study desks and hostel reading corners.",
  },
  {
    id: "dev-market-2",
    vendorId: "dev-market-vendor-2",
    name: "Study chair",
    vendor: "Student Comforts",
    category: "Study",
    area: "Namiwawa",
    campus: "MUBAS",
    price: 45000,
    deliveryFee: 3000,
    rating: 4.4,
    image: "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?auto=format&fit=crop&w=1200&q=80",
    description: "Cushioned ergonomic chair with sturdy frame for long study sessions.",
  },
  {
    id: "dev-market-3",
    vendorId: "dev-market-vendor-3",
    name: "Power bank",
    vendor: "Uni Gadgets",
    category: "Electronics",
    area: "Zomba CBD",
    campus: "UNIMA",
    price: 32000,
    deliveryFee: 2200,
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?auto=format&fit=crop&w=1200&q=80",
    description: "Fast charging power bank with dual USB output, ideal for busy campus days.",
  },
  {
    id: "dev-market-4",
    vendorId: "dev-market-vendor-4",
    name: "Bedding set",
    vendor: "Hostel Essentials",
    category: "Essentials",
    area: "Soche",
    campus: "MUST",
    price: 28000,
    deliveryFee: 2600,
    rating: 4.5,
    image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
    description: "Complete bedding set with duvet cover, pillow cases, and fitted sheet.",
  },
];

const DEV_FOOD_CARDS: FoodCard[] = [
  {
    id: "dev-food-1",
    vendorId: "dev-food-vendor-1",
    name: "Campus Grill",
    cuisine: "Fast food",
    area: "Soche East",
    campus: "MUST",
    etaMins: 25,
    meal: "Chicken and chips",
    mealPrice: 12000,
    deliveryFee: 2500,
    rating: 4.7,
    isOpen: true,
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?auto=format&fit=crop&w=1200&q=80",
    description: "Crispy chicken combos and quick meals popular with evening students.",
  },
  {
    id: "dev-food-2",
    vendorId: "dev-food-vendor-2",
    name: "Uni Bites",
    cuisine: "Burgers",
    area: "Namiwawa",
    campus: "MUBAS",
    etaMins: 30,
    meal: "Beef burger combo",
    mealPrice: 15000,
    deliveryFee: 3000,
    rating: 4.4,
    isOpen: false,
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80",
    description: "Loaded burgers, chips, and sauces with value combo options.",
  },
  {
    id: "dev-food-3",
    vendorId: "dev-food-vendor-3",
    name: "Zomba Fresh Meals",
    cuisine: "Local",
    area: "Old Naisi",
    campus: "UNIMA",
    etaMins: 28,
    meal: "Rice and fish",
    mealPrice: 10000,
    deliveryFee: 2200,
    rating: 4.8,
    isOpen: true,
    image: "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=1200&q=80",
    description: "Affordable local dishes with fresh ingredients and generous portions.",
  },
];

type TrustRow = {
  entity_id: string;
  avg_rating: number | null;
};

const MARKET_PLACEHOLDER = "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1200&q=80";
const FOOD_PLACEHOLDER = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80";

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
  const productMeta = await getSellerProductMetaMap(items.map((item) => item.id));
  const liveCards = items.map((item) => {
    const vendor = vendorsById.get(item.vendor_id);
    const category = productMeta[item.id]?.category?.trim() || inferMarketCategory({ name: item.name, description: item.description ?? "" });
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
      rating: ratingsByVendorId.get(item.vendor_id) ?? 4.5,
      image: item.image_url ?? MARKET_PLACEHOLDER,
      description: item.description ?? "Available now from trusted campus vendors.",
    };
  });

  return liveCards.length ? liveCards : DEV_MARKET_CARDS;
}

export async function getMarketCardById(itemId: string): Promise<MarketCard | null> {
  const items = await listMarketCards();
  return items.find((item) => item.id === itemId) ?? null;
}

export async function listFoodCards(): Promise<FoodCard[]> {
  const { items, vendorsById, ratingsByVendorId } = await fetchChannelRows("food");
  const liveCards = items.map((item) => {
    const vendor = vendorsById.get(item.vendor_id);
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
      description: item.description ?? "Fresh meals delivered near your campus.",
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
    items,
  };
}
