import { supabase } from "@/lib/supabase";

export type TicketEventPayoutRequestType = "early_payout" | "final_settlement";
export type TicketEventPayoutStatus = "pending" | "approved" | "declined" | "cancelled" | "paid";

export type TicketEventPayoutRequest = {
  id: string;
  request_type: TicketEventPayoutRequestType;
  requested_amount_mwk: number;
  approved_amount_mwk: number | null;
  status: TicketEventPayoutStatus;
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  paid_at: string | null;
  payout_method: "airtel_money" | "mpamba" | "bank" | null;
  payout_reference: string | null;
};

export type TicketEventFinance = {
  event_id: string;
  event_title: string;
  event_status: string;
  starts_at: string | null;
  ends_at: string | null;
  event_finished: boolean;
  payouts_configured: boolean;
  finance_status: "unconfigured" | "open" | "frozen" | "settled";
  gross_ticket_sales_mwk: number;
  active_paid_ticket_sales_mwk: number;
  refunded_ticket_sales_mwk: number;
  service_fees_paid_mwk: number;
  platform_fee_mwk: number;
  protected_refund_reserve_mwk: number;
  other_hold_mwk: number;
  net_event_funds_before_payout_mwk: number;
  paid_out_mwk: number;
  approved_unpaid_mwk: number;
  organizer_advance_liability_mwk: number;
  available_for_payout_mwk: number;
  final_settlement_ready: boolean;
  requests: TicketEventPayoutRequest[];
};

export type AdminTicketEventPayoutRequest = {
  id: string;
  event_id: string;
  event_title: string;
  organizer_id: string;
  organizer_name: string | null;
  organizer_email: string | null;
  request_type: TicketEventPayoutRequestType;
  requested_amount_mwk: number;
  approved_amount_mwk: number | null;
  status: "pending" | "approved";
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  paid_at: string | null;
  payout_method: "airtel_money" | "mpamba" | "bank" | null;
  payout_reference: string | null;
  finance: Omit<TicketEventFinance, "requests">;
};

export type AdminTicketEventFinanceEvent = {
  event_id: string;
  event_title: string;
  event_status: string;
  starts_at: string | null;
  ends_at: string | null;
  organizer_id: string;
  organizer_name: string | null;
  organizer_email: string | null;
  finance: Omit<TicketEventFinance, "requests">;
};

function message(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeFinance(data: any): TicketEventFinance {
  const requests = Array.isArray(data?.requests) ? data.requests : [];
  return {
    ...data,
    event_id: String(data?.event_id || ""),
    event_title: String(data?.event_title || "Event"),
    event_finished: Boolean(data?.event_finished),
    payouts_configured: Boolean(data?.payouts_configured),
    final_settlement_ready: Boolean(data?.final_settlement_ready),
    gross_ticket_sales_mwk: num(data?.gross_ticket_sales_mwk),
    active_paid_ticket_sales_mwk: num(data?.active_paid_ticket_sales_mwk),
    refunded_ticket_sales_mwk: num(data?.refunded_ticket_sales_mwk),
    service_fees_paid_mwk: num(data?.service_fees_paid_mwk),
    platform_fee_mwk: num(data?.platform_fee_mwk),
    protected_refund_reserve_mwk: num(data?.protected_refund_reserve_mwk),
    other_hold_mwk: num(data?.other_hold_mwk),
    net_event_funds_before_payout_mwk: num(data?.net_event_funds_before_payout_mwk),
    paid_out_mwk: num(data?.paid_out_mwk),
    approved_unpaid_mwk: num(data?.approved_unpaid_mwk),
    organizer_advance_liability_mwk: num(data?.organizer_advance_liability_mwk),
    available_for_payout_mwk: num(data?.available_for_payout_mwk),
    requests: requests.map((row: any) => ({
      ...row,
      id: String(row.id),
      requested_amount_mwk: num(row.requested_amount_mwk),
      approved_amount_mwk: row.approved_amount_mwk == null ? null : num(row.approved_amount_mwk),
    })),
  } as TicketEventFinance;
}

export async function getMyTicketEventFinance(eventId: string): Promise<TicketEventFinance> {
  const { data, error } = await supabase.rpc("get_my_ticket_event_finance", { p_event_id: eventId });
  if (error) throw new Error(message(error, "Could not load event finance."));
  return normalizeFinance(data);
}

export async function requestMyTicketEventPayout(input: {
  eventId: string;
  requestType: TicketEventPayoutRequestType;
  amountMwk?: number | null;
}) {
  const { data, error } = await supabase.rpc("request_my_ticket_event_payout", {
    p_event_id: input.eventId,
    p_request_type: input.requestType,
    p_requested_amount_mwk: input.requestType === "final_settlement" ? null : input.amountMwk ?? null,
  });
  if (error) throw new Error(message(error, "Could not submit payout request."));
  return data as { ok: true; request_id: string; request_type: TicketEventPayoutRequestType; requested_amount_mwk: number; status: "pending" };
}

export async function cancelMyTicketEventPayoutRequest(requestId: string) {
  const { data, error } = await supabase.rpc("cancel_my_ticket_event_payout_request", { p_request_id: requestId });
  if (error) throw new Error(message(error, "Could not cancel payout request."));
  return data as { ok: true; request_id: string; status: "cancelled" };
}

export async function listAdminTicketEventPayoutRequests(): Promise<AdminTicketEventPayoutRequest[]> {
  const { data, error } = await supabase.rpc("admin_list_ticket_event_payout_requests");
  if (error) throw new Error(message(error, "Could not load payout requests."));
  if (!Array.isArray(data)) return [];
  return data.map((row: any) => ({
    ...row,
    id: String(row.id),
    event_id: String(row.event_id),
    organizer_id: String(row.organizer_id),
    requested_amount_mwk: num(row.requested_amount_mwk),
    approved_amount_mwk: row.approved_amount_mwk == null ? null : num(row.approved_amount_mwk),
    finance: normalizeFinance({ ...(row.finance ?? {}), requests: [] }),
  })) as AdminTicketEventPayoutRequest[];
}

export async function listAdminTicketEventFinanceEvents(): Promise<AdminTicketEventFinanceEvent[]> {
  const { data, error } = await supabase.rpc("admin_list_ticket_event_finance_events");
  if (error) throw new Error(message(error, "Could not load organizer event finance."));
  if (!Array.isArray(data)) return [];
  return data.map((row: any) => ({
    ...row,
    event_id: String(row.event_id),
    organizer_id: String(row.organizer_id),
    finance: normalizeFinance({ ...(row.finance ?? {}), requests: [] }),
  })) as AdminTicketEventFinanceEvent[];
}

export async function adminSetTicketEventFinanceControls(input: {
  eventId: string;
  reserveRequiredMwk: number;
  platformFeeMwk: number;
  otherHoldMwk?: number;
  status?: "open" | "frozen" | "settled";
  note?: string | null;
}) {
  const { data, error } = await supabase.rpc("admin_set_ticket_event_finance_controls", {
    p_event_id: input.eventId,
    p_reserve_required_mwk: input.reserveRequiredMwk,
    p_platform_fee_mwk: input.platformFeeMwk,
    p_other_hold_mwk: input.otherHoldMwk ?? 0,
    p_status: input.status ?? "open",
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(message(error, "Could not update event finance controls."));
  return normalizeFinance({ ...(data ?? {}), requests: [] });
}

export async function adminReviewTicketEventPayoutRequest(input: {
  requestId: string;
  action: "approve" | "decline";
  approvedAmountMwk?: number | null;
  note?: string | null;
}) {
  const { data, error } = await supabase.rpc("admin_review_ticket_event_payout_request", {
    p_request_id: input.requestId,
    p_action: input.action,
    p_approved_amount_mwk: input.action === "approve" ? input.approvedAmountMwk ?? null : null,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(message(error, "Could not review payout request."));
  return data as { ok: true; request_id: string; status: "approved" | "declined"; approved_amount_mwk?: number };
}

export async function adminRecordTicketEventPayoutPaid(input: {
  requestId: string;
  payoutMethod: "airtel_money" | "mpamba" | "bank";
  payoutReference: string;
}) {
  const { data, error } = await supabase.rpc("admin_record_ticket_event_payout_paid", {
    p_request_id: input.requestId,
    p_payout_method: input.payoutMethod,
    p_payout_reference: input.payoutReference.trim(),
  });
  if (error) throw new Error(message(error, "Could not record payout as paid."));
  return data as { ok: true; request_id: string; status: "paid" };
}
