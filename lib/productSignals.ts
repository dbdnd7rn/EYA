export type PriceBand = "great_deal" | "fair_price" | "above_market" | "unknown";

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function computeRoomMatchScore(input: {
  search: string;
  preferredCampus?: string | null;
  preferredCity?: string | null;
  preferredType?: "hostel" | "bedsitter" | "" | null;
  preferredRoomType?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  title?: string | null;
  campus?: string | null;
  city?: string | null;
  listingType?: "hostel" | "bedsitter" | null;
  roomTypes?: string[] | null;
  priceFrom?: number | null;
}) {
  let score = 40;
  const search = input.search.trim().toLowerCase();
  const haystack = [input.title, input.campus, input.city].filter(Boolean).join(" ").toLowerCase();

  if (search) {
    score += haystack.includes(search) ? 18 : -8;
  }
  if (input.preferredCampus && input.preferredCampus === (input.campus ?? "")) score += 14;
  if (input.preferredCity && input.preferredCity === (input.city ?? "")) score += 10;
  if (input.preferredType && input.preferredType === (input.listingType ?? null)) score += 10;
  if (input.preferredRoomType && (input.roomTypes ?? []).includes(input.preferredRoomType)) score += 8;

  const price = input.priceFrom;
  if (price != null) {
    if (input.minPrice != null && price < input.minPrice) score -= 16;
    if (input.maxPrice != null && price > input.maxPrice) score -= 16;
    if (input.minPrice != null && input.maxPrice != null && price >= input.minPrice && price <= input.maxPrice) {
      score += 12;
    }
  }

  return clamp(Math.round(score), 5, 99);
}

export function getPriceBand(price: number | null | undefined, median: number | null | undefined): PriceBand {
  if (price == null || median == null || median <= 0) return "unknown";
  const ratio = price / median;
  if (ratio <= 0.85) return "great_deal";
  if (ratio <= 1.15) return "fair_price";
  return "above_market";
}

export function priceBandLabel(band: PriceBand) {
  if (band === "great_deal") return "Great deal";
  if (band === "fair_price") return "Fair price";
  if (band === "above_market") return "Above market";
  return "Price pending";
}

export function computeListingQualityScore(input: {
  title?: string | null;
  description?: string | null;
  imageUrls?: string[] | null;
  amenities?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
  contactPhone?: string | null;
  roomTypes?: string[] | null;
}) {
  let score = 0;
  if ((input.title ?? "").trim().length >= 8) score += 15;
  if ((input.description ?? "").trim().length >= 60) score += 20;
  score += Math.min(20, (input.imageUrls ?? []).length * 4);
  score += Math.min(15, (input.amenities ?? []).length);
  if (input.latitude != null && input.longitude != null) score += 10;
  if ((input.contactPhone ?? "").trim()) score += 10;
  if ((input.roomTypes ?? []).length > 0) score += 10;
  return clamp(Math.round(score), 0, 100);
}

export function trustText(input: { isVerified: boolean; ratingCount: number; ratingAvg: number }) {
  if (input.isVerified && input.ratingCount >= 5 && input.ratingAvg >= 4.2) return "High trust";
  if (input.isVerified || input.ratingCount >= 3) return "Trusted";
  return "Building trust";
}
