import { supabaseNewApp } from "@/lib/supabaseNewApp";
import type { OrderRow } from "@/lib/newApp/types";

function throwIfError(error: { message?: string } | null) {
  if (error) throw new Error(error.message || "Food order security action failed.");
}

export function normalizeRoomNumber(value?: string | null) {
  return String(value ?? "")
    .replace(/^room\s*[:#-]?\s*/i, "")
    .trim()
    .slice(0, 40);
}

export function roomLabel(value?: string | null) {
  const room = normalizeRoomNumber(value);
  return room ? `Room ${room}` : "Campus residence";
}

export async function approveFoodOrderPayment(orderId: string, roomNumber?: string | null): Promise<OrderRow> {
  const { data, error } = await supabaseNewApp.rpc("approve_food_order_payment", {
    p_order_id: orderId,
    p_room_number: normalizeRoomNumber(roomNumber) || null,
  });
  throwIfError(error);
  if (!data) throw new Error("The restaurant approval was not saved.");
  return data as OrderRow;
}

export async function releaseFoodOrderToRiders(orderId: string): Promise<OrderRow> {
  const { data, error } = await supabaseNewApp.rpc("release_food_order_to_riders", {
    p_order_id: orderId,
  });
  throwIfError(error);
  if (!data) throw new Error("The rider release was not saved.");
  return data as OrderRow;
}
