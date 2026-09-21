import { isConfiguredAdminEmail } from "./config.js";
import { supabase } from "./supabase.js";

function authError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function getProfileById(userId) {
  const id = typeof userId === "string" ? userId.trim() : "";
  if (!id) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,role,full_name,email,phone")
    .eq("id", id)
    .maybeSingle();
  if (error) throw authError(500, error.message);
  return data;
}

export async function requireAuthenticatedUser(req) {
  const authHeader = req.header("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) throw authError(401, "Authentication required.");

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) throw authError(401, "Invalid or expired session.");

  const profile = await getProfileById(data.user.id);
  return { user: data.user, profile };
}

export function claimedActorId(req) {
  const value = req.header("x-actor-user-id") || req.header("x-user-id");
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function requireAuthenticatedActor(req) {
  const { user, profile } = await requireAuthenticatedUser(req);
  const claimedUserId = claimedActorId(req);
  if (claimedUserId && claimedUserId !== user.id) {
    throw authError(403, "Actor identity does not match the authenticated session.");
  }
  return { actorId: user.id, user, profile };
}

export async function requireAdmin(req) {
  const { user, profile } = await requireAuthenticatedUser(req);
  const claimedUserId = req.header("x-admin-user-id") || claimedActorId(req);
  if (claimedUserId && String(claimedUserId) !== user.id) {
    throw authError(403, "Admin identity does not match the authenticated session.");
  }
  if (!profile || profile.role !== "admin") throw authError(403, "Admin access required.");
  if (!isConfiguredAdminEmail(profile.email)) {
    throw authError(403, "This account is not allowed to use admin controls.");
  }
  return profile;
}

export function statusFromError(error, fallback = 500) {
  const status = Number(error?.statusCode);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : fallback;
}
