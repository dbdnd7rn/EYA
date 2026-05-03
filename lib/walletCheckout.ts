import { ENV } from "@/lib/env";

function getBackendBaseUrl() {
  if (!ENV.PAYCHANGU_BACKEND) {
    throw new Error("Backend URL is not configured. Set EXPO_PUBLIC_PAYCHANGU_BACKEND.");
  }
  return ENV.PAYCHANGU_BACKEND.replace(/\/+$/, "");
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

export async function checkoutWithWallet(
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
  const res = await fetch(`${getBackendBaseUrl()}/api/wallet/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Wallet checkout failed (${res.status}).`);
  }

  return data as {
    status: string;
    payment_status: "paid";
    method: "wallet";
    order_id: string;
    payment_id: string;
    wallet_balance_mwk: number;
    wallet_activity_id: string;
  };
}
