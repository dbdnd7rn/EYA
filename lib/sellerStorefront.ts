import AsyncStorage from "@react-native-async-storage/async-storage";

const STOREFRONT_KEY = "pamaketi_seller_storefront_v1";

export type SellerStorefrontMeta = {
  vendorId: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
};

type StorefrontMap = Record<string, SellerStorefrontMeta>;

async function readStorefrontMap(): Promise<StorefrontMap> {
  const raw = await AsyncStorage.getItem(STOREFRONT_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as StorefrontMap;
  } catch {
    return {};
  }
}

export async function getSellerStorefrontMeta(vendorId: string): Promise<SellerStorefrontMeta | null> {
  const map = await readStorefrontMap();
  return map[vendorId] ?? null;
}

export async function setSellerStorefrontMeta(input: SellerStorefrontMeta) {
  const map = await readStorefrontMap();
  map[input.vendorId] = {
    vendorId: input.vendorId,
    avatarUrl: input.avatarUrl ?? null,
    bannerUrl: input.bannerUrl ?? null,
  };
  await AsyncStorage.setItem(STOREFRONT_KEY, JSON.stringify(map));
  return map[input.vendorId];
}
