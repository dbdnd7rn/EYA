import { ENV } from "@/lib/env";

export type OrderHandoffDetails = {
  status: string;
  order_id: string;
  invoice: {
    order_reference: string | null;
    title: string | null;
    description: string | null;
    amount_mwk: number;
    currency: string;
    customer_email: string | null;
    customer_phone: string | null;
    delivery_address: string | null;
    delivery_mode: string | null;
    created_at: string | null;
    payment_reference: string;
    line_items: {
      item_name_snapshot: string;
      quantity: number;
      line_total_mwk: number;
    }[];
  };
  handoff: {
    delivery_pin: string | null;
    qr_token: string | null;
    qr_data_url: string | null;
    verified_at: string | null;
  };
  order: {
    id: string;
    status: string;
    channel: string;
    delivery_mode: string;
    total_mwk: number;
    subtotal_mwk: number;
    delivery_fee_mwk: number;
    service_fee_mwk: number;
  };
};

function authHeaders(accessToken?: string | null): Record<string, string> {
  if (!accessToken) return {};
  return { Authorization: `Bearer ${accessToken}` };
}

export async function getOrderHandoffDetails(orderId: string, accessToken?: string | null): Promise<OrderHandoffDetails> {
  if (!ENV.PAYCHANGU_BACKEND) {
    throw new Error("PayChangu backend URL is not configured.");
  }

  const url = `${ENV.PAYCHANGU_BACKEND.replace(/\/+$/, "")}/api/orders/${encodeURIComponent(orderId)}/handoff`;
  const res = await fetch(url, { method: "GET", headers: authHeaders(accessToken) });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.message || `Could not load handoff details (${res.status}).`);
  }

  return data as OrderHandoffDetails;
}

export async function verifyOrderHandoff(input: {
  orderId: string;
  accessToken?: string | null;
  pin?: string;
  qrToken?: string;
}): Promise<{ status: string; message: string; order_id: string; payment_id: string; verified_at: string | null }> {
  if (!ENV.PAYCHANGU_BACKEND) {
    throw new Error("PayChangu backend URL is not configured.");
  }

  const url = `${ENV.PAYCHANGU_BACKEND.replace(/\/+$/, "")}/api/orders/${encodeURIComponent(input.orderId)}/handoff/verify`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(input.accessToken) },
    body: JSON.stringify({
      pin: input.pin ?? undefined,
      qr_token: input.qrToken ?? undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.message || `Could not verify handoff (${res.status}).`);
  }

  return data as { status: string; message: string; order_id: string; payment_id: string; verified_at: string | null };
}
