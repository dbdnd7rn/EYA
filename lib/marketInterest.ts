import AsyncStorage from "@react-native-async-storage/async-storage";

export type MarketRequestStatus = "discussing" | "arranged" | "completed" | "cancelled";

export type PickupFeedback = {
  rating: number;
  note: string;
  tags: string[];
  submittedAt: string;
};

export type MarketInterestRequest = {
  id: string;
  itemId: string;
  itemName: string;
  image: string;
  priceMwk: number;
  category: string;
  condition: string;
  vendorId: string;
  vendorName: string;
  customerId: string;
  customerName: string;
  area: string;
  campus: string;
  status: MarketRequestStatus;
  createdAt: string;
  lastMessage: string;
  lastMessageAt: string;
  pickupTimeLabel?: string | null;
  pickupLocation?: string | null;
  pickupNote?: string | null;
  completedAt?: string | null;
  studentFeedback?: PickupFeedback | null;
  sellerFeedback?: PickupFeedback | null;
};

type InterestStore = {
  requests: MarketInterestRequest[];
  savedShopIds: string[];
};

const STORAGE_KEY = "eya_market_interest_v1";

const EMPTY_STORE: InterestStore = {
  requests: [],
  savedShopIds: [],
};

async function readStore(): Promise<InterestStore> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as Partial<InterestStore>;
    return {
      requests: parsed.requests ?? [],
      savedShopIds: parsed.savedShopIds ?? [],
    };
  } catch {
    return EMPTY_STORE;
  }
}

async function writeStore(store: InterestStore) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function listStudentMarketRequests(customerId: string) {
  const store = await readStore();
  return store.requests
    .filter((row) => row.customerId === customerId)
    .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
}

export async function listVendorMarketRequests(vendorId: string) {
  const store = await readStore();
  return store.requests
    .filter((row) => row.vendorId === vendorId)
    .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
}

export async function getMarketRequestById(requestId: string) {
  const store = await readStore();
  return store.requests.find((row) => row.id === requestId) ?? null;
}

export async function upsertMarketRequest(input: Omit<MarketInterestRequest, "id" | "createdAt" | "lastMessageAt"> & { id?: string; createdAt?: string; lastMessageAt?: string }) {
  const store = await readStore();
  const now = new Date().toISOString();
  const requestId = input.id ?? `market-request-${Date.now()}`;
  const current = store.requests.find((row) => row.id === requestId);
  const next: MarketInterestRequest = {
    ...current,
    ...input,
    id: requestId,
    createdAt: input.createdAt ?? current?.createdAt ?? now,
    lastMessageAt: input.lastMessageAt ?? now,
  };
  const index = store.requests.findIndex((row) => row.id === requestId);
  if (index >= 0) store.requests[index] = next;
  else store.requests.unshift(next);
  await writeStore(store);
  return next;
}

export async function ensureMarketInterest(params: {
  itemId: string;
  itemName: string;
  image: string;
  priceMwk: number;
  category: string;
  condition?: string;
  vendorId: string;
  vendorName: string;
  customerId: string;
  customerName: string;
  area: string;
  campus: string;
}) {
  const store = await readStore();
  const existing = store.requests.find((row) => row.itemId === params.itemId && row.customerId === params.customerId && row.vendorId === params.vendorId);
  if (existing) return existing;
  const created: MarketInterestRequest = {
    id: `market-request-${Date.now()}`,
    itemId: params.itemId,
    itemName: params.itemName,
    image: params.image,
    priceMwk: params.priceMwk,
    category: params.category,
    condition: params.condition ?? "Brand new",
    vendorId: params.vendorId,
    vendorName: params.vendorName,
    customerId: params.customerId,
    customerName: params.customerName,
    area: params.area,
    campus: params.campus,
    status: "discussing",
    createdAt: new Date().toISOString(),
    lastMessage: "Interested in this item",
    lastMessageAt: new Date().toISOString(),
    pickupTimeLabel: null,
    pickupLocation: null,
    pickupNote: null,
    completedAt: null,
    studentFeedback: null,
    sellerFeedback: null,
  };
  store.requests.unshift(created);
  await writeStore(store);
  return created;
}

export async function setMarketRequestStatus(requestId: string, status: MarketRequestStatus, patch?: Partial<MarketInterestRequest>) {
  const store = await readStore();
  const index = store.requests.findIndex((row) => row.id === requestId);
  if (index < 0) return null;
  const current = store.requests[index];
  const next: MarketInterestRequest = {
    ...current,
    ...patch,
    status,
    completedAt: status === "completed" ? patch?.completedAt ?? new Date().toISOString() : current.completedAt ?? null,
    lastMessageAt: new Date().toISOString(),
  };
  store.requests[index] = next;
  await writeStore(store);
  return next;
}

export async function addMarketRequestMessage(requestId: string, message: string) {
  return setMarketRequestStatus(requestId, (await getMarketRequestById(requestId))?.status ?? "discussing", {
    lastMessage: message,
    lastMessageAt: new Date().toISOString(),
  });
}

export async function submitStudentPickupFeedback(requestId: string, feedback: PickupFeedback) {
  return setMarketRequestStatus(requestId, "completed", {
    studentFeedback: feedback,
    completedAt: feedback.submittedAt,
    lastMessage: feedback.note || "Feedback submitted",
    lastMessageAt: feedback.submittedAt,
  });
}

export async function submitSellerPickupFeedback(requestId: string, feedback: PickupFeedback) {
  return setMarketRequestStatus(requestId, "completed", {
    sellerFeedback: feedback,
    completedAt: feedback.submittedAt,
    lastMessage: feedback.note || "Seller feedback submitted",
    lastMessageAt: feedback.submittedAt,
  });
}

export async function toggleSavedShop(vendorId: string) {
  const store = await readStore();
  const has = store.savedShopIds.includes(vendorId);
  store.savedShopIds = has ? store.savedShopIds.filter((id) => id !== vendorId) : [vendorId, ...store.savedShopIds];
  await writeStore(store);
  return !has;
}

export async function isShopSaved(vendorId: string) {
  const store = await readStore();
  return store.savedShopIds.includes(vendorId);
}
