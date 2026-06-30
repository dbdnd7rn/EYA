import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabaseNewApp } from "../supabaseNewApp";
import { ENV } from "../env";
import { listVendors } from "./vendors";
import type { CatalogItemCreateInput, CatalogItemRow, CatalogItemUpdateInput, SalesChannel } from "./types";

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const DEV_CATALOG_KEY = "eya_dev_catalog_items_v1";
const CATALOG_SELECT = "id, vendor_id, channel, name, description, price_mwk, stock_qty, image_url, image_urls, is_active, created_at, updated_at";
const CATALOG_SELECT_LEGACY = "id, vendor_id, channel, name, description, price_mwk, stock_qty, image_url, is_active, created_at, updated_at";

async function getDevCatalogItems(): Promise<CatalogItemRow[]> {
  const raw = await AsyncStorage.getItem(DEV_CATALOG_KEY);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as CatalogItemRow[]).map(normalizeCatalogRow);
  } catch {
    return [];
  }
}

async function setDevCatalogItems(items: CatalogItemRow[]) {
  await AsyncStorage.setItem(DEV_CATALOG_KEY, JSON.stringify(items));
}

type CatalogFilters = {
  vendorId?: string;
  channel?: SalesChannel;
  campus?: string;
  isActiveOnly?: boolean;
  q?: string;
  limit?: number;
};

function normalizeImageUrls(values: unknown) {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const url = typeof value === "string" ? value.trim() : "";
    if (!url || seen.has(url)) return;
    seen.add(url);
    output.push(url);
  });
  return output;
}

function imageUrlsForWrite(input: { image_url?: string | null; image_urls?: string[] | null }) {
  const uploaded = normalizeImageUrls(input.image_urls);
  const cover = typeof input.image_url === "string" && input.image_url.trim() ? input.image_url.trim() : uploaded[0] ?? null;
  const imageUrls = uploaded.length ? uploaded : cover ? [cover] : [];
  return { cover, imageUrls };
}

function normalizeCatalogRow(row: CatalogItemRow): CatalogItemRow {
  const imageUrls = normalizeImageUrls((row as CatalogItemRow & { image_urls?: unknown }).image_urls);
  const cover = row.image_url?.trim() || imageUrls[0] || null;
  return {
    ...row,
    image_url: cover,
    image_urls: imageUrls.length ? imageUrls : cover ? [cover] : [],
  };
}

function isMissingImageUrlsError(error: { message: string } | null) {
  return !!error && /image_urls|schema cache|column/i.test(error.message);
}

export async function listCatalogItems(filters?: CatalogFilters): Promise<CatalogItemRow[]> {
  if (ENV.DEV_AUTH_MODE) {
    let items = await getDevCatalogItems();
    if (filters?.vendorId) items = items.filter((row) => row.vendor_id === filters.vendorId);
    if (filters?.channel) items = items.filter((row) => row.channel === filters.channel);
    if (filters?.isActiveOnly ?? true) items = items.filter((row) => row.is_active);
    if (filters?.q?.trim()) {
      const term = filters.q.trim().toLowerCase();
      items = items.filter((row) => row.name.toLowerCase().includes(term));
    }
    if (filters?.campus) {
      const vendorRows = await listVendors({ campus: filters.campus, isActiveOnly: false });
      const allowed = new Set(vendorRows.map((row) => row.id));
      items = items.filter((row) => allowed.has(row.vendor_id));
    }
    if (filters?.limit && filters.limit > 0) items = items.slice(0, filters.limit);
    return items.map(normalizeCatalogRow).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }

  const buildQuery = (selectClause: string) => {
    let query = supabaseNewApp
      .from("catalog_items")
      .select(selectClause)
      .order("created_at", { ascending: false });

    if (filters?.vendorId) query = query.eq("vendor_id", filters.vendorId);
    if (filters?.channel) query = query.eq("channel", filters.channel);
    if (filters?.isActiveOnly ?? true) query = query.eq("is_active", true);
    if (filters?.q?.trim()) query = query.ilike("name", `%${filters.q.trim()}%`);
    if (filters?.limit && filters.limit > 0) query = query.limit(filters.limit);
    return query;
  };

  let { data, error } = await buildQuery(CATALOG_SELECT);
  if (isMissingImageUrlsError(error)) {
    ({ data, error } = await buildQuery(CATALOG_SELECT_LEGACY));
  }
  throwIfError(error);

  let items = ((data ?? []) as unknown as CatalogItemRow[]).map(normalizeCatalogRow);

  if (filters?.campus) {
    const { data: vendorRows, error: vendorError } = await supabaseNewApp
      .from("vendors")
      .select("id")
      .eq("campus", filters.campus);
    throwIfError(vendorError);
    const allowed = new Set((vendorRows ?? []).map((v) => (v as { id: string }).id));
    items = items.filter((row) => allowed.has(row.vendor_id));
  }

  return items;
}

export async function getCatalogItemById(itemId: string): Promise<CatalogItemRow | null> {
  if (ENV.DEV_AUTH_MODE) {
    const items = await getDevCatalogItems();
    return items.find((row) => row.id === itemId) ?? null;
  }

  let { data, error } = await supabaseNewApp
    .from("catalog_items")
    .select(CATALOG_SELECT)
    .eq("id", itemId)
    .maybeSingle();
  if (isMissingImageUrlsError(error)) {
    ({ data, error } = await supabaseNewApp
      .from("catalog_items")
      .select(CATALOG_SELECT_LEGACY)
      .eq("id", itemId)
      .maybeSingle());
  }
  throwIfError(error);
  return data ? normalizeCatalogRow(data as CatalogItemRow) : null;
}

export async function createCatalogItem(input: CatalogItemCreateInput): Promise<CatalogItemRow> {
  const { cover, imageUrls } = imageUrlsForWrite(input);
  if (ENV.DEV_AUTH_MODE) {
    const now = new Date().toISOString();
    const items = await getDevCatalogItems();
    const created: CatalogItemRow = {
      id: `dev-item-${input.vendor_id}-${Date.now()}`,
      vendor_id: input.vendor_id,
      channel: input.channel,
      name: input.name.trim(),
      description: input.description ?? null,
      price_mwk: input.price_mwk,
      stock_qty: input.stock_qty ?? null,
      image_url: cover,
      image_urls: imageUrls,
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    await setDevCatalogItems([created, ...items]);
    return created;
  }

  const payload = {
    vendor_id: input.vendor_id,
    channel: input.channel,
    name: input.name.trim(),
    description: input.description ?? null,
    price_mwk: input.price_mwk,
    stock_qty: input.stock_qty ?? null,
    image_url: cover,
    image_urls: imageUrls,
  };

  let { data, error } = await supabaseNewApp
    .from("catalog_items")
    .insert(payload)
    .select(CATALOG_SELECT)
    .single();
  if (isMissingImageUrlsError(error)) {
    const { image_urls, ...legacyPayload } = payload;
    ({ data, error } = await supabaseNewApp
      .from("catalog_items")
      .insert(legacyPayload)
      .select(CATALOG_SELECT_LEGACY)
      .single());
  }
  throwIfError(error);
  return normalizeCatalogRow(data as CatalogItemRow);
}

export async function updateCatalogItem(itemId: string, input: CatalogItemUpdateInput): Promise<CatalogItemRow> {
  if (ENV.DEV_AUTH_MODE) {
    const items = await getDevCatalogItems();
    const index = items.findIndex((row) => row.id === itemId);
    if (index < 0) throw new Error("Listing not found.");

    const current = items[index];
    const nextImages = input.image_urls !== undefined || input.image_url !== undefined ? imageUrlsForWrite(input) : null;
    const updated: CatalogItemRow = {
      ...current,
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.price_mwk !== undefined ? { price_mwk: input.price_mwk } : {}),
      ...(input.stock_qty !== undefined ? { stock_qty: input.stock_qty } : {}),
      ...(nextImages ? { image_url: nextImages.cover, image_urls: nextImages.imageUrls } : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
      updated_at: new Date().toISOString(),
    };

    const next = items.slice();
    next[index] = updated;
    await setDevCatalogItems(next);
    return updated;
  }

  const nextImages = input.image_urls !== undefined || input.image_url !== undefined ? imageUrlsForWrite(input) : null;
  const payload = {
    ...(input.name != null ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.price_mwk !== undefined ? { price_mwk: input.price_mwk } : {}),
    ...(input.stock_qty !== undefined ? { stock_qty: input.stock_qty } : {}),
    ...(nextImages ? { image_url: nextImages.cover, image_urls: nextImages.imageUrls } : {}),
    ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
  };

  let { data, error } = await supabaseNewApp
    .from("catalog_items")
    .update(payload)
    .eq("id", itemId)
    .select(CATALOG_SELECT)
    .single();
  if (isMissingImageUrlsError(error)) {
    const { image_urls, ...legacyPayload } = payload;
    ({ data, error } = await supabaseNewApp
      .from("catalog_items")
      .update(legacyPayload)
      .eq("id", itemId)
      .select(CATALOG_SELECT_LEGACY)
      .single());
  }
  throwIfError(error);
  return normalizeCatalogRow(data as CatalogItemRow);
}

export async function deleteCatalogItem(itemId: string): Promise<void> {
  if (ENV.DEV_AUTH_MODE) {
    const items = await getDevCatalogItems();
    const next = items.filter((row) => row.id !== itemId);
    await setDevCatalogItems(next);
    return;
  }

  const { error } = await supabaseNewApp.from("catalog_items").delete().eq("id", itemId);
  throwIfError(error);
}
