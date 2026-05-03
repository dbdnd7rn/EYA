export type AppRole = "student" | "landlord" | "agent" | "vendor" | "admin" | null;

export function normalizeAppRole(raw: unknown): AppRole {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();

  if (!v) return null;
  if (v === "admin") return "admin";
  if (v === "vendor" || v === "seller" || v === "merchant" || v === "restaurant" || v === "food_provider" || v === "food provider") return "vendor";
  if (v === "landlord" || v === "host") return "landlord";
  if (v === "agent" || v === "rider" || v === "agent/rider" || v === "agent_rider" || v === "delivery_agent" || v === "delivery agent") return "agent";
  if (v === "student" || v === "tenant" || v === "customer" || v === "user") return "student";
  return null;
}
