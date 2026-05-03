import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabaseNewApp } from "../supabaseNewApp";
import { ENV } from "../env";
import type { VendorCreateInput, VendorRow, VendorUpdateInput } from "./types";

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const DEV_VENDORS_KEY = "eya_dev_vendors_v1";

async function getDevVendors(): Promise<VendorRow[]> {
  const raw = await AsyncStorage.getItem(DEV_VENDORS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as VendorRow[];
  } catch {
    return [];
  }
}

async function setDevVendors(vendors: VendorRow[]) {
  await AsyncStorage.setItem(DEV_VENDORS_KEY, JSON.stringify(vendors));
}

type VendorListFilters = {
  supports?: "market" | "food";
  campus?: string;
  area?: string;
  isActiveOnly?: boolean;
  limit?: number;
};

export async function listVendors(filters?: VendorListFilters): Promise<VendorRow[]> {
  if (ENV.DEV_AUTH_MODE) {
    let rows = await getDevVendors();
    if (filters?.supports === "market") rows = rows.filter((row) => row.supports_market);
    if (filters?.supports === "food") rows = rows.filter((row) => row.supports_food);
    if (filters?.campus) rows = rows.filter((row) => row.campus === filters.campus);
    if (filters?.area) rows = rows.filter((row) => row.area === filters.area);
    if (filters?.isActiveOnly ?? true) rows = rows.filter((row) => row.is_active);
    if (filters?.limit && filters.limit > 0) rows = rows.slice(0, filters.limit);
    return rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }

  let query = supabaseNewApp
    .from("vendors")
    .select("id, owner_id, name, description, supports_market, supports_food, campus, area, city, latitude, longitude, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (filters?.supports === "market") query = query.eq("supports_market", true);
  if (filters?.supports === "food") query = query.eq("supports_food", true);
  if (filters?.campus) query = query.eq("campus", filters.campus);
  if (filters?.area) query = query.eq("area", filters.area);
  if (filters?.isActiveOnly ?? true) query = query.eq("is_active", true);
  if (filters?.limit && filters.limit > 0) query = query.limit(filters.limit);

  const { data, error } = await query;
  throwIfError(error);
  return (data ?? []) as VendorRow[];
}

export async function getVendorById(vendorId: string): Promise<VendorRow | null> {
  if (ENV.DEV_AUTH_MODE) {
    const rows = await getDevVendors();
    return rows.find((row) => row.id === vendorId) ?? null;
  }

  const { data, error } = await supabaseNewApp
    .from("vendors")
    .select("id, owner_id, name, description, supports_market, supports_food, campus, area, city, latitude, longitude, is_active, created_at, updated_at")
    .eq("id", vendorId)
    .maybeSingle();
  throwIfError(error);
  return (data as VendorRow | null) ?? null;
}

export async function listMyVendors(ownerId: string): Promise<VendorRow[]> {
  if (ENV.DEV_AUTH_MODE) {
    const rows = await getDevVendors();
    return rows
      .filter((row) => row.owner_id === ownerId)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }

  const { data, error } = await supabaseNewApp
    .from("vendors")
    .select("id, owner_id, name, description, supports_market, supports_food, campus, area, city, latitude, longitude, is_active, created_at, updated_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as VendorRow[];
}

export async function createVendor(ownerId: string, input: VendorCreateInput): Promise<VendorRow> {
  if (ENV.DEV_AUTH_MODE) {
    const now = new Date().toISOString();
    const rows = await getDevVendors();
    const existing = rows.find((row) => row.owner_id === ownerId && row.supports_market === (input.supports_market ?? true));
    if (existing) {
      throw new Error("A seller shop already exists for this account.");
    }
    const vendor: VendorRow = {
      id: `dev-vendor-${ownerId}-${Date.now()}`,
      owner_id: ownerId,
      name: input.name.trim(),
      description: input.description ?? null,
      supports_market: input.supports_market ?? true,
      supports_food: input.supports_food ?? false,
      campus: input.campus ?? null,
      area: input.area ?? null,
      city: input.city ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    await setDevVendors([vendor, ...rows]);
    return vendor;
  }

  const desiredSupportsMarket = input.supports_market ?? true;
  try {
    const existing = await listMyVendors(ownerId);
    const conflict = existing.find((row) => row.supports_market === desiredSupportsMarket);
    if (conflict) {
      throw new Error("A seller shop already exists for this account.");
    }
  } catch (e) {
    if (e instanceof Error && e.message === "A seller shop already exists for this account.") throw e;
    // If we can't verify, fail closed to avoid accidentally creating duplicate shops.
    throw new Error("Could not verify existing seller shop. Please retry.");
  }

  const payload = {
    owner_id: ownerId,
    name: input.name.trim(),
    description: input.description ?? null,
    supports_market: input.supports_market ?? true,
    supports_food: input.supports_food ?? false,
    campus: input.campus ?? null,
    area: input.area ?? null,
    city: input.city ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
  };

  const { data, error } = await supabaseNewApp
    .from("vendors")
    .insert(payload)
    .select("id, owner_id, name, description, supports_market, supports_food, campus, area, city, latitude, longitude, is_active, created_at, updated_at")
    .single();
  throwIfError(error);
  return data as VendorRow;
}

export async function updateVendor(vendorId: string, input: VendorUpdateInput): Promise<VendorRow> {
  if (ENV.DEV_AUTH_MODE) {
    const rows = await getDevVendors();
    const index = rows.findIndex((row) => row.id === vendorId);
    if (index < 0) throw new Error("Vendor not found.");
    const current = rows[index];
    const updated: VendorRow = {
      ...current,
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.supports_market !== undefined ? { supports_market: input.supports_market } : {}),
      ...(input.supports_food !== undefined ? { supports_food: input.supports_food } : {}),
      ...(input.campus !== undefined ? { campus: input.campus } : {}),
      ...(input.area !== undefined ? { area: input.area } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
      updated_at: new Date().toISOString(),
    };
    const next = rows.slice();
    next[index] = updated;
    await setDevVendors(next);
    return updated;
  }

  const payload = {
    ...(input.name != null ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.supports_market !== undefined ? { supports_market: input.supports_market } : {}),
    ...(input.supports_food !== undefined ? { supports_food: input.supports_food } : {}),
    ...(input.campus !== undefined ? { campus: input.campus } : {}),
    ...(input.area !== undefined ? { area: input.area } : {}),
    ...(input.city !== undefined ? { city: input.city } : {}),
    ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
    ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
    ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
  };

  const { data, error } = await supabaseNewApp
    .from("vendors")
    .update(payload)
    .eq("id", vendorId)
    .select("id, owner_id, name, description, supports_market, supports_food, campus, area, city, latitude, longitude, is_active, created_at, updated_at")
    .single();
  throwIfError(error);
  return data as VendorRow;
}
