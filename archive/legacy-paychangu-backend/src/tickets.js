import { supabase } from "./supabase.js";
import { sendPushNotificationsToUsers } from "./push.js";

function throwIfError(error) {
  if (error) throw new Error(error.message || "Database operation failed.");
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTicketEvent(row, tiers = []) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description || "",
    dateLabel: row.date_label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    venue: row.venue,
    city: row.city,
    image: row.image_url,
    heroImage: row.hero_image_url,
    status: row.status,
    rating: Number(row.metadata?.rating || 4.8),
    tiers: tiers.map((tier) => ({
      id: tier.id,
      eventId: tier.event_id,
      name: tier.name,
      priceMwk: Number(tier.price_mwk || 0),
      description: tier.description || "",
      available: Boolean(tier.available) && Number(tier.capacity_total || 0) > Number(tier.capacity_sold || 0),
      capacityTotal: Number(tier.capacity_total || 0),
      capacitySold: Number(tier.capacity_sold || 0),
      capacityReserved: Number(tier.capacity_reserved || 0),
      remaining: Math.max(0, Number(tier.capacity_total || 0) - Number(tier.capacity_sold || 0) - Number(tier.capacity_reserved || 0)),
    })),
  };
}

async function getTicketTiersByEventIds(eventIds) {
  if (!eventIds.length) return new Map();
  const { data, error } = await supabase
    .from("ticket_tiers")
    .select("id,event_id,name,description,price_mwk,capacity_total,capacity_sold,capacity_reserved,available,sort_order,sale_starts_at,sale_ends_at")
    .in("event_id", eventIds)
    .order("sort_order", { ascending: true });
  throwIfError(error);

  const byEvent = new Map();
  for (const tier of data || []) {
    const current = byEvent.get(tier.event_id) || [];
    current.push(tier);
    byEvent.set(tier.event_id, current);
  }
  return byEvent;
}

export async function listPublishedTicketEvents({ query = "", limit = 50 } = {}) {
  await supabase.rpc("release_expired_ticket_reservations").catch(() => ({ data: 0, error: null }));

  const normalizedLimit = Math.min(Math.max(Number(limit || 50), 1), 100);
  const term = String(query || "").trim();
  let request = supabase
    .from("ticket_events")
    .select("id,title,category,description,date_label,starts_at,ends_at,venue,city,image_url,hero_image_url,status,sort_order,metadata,created_at,updated_at")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(normalizedLimit);

  if (term) {
    request = request.or(`title.ilike.%${term}%,category.ilike.%${term}%,venue.ilike.%${term}%,city.ilike.%${term}%`);
  }

  const { data, error } = await request;
  throwIfError(error);
  const events = data || [];
  const tierMap = await getTicketTiersByEventIds(events.map((row) => row.id));
  return events.map((event) => normalizeTicketEvent(event, tierMap.get(event.id) || []));
}

export async function reserveTicketOrder({ userId, eventId, tierId, quantity, email, phone }) {
  const { data, error } = await supabase.rpc("reserve_ticket_order", {
    p_user_id: userId,
    p_event_id: eventId,
    p_tier_id: tierId,
    p_quantity: quantity,
    p_customer_email: email || null,
    p_customer_phone: phone || null,
  });
  throwIfError(error);
  return asObject(data);
}

export async function releaseTicketOrder(orderId, status = "cancelled") {
  const { data, error } = await supabase.rpc("release_ticket_order", {
    p_order_id: orderId,
    p_status: status,
  });
  throwIfError(error);
  return asObject(data);
}

export async function attachTicketPaymentToOrder({ orderId, payment, method, providerPayload }) {
  const now = new Date().toISOString();
  const { data: order, error: orderError } = await supabase
    .from("ticket_orders")
    .update({
      status: "awaiting_payment",
      payment_status: "pending",
      payment_id: payment.id,
      payment_reference: payment.reference,
      customer_phone: payment.customer_phone || null,
      updated_at: now,
    })
    .eq("id", orderId)
    .select("id,user_id,event_id,tier_id,quantity,total_mwk,status,payment_status,payment_reference,reserved_until,created_at,updated_at")
    .single();
  throwIfError(orderError);

  const { error: ticketPaymentError } = await supabase
    .from("ticket_payments")
    .upsert(
      {
        order_id: orderId,
        payment_id: payment.id,
        provider: payment.provider || "paychangu",
        method: method || payment.method || null,
        reference: payment.reference,
        amount_mwk: Number(payment.amount_mwk || 0),
        status: "pending",
        provider_payload: providerPayload || {},
      },
      { onConflict: "order_id,reference" },
    );
  throwIfError(ticketPaymentError);

  return order;
}

export async function issueTicketOrderFromPayment(payment, verifyPayload = {}) {
  const metadata = asObject(payment.metadata);
  const orderId = metadata.ticket_order_id || payment.related_order_id;
  if (!orderId) throw new Error("Ticket payment is missing ticket_order_id.");

  const { data, error } = await supabase.rpc("issue_ticket_order", {
    p_order_id: orderId,
    p_payment_id: payment.id,
    p_payment_reference: payment.reference || payment.tx_ref || null,
    p_paid_at: payment.paid_at || new Date().toISOString(),
  });
  throwIfError(error);
  const result = asObject(data);
  const order = asObject(result.order);
  const tickets = asArray(result.tickets);

  await supabase
    .from("ticket_payments")
    .update({
      status: order.status === "payment_review" ? "pending" : "paid",
      provider_payload: verifyPayload || {},
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .eq("reference", payment.reference);

  if (result.finalized === true && order.user_id) {
    await sendPushNotificationsToUsers([order.user_id], {
      title: "Ticket booked",
      body: `Your ${tickets.length > 1 ? `${tickets.length} tickets are` : "ticket is"} ready in EYA.`,
      type: "ticket_issued",
      data: {
        ticketOrderId: order.id,
        paymentId: payment.id,
      },
    }).catch((error) => {
      console.error("[ticket-issued-notification-error]", error instanceof Error ? error.message : error);
    });
  }

  return {
    order,
    tickets,
    finalized: result.finalized === true,
    message: typeof result.message === "string" ? result.message : null,
  };
}

export async function getTicketOrderForUser(orderId, userId, isAdmin = false) {
  const { data: order, error: orderError } = await supabase
    .from("ticket_orders")
    .select("id,user_id,event_id,tier_id,quantity,unit_price_mwk,service_fee_mwk,total_mwk,status,payment_status,payment_id,payment_reference,reserved_until,paid_at,created_at,updated_at")
    .eq("id", orderId)
    .maybeSingle();
  throwIfError(orderError);
  if (!order) return null;
  if (!isAdmin && order.user_id !== userId) throw new Error("Not allowed to view this ticket order.");

  const [{ data: event, error: eventError }, { data: tier, error: tierError }, { data: tickets, error: ticketError }] = await Promise.all([
    supabase
      .from("ticket_events")
      .select("id,title,category,description,date_label,starts_at,ends_at,venue,city,image_url,hero_image_url")
      .eq("id", order.event_id)
      .maybeSingle(),
    supabase.from("ticket_tiers").select("id,name,description,price_mwk").eq("id", order.tier_id).maybeSingle(),
    supabase.from("issued_tickets").select("id,ticket_code,status,checked_in_at,issued_at").eq("order_id", order.id).order("issued_at", { ascending: true }),
  ]);
  throwIfError(eventError);
  throwIfError(tierError);
  throwIfError(ticketError);

  return {
    order,
    event,
    tier,
    tickets: tickets || [],
  };
}

export async function listMyIssuedTickets(userId) {
  const { data: tickets, error } = await supabase
    .from("issued_tickets")
    .select("id,order_id,event_id,tier_id,ticket_code,status,checked_in_at,issued_at,created_at")
    .eq("user_id", userId)
    .order("issued_at", { ascending: false });
  throwIfError(error);
  const rows = tickets || [];
  if (!rows.length) return [];

  const eventIds = [...new Set(rows.map((row) => row.event_id).filter(Boolean))];
  const tierIds = [...new Set(rows.map((row) => row.tier_id).filter(Boolean))];
  const orderIds = [...new Set(rows.map((row) => row.order_id).filter(Boolean))];

  const [{ data: events, error: eventError }, { data: tiers, error: tierError }, { data: orders, error: orderError }] = await Promise.all([
    eventIds.length
      ? supabase.from("ticket_events").select("id,title,category,description,date_label,starts_at,ends_at,venue,city,image_url,hero_image_url").in("id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    tierIds.length
      ? supabase.from("ticket_tiers").select("id,name,price_mwk").in("id", tierIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase.from("ticket_orders").select("id,total_mwk,quantity,status,payment_status,paid_at").in("id", orderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwIfError(eventError);
  throwIfError(tierError);
  throwIfError(orderError);

  const eventById = new Map((events || []).map((row) => [row.id, row]));
  const tierById = new Map((tiers || []).map((row) => [row.id, row]));
  const orderById = new Map((orders || []).map((row) => [row.id, row]));

  return rows.map((ticket) => ({
    ...ticket,
    event: eventById.get(ticket.event_id) || null,
    tier: tierById.get(ticket.tier_id) || null,
    order: orderById.get(ticket.order_id) || null,
  }));
}

export async function listAdminTicketEvents({ query = "", limit = 200 } = {}) {
  const normalizedLimit = Math.min(Math.max(Number(limit || 200), 1), 500);
  const term = String(query || "").trim();
  let request = supabase
    .from("ticket_events")
    .select("id,title,category,description,date_label,starts_at,ends_at,venue,city,image_url,hero_image_url,status,sort_order,metadata,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(normalizedLimit);

  if (term) {
    request = request.or(`title.ilike.%${term}%,category.ilike.%${term}%,venue.ilike.%${term}%,city.ilike.%${term}%`);
  }

  const { data, error } = await request;
  throwIfError(error);
  const events = data || [];
  const tierMap = await getTicketTiersByEventIds(events.map((row) => row.id));
  return events.map((event) => normalizeTicketEvent(event, tierMap.get(event.id) || []));
}

export async function upsertAdminTicketEvent(input, adminId) {
  const payload = {
    ...(input.id ? { id: input.id } : {}),
    title: String(input.title || "").trim(),
    category: String(input.category || "Music").trim(),
    description: typeof input.description === "string" ? input.description.trim() : null,
    date_label: String(input.date_label || input.dateLabel || "").trim(),
    starts_at: input.starts_at || input.startsAt || null,
    ends_at: input.ends_at || input.endsAt || null,
    venue: String(input.venue || "").trim(),
    city: String(input.city || "").trim(),
    image_url: String(input.image_url || input.image || "").trim(),
    hero_image_url: String(input.hero_image_url || input.heroImage || input.image_url || input.image || "").trim(),
    status: ["draft", "published", "cancelled", "archived"].includes(String(input.status)) ? String(input.status) : "draft",
    organizer_id: input.organizer_id || null,
    created_by: adminId || null,
    sort_order: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 100,
  };

  if (!payload.title || !payload.date_label || !payload.venue || !payload.city || !payload.image_url || !payload.hero_image_url) {
    throw new Error("Ticket event title, date, venue, city and images are required.");
  }

  const { data, error } = await supabase
    .from("ticket_events")
    .upsert(payload)
    .select("*")
    .single();
  throwIfError(error);
  return data;
}

export async function upsertAdminTicketTier(input) {
  const payload = {
    ...(input.id ? { id: input.id } : {}),
    event_id: input.event_id || input.eventId,
    name: String(input.name || "").trim(),
    description: String(input.description || "").trim(),
    price_mwk: Number(input.price_mwk ?? input.priceMwk ?? 0),
    capacity_total: Math.max(0, Math.floor(Number(input.capacity_total ?? input.capacityTotal ?? 0))),
    available: input.available !== false,
    sale_starts_at: input.sale_starts_at || input.saleStartsAt || null,
    sale_ends_at: input.sale_ends_at || input.saleEndsAt || null,
    sort_order: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 100,
  };

  if (!payload.event_id || !payload.name) throw new Error("Ticket tier event and name are required.");
  if (!Number.isFinite(payload.price_mwk) || payload.price_mwk < 0) throw new Error("Ticket tier price is invalid.");

  const { data, error } = await supabase
    .from("ticket_tiers")
    .upsert(payload)
    .select("*")
    .single();
  throwIfError(error);
  return data;
}

export async function listAdminTicketOrders({ status = "", limit = 200 } = {}) {
  let request = supabase
    .from("ticket_orders")
    .select("id,user_id,event_id,tier_id,quantity,total_mwk,status,payment_status,payment_reference,reserved_until,paid_at,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(Number(limit || 200), 1), 500));
  if (status) request = request.eq("status", status);

  const { data: orders, error } = await request;
  throwIfError(error);
  const rows = orders || [];
  if (!rows.length) return [];

  const eventIds = [...new Set(rows.map((row) => row.event_id).filter(Boolean))];
  const tierIds = [...new Set(rows.map((row) => row.tier_id).filter(Boolean))];
  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];

  const [{ data: events, error: eventError }, { data: tiers, error: tierError }, { data: users, error: userError }] = await Promise.all([
    eventIds.length ? supabase.from("ticket_events").select("id,title,venue,city,date_label").in("id", eventIds) : Promise.resolve({ data: [], error: null }),
    tierIds.length ? supabase.from("ticket_tiers").select("id,name,price_mwk").in("id", tierIds) : Promise.resolve({ data: [], error: null }),
    userIds.length ? supabase.from("profiles").select("id,full_name,email,phone").in("id", userIds) : Promise.resolve({ data: [], error: null }),
  ]);
  throwIfError(eventError);
  throwIfError(tierError);
  throwIfError(userError);

  const eventById = new Map((events || []).map((row) => [row.id, row]));
  const tierById = new Map((tiers || []).map((row) => [row.id, row]));
  const userById = new Map((users || []).map((row) => [row.id, row]));

  return rows.map((order) => ({
    ...order,
    event: eventById.get(order.event_id) || null,
    tier: tierById.get(order.tier_id) || null,
    user: userById.get(order.user_id) || null,
  }));
}

export async function checkInTicket({ ticketCode, eventId = null, actorId, deviceLabel = null }) {
  const code = String(ticketCode || "").trim().toUpperCase();
  if (!code) throw new Error("Ticket code is required.");
  const expectedEventId = String(eventId || "").trim();

  const { data: ticket, error: ticketError } = await supabase
    .from("issued_tickets")
    .select("id,event_id,order_id,tier_id,user_id,status,checked_in_at,ticket_code")
    .eq("ticket_code", code)
    .maybeSingle();
  throwIfError(ticketError);
  if (!ticket) throw new Error("Ticket not found.");
  if (expectedEventId && ticket.event_id !== expectedEventId) throw new Error("Ticket is for another event.");
  if (ticket.status !== "active") throw new Error(`Ticket is ${ticket.status}.`);
  if (ticket.checked_in_at) throw new Error("Ticket has already been checked in.");

  const now = new Date().toISOString();
  const { data: updatedRows, error: updateError } = await supabase
    .from("issued_tickets")
    .update({
      status: "used",
      checked_in_at: now,
      checked_in_by: actorId || null,
      updated_at: now,
    })
    .eq("id", ticket.id)
    .eq("status", "active")
    .is("checked_in_at", null)
    .select("id,event_id,order_id,tier_id,user_id,status,checked_in_at,ticket_code");
  throwIfError(updateError);
  const updated = Array.isArray(updatedRows) ? updatedRows[0] : null;
  if (!updated) throw new Error("Ticket has already been checked in.");

  const { data: checkin, error: checkinError } = await supabase
    .from("ticket_checkins")
    .insert({
      issued_ticket_id: ticket.id,
      event_id: ticket.event_id,
      checked_in_by: actorId || null,
      method: "qr",
      device_label: deviceLabel || null,
    })
    .select("*")
    .single();
  throwIfError(checkinError);

  const [{ data: event, error: eventError }, { data: tier, error: tierError }, { data: order, error: orderError }, { data: user, error: userError }] = await Promise.all([
    supabase.from("ticket_events").select("id,title,date_label,venue,city").eq("id", updated.event_id).maybeSingle(),
    supabase.from("ticket_tiers").select("id,name,price_mwk").eq("id", updated.tier_id).maybeSingle(),
    supabase.from("ticket_orders").select("id,total_mwk,quantity,payment_status,paid_at").eq("id", updated.order_id).maybeSingle(),
    supabase.from("profiles").select("id,full_name,email,phone").eq("id", updated.user_id).maybeSingle(),
  ]);
  throwIfError(eventError);
  throwIfError(tierError);
  throwIfError(orderError);
  throwIfError(userError);

  return {
    ticket: {
      ...updated,
      event: event || null,
      tier: tier || null,
      order: order || null,
      user: user || null,
    },
    checkin,
  };
}
