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
    // Local role applications keep the admission flow usable when Supabase is unavailable.
  }
}

function readErrorText(error: unknown) {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const value = error as { code?: unknown; details?: unknown; hint?: unknown; message?: unknown };
    return [value.code, value.message, value.details, value.hint]
      .filter((part) => typeof part === "string" && part.trim().length > 0)
      .join(" ");
  }
  return String(error);
}

export function isRoleApplicationsUnavailableError(error: unknown) {
  const text = readErrorText(error).toLowerCase();
  if (!text) return false;

  const missingTable =
    text.includes("role_applications") &&
    (text.includes("schema cache") ||
      text.includes("could not find") ||
      text.includes("does not exist") ||
      text.includes("relation") ||
      text.includes("not found"));

  return (
    missingTable ||
    text.includes("network request failed") ||
    text.includes("failed to fetch") ||
    text.includes("fetch failed") ||
    text.includes("networkerror") ||
    text.includes("load failed")
  );
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

function applicationWorkspaceKey(row: Pick<RoleApplication, "user_id" | "target_role" | "application_kind">) {
  return `${row.user_id}:${row.target_role}:${row.application_kind}`;
}

function isSamePendingApplication(row: RoleApplication, input: SubmitInput) {
  return (
    row.user_id === input.userId &&
    row.target_role === input.targetRole &&
    row.application_kind === input.applicationKind &&
    row.status === "pending"
  );
}

function sortApplications(rows: RoleApplication[]) {
  return [...rows].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
}

function mergeRoleApplications(remoteRows: RoleApplication[], localRows: RoleApplication[]) {
  const merged: RoleApplication[] = [];
  const remoteWorkspaceKeys = new Set(remoteRows.filter((row) => row.status !== "declined").map(applicationWorkspaceKey));
  const seenIds = new Set<string>();

  for (const row of [...remoteRows, ...localRows]) {
    if (seenIds.has(row.id)) continue;
    if (localRows.includes(row) && remoteWorkspaceKeys.has(applicationWorkspaceKey(row)) && row.status === "pending") continue;
    seenIds.add(row.id);
    merged.push(row);
  }

  return sortApplications(merged);
}

function isLocalApplicationId(id: string) {
  return id.startsWith("dev-") || id.startsWith("local-");
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

async function submitLocalRoleApplication(input: SubmitInput, idPrefix = "local", options?: { notifyAdmins?: boolean }) {
  const rows = await readDevApplications();
  const existing = rows.find((row) => isSamePendingApplication(row, input));
  if (existing) return normalizeApplication(existing);

  const timestamp = nowIso();
  const row: RoleApplication = {
    id: `${idPrefix}-${Date.now()}`,
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
    created_at: timestamp,
    updated_at: timestamp,
  };
  await writeDevApplications([row, ...rows]);
  if (options?.notifyAdmins) await notifyAdminsAboutApplication(row);
  return row;
}

async function reviewLocalRoleApplication(input: {
  applicationId: string;
  status: Extract<RoleApplicationStatus, "approved" | "declined">;
  adminUserId: string;
  adminNote?: string | null;
}) {
  const reviewedAt = nowIso();
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

async function submitRemoteRoleApplication(input: SubmitInput) {
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
      const { data: existing, error: existingError } = await supabase
        .from("role_applications")
        .select("*")
        .eq("user_id", input.userId)
        .eq("target_role", input.targetRole)
        .eq("application_kind", input.applicationKind)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existingError && existing) return normalizeApplication(existing);
      throw new Error("This application is already pending admin review.");
    }
    throw error;
  }

  const row = normalizeApplication(data);
  await notifyAdminsAboutApplication(row);
  return row;
}

export async function submitRoleApplication(input: SubmitInput) {
  if (ENV.DEV_AUTH_MODE) {
    return submitLocalRoleApplication(input, "dev", { notifyAdmins: true });
  }

  try {
    return await submitRemoteRoleApplication(input);
  } catch (error) {
    if (isRoleApplicationsUnavailableError(error)) {
      return submitLocalRoleApplication(input, "local", { notifyAdmins: true });
    }
    throw error;
  }
}

export async function listMyRoleApplications(userId: string) {
  const localRows = (await readDevApplications()).filter((row) => row.user_id === userId).map(normalizeApplication);

  if (ENV.DEV_AUTH_MODE) {
    return sortApplications(localRows);
  }

  const { data, error } = await supabase
    .from("role_applications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    if (isRoleApplicationsUnavailableError(error)) return sortApplications(localRows);
    throw error;
  }
  return mergeRoleApplications((data ?? []).map(normalizeApplication), localRows);
}

export async function listRoleApplicationsForAdmin() {
  const localRows = (await readDevApplications()).map(normalizeApplication);

  if (ENV.DEV_AUTH_MODE) {
    return sortApplications(localRows);
  }

  const { data, error } = await supabase
    .from("role_applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(240);

  if (error) {
    if (isRoleApplicationsUnavailableError(error)) return sortApplications(localRows);
    throw error;
  }
  return mergeRoleApplications((data ?? []).map(normalizeApplication), localRows);
}

export async function reviewRoleApplication(input: {
  applicationId: string;
  status: Extract<RoleApplicationStatus, "approved" | "declined">;
  adminUserId: string;
  adminNote?: string | null;
}) {
  if (ENV.DEV_AUTH_MODE || isLocalApplicationId(input.applicationId)) {
    return reviewLocalRoleApplication(input);
  }

  const reviewedAt = nowIso();
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

  if (error) {
    if (isRoleApplicationsUnavailableError(error)) return reviewLocalRoleApplication(input);
    throw error;
  }
  const row = normalizeApplication(data);
  await notifyApplicantAboutReview(row);
  return row;
}

export async function syncLocalRoleApplications(userId?: string | null) {
  if (ENV.DEV_AUTH_MODE) return { synced: 0 };

  const rows = await readDevApplications();
  const localPendingRows = rows
    .filter((row) => isLocalApplicationId(row.id))
    .filter((row) => row.status === "pending")
    .filter((row) => !userId || row.user_id === userId)
    .map(normalizeApplication);

  if (!localPendingRows.length) return { synced: 0 };

  let nextRows = [...rows];
  let synced = 0;

  for (const row of localPendingRows) {
    try {
      await submitRemoteRoleApplication({
        userId: row.user_id,
        targetRole: row.target_role,
        applicationKind: row.application_kind,
        payload: row.payload,
        applicantName: row.applicant_name,
        applicantEmail: row.applicant_email,
        applicantPhone: row.applicant_phone,
      });
    } catch {
      continue;
    }

    nextRows = nextRows.filter((entry) => entry.id !== row.id);
    synced += 1;
  }

  if (synced > 0) await writeDevApplications(nextRows);
  return { synced };
}

export async function hasApprovedWorkspaceRole(userId: string, role: AppRole) {
  if (!userId) return false;
  if (role === "student") return true;
  if (role === "admin") return true;
  if (role !== "landlord" && role !== "vendor" && role !== "agent") return false;

  const rows = await listMyRoleApplications(userId).catch(() => []);
  return rows.some((row) => row.target_role === role && row.status === "approved");
}
