import { ENV } from "@/lib/env";

function getBackendBaseUrl() {
  if (!ENV.EYA_API_URL) {
    throw new Error("EYA API URL is not configured. Set EXPO_PUBLIC_EYA_API_URL.");
  }
  return ENV.EYA_API_URL.replace(/\/+$/, "");
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

export async function checkoutWithCash(
  accessToken: string,
  input: {
    title: string;
    description: string;
    purpose: "campus_market_order";
    order: {
      vendor_id: string;
      channel: "market" | "food";
      delivery_mode: "pickup" | "doorstep";
      delivery_fee_mwk?: number;
      service_fee_mwk?: number;
      lines: {
        item_id: string;
        quantity: number;
        food_customization?: {
          selection_map?: Record<string, string[]>;
          summary?: string;
        };
      }[];
    };
  },
) {
  const res = await fetch(`${getBackendBaseUrl()}/api/checkout/cash`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Cash checkout failed (${res.status}).`);
  }

  return data as {
    status: string;
    payment_status: "pending";
    method: "cash";
    order_id: string;
    payment_id: string;
    reference: string;
  };
}
