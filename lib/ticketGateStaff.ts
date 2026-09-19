import { supabase } from "@/lib/supabase";

export type GateStaffEffectiveStatus =
  | "invited"
  | "scheduled"
  | "active"
  | "expired"
  | "declined"
  | "revoked"
  | "cancelled";

export type GateStaffAssignment = {
  id: string;
  event_id: string;
  organization_id: string;
  assignment_status: string;
  effective_status: GateStaffEffectiveStatus;
  gate_label?: string | null;
  invited_email: string;
  invited_at: string;
  accepted_at?: string | null;
  event_title: string;
  venue?: string | null;
  city?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  event_status: string;
  scanner_opens_at?: string | null;
  scanner_expires_at?: string | null;
  scan_enabled: boolean;
};

export type OrganizerGateStaffMember = {
  id: string;
  user_id?: string | null;
  invited_email: string;
  staff_name?: string | null;
  assignment_status: string;
  effective_status: GateStaffEffectiveStatus;
  gate_label?: string | null;
  invited_at: string;
  accepted_at?: string | null;
  scanner_opens_at?: string | null;
  scanner_expires_at?: string | null;
  scan_count: number;
  last_scan_at?: string | null;
};

export type OrganizerGateStaffResponse = {
  event_id: string;
  event_title: string;
  scanner_opens_at?: string | null;
  scanner_expires_at?: string | null;
  staff: OrganizerGateStaffMember[];
};

export type GateCheckInActivityRow = {
  checkin_id: string;
  checked_in_at: string;
  ticket_id: string;
  ticket_reference: string;
  ticket_type?: string | null;
  scanner_user_id?: string | null;
  scanner_name: string;
  scanner_assignment_id?: string | null;
  gate_label?: string | null;
  method: string;
  credential_kind?: string | null;
  scanner_access_kind?: "admin" | "gate_staff" | string;
};

export type GateCheckInActivity = {
  event: {
    id: string;
    title: string;
    starts_at?: string | null;
    ends_at?: string | null;
    venue?: string | null;
    city?: string | null;
  };
  summary: {
    tickets_issued: number;
    checked_in: number;
    remaining_to_check_in: number;
    checkins_last_15_minutes: number;
    active_gate_staff: number;
  };
  activity: GateCheckInActivityRow[];
};

function asObject<T>(data: unknown, fallbackMessage: string): T {
  if (!data || typeof data !== "object") throw new Error(fallbackMessage);
  return data as T;
}

export async function getMyGateStaffAssignments(): Promise<GateStaffAssignment[]> {
  const { data, error } = await supabase.rpc("get_my_gate_staff_assignments");
  if (error) throw new Error(error.message || "Could not load Gate Staff assignments.");
  return Array.isArray(data) ? (data as GateStaffAssignment[]) : [];
}

export async function acceptGateStaffInvite(assignmentId: string) {
  const { data, error } = await supabase.rpc("accept_ticket_gate_staff_invite", {
    p_assignment_id: assignmentId,
  });
  if (error) throw new Error(error.message || "Could not accept Gate Staff invitation.");
  return asObject<{ ok: boolean; assignment_id: string; status: string }>(data, "Gate Staff invitation returned no result.");
}

export async function declineGateStaffInvite(assignmentId: string) {
  const { data, error } = await supabase.rpc("decline_ticket_gate_staff_invite", {
    p_assignment_id: assignmentId,
  });
  if (error) throw new Error(error.message || "Could not decline Gate Staff invitation.");
  return asObject<{ ok: boolean; assignment_id: string; status: string }>(data, "Gate Staff invitation returned no result.");
}

export async function inviteGateStaff(input: { eventId: string; email: string; gateLabel?: string | null }) {
  const { data, error } = await supabase.rpc("invite_ticket_gate_staff", {
    p_event_id: input.eventId,
    p_email: input.email,
    p_gate_label: input.gateLabel || null,
  });
  if (error) throw new Error(error.message || "Could not invite Gate Staff.");
  return asObject<{
    ok: boolean;
    assignment_id: string;
    status: string;
    event_id: string;
    invited_email: string;
    gate_label?: string | null;
    scanner_opens_at?: string | null;
    scanner_expires_at?: string | null;
  }>(data, "Gate Staff invitation returned no result.");
}

export async function revokeGateStaffAssignment(assignmentId: string, note?: string | null) {
  const { data, error } = await supabase.rpc("revoke_ticket_gate_staff_assignment", {
    p_assignment_id: assignmentId,
    p_note: note || null,
  });
  if (error) throw new Error(error.message || "Could not revoke Gate Staff access.");
  return asObject<{ ok: boolean; assignment_id: string; status: string }>(data, "Gate Staff revoke returned no result.");
}

export async function getOrganizerGateStaff(eventId: string): Promise<OrganizerGateStaffResponse> {
  const { data, error } = await supabase.rpc("get_my_ticket_event_gate_staff", {
    p_event_id: eventId,
  });
  if (error) throw new Error(error.message || "Could not load event Gate Staff.");
  return asObject<OrganizerGateStaffResponse>(data, "Event Gate Staff returned no result.");
}

export async function getOrganizerGateCheckInActivity(eventId: string, limit = 200): Promise<GateCheckInActivity> {
  const { data, error } = await supabase.rpc("get_my_ticket_event_checkin_activity", {
    p_event_id: eventId,
    p_limit: limit,
  });
  if (error) throw new Error(error.message || "Could not load check-in activity.");
  return asObject<GateCheckInActivity>(data, "Check-in activity returned no result.");
}
