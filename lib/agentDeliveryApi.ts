import { ENV } from "@/lib/env";
import type { DeliveryStatus } from "@/lib/newApp/types";

export type AgentOpenDeliveryRequest = {
  id: string;
  order_id: string;
  driver_id: string | null;
  status: DeliveryStatus;
  eta_minutes: number | null;
  created_at: string;
  updated_at: string;
  title: string;
  item_summary: string;
  vendor: {
    id: string;
    name: string;
    campus: string | null;
    area: string | null;
  } | null;
  order: {
    id: string;
    channel: "market" | "food";
    status: string;
    delivery_mode: "pickup" | "doorstep";
    dropoff_notes: string | null;
    delivery_fee_mwk: number;
    total_mwk: number;
    created_at: string;
    updated_at: string;
  } | null;
};

type DeliveryActionResponse = {
  status: string;
  delivery: {
    id: string;
    order_id: string;
    driver_id: string | null;
    status: DeliveryStatus;
    eta_minutes?: number | null;
    delivered_at?: string | null;
    updated_at?: string;
    created_at?: string;
  };
  actor_id?: string;
};

function backendUrl(path: string) {
  if (!ENV.PAYCHANGU_BACKEND) {
    throw new Error("PayChangu backend URL is not configured.");
  }
  return `${ENV.PAYCHANGU_BACKEND.replace(/\/+$/, "")}${path}`;
}

function agentHeaders(input: { accessToken?: string | null; userId?: string | null; json?: boolean }) {
  return {
    ...(input.json ? { "Content-Type": "application/json" } : {}),
    ...(input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : {}),
    ...(input.userId ? { "x-user-id": input.userId } : {}),
  };
}

async function parseJson<T>(res: Response) {
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message || `Request failed (${res.status}).`);
  }
  return data;
}

export async function listOpenDeliveryRequests(input: { userId: string; accessToken?: string | null }) {
  const res = await fetch(backendUrl("/api/deliveries/unassigned"), {
    method: "GET",
    headers: agentHeaders({ accessToken: input.accessToken, userId: input.userId }),
  });
  const data = await parseJson<{ status: string; deliveries: AgentOpenDeliveryRequest[] }>(res);
  return data.deliveries ?? [];
}

export async function assignDeliveryToSelf(input: { orderId: string; userId: string; accessToken?: string | null }) {
  const res = await fetch(backendUrl(`/api/deliveries/${encodeURIComponent(input.orderId)}/assign`), {
    method: "POST",
    headers: agentHeaders({ accessToken: input.accessToken, userId: input.userId, json: true }),
    body: JSON.stringify({ driver_id: input.userId }),
  });
  return parseJson<DeliveryActionResponse>(res);
}

export async function unassignDeliveryFromSelf(input: { orderId: string; userId: string; accessToken?: string | null }) {
  const res = await fetch(backendUrl(`/api/deliveries/${encodeURIComponent(input.orderId)}/unassign`), {
    method: "POST",
    headers: agentHeaders({ accessToken: input.accessToken, userId: input.userId, json: true }),
    body: JSON.stringify({}),
  });
  return parseJson<DeliveryActionResponse>(res);
}

export async function updateDeliveryStatusForAgent(input: {
  orderId: string;
  status: DeliveryStatus;
  userId: string;
  accessToken?: string | null;
}) {
  const res = await fetch(backendUrl(`/api/deliveries/${encodeURIComponent(input.orderId)}/status`), {
    method: "POST",
    headers: agentHeaders({ accessToken: input.accessToken, userId: input.userId, json: true }),
    body: JSON.stringify({ status: input.status }),
  });
  return parseJson<DeliveryActionResponse>(res);
}
