import { supabase } from "@/lib/supabase";
import { createAdminNotification, createInAppNotification } from "@/lib/appNotifications";

export type TrustSafetyReportStatus = "open" | "in_review" | "resolved" | "dismissed";

export type CreateTrustSafetyReportInput = {
  reporterId: string;
  subjectType: string;
  subjectId?: string | null;
  category: string;
  details: string;
  relatedEnquiryId?: string | null;
  relatedOrderId?: string | null;
};

export async function createTrustSafetyReport(input: CreateTrustSafetyReportInput) {
  const payload = {
    reporter_id: input.reporterId,
    subject_type: input.subjectType,
    subject_id: input.subjectId ?? null,
    category: input.category,
    details: input.details.trim(),
    related_enquiry_id: input.relatedEnquiryId ?? null,
    related_order_id: input.relatedOrderId ?? null,
  };

  const { data, error } = await supabase.from("trust_safety_reports").insert(payload).select("*").single();
  if (error) throw error;
  try {
    await createAdminNotification({
      title: "New trust report",
      message: `${input.category.replace(/_/g, " ")} report submitted for ${input.subjectType}.`,
      type: "trust_report_created",
      priority: "important",
      data: {
        category: input.category,
        subjectType: input.subjectType,
        subjectId: input.subjectId ?? null,
      },
    });
  } catch {
    // Report creation should not fail because admin notification delivery failed.
  }
  return data;
}

export async function listMyTrustSafetyReports(reporterId: string) {
  const { data, error } = await supabase
    .from("trust_safety_reports")
    .select("id, category, subject_type, subject_id, status, details, created_at, admin_notes")
    .eq("reporter_id", reporterId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listTrustSafetyReportsForAdmin() {
  const { data, error } = await supabase
    .from("trust_safety_reports")
    .select("id, reporter_id, category, subject_type, subject_id, status, details, created_at, admin_notes")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function updateTrustSafetyReportStatus(
  reportId: string,
  status: TrustSafetyReportStatus,
  adminNotes?: string | null,
) {
  const { data, error } = await supabase
    .from("trust_safety_reports")
    .update({
      status,
      admin_notes: adminNotes ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reportId);

  if (error) throw error;

  const { data: report } = await supabase.from("trust_safety_reports").select("reporter_id,subject_type").eq("id", reportId).maybeSingle();
  const reporterId = (report as { reporter_id?: string | null; subject_type?: string | null } | null)?.reporter_id;
  if (!reporterId) return;

  try {
    await createInAppNotification({
      userId: reporterId,
      title: "Trust report updated",
      message: `Your ${String((report as any)?.subject_type || "trust").replace(/_/g, " ")} report is now ${status.replace(/_/g, " ")}.`,
      type: "trust_report_updated",
      priority: "important",
      data: { reportId, status },
    });
  } catch {
    // Admin review should not fail because notification delivery failed.
  }
}
