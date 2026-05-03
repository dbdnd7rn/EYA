import { ENV } from "@/lib/env";

export type AdminOrderStatus = "pending" | "accepted" | "preparing" | "picked_up" | "on_the_way" | "delivered" | "cancelled";
export type AdminDeliveryStatus = "searching" | "assigned" | "picked_up" | "arriving" | "delivered" | "failed" | "cancelled";

export type AdminOrderSummary = {
  id: string;
  customer_id: string;
  vendor_id: string;
  channel: "market" | "food";
  status: AdminOrderStatus;
  delivery_mode: "pickup" | "doorstep";
  dropoff_notes: string | null;
  total_mwk: number;
  payment_status: string;
  created_at: string;
  updated_at: string;
  vendor: {
    id: string;
    name: string;
    owner_id: string | null;
  } | null;
  delivery: {
    order_id: string;
    driver_id: string | null;
    status: AdminDeliveryStatus;
    eta_minutes: number | null;
    updated_at: string;
  } | null;
  handoff: {
    order_id: string;
    order_reference: string;
    verified_at: string | null;
  } | null;
};

export type AdminPaymentSummary = {
  id: string;
  user_id: string;
  related_order_id: string | null;
  provider: string | null;
  method: string | null;
  reference: string;
  status: string;
  amount_mwk: number;
  currency: string;
  title: string | null;
  description: string | null;
  customer_email: string | null;
  created_at: string;
  paid_at: string | null;
  verified_at: string | null;
};

export type AdminSupportTicket = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  type: string | null;
  listing_id: string | null;
  subject: string | null;
  message: string | null;
  status: string;
  admin_note: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type AdminVendorSummary = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  supports_market: boolean;
  supports_food: boolean;
  campus: string | null;
  area: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminCatalogItemSummary = {
  id: string;
  vendor_id: string;
  channel: "market" | "food";
  name: string;
  description: string | null;
  price_mwk: number;
  stock_qty: number | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminHousingListingSummary = {
  id: string;
  landlord_id: string;
  title: string;
  listing_type: "hostel" | "bedsitter";
  campus: string | null;
  area: string | null;
  city: string | null;
  price_from: number | null;
  description: string | null;
  contact_phone: string | null;
  is_active: boolean;
  image_urls: string[] | null;
  created_at: string | null;
  updated_at: string | null;
  landlord: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

export type AdminUserSummary = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  role: "student" | "landlord" | "agent" | "vendor" | "admin";
  onboarded: boolean;
  campus: string | null;
  area: string | null;
  created_at: string | null;
  updated_at: string | null;
  listing_count: number;
  vendor_count: number;
  order_count: number;
};

export type AdminBroadcastAudience = AdminUserSummary["role"] | "all";

export type AdminStaffInviteInput = {
  email: string;
  fullName?: string | null;
  role: AdminUserSummary["role"];
};

export type CreateAdminVendorInput = {
  owner_id: string;
  name: string;
  description?: string | null;
  supports_market?: boolean;
  supports_food?: boolean;
  campus?: string | null;
  area?: string | null;
  city?: string | null;
  is_active?: boolean;
};

export type CreateAdminCatalogItemInput = {
  vendor_id: string;
  channel: "market" | "food";
  name: string;
  description?: string | null;
  price_mwk: number;
  stock_qty?: number | null;
  image_url?: string | null;
  is_active?: boolean;
};

export type CreateAdminHousingListingInput = {
  landlord_id: string;
  title: string;
  listing_type: "hostel" | "bedsitter";
  campus?: string | null;
  area?: string | null;
  city?: string | null;
  price_from?: number | null;
  description?: string | null;
  contact_phone: string;
  is_active?: boolean;
};

function backendUrl(path: string) {
  if (!ENV.PAYCHANGU_BACKEND) {
    throw new Error("PayChangu backend URL is not configured.");
  }
  return `${ENV.PAYCHANGU_BACKEND.replace(/\/+$/, "")}${path}`;
}

function adminHeaders(input: { userId: string; accessToken?: string | null; json?: boolean }) {
  return {
    ...(input.json ? { "Content-Type": "application/json" } : {}),
    ...(input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : {}),
    "x-admin-user-id": input.userId,
  };
}

async function parseJson<T>(res: Response) {
  const payload = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(payload?.message || `Request failed (${res.status}).`);
  }
  return payload;
}

export async function listAdminOrders(input: {
  userId: string;
  accessToken?: string | null;
  status?: string | null;
  deliveryStatus?: string | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.status) query.set("status", input.status);
  if (input.deliveryStatus) query.set("delivery_status", input.deliveryStatus);

  const res = await fetch(backendUrl(`/api/admin/orders${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; orders: AdminOrderSummary[] }>(res);
  return data.orders ?? [];
}

export async function listAdminPayments(input: {
  userId: string;
  accessToken?: string | null;
  status?: string | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.status) query.set("status", input.status);

  const res = await fetch(backendUrl(`/api/admin/payments${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; payments: AdminPaymentSummary[] }>(res);
  return data.payments ?? [];
}

export async function updateAdminOrderStatus(input: {
  orderId: string;
  status: AdminOrderStatus;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/orders/${encodeURIComponent(input.orderId)}/status`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({ status: input.status }),
  });
  return parseJson<{ status: string; order: Record<string, unknown> }>(res);
}

export async function assignAdminDriver(input: {
  orderId: string;
  driverId: string;
  etaMinutes?: number | null;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/orders/${encodeURIComponent(input.orderId)}/assign-driver`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      driver_id: input.driverId,
      eta_minutes: input.etaMinutes ?? null,
    }),
  });
  return parseJson<{ status: string; delivery: Record<string, unknown> }>(res);
}

export async function listAdminSupportTickets(input: {
  userId: string;
  accessToken?: string | null;
  status?: string | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.status) query.set("status", input.status);

  const res = await fetch(backendUrl(`/api/admin/support-tickets${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; tickets: AdminSupportTicket[] }>(res);
  return data.tickets ?? [];
}

export async function respondAdminSupportTicket(input: {
  ticketId: string;
  status: string;
  adminNote?: string | null;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/support-tickets/${encodeURIComponent(input.ticketId)}/respond`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      status: input.status,
      admin_note: input.adminNote ?? null,
    }),
  });
  return parseJson<{ status: string; ticket: AdminSupportTicket }>(res);
}

export async function listAdminVendors(input: {
  userId: string;
  accessToken?: string | null;
  query?: string | null;
  activeOnly?: boolean | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.query) query.set("q", input.query);
  if (typeof input.activeOnly === "boolean") query.set("active_only", String(input.activeOnly));

  const res = await fetch(backendUrl(`/api/admin/vendors${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; vendors: AdminVendorSummary[] }>(res);
  return data.vendors ?? [];
}

export async function updateAdminVendor(input: {
  vendorId: string;
  patch: Partial<Pick<AdminVendorSummary, "name" | "description" | "supports_market" | "supports_food" | "campus" | "area" | "city" | "is_active">>;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/vendors/${encodeURIComponent(input.vendorId)}`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify(input.patch),
  });
  return parseJson<{ status: string; vendor: AdminVendorSummary }>(res);
}

export async function createAdminVendor(input: CreateAdminVendorInput & {
  userId: string;
  accessToken?: string | null;
}) {
  if (ENV.DEV_AUTH_MODE) {
    return {
      id: `dev-vendor-${Date.now()}`,
      owner_id: input.owner_id,
      name: input.name,
      description: input.description ?? null,
      supports_market: input.supports_market ?? true,
      supports_food: input.supports_food ?? false,
      campus: input.campus ?? null,
      area: input.area ?? null,
      city: input.city ?? null,
      latitude: null,
      longitude: null,
      is_active: input.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies AdminVendorSummary;
  }

  const res = await fetch(backendUrl("/api/admin/vendors"), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      owner_id: input.owner_id,
      name: input.name,
      description: input.description ?? null,
      supports_market: input.supports_market ?? true,
      supports_food: input.supports_food ?? false,
      campus: input.campus ?? null,
      area: input.area ?? null,
      city: input.city ?? null,
      is_active: input.is_active ?? true,
    }),
  });
  const data = await parseJson<{ status: string; vendor: AdminVendorSummary }>(res);
  return data.vendor;
}

export async function deleteAdminVendor(input: {
  vendorId: string;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/vendors/${encodeURIComponent(input.vendorId)}`), {
    method: "DELETE",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  return parseJson<{ status: string; vendor_id: string }>(res);
}

export async function listAdminCatalogItems(input: {
  userId: string;
  accessToken?: string | null;
  query?: string | null;
  activeOnly?: boolean | null;
  channel?: "market" | "food" | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.query) query.set("q", input.query);
  if (typeof input.activeOnly === "boolean") query.set("active_only", String(input.activeOnly));
  if (input.channel) query.set("channel", input.channel);

  const res = await fetch(backendUrl(`/api/admin/catalog-items${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; items: AdminCatalogItemSummary[] }>(res);
  return data.items ?? [];
}

export async function updateAdminCatalogItem(input: {
  itemId: string;
  patch: Partial<Pick<AdminCatalogItemSummary, "name" | "description" | "price_mwk" | "stock_qty" | "image_url" | "is_active">>;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/catalog-items/${encodeURIComponent(input.itemId)}`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify(input.patch),
  });
  return parseJson<{ status: string; item: AdminCatalogItemSummary }>(res);
}

export async function createAdminCatalogItem(input: CreateAdminCatalogItemInput & {
  userId: string;
  accessToken?: string | null;
}) {
  if (ENV.DEV_AUTH_MODE) {
    return {
      id: `dev-item-${Date.now()}`,
      vendor_id: input.vendor_id,
      channel: input.channel,
      name: input.name,
      description: input.description ?? null,
      price_mwk: input.price_mwk,
      stock_qty: input.stock_qty ?? null,
      image_url: input.image_url ?? null,
      is_active: input.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies AdminCatalogItemSummary;
  }

  const res = await fetch(backendUrl("/api/admin/catalog-items"), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      vendor_id: input.vendor_id,
      channel: input.channel,
      name: input.name,
      description: input.description ?? null,
      price_mwk: input.price_mwk,
      stock_qty: input.stock_qty ?? null,
      image_url: input.image_url ?? null,
      is_active: input.is_active ?? true,
    }),
  });
  const data = await parseJson<{ status: string; item: AdminCatalogItemSummary }>(res);
  return data.item;
}

export async function deleteAdminCatalogItem(input: {
  itemId: string;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/catalog-items/${encodeURIComponent(input.itemId)}`), {
    method: "DELETE",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  return parseJson<{ status: string; item_id: string }>(res);
}

export async function listAdminHousingListings(input: {
  userId: string;
  accessToken?: string | null;
  query?: string | null;
  activeOnly?: boolean | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.query) query.set("q", input.query);
  if (typeof input.activeOnly === "boolean") query.set("active_only", String(input.activeOnly));

  const res = await fetch(backendUrl(`/api/admin/housing-listings${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; listings: AdminHousingListingSummary[] }>(res);
  return data.listings ?? [];
}

export async function updateAdminHousingListing(input: {
  listingId: string;
  patch: Partial<Pick<AdminHousingListingSummary, "title" | "description" | "campus" | "area" | "city" | "price_from" | "contact_phone" | "is_active">>;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/housing-listings/${encodeURIComponent(input.listingId)}`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify(input.patch),
  });
  return parseJson<{ status: string; listing: AdminHousingListingSummary }>(res);
}

export async function createAdminHousingListing(input: CreateAdminHousingListingInput & {
  userId: string;
  accessToken?: string | null;
}) {
  if (ENV.DEV_AUTH_MODE) {
    return {
      id: `dev-listing-${Date.now()}`,
      landlord_id: input.landlord_id,
      title: input.title,
      listing_type: input.listing_type,
      campus: input.campus ?? null,
      area: input.area ?? null,
      city: input.city ?? null,
      price_from: input.price_from ?? null,
      description: input.description ?? null,
      contact_phone: input.contact_phone,
      is_active: input.is_active ?? true,
      image_urls: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      landlord: null,
    } satisfies AdminHousingListingSummary;
  }

  const res = await fetch(backendUrl("/api/admin/housing-listings"), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      landlord_id: input.landlord_id,
      title: input.title,
      listing_type: input.listing_type,
      campus: input.campus ?? null,
      area: input.area ?? null,
      city: input.city ?? null,
      price_from: input.price_from ?? null,
      description: input.description ?? null,
      contact_phone: input.contact_phone,
      is_active: input.is_active ?? true,
    }),
  });
  const data = await parseJson<{ status: string; listing: AdminHousingListingSummary }>(res);
  return data.listing;
}

export async function deleteAdminHousingListing(input: {
  listingId: string;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/housing-listings/${encodeURIComponent(input.listingId)}`), {
    method: "DELETE",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  return parseJson<{ status: string; listing_id: string }>(res);
}

export async function listAdminUsers(input: {
  userId: string;
  accessToken?: string | null;
  query?: string | null;
  role?: AdminUserSummary["role"] | null;
  limit?: number;
}) {
  if (ENV.DEV_AUTH_MODE) return [];

  const query = new URLSearchParams();
  if (input.limit) query.set("limit", String(input.limit));
  if (input.query) query.set("q", input.query);
  if (input.role) query.set("role", input.role);

  const res = await fetch(backendUrl(`/api/admin/users${query.size ? `?${query.toString()}` : ""}`), {
    method: "GET",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  const data = await parseJson<{ status: string; users: AdminUserSummary[] }>(res);
  return data.users ?? [];
}

export async function updateAdminUser(input: {
  targetUserId: string;
  patch: Partial<Pick<AdminUserSummary, "full_name" | "phone" | "campus" | "area" | "role" | "onboarded">>;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/users/${encodeURIComponent(input.targetUserId)}`), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify(input.patch),
  });
  return parseJson<{ status: string; user: AdminUserSummary }>(res);
}

export async function deleteAdminUser(input: {
  targetUserId: string;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/admin/users/${encodeURIComponent(input.targetUserId)}`), {
    method: "DELETE",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken }),
  });
  return parseJson<{ status: string; user_id: string }>(res);
}

export async function inviteAdminStaff(input: AdminStaffInviteInput & {
  userId: string;
  accessToken?: string | null;
}) {
  if (ENV.DEV_AUTH_MODE) {
    return {
      status: "success",
      user: {
        id: `dev-invite-${Date.now()}`,
        email: input.email,
        full_name: input.fullName ?? null,
        role: input.role,
      },
    };
  }

  const res = await fetch(backendUrl("/api/admin/users/invite"), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      email: input.email,
      full_name: input.fullName ?? null,
      role: input.role,
    }),
  });
  return parseJson<{ status: string; user: Pick<AdminUserSummary, "id" | "email" | "full_name" | "role"> }>(res);
}

export async function broadcastAdminNotification(input: {
  title: string;
  message: string;
  audienceRole: AdminBroadcastAudience;
  priority?: "normal" | "important";
  type?: string;
  userId: string;
  accessToken?: string | null;
}) {
  if (ENV.DEV_AUTH_MODE) {
    return { status: "success", sent_to: 0, audience_role: input.audienceRole };
  }

  const res = await fetch(backendUrl("/api/admin/broadcast"), {
    method: "POST",
    headers: adminHeaders({ userId: input.userId, accessToken: input.accessToken, json: true }),
    body: JSON.stringify({
      title: input.title,
      message: input.message,
      audience_role: input.audienceRole,
      priority: input.priority ?? "normal",
      type: input.type ?? "system",
    }),
  });
  return parseJson<{ status: string; sent_to: number; audience_role: AdminBroadcastAudience }>(res);
}
