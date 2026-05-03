import { getAgentRiderProfile } from "@/lib/agentRiderProfile";
import { ENV, isConfiguredAdminEmail } from "@/lib/env";
import { listMyVendors } from "@/lib/newApp/vendors";
import { normalizeAppRole, type AppRole } from "@/lib/roleRouting";
import { listMyRoleApplications, type RoleApplicationStatus } from "@/lib/roleApplications";
import { supabase } from "@/lib/supabase";

export type WorkspaceRole = Exclude<AppRole, null>;

export type WorkspaceStatus = {
  role: WorkspaceRole;
  label: string;
  ready: boolean;
  description: string;
  homeRoute: string;
  setupRoute?: string;
  ctaReady: string;
  ctaSetup?: string;
  applicationStatus?: RoleApplicationStatus | "none";
};

export function getWorkspaceLabel(role: WorkspaceRole) {
  if (role === "student") return "User";
  if (role === "vendor") return "Restaurant";
  if (role === "landlord") return "Landlord";
  if (role === "agent") return "Delivery Agent";
  return "Admin";
}

export function getWorkspaceHomeRoute(role: WorkspaceRole) {
  if (role === "vendor") return "/(market)/(tabs)/dashboard";
  if (role === "landlord") return "/(landlord)/(tabs)/dashboard";
  if (role === "agent") return "/(agent)/(tabs)/dashboard";
  if (role === "admin") return "/admin";
  return "/(student)/(tabs)/home";
}

export function getWorkspaceSetupRoute(role: Exclude<WorkspaceRole, "admin">) {
  if (role === "vendor") return "/(market)/setup";
  if (role === "landlord") return "/(landlord)/(tabs)/create";
  if (role === "agent") return "/(agent)/(tabs)/dashboard";
  return "/(student)/(tabs)/home";
}

export function getWorkspaceSteps(role: Exclude<WorkspaceRole, "admin">) {
  if (role === "vendor") {
    return [
      "Open your restaurant profile.",
      "Add business details and location.",
      "Publish your menu and start receiving orders.",
    ];
  }
  if (role === "landlord") {
    return [
      "Open landlord workspace.",
      "Create your first listing with photos and location.",
      "Start receiving and replying to enquiries.",
    ];
  }
  if (role === "agent") {
    return [
      "Open rider workspace.",
      "Add your rider details in profile.",
      "Go online and start accepting delivery jobs.",
    ];
  }
  return [
    "Sign in once.",
    "Browse rooms, food, and essentials.",
    "Switch to any other workspace anytime.",
  ];
}

export function getFallbackWorkspaceRole(role: AppRole, email?: string | null): WorkspaceRole {
  const normalized = normalizeAppRole(role);
  if (normalized === "admin" && (ENV.DEV_AUTH_MODE || isConfiguredAdminEmail(email))) return "admin";
  return "student";
}

export async function getWorkspaceStatuses(userId: string, _email?: string | null): Promise<WorkspaceStatus[]> {
  const [vendors, listingsRes, riderProfile, applications] = await Promise.all([
    listMyVendors(userId).catch(() => []),
    supabase.from("listings").select("id", { count: "exact", head: true }).eq("landlord_id", userId),
    getAgentRiderProfile(userId).catch(() => null),
    listMyRoleApplications(userId).catch(() => []),
  ]);

  const hasVendor = vendors.length > 0;
  const hasListings = Number(listingsRes.count ?? 0) > 0;
  const hasAgentProfile = Boolean(riderProfile);
  const appStatusFor = (role: WorkspaceRole): RoleApplicationStatus | "none" => {
    const approved = applications.find((entry) => entry.target_role === role && entry.status === "approved");
    if (approved) return "approved";
    const pending = applications.find((entry) => entry.target_role === role && entry.status === "pending");
    if (pending) return "pending";
    const declined = applications.find((entry) => entry.target_role === role && entry.status === "declined");
    return declined ? "declined" : "none";
  };
  const vendorApplicationStatus = appStatusFor("vendor");
  const landlordApplicationStatus = appStatusFor("landlord");
  const agentApplicationStatus = appStatusFor("agent");
  const vendorApproved = vendorApplicationStatus === "approved";
  const landlordApproved = landlordApplicationStatus === "approved";
  const agentApproved = agentApplicationStatus === "approved";
  const statuses: WorkspaceStatus[] = [
    {
      role: "student",
      label: "User",
      ready: true,
      description: "Browse rooms, food, and essentials with your main account.",
      homeRoute: getWorkspaceHomeRoute("student"),
      setupRoute: getWorkspaceSetupRoute("student"),
      ctaReady: "Open user app",
      ctaSetup: "Continue as user",
      applicationStatus: "approved",
    },
    {
      role: "vendor",
      label: "Restaurant",
      ready: vendorApproved,
      description: vendorApproved
        ? hasVendor
          ? "Restaurant workspace is approved and ready to use."
          : "Restaurant workspace is approved. Complete your shop setup."
        : vendorApplicationStatus === "pending"
          ? "Restaurant workspace application is pending admin review."
          : "Apply for restaurant or seller access before setup opens.",
      homeRoute: getWorkspaceHomeRoute("vendor"),
      setupRoute: getWorkspaceSetupRoute("vendor"),
      ctaReady: "Open restaurant",
      ctaSetup: "Set up restaurant",
      applicationStatus: vendorApplicationStatus,
    },
    {
      role: "landlord",
      label: "Landlord",
      ready: landlordApproved,
      description: landlordApproved
        ? hasListings
          ? "Landlord workspace is approved and already has listings."
          : "Landlord workspace is approved. Create your first listing."
        : landlordApplicationStatus === "pending"
          ? "Landlord application is pending admin review."
          : "Apply for landlord access before listings open.",
      homeRoute: getWorkspaceHomeRoute("landlord"),
      setupRoute: getWorkspaceSetupRoute("landlord"),
      ctaReady: "Open landlord",
      ctaSetup: "Create first listing",
      applicationStatus: landlordApplicationStatus,
    },
    {
      role: "agent",
      label: "Delivery Agent",
      ready: agentApproved,
      description: agentApproved
        ? hasAgentProfile
          ? "Rider workspace is approved and ready to go."
          : "Rider workspace is approved. Complete your profile."
        : agentApplicationStatus === "pending"
          ? "Delivery application is pending admin review."
          : "Apply for delivery access before rider tools open.",
      homeRoute: getWorkspaceHomeRoute("agent"),
      setupRoute: getWorkspaceSetupRoute("agent"),
      ctaReady: "Open rider workspace",
      ctaSetup: "Start rider setup",
      applicationStatus: agentApplicationStatus,
    },
  ];

  return statuses;
}
