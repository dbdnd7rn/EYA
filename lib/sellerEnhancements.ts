import AsyncStorage from "@react-native-async-storage/async-storage";

const ENHANCEMENT_KEY = "pamaketi_seller_enhancements_v1";

export type InventoryHistoryEntry = {
  id: string;
  changedAt: string;
  quantity: number | null;
  reason: string;
};

export type PromotionMeta = {
  title: string;
  type: "percent" | "flat";
  value: number;
  active: boolean;
};

export type SellerProductMeta = {
  productId: string;
  category?: string | null;
  condition?: string | null;
  inventoryHistory?: InventoryHistoryEntry[];
  promotion?: PromotionMeta | null;
};

export type SellerShopMeta = {
  vendorId: string;
  openingHours?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  whatsapp?: string | null;
  soundAlertsEnabled?: boolean;
  pushNotificationsEnabled?: boolean;
};

type EnhancementStore = {
  products: Record<string, SellerProductMeta>;
  vendors: Record<string, SellerShopMeta>;
};

const EMPTY_STORE: EnhancementStore = { products: {}, vendors: {} };

async function readStore(): Promise<EnhancementStore> {
  const raw = await AsyncStorage.getItem(ENHANCEMENT_KEY);
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as Partial<EnhancementStore>;
    return {
      products: parsed.products ?? {},
      vendors: parsed.vendors ?? {},
    };
  } catch {
    return EMPTY_STORE;
  }
}

async function writeStore(store: EnhancementStore) {
  await AsyncStorage.setItem(ENHANCEMENT_KEY, JSON.stringify(store));
}

export async function getSellerProductMeta(productId: string) {
  const store = await readStore();
  return store.products[productId] ?? null;
}

export async function getSellerProductMetaMap(productIds: string[]) {
  const store = await readStore();
  return Object.fromEntries(productIds.map((id) => [id, store.products[id] ?? null])) as Record<string, SellerProductMeta | null>;
}

export async function upsertSellerProductMeta(productId: string, patch: Partial<SellerProductMeta>) {
  const store = await readStore();
  const current = store.products[productId] ?? { productId };
  const next: SellerProductMeta = {
    ...current,
    ...patch,
    productId,
  };
  store.products[productId] = next;
  await writeStore(store);
  return next;
}

export async function setSellerProductCategory(productId: string, category: string | null) {
  return upsertSellerProductMeta(productId, { category: category?.trim() || null });
}

export async function setSellerProductCondition(productId: string, condition: string | null) {
  return upsertSellerProductMeta(productId, { condition: condition?.trim() || null });
}

export async function setBulkSellerProductCategory(productIds: string[], category: string | null) {
  const store = await readStore();
  for (const productId of productIds) {
    const current = store.products[productId] ?? { productId };
    store.products[productId] = { ...current, productId, category: category?.trim() || null };
  }
  await writeStore(store);
}

export async function setSellerProductPromotion(productId: string, promotion: PromotionMeta | null) {
  return upsertSellerProductMeta(productId, { promotion });
}

export async function logInventoryHistory(productId: string, quantity: number | null, reason: string) {
  const store = await readStore();
  const current = store.products[productId] ?? { productId };
  const history = current.inventoryHistory ?? [];
  const entry: InventoryHistoryEntry = {
    id: `${productId}-${Date.now()}`,
    changedAt: new Date().toISOString(),
    quantity,
    reason,
  };
  store.products[productId] = {
    ...current,
    productId,
    inventoryHistory: [entry, ...history].slice(0, 20),
  };
  await writeStore(store);
  return entry;
}

export async function getSellerShopMeta(vendorId: string) {
  const store = await readStore();
  return store.vendors[vendorId] ?? null;
}

export async function upsertSellerShopMeta(vendorId: string, patch: Partial<SellerShopMeta>) {
  const store = await readStore();
  const current = store.vendors[vendorId] ?? { vendorId, soundAlertsEnabled: true, pushNotificationsEnabled: true };
  const next: SellerShopMeta = {
    ...current,
    ...patch,
    vendorId,
  };
  store.vendors[vendorId] = next;
  await writeStore(store);
  return next;
}
