import { supabase } from "@/lib/supabase";

export type TicketTransferStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

export type TicketTransfer = {
  id: string;
  issued_ticket_id: string;
  event_id: string;
  sender_user_id: string;
  recipient_user_id: string;
  recipient_email: string;
  status: TicketTransferStatus;
  requested_at: string;
  responded_at: string | null;
  expires_at: string;
  event_title: string;
  event_starts_at: string | null;
  ticket_code: string;
  sender_name: string | null;
  recipient_name: string | null;
};

export type TicketTransferLists = {
  incoming: TicketTransfer[];
  outgoing: TicketTransfer[];
};

function asTransfer(value: any): TicketTransfer | null {
  if (!value || typeof value !== "object" || !value.id || !value.issued_ticket_id) return null;
  return {
    id: String(value.id),
    issued_ticket_id: String(value.issued_ticket_id),
    event_id: String(value.event_id || ""),
    sender_user_id: String(value.sender_user_id || ""),
    recipient_user_id: String(value.recipient_user_id || ""),
    recipient_email: String(value.recipient_email || ""),
    status: String(value.status || "pending") as TicketTransferStatus,
    requested_at: String(value.requested_at || ""),
    responded_at: typeof value.responded_at === "string" ? value.responded_at : null,
    expires_at: String(value.expires_at || ""),
    event_title: String(value.event_title || "Event ticket"),
    event_starts_at: typeof value.event_starts_at === "string" ? value.event_starts_at : null,
    ticket_code: String(value.ticket_code || ""),
    sender_name: typeof value.sender_name === "string" ? value.sender_name : null,
    recipient_name: typeof value.recipient_name === "string" ? value.recipient_name : null,
  };
}

function transferArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(asTransfer).filter((item): item is TicketTransfer => Boolean(item));
}

function messageFromResult(data: any, fallback: string) {
  if (data && typeof data === "object" && typeof data.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  return fallback;
}

export async function listMyTicketTransfers(): Promise<TicketTransferLists> {
  const { data, error } = await supabase.rpc("get_my_ticket_transfers");
  if (error) throw new Error(error.message || "Could not load ticket transfers.");
  return {
    incoming: transferArray(data?.incoming),
    outgoing: transferArray(data?.outgoing),
  };
}

export async function requestTicketTransfer(ticketId: string, recipientEmail: string) {
  const id = String(ticketId || "").trim();
  const email = String(recipientEmail || "").trim().toLowerCase();
  if (!id) throw new Error("Choose a ticket to transfer.");
  if (!email || !email.includes("@")) throw new Error("Enter the recipient's EYA account email.");

  const { data, error } = await supabase.rpc("request_ticket_transfer", {
    p_ticket_id: id,
    p_recipient_email: email,
  });
  if (error) throw new Error(error.message || "Could not send ticket transfer.");
  if (data?.ok !== true) throw new Error(messageFromResult(data, "Could not send ticket transfer."));
  return data;
}

export async function acceptTicketTransfer(transferId: string) {
  const { data, error } = await supabase.rpc("accept_ticket_transfer", { p_transfer_id: transferId });
  if (error) throw new Error(error.message || "Could not accept ticket transfer.");
  if (data?.ok !== true) throw new Error(messageFromResult(data, "This ticket transfer is no longer available."));
  return data;
}

export async function declineTicketTransfer(transferId: string) {
  const { data, error } = await supabase.rpc("decline_ticket_transfer", { p_transfer_id: transferId });
  if (error) throw new Error(error.message || "Could not decline ticket transfer.");
  if (data?.ok !== true) throw new Error(messageFromResult(data, "Could not decline ticket transfer."));
  return data;
}

export async function cancelTicketTransfer(transferId: string) {
  const { data, error } = await supabase.rpc("cancel_ticket_transfer", { p_transfer_id: transferId });
  if (error) throw new Error(error.message || "Could not cancel ticket transfer.");
  if (data?.ok !== true) throw new Error(messageFromResult(data, "Could not cancel ticket transfer."));
  return data;
}
