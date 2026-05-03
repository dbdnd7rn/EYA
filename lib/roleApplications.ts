import AsyncStorage from "@react-native-async-storage/async-storage";
import { ENV } from "@/lib/env";
import { createAdminNotification, createInAppNotification } from "@/lib/appNotifications";
import { type AppRole } from "@/lib/roleRouting";
import { supabase } from "@/lib/supabase";

export type RoleApplicationKind = "landlord" | "restaurant" | "seller" | "delivery";
export type RoleApplicationStatus = "pending" | "approved" | "declined";

export type RoleApplication = {
  id: string;
  user_id: string;
  target_role: Exclude<AppRole, "student" | "admin" | null>;
  application_kind: RoleApplicationKind;
  status: RoleApplicationStatus;
  payload: Record<string, string>;
  applicant_name: string | null;
  applicant_email: string | null;
  applicant_phone: string | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type SubmitInput = {
  userId: string;
  targetRole: RoleApplication["target_role"];
  applicationKind: RoleApplicationKind;
  payload: Record<string, string>;
  applicantName?: string | null;
  applicantEmail?: string | null;
  applicantPhone?: string | null;
};

const DEV_APPLICATIONS_KEY = "eya.role_applications.v1";

function nowIso() {
  return new Date().toISOString();
}

async function readDevApplications(): Promise<RoleApplication[]> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(DEV_APPLICATIONS_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    return JSON.parse(raw) as RoleApplication[];
  } catch {
    return [];
  }
}

async function writeDevApplications(rows: RoleApplication[]) {
  try {
    await AsyncStorage.setItem(DEV_APPLICATIONS_KEY, JSON.stringify(rows));
  } catch {
    // Local role applications are a dev-mode convenience.
  }
}

function normalizeApplication(row: any): RoleApplication {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    target_role: row.target_role,
    application_kind: row.application_kind,
    status: row.status,
    payload: (row.payload ?? {}) as Record<string, string>,
    applicant_name: row.applicant_name ?? null,
    applicant_email: row.applicant_email ?? null,
    applicant_phone: row.applicant_phone ?? null,
    admin_note: row.admin_note ?? null,
    reviewed_by: row.reviewed_by ?? null,
    reviewed_at: row.reviewed_at ?? null,
    created_at: row.created_at ?? nowIso(),
    updated_at: row.updated_at ?? nowIso(),
  };
}

function applicationRoleLabel(row: Pick<RoleApplication, "application_kind" | "target_role">) {
  if (row.application_kind === "restaurant") return "Restaurant";
  if (row.application_kind === "seller") return "Seller";
  if (row.application_kind === "delivery") return "Delivery Agent";
  if (row.target_role === "landlord") return "Landlord";
  return "Workspace";
}

async function notifyAdminsAboutApplication(row: RoleApplication) {
  try {
    const label = applicationRoleLabel(row);
    await createAdminNotification({
      title: `New ${label} admission`,
      message: `${row.applicant_name || row.applicant_email || "A user"} submitted a ${label.toLowerCase()} role application.`,
      type: "role_application_submitted",
      priority: "important",
      data: {
        applicationId: row.id,
        applicantId: row.user_id,
        targetRole: row.target_role,
        applicationKind: row.application_kind,
      },
    });
  } catch {
    // Role submission should not fail because admin notification delivery failed.
  }
}

async function notifyApplicantAboutReview(row: RoleApplication) {
  try {
    const label = applicationRoleLabel(row);
    const approved = row.status === "approved";
    await createInAppNotification({
      userId: row.user_id,
      title: approved ? `${label} admission approved` : `${label} admission declined`,
      message: approved
        ? `Your ${label.toLowerCase()} admission has been approved. You can now switch into that workspace.`
        : `Your ${label.toLowerCase()} admission was declined.${row.admin_note ? ` ${row.admin_note}` : ""}`,
      type: approved ? "role_application_approved" : "role_application_declined",
      priority: "important",
      data: {
        applicationId: row.id,
        targetRole: row.target_role,
        applicationKind: row.application_kind,
        status: row.status,
      },
    });
  } catch {
    // Admin review should not fail because applicant notification delivery failed.
  }
}

export async function submitRoleApplication(input: SubmitInput) {
  if (ENV.DEV_AUTH_MODE) {
    const rows = await readDevApplications();
    const existing = rows.find(
      (row) =>
        row.user_id === input.userId &&
        row.target_role === input.targetRole &&
        row.application_kind === input.applicationKind &&
        row.status === "pending",
    );
    if (existing) return existing;

    const row: RoleApplication = {
      id: `dev-${Date.now()}`,
      user_id: input.userId,
      target_role: input.targetRole,
      application_kind: input.applicationKind,
      status: "pending",
      payload: input.payload,
      applicant_name: input.applicantName ?? null,
      applicant_email: input.applicantEmail ?? null,
      applicant_phone: input.applicantPhone ?? null,
      admin_note: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    await writeDevApplications([row, ...rows]);
    await notifyAdminsAboutApplication(row);
    return row;
  }

  const { data, error } = await supabase
    .from("role_applications")
    .insert({
      user_id: input.userId,
      target_role: input.targetRole,
      application_kind: input.applicationKind,
      status: "pending",
      payload: input.payload,
      applicant_name: input.applicantName ?? null,
      applicant_email: input.applicantEmail ?? null,
      applicant_phone: input.applicantPhone ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("You already have a pending application for this workspace.");
    }
    throw error;
  }
  return normalizeApplication(data);
}

export async function listMyRoleApplications(userId: string) {
  if (ENV.DEV_AUTH_MODE) {
    const rows = await readDevApplications();
    return rows.filter((row) => row.user_id === userId).map(normalizeApplication);
  }

  const { data, error } = await supabase
    .from("role_applications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(normalizeApplication);
}

export async function listRoleApplicationsForAdmin() {
  if (ENV.DEV_AUTH_MODE) {
    return (await readDevApplications()).map(normalizeApplication);
  }

  const { data, error } = await supabase
    .from("role_applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(240);

  if (error) throw error;
  return (data ?? []).map(normalizeApplication);
}

export async function reviewRoleApplication(input: {
  applicationId: string;
  status: Extract<RoleApplicationStatus, "approved" | "declined">;
  adminUserId: string;
  adminNote?: string | null;
}) {
  const reviewedAt = nowIso();
  if (ENV.DEV_AUTH_MODE) {
    const rows = await readDevApplications();
    const nextRows = rows.map((row) =>
      row.id === input.applicationId
        ? {
            ...row,
            status: input.status,
            admin_note: input.adminNote ?? null,
            reviewed_by: input.adminUserId,
            reviewed_at: reviewedAt,
            updated_at: reviewedAt,
          }
        : row,
    );
    await writeDevApplications(nextRows);
    const updated = nextRows.find((row) => row.id === input.applicationId);
    if (!updated) throw new Error("Application not found.");
    await notifyApplicantAboutReview(updated);
    return updated;
  }

  const { data, error } = await supabase
    .from("role_applications")
    .update({
      status: input.status,
      admin_note: input.adminNote ?? null,
      reviewed_by: input.adminUserId,
      reviewed_at: reviewedAt,
    })
    .eq("id", input.applicationId)
    .select("*")
    .single();

  if (error) throw error;
  return normalizeApplication(data);
}

export async function hasApprovedWorkspaceRole(userId: string, role: AppRole) {
  if (!userId) return false;
  if (role === "student") return true;
  if (role === "admin") return true;
  if (role !== "landlord" && role !== "vendor" && role !== "agent") return false;

  const rows = await listMyRoleApplications(userId).catch(() => []);
  return rows.some((row) => row.target_role === role && row.status === "approved");
}
