import {
  adaptiveProximityRadiusMeters,
  distanceMetersBetween,
  type GeoPoint,
} from "@/lib/marketplaceRanking";

export type RoomProximityListing = {
  latitude?: number | null;
  longitude?: number | null;
  visibility_rank?: number | null;
  price_from?: number | null;
  created_at?: string | null;
};

export type RoomProximityResult = {
  score: number;
  distanceMeters: number | null;
  radiusMeters: number | null;
  accuracyMeters: number | null;
  proximityScore: number;
  withinAccuracyRadius: boolean;
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
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

function listingDistanceMeters(item: RoomProximityListing, liveLocation: GeoPoint | null) {
  if (!liveLocation || !validCoordinate(item.latitude, item.longitude)) return null;
  return distanceMetersBetween(liveLocation, {
    latitude: item.latitude as number,
    longitude: item.longitude as number,
  });
}

function proximityScore(distanceMeters: number | null, radiusMeters: number | null) {
  if (distanceMeters == null || radiusMeters == null) return 0;
  if (distanceMeters <= radiusMeters) return 0.72 + 0.28 * (1 - distanceMeters / Math.max(1, radiusMeters));
  const expansionRadius = radiusMeters * 5;
  if (distanceMeters <= expansionRadius) return 0.5 * (1 - (distanceMeters - radiusMeters) / Math.max(1, expansionRadius - radiusMeters));
  return 0;
}

function freshnessScore(value?: string | null) {
  const time = new Date(value ?? 0).getTime();
  if (!Number.isFinite(time)) return 0;
  const days = Math.max(0, (Date.now() - time) / (1000 * 60 * 60 * 24));
  return 1 - Math.min(days, 45) / 45;
}

function affordabilityScore(value?: number | null) {
  const price = Number(value ?? 0);
  if (!Number.isFinite(price) || price <= 0) return 0.4;
  return 1 - Math.min(price, 500000) / 500000;
}

export function rankRoomListing(input: {
  item: RoomProximityListing;
  liveLocation: GeoPoint | null;
  savedLocationScore?: number;
}): RoomProximityResult {
  const accuracyMeters =
    typeof input.liveLocation?.accuracy === "number" && Number.isFinite(input.liveLocation.accuracy)
      ? input.liveLocation.accuracy
      : null;
  const radiusMeters = input.liveLocation ? adaptiveProximityRadiusMeters(input.liveLocation.accuracy) : null;
  const distanceMeters = listingDistanceMeters(input.item, input.liveLocation);
  const nearScore = proximityScore(distanceMeters, radiusMeters);
  const savedLocation = clamp01(Number(input.savedLocationScore ?? 0) / 67);
  const baseRank = clamp01(Number(input.item.visibility_rank ?? 0) / 100);
  const freshness = freshnessScore(input.item.created_at);
  const affordability = affordabilityScore(input.item.price_from);

  const score = input.liveLocation
    ? nearScore * 0.44 + savedLocation * 0.18 + baseRank * 0.16 + freshness * 0.12 + affordability * 0.1
    : savedLocation * 0.34 + baseRank * 0.3 + freshness * 0.22 + affordability * 0.14;

  return {
    score,
    distanceMeters,
    radiusMeters,
    accuracyMeters,
    proximityScore: nearScore,
    withinAccuracyRadius: distanceMeters != null && radiusMeters != null && distanceMeters <= radiusMeters,
  };
}
