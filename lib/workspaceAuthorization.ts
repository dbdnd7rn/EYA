import { getAgentRiderProfile } from "@/lib/agentRiderProfile";
import { listMyVendors } from "@/lib/newApp/vendors";
import { listMyRoleApplications } from "@/lib/roleApplications";
import { normalizeAppRole, type AppRole } from "@/lib/roleRouting";
import { supabase } from "@/lib/supabase";

export async function hasWorkspaceAccess(userId: string, role: AppRole) {
  if (!userId) return false;
  if (role === "student" || role === "admin") return true;
  if (role !== "landlord" && role !== "vendor" && role !== "agent") return false;

  const applications = await listMyRoleApplications(userId).catch(() => []);
  if (applications.some((row) => row.target_role === role && row.status === "approved")) {
    return true;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (normalizeAppRole(profile?.role) === role) return true;

  if (role === "vendor") {
    const vendors = await listMyVendors(userId).catch(() => []);
    return vendors.some((vendor) => vendor.supports_food);
  }

  if (role === "landlord") {
    const { count, error } = await supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("landlord_id", userId);
    return !error && Number(count ?? 0) > 0;
  }

  const riderProfile = await getAgentRiderProfile(userId).catch(() => null);
  return Boolean(riderProfile);
}
