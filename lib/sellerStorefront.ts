import AsyncStorage from "@react-native-async-storage/async-storage";

const STOREFRONT_KEY = "eya_seller_storefront_v1";

export type SellerStorefrontMeta = {
  vendorId: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  galleryUrls?: string[];
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
  const current = map[vendorId] ?? null;
  if (!current) return null;
  return {
    vendorId,
    avatarUrl: current.avatarUrl ?? null,
    bannerUrl: current.bannerUrl ?? null,
    galleryUrls: Array.isArray(current.galleryUrls) ? current.galleryUrls.filter((value) => typeof value === "string" && value.trim()) : [],
  };
}

export async function setSellerStorefrontMeta(input: SellerStorefrontMeta) {
  const map = await readStorefrontMap();
  const current = map[input.vendorId] ?? { vendorId: input.vendorId };
  map[input.vendorId] = {
    vendorId: input.vendorId,
    avatarUrl: input.avatarUrl ?? current.avatarUrl ?? null,
    bannerUrl: input.bannerUrl ?? current.bannerUrl ?? null,
    galleryUrls: Array.isArray(input.galleryUrls)
      ? input.galleryUrls.filter((value) => typeof value === "string" && value.trim())
      : Array.isArray(current.galleryUrls)
        ? current.galleryUrls.filter((value) => typeof value === "string" && value.trim())
        : [],
  };
  await AsyncStorage.setItem(STOREFRONT_KEY, JSON.stringify(map));
  return map[input.vendorId];
}
