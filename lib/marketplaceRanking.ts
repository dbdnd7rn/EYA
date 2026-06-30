export type GeoPoint = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

type RankableMarketListing = {
  name: string;
  vendor: string;
  area: string;
  campus: string;
  category: string;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  price: number;
  rating: number;
  rankingScore?: number | null;
  refreshedAt: string;
  listedAt: string;
};

export type MarketRankingResult = {
  score: number;
  distanceMeters: number | null;
  radiusMeters: number | null;
  proximityScore: number;
  withinPreciseRadius: boolean;
};

const EARTH_RADIUS_M = 6371000;

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function asRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function validCoordinate(latitude?: number | null, longitude?: number | null) {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function distanceMetersBetween(a: GeoPoint, b: GeoPoint) {
  const dLat = asRadians(b.latitude - a.latitude);
  const dLng = asRadians(b.longitude - a.longitude);
  const lat1 = asRadians(a.latitude);
  const lat2 = asRadians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function adaptiveProximityRadiusMeters(accuracy?: number | null) {
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy)) return 100;
  if (accuracy <= 10) return 10;
  if (accuracy <= 25) return 25;
  if (accuracy <= 50) return 50;
  if (accuracy <= 100) return 100;
  return 250;
}

export function formatDistanceMeters(distance: number | null) {
  if (distance == null || !Number.isFinite(distance)) return "Distance unknown";
  if (distance < 1000) return `${Math.max(1, Math.round(distance))}m away`;
  return `${(distance / 1000).toFixed(distance < 10000 ? 1 : 0)}km away`;
}

export function formatAccuracyLabel(accuracy?: number | null) {
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy)) return "GPS active";
  return `GPS +/-${Math.max(1, Math.round(accuracy))}m`;
}

function listingDistanceMeters(item: RankableMarketListing, liveLocation: GeoPoint | null) {
  if (!liveLocation || !validCoordinate(item.latitude, item.longitude)) return null;
  return distanceMetersBetween(liveLocation, {
    latitude: item.latitude as number,
    longitude: item.longitude as number,
  });
}

function proximityScore(distanceMeters: number | null, radiusMeters: number | null) {
  if (distanceMeters == null || radiusMeters == null) return 0;
  if (distanceMeters <= 10) return 1;
  if (distanceMeters <= radiusMeters) return 0.72 + 0.28 * (1 - distanceMeters / Math.max(1, radiusMeters));
  const expansionRadius = radiusMeters * 4;
  if (distanceMeters <= expansionRadius) return 0.45 * (1 - (distanceMeters - radiusMeters) / Math.max(1, expansionRadius - radiusMeters));
  return 0;
}

function hoursSince(iso: string) {
  const value = new Date(iso).getTime();
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - value) / (1000 * 60 * 60));
}

function freshnessScore(refreshedAt: string) {
  const hours = hoursSince(refreshedAt);
  if (!Number.isFinite(hours)) return 0;
  return 1 - Math.min(hours, 24 * 30) / (24 * 30);
}

function searchRelevance(item: RankableMarketListing, term: string) {
  const q = term.trim().toLowerCase();
  if (!q) return 0.64;
  const name = item.name.toLowerCase();
  const vendor = item.vendor.toLowerCase();
  const category = item.category.toLowerCase();
  const description = item.description.toLowerCase();
  if (name === q) return 1;
  if (name.startsWith(q)) return 0.92;
  if (name.includes(q)) return 0.82;
  if (category.includes(q)) return 0.74;
  if (vendor.includes(q)) return 0.68;
  if (description.includes(q)) return 0.48;
  return 0;
}

function priceValueScore(price: number) {
  if (!Number.isFinite(price) || price <= 0) return 0.45;
  return 1 - Math.min(price, 250000) / 250000;
}

export function rankMarketListing(input: {
  item: RankableMarketListing;
  term: string;
  liveLocation: GeoPoint | null;
  savedLocationScore: number;
}) : MarketRankingResult {
  const radiusMeters = input.liveLocation ? adaptiveProximityRadiusMeters(input.liveLocation.accuracy) : null;
  const distanceMeters = listingDistanceMeters(input.item, input.liveLocation);
  const nearScore = proximityScore(distanceMeters, radiusMeters);
  const preciseRadius = input.liveLocation?.accuracy != null && input.liveLocation.accuracy <= 10 ? 10 : radiusMeters;
  const withinPreciseRadius = distanceMeters != null && preciseRadius != null && distanceMeters <= preciseRadius;

  const searchScore = searchRelevance(input.item, input.term);
  const trustScore = clamp01((input.item.rating || 0) / 5);
  const baseRanking = clamp01(input.item.rankingScore ?? 0);
  const freshness = freshnessScore(input.item.refreshedAt || input.item.listedAt);
  const savedLocation = clamp01(input.savedLocationScore / 67);
  const price = priceValueScore(input.item.price);

  const score = input.liveLocation
    ? nearScore * 0.35 + trustScore * 0.18 + searchScore * 0.15 + freshness * 0.12 + baseRanking * 0.1 + price * 0.06 + savedLocation * 0.04
    : baseRanking * 0.38 + savedLocation * 0.24 + searchScore * 0.16 + trustScore * 0.12 + freshness * 0.06 + price * 0.04;

  return {
    score,
    distanceMeters,
    radiusMeters,
    proximityScore: nearScore,
    withinPreciseRadius,
  };
}

export function diversifyMarketListings<T extends { vendorId: string }>(items: T[]) {
  const remaining = [...items];
  const output: T[] = [];
  let lastVendor = "";

  while (remaining.length) {
    const index = remaining.findIndex((item) => item.vendorId !== lastVendor);
    const nextIndex = index >= 0 ? index : 0;
    const [next] = remaining.splice(nextIndex, 1);
    output.push(next);
    lastVendor = next.vendorId;
  }

  return output;
}
