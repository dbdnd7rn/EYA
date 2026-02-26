export type AmenityKey =
  | "wifi"
  | "water_included"
  | "electricity_included"
  | "backup_power"
  | "borehole"
  | "water_tank"
  | "geyser"
  | "ceiling"
  | "laundry_service"
  | "bed"
  | "mattress"
  | "wardrobe"
  | "study_desk"
  | "chair"
  | "tv"
  | "fridge"
  | "cooker"
  | "private_kitchen"
  | "shared_kitchen"
  | "private_bathroom"
  | "shared_bathroom"
  | "shower"
  | "bathtub"
  | "toilet_inside"
  | "toilet_outside"
  | "security_guard"
  | "security_cameras"
  | "fenced"
  | "transport_nearby";

export const AMENITY_GROUPS: { title: string; items: { key: AmenityKey; label: string }[] }[] = [
  {
    title: "Essentials",
    items: [
      { key: "wifi", label: "Wi-Fi" },
      { key: "water_included", label: "Water included" },
      { key: "electricity_included", label: "Electricity included" },
      { key: "backup_power", label: "Backup power" },
      { key: "borehole", label: "Borehole" },
      { key: "water_tank", label: "Water tank" },
      { key: "geyser", label: "Geyser (hot water)" },
      { key: "ceiling", label: "Ceiling (not open roof)" },
      { key: "laundry_service", label: "Laundry service" },
    ],
  },
  {
    title: "Furniture",
    items: [
      { key: "bed", label: "Bed" },
      { key: "mattress", label: "Mattress" },
      { key: "wardrobe", label: "Wardrobe" },
      { key: "study_desk", label: "Study desk" },
      { key: "chair", label: "Chair" },
      { key: "tv", label: "TV" },
    ],
  },
  {
    title: "Kitchen & appliances",
    items: [
      { key: "fridge", label: "Fridge" },
      { key: "cooker", label: "Cooker / stove" },
      { key: "private_kitchen", label: "Private kitchen" },
      { key: "shared_kitchen", label: "Shared kitchen" },
    ],
  },
  {
    title: "Bathroom",
    items: [
      { key: "private_bathroom", label: "Private bathroom" },
      { key: "shared_bathroom", label: "Shared bathroom" },
      { key: "shower", label: "Shower" },
      { key: "bathtub", label: "Bathtub" },
      { key: "toilet_inside", label: "Toilet inside" },
      { key: "toilet_outside", label: "Toilet outside" },
    ],
  },
  {
    title: "Security",
    items: [
      { key: "security_guard", label: "Security guard" },
      { key: "security_cameras", label: "Security cameras" },
      { key: "fenced", label: "Fenced compound" },
    ],
  },
  {
    title: "Location",
    items: [{ key: "transport_nearby", label: "Transport nearby" }],
  },
];
