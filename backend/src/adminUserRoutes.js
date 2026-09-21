import { requireAdmin, statusFromError } from "./auth.js";
import { config, isConfiguredAdminEmail } from "./config.js";
import { sendPushNotificationsToUsers } from "./push.js";
import { supabase, supabaseNewApp } from "./supabase.js";

function sendError(res, status, message) {
  return res.status(status).json({ status: "error", error: message, message });
}

function normalizeManagedRole(value) {
  const role = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (role === "student" || role === "landlord" || role === "agent" || role === "vendor" || role === "admin") return role;
  return null;
}

function normalizeNotificationAudience(value) {
  const role = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (role === "all") return "all";
  return normalizeManagedRole(role);
}

async function listBroadcastRecipientIds(audience) {
  const pageSize = 1000;
  const ids = new Set();

  async function addAuthUserIds() {
    for (let page = 1; ; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: pageSize });
      if (error) throw new Error(error.message);
      const users = data?.users || [];
      for (const user of users) if (user?.id) ids.add(user.id);
      if (users.length < pageSize) break;
    }
  }

  if (audience === "all") {
    await addAuthUserIds();
    return [...ids];
  }

  if (audience === "student") {
    await addAuthUserIds();
    const nonStudentIds = new Set();
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,role")
        .neq("role", "student")
        .range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      for (const row of data || []) if (row?.id) nonStudentIds.add(row.id);
      if (!data || data.length < pageSize) break;
    }
    for (const id of nonStudentIds) ids.delete(id);
    return [...ids];
  }

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id,role")
      .eq("role", audience)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    for (const row of data || []) if (row?.id) ids.add(row.id);
    if (!data || data.length < pageSize) break;
  }
  return [...ids];
}

async function createBroadcastNotifications(userIds, { title, message, type, priority, audience }) {
  const targets = [...new Set((userIds || []).filter((value) => typeof value === "string" && value.trim()))];
  if (!targets.length) return 0;

  const now = new Date().toISOString();
  const rows = targets.map((userId) => ({
    user_id: userId,
    title,
    message,
    type,
    priority,
    data: { audienceRole: audience, broadcast: true },
    is_read: false,
    pushed_at: now,
  }));

  const chunkSize = 500;
  let inserted = 0;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from("notifications").insert(chunk);
    if (error) throw new Error(error.message);
    inserted += chunk.length;
  }
  return inserted;
}

function countBy(rows, key) {
  return (rows || []).reduce((acc, row) => {
    const id = row?.[key];
    if (!id) return acc;
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});
}

export function registerAdminUserRoutes(app) {
  app.get("/api/admin/users", async (req, res) => {
    try {
      await requireAdmin(req);
      const limit = Math.min(Math.max(Number(req.query.limit || 120), 1), 400);
      const queryText = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const role = normalizeManagedRole(req.query.role);

      let query = supabase
        .from("profiles")
        .select("id,full_name,first_name,last_name,email,phone,role,onboarded,campus,area,created_at,updated_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (role) query = query.eq("role", role);
      if (queryText) {
        query = query.or(`full_name.ilike.%${queryText}%,email.ilike.%${queryText}%,phone.ilike.%${queryText}%,campus.ilike.%${queryText}%,area.ilike.%${queryText}%`);
      }

      const { data: profiles, error } = await query;
      if (error) throw new Error(error.message);
      const userIds = (profiles || []).map((row) => row.id).filter(Boolean);

      const [listingCountsRes, vendorCountsRes, orderCountsRes] = await Promise.all([
        userIds.length
          ? supabase.from("listings").select("landlord_id").in("landlord_id", userIds)
          : Promise.resolve({ data: [], error: null }),
        userIds.length
          ? supabaseNewApp.from("vendors").select("owner_id").in("owner_id", userIds)
          : Promise.resolve({ data: [], error: null }),
        userIds.length
          ? supabaseNewApp.from("orders").select("customer_id").in("customer_id", userIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (listingCountsRes.error) throw new Error(listingCountsRes.error.message);
      if (vendorCountsRes.error) throw new Error(vendorCountsRes.error.message);
      if (orderCountsRes.error) throw new Error(orderCountsRes.error.message);

      const listingCountByUser = countBy(listingCountsRes.data, "landlord_id");
      const vendorCountByUser = countBy(vendorCountsRes.data, "owner_id");
      const orderCountByUser = countBy(orderCountsRes.data, "customer_id");
      const rows = (profiles || []).map((row) => ({
        ...row,
        listing_count: Number(listingCountByUser[row.id] || 0),
        vendor_count: Number(vendorCountByUser[row.id] || 0),
        order_count: Number(orderCountByUser[row.id] || 0),
      }));
      return res.json({ status: "success", users: rows });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not load users.");
    }
  });

  app.post("/api/admin/users/invite", async (req, res) => {
    try {
      await requireAdmin(req);
      const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
      const fullName = typeof req.body?.full_name === "string" ? req.body.full_name.trim() : "";
      const role = normalizeManagedRole(req.body?.role || "admin");
      if (!email || !email.includes("@")) return sendError(res, 400, "A valid email is required.");
      if (!role) return sendError(res, 400, "Invalid role.");
      if (role === "admin" && !isConfiguredAdminEmail(email)) {
        return sendError(res, 400, "This email is not allowlisted for admin access.");
      }

      const redirectTo = config.publicBaseUrl ? `${config.publicBaseUrl}/auth/callback` : undefined;
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName || null, role },
        ...(redirectTo ? { redirectTo } : {}),
      });
      if (inviteError) throw new Error(inviteError.message);

      const invitedUser = inviteData?.user;
      if (!invitedUser?.id) return sendError(res, 500, "Invite was sent but user profile could not be resolved.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: invitedUser.id,
            email,
            full_name: fullName || invitedUser.user_metadata?.full_name || null,
            role,
            onboarded: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )
        .select("id,full_name,email,role")
        .single();
      if (profileError) throw new Error(profileError.message);
      return res.json({ status: "success", user: profile });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not invite user.");
    }
  });

  app.post("/api/admin/users/:userId", async (req, res) => {
    try {
      const admin = await requireAdmin(req);
      const userId = String(req.params.userId || "").trim();
      if (!userId) return sendError(res, 400, "User id is required.");
      if (userId === admin.id && req.body?.role && String(req.body.role).trim().toLowerCase() !== "admin") {
        return sendError(res, 400, "Admin cannot remove their own admin role here.");
      }

      const payload = {};
      if (typeof req.body?.full_name === "string") payload.full_name = req.body.full_name.trim() || null;
      if (typeof req.body?.phone === "string") payload.phone = req.body.phone.trim() || null;
      if (typeof req.body?.campus === "string") payload.campus = req.body.campus.trim() || null;
      if (typeof req.body?.area === "string") payload.area = req.body.area.trim() || null;
      if (typeof req.body?.onboarded === "boolean") payload.onboarded = req.body.onboarded;

      const role = normalizeManagedRole(req.body?.role);
      if (req.body?.role !== undefined) {
        if (!role) return sendError(res, 400, "Invalid role.");
        if (role === "admin") {
          const { data: targetProfile, error: targetError } = await supabase
            .from("profiles")
            .select("email")
            .eq("id", userId)
            .maybeSingle();
          if (targetError) throw new Error(targetError.message);
          if (!isConfiguredAdminEmail(targetProfile?.email)) {
            return sendError(res, 400, "This email is not allowlisted for admin access.");
          }
        }
        payload.role = role;
      }
      if (!Object.keys(payload).length) return sendError(res, 400, "No valid user fields provided.");

      const { data, error } = await supabase
        .from("profiles")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .select("id,full_name,first_name,last_name,email,phone,role,onboarded,campus,area,created_at,updated_at")
        .single();
      if (error) throw new Error(error.message);
      return res.json({ status: "success", user: data });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not update user.");
    }
  });

  app.delete("/api/admin/users/:userId", async (req, res) => {
    try {
      const admin = await requireAdmin(req);
      const userId = String(req.params.userId || "").trim();
      if (!userId) return sendError(res, 400, "User id is required.");
      if (userId === admin.id) return sendError(res, 400, "Admin cannot delete their own account here.");

      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
      return res.json({ status: "success", user_id: userId });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not delete user.");
    }
  });

  app.post("/api/admin/broadcast", async (req, res) => {
    try {
      await requireAdmin(req);
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
      const audience = normalizeNotificationAudience(req.body?.audience_role || "all");
      const priority = req.body?.priority === "important" ? "important" : "normal";
      const type = typeof req.body?.type === "string" && req.body.type.trim() ? req.body.type.trim() : "system";
      if (!title) return sendError(res, 400, "Notification title is required.");
      if (!message) return sendError(res, 400, "Notification message is required.");
      if (!audience) return sendError(res, 400, "Invalid notification audience.");

      const userIds = await listBroadcastRecipientIds(audience);
      const notificationCount = await createBroadcastNotifications(userIds, { title, message, type, priority, audience });
      let pushSent = 0;
      if (userIds.length) {
        try {
          const pushResult = await sendPushNotificationsToUsers(userIds, {
            title,
            body: message,
            type,
            priority,
            data: { audienceRole: audience, broadcast: true },
            skipInApp: true,
          });
          pushSent = Number(pushResult?.sent || 0);
        } catch (pushError) {
          console.error("[admin-broadcast-push-error]", pushError instanceof Error ? pushError.message : pushError);
        }
      }

      return res.json({
        status: "success",
        sent_to: notificationCount,
        push_sent: pushSent,
        audience_role: audience,
        recipient_source: audience === "all" || audience === "student" ? "auth_users" : "profiles",
      });
    } catch (error) {
      return sendError(res, statusFromError(error, 403), error instanceof Error ? error.message : "Could not send broadcast.");
    }
  });
}
