import { getProfileById, requireAdmin, statusFromError } from "./auth.js";
import { getVendorById } from "./commerceData.js";
import { supabase, supabaseNewApp } from "./supabase.js";

function sendError(res, status, message) {
  return res.status(status).json({ status: "error", error: message, message });
}

function normalizeImageUrls(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const urls = [];
  for (const item of value) {
    const url = typeof item === "string" ? item.trim() : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function parseBooleanQuery(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "true" ? true : normalized === "false" ? false : null;
}

export function registerAdminCatalogRoutes(app) {
  app.get("/api/admin/vendors", async (req, res) => {
    try {
      await requireAdmin(req);
      const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 300);
      const queryText = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const activeOnly = parseBooleanQuery(req.query.active_only);

      let query = supabaseNewApp
        .from("vendors")
        .select("id,owner_id,name,description,supports_market,supports_food,campus,area,city,latitude,longitude,is_active,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (queryText) query = query.ilike("name", `%${queryText}%`);
      if (activeOnly !== null) query = query.eq("is_active", activeOnly);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return res.json({ status: "success", vendors: data || [] });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not load vendors.");
    }
  });

  app.post("/api/admin/vendors", async (req, res) => {
    try {
      await requireAdmin(req);
      const ownerId = typeof req.body?.owner_id === "string" ? req.body.owner_id.trim() : "";
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      if (!ownerId) return sendError(res, 400, "Owner user id is required.");
      if (!name) return sendError(res, 400, "Vendor name is required.");

      const owner = await getProfileById(ownerId);
      if (!owner) return sendError(res, 400, "Owner account not found.");

      const payload = {
        owner_id: ownerId,
        name,
        description: typeof req.body?.description === "string" ? req.body.description.trim() || null : null,
        supports_market: typeof req.body?.supports_market === "boolean" ? req.body.supports_market : true,
        supports_food: typeof req.body?.supports_food === "boolean" ? req.body.supports_food : false,
        campus: typeof req.body?.campus === "string" ? req.body.campus.trim() || null : null,
        area: typeof req.body?.area === "string" ? req.body.area.trim() || null : null,
        city: typeof req.body?.city === "string" ? req.body.city.trim() || null : null,
        is_active: typeof req.body?.is_active === "boolean" ? req.body.is_active : true,
      };

      const { data, error } = await supabaseNewApp
        .from("vendors")
        .insert(payload)
        .select("id,owner_id,name,description,supports_market,supports_food,campus,area,city,latitude,longitude,is_active,created_at,updated_at")
        .single();
      if (error) throw new Error(error.message);
      return res.json({ status: "success", vendor: data });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not create vendor.");
    }
  });

  app.post("/api/admin/vendors/:vendorId", async (req, res) => {
    try {
      await requireAdmin(req);
      const vendorId = String(req.params.vendorId || "").trim();
      if (!vendorId) return sendError(res, 400, "Vendor id is required.");

      const payload = {};
      if (typeof req.body?.is_active === "boolean") payload.is_active = req.body.is_active;
      if (typeof req.body?.supports_market === "boolean") payload.supports_market = req.body.supports_market;
      if (typeof req.body?.supports_food === "boolean") payload.supports_food = req.body.supports_food;
      if (typeof req.body?.name === "string" && req.body.name.trim()) payload.name = req.body.name.trim();
      if (typeof req.body?.description === "string") payload.description = req.body.description.trim() || null;
      if (req.body?.description === null) payload.description = null;
      if (typeof req.body?.campus === "string") payload.campus = req.body.campus.trim() || null;
      if (req.body?.campus === null) payload.campus = null;
      if (typeof req.body?.area === "string") payload.area = req.body.area.trim() || null;
      if (req.body?.area === null) payload.area = null;
      if (typeof req.body?.city === "string") payload.city = req.body.city.trim() || null;
      if (req.body?.city === null) payload.city = null;
      if (!Object.keys(payload).length) return sendError(res, 400, "No valid vendor fields provided.");

      const { data, error } = await supabaseNewApp
        .from("vendors")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", vendorId)
        .select("id,owner_id,name,description,supports_market,supports_food,campus,area,city,latitude,longitude,is_active,created_at,updated_at")
        .single();
      if (error) throw new Error(error.message);
      return res.json({ status: "success", vendor: data });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not update vendor.");
    }
  });

  app.delete("/api/admin/vendors/:vendorId", async (req, res) => {
    try {
      await requireAdmin(req);
      const vendorId = String(req.params.vendorId || "").trim();
      if (!vendorId) return sendError(res, 400, "Vendor id is required.");

      const { data: linkedOrders, error: orderError } = await supabaseNewApp
        .from("orders")
        .select("id")
        .eq("vendor_id", vendorId)
        .limit(1);
      if (orderError) throw new Error(orderError.message);
      if ((linkedOrders || []).length) return sendError(res, 409, "Vendor has linked orders. Hide it instead of deleting.");

      const { error } = await supabaseNewApp.from("vendors").delete().eq("id", vendorId);
      if (error) throw new Error(error.message);
      return res.json({ status: "success", vendor_id: vendorId });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not delete vendor.");
    }
  });

  app.get("/api/admin/catalog-items", async (req, res) => {
    try {
      await requireAdmin(req);
      const limit = Math.min(Math.max(Number(req.query.limit || 120), 1), 400);
      const queryText = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const activeOnly = parseBooleanQuery(req.query.active_only);
      const channel = typeof req.query.channel === "string" ? req.query.channel.trim() : "";

      let query = supabaseNewApp
        .from("catalog_items")
        .select("id,vendor_id,channel,name,description,price_mwk,stock_qty,image_url,image_urls,is_active,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (queryText) query = query.ilike("name", `%${queryText}%`);
      if (activeOnly !== null) query = query.eq("is_active", activeOnly);
      if (channel === "market" || channel === "food") query = query.eq("channel", channel);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return res.json({ status: "success", items: data || [] });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not load catalog items.");
    }
  });

  app.post("/api/admin/catalog-items", async (req, res) => {
    try {
      await requireAdmin(req);
      const vendorId = typeof req.body?.vendor_id === "string" ? req.body.vendor_id.trim() : "";
      const channel = typeof req.body?.channel === "string" ? req.body.channel.trim() : "";
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const price = Number(req.body?.price_mwk);
      if (!vendorId) return sendError(res, 400, "Vendor id is required.");
      if (channel !== "market" && channel !== "food") return sendError(res, 400, "Channel must be market or food.");
      if (!name) return sendError(res, 400, "Item name is required.");
      if (!Number.isFinite(price) || price < 0) return sendError(res, 400, "price_mwk must be a valid amount.");
      if (!(await getVendorById(vendorId))) return sendError(res, 400, "Vendor not found.");

      let stockQty = null;
      if (req.body?.stock_qty !== undefined && req.body?.stock_qty !== null && req.body?.stock_qty !== "") {
        const parsedStock = Number(req.body.stock_qty);
        if (!Number.isFinite(parsedStock)) return sendError(res, 400, "stock_qty must be numeric.");
        stockQty = parsedStock;
      }

      const bodyImageUrls = normalizeImageUrls(req.body?.image_urls);
      const bodyImageUrl = typeof req.body?.image_url === "string" ? req.body.image_url.trim() || null : null;
      const imageUrls = bodyImageUrls.length ? bodyImageUrls : bodyImageUrl ? [bodyImageUrl] : [];
      const payload = {
        vendor_id: vendorId,
        channel,
        name,
        description: typeof req.body?.description === "string" ? req.body.description.trim() || null : null,
        price_mwk: price,
        stock_qty: stockQty,
        image_url: bodyImageUrl || imageUrls[0] || null,
        image_urls: imageUrls,
        is_active: typeof req.body?.is_active === "boolean" ? req.body.is_active : true,
      };

      const { data, error } = await supabaseNewApp
        .from("catalog_items")
        .insert(payload)
        .select("id,vendor_id,channel,name,description,price_mwk,stock_qty,image_url,image_urls,is_active,created_at,updated_at")
        .single();
      if (error) throw new Error(error.message);
      return res.json({ status: "success", item: data });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not create catalog item.");
    }
  });

  app.post("/api/admin/catalog-items/:itemId", async (req, res) => {
    try {
      await requireAdmin(req);
      const itemId = String(req.params.itemId || "").trim();
      if (!itemId) return sendError(res, 400, "Item id is required.");

      const payload = {};
      if (typeof req.body?.is_active === "boolean") payload.is_active = req.body.is_active;
      if (typeof req.body?.name === "string" && req.body.name.trim()) payload.name = req.body.name.trim();
      if (typeof req.body?.description === "string") payload.description = req.body.description.trim() || null;
      if (req.body?.description === null) payload.description = null;
      if (typeof req.body?.image_url === "string") payload.image_url = req.body.image_url.trim() || null;
      if (req.body?.image_url === null) payload.image_url = null;
      if (Array.isArray(req.body?.image_urls)) {
        const imageUrls = normalizeImageUrls(req.body.image_urls);
        payload.image_urls = imageUrls;
        if (payload.image_url === undefined) payload.image_url = imageUrls[0] || null;
      }
      if (req.body?.image_urls === null) payload.image_urls = [];
      if (req.body?.stock_qty === null) payload.stock_qty = null;
      if (req.body?.stock_qty !== undefined && req.body?.stock_qty !== null) {
        const stockQty = Number(req.body.stock_qty);
        if (!Number.isFinite(stockQty)) return sendError(res, 400, "stock_qty must be numeric.");
        payload.stock_qty = stockQty;
      }
      if (req.body?.price_mwk !== undefined) {
        const price = Number(req.body.price_mwk);
        if (!Number.isFinite(price) || price < 0) return sendError(res, 400, "price_mwk must be a valid amount.");
        payload.price_mwk = price;
      }
      if (!Object.keys(payload).length) return sendError(res, 400, "No valid listing fields provided.");

      const { data, error } = await supabaseNewApp
        .from("catalog_items")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", itemId)
        .select("id,vendor_id,channel,name,description,price_mwk,stock_qty,image_url,image_urls,is_active,created_at,updated_at")
        .single();
      if (error) throw new Error(error.message);
      return res.json({ status: "success", item: data });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not update catalog item.");
    }
  });

  app.delete("/api/admin/catalog-items/:itemId", async (req, res) => {
    try {
      await requireAdmin(req);
      const itemId = String(req.params.itemId || "").trim();
      if (!itemId) return sendError(res, 400, "Item id is required.");

      const { data: linkedOrders, error: orderError } = await supabaseNewApp
        .from("order_items")
        .select("id")
        .eq("item_id", itemId)
        .limit(1);
      if (orderError) throw new Error(orderError.message);
      if ((linkedOrders || []).length) return sendError(res, 409, "Listing has linked orders. Hide it instead of deleting.");

      const { error } = await supabaseNewApp.from("catalog_items").delete().eq("id", itemId);
      if (error) throw new Error(error.message);
      return res.json({ status: "success", item_id: itemId });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not delete catalog item.");
    }
  });

  app.get("/api/admin/housing-listings", async (req, res) => {
    try {
      await requireAdmin(req);
      const limit = Math.min(Math.max(Number(req.query.limit || 120), 1), 300);
      const queryText = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const activeOnly = parseBooleanQuery(req.query.active_only);

      let query = supabase
        .from("listings")
        .select("id,landlord_id,title,listing_type,campus,area,city,price_from,description,contact_phone,is_active,image_urls,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (activeOnly !== null) query = query.eq("is_active", activeOnly);
      if (queryText) query = query.or(`title.ilike.%${queryText}%,campus.ilike.%${queryText}%,area.ilike.%${queryText}%,city.ilike.%${queryText}%`);

      const { data: listings, error } = await query;
      if (error) throw new Error(error.message);

      const landlordIds = [...new Set((listings || []).map((row) => row.landlord_id).filter(Boolean))];
      const landlordResult = landlordIds.length
        ? await supabase.from("profiles").select("id,full_name,email,phone").in("id", landlordIds)
        : { data: [], error: null };
      if (landlordResult.error) throw new Error(landlordResult.error.message);
      const landlordById = new Map((landlordResult.data || []).map((row) => [row.id, row]));
      const rows = (listings || []).map((row) => ({ ...row, landlord: landlordById.get(row.landlord_id) || null }));
      return res.json({ status: "success", listings: rows });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not load housing listings.");
    }
  });

  app.post("/api/admin/housing-listings", async (req, res) => {
    try {
      await requireAdmin(req);
      const landlordId = typeof req.body?.landlord_id === "string" ? req.body.landlord_id.trim() : "";
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const listingType = typeof req.body?.listing_type === "string" ? req.body.listing_type.trim() : "";
      const contactPhone = typeof req.body?.contact_phone === "string" ? req.body.contact_phone.trim() : "";
      if (!landlordId) return sendError(res, 400, "Landlord user id is required.");
      if (!title) return sendError(res, 400, "Title is required.");
      if (listingType !== "hostel" && listingType !== "bedsitter") return sendError(res, 400, "Listing type must be hostel or bedsitter.");
      if (!contactPhone) return sendError(res, 400, "Contact phone is required.");
      if (!(await getProfileById(landlordId))) return sendError(res, 400, "Landlord account not found.");

      let priceFrom = null;
      if (req.body?.price_from !== undefined && req.body?.price_from !== null && req.body?.price_from !== "") {
        const parsedPrice = Number(req.body.price_from);
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) return sendError(res, 400, "price_from must be a valid amount.");
        priceFrom = parsedPrice;
      }

      const payload = {
        landlord_id: landlordId,
        title,
        listing_type: listingType,
        campus: typeof req.body?.campus === "string" ? req.body.campus.trim() || null : null,
        area: typeof req.body?.area === "string" ? req.body.area.trim() || null : null,
        city: typeof req.body?.city === "string" ? req.body.city.trim() || null : null,
        price_from: priceFrom,
        description: typeof req.body?.description === "string" ? req.body.description.trim() || null : null,
        contact_phone: contactPhone,
        contact_method: "whatsapp",
        image_urls: [],
        is_active: typeof req.body?.is_active === "boolean" ? req.body.is_active : true,
      };

      const { data, error } = await supabase
        .from("listings")
        .insert(payload)
        .select("id,landlord_id,title,listing_type,campus,area,city,price_from,description,contact_phone,is_active,image_urls,created_at,updated_at")
        .single();
      if (error) throw new Error(error.message);
      return res.json({ status: "success", listing: data });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not create housing listing.");
    }
  });

  app.post("/api/admin/housing-listings/:listingId", async (req, res) => {
    try {
      await requireAdmin(req);
      const listingId = String(req.params.listingId || "").trim();
      if (!listingId) return sendError(res, 400, "Listing id is required.");

      const payload = {};
      if (typeof req.body?.is_active === "boolean") payload.is_active = req.body.is_active;
      if (typeof req.body?.title === "string" && req.body.title.trim()) payload.title = req.body.title.trim();
      if (typeof req.body?.description === "string") payload.description = req.body.description.trim() || null;
      if (req.body?.description === null) payload.description = null;
      if (typeof req.body?.campus === "string") payload.campus = req.body.campus.trim() || null;
      if (req.body?.campus === null) payload.campus = null;
      if (typeof req.body?.area === "string") payload.area = req.body.area.trim() || null;
      if (req.body?.area === null) payload.area = null;
      if (typeof req.body?.city === "string") payload.city = req.body.city.trim() || null;
      if (req.body?.city === null) payload.city = null;
      if (typeof req.body?.contact_phone === "string") payload.contact_phone = req.body.contact_phone.trim() || null;
      if (req.body?.contact_phone === null) payload.contact_phone = null;
      if (req.body?.price_from !== undefined) {
        if (req.body.price_from === null || req.body.price_from === "") payload.price_from = null;
        else {
          const price = Number(req.body.price_from);
          if (!Number.isFinite(price) || price < 0) return sendError(res, 400, "price_from must be a valid amount.");
          payload.price_from = price;
        }
      }
      if (!Object.keys(payload).length) return sendError(res, 400, "No valid housing fields provided.");

      const { data, error } = await supabase
        .from("listings")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", listingId)
        .select("id,landlord_id,title,listing_type,campus,area,city,price_from,description,contact_phone,is_active,image_urls,created_at,updated_at")
        .single();
      if (error) throw new Error(error.message);
      return res.json({ status: "success", listing: data });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not update housing listing.");
    }
  });

  app.delete("/api/admin/housing-listings/:listingId", async (req, res) => {
    try {
      await requireAdmin(req);
      const listingId = String(req.params.listingId || "").trim();
      if (!listingId) return sendError(res, 400, "Listing id is required.");

      const { error } = await supabase.from("listings").delete().eq("id", listingId);
      if (error) throw new Error(error.message);
      return res.json({ status: "success", listing_id: listingId });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not delete housing listing.");
    }
  });
}
