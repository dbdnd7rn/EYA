import { ENV } from "@/lib/env";

type WalletApiResponse<T> = T & { status: string; message?: string };

function getBackendBaseUrl() {
  if (!ENV.PAYCHANGU_BACKEND) {
    throw new Error("Backend URL is not configured. Set EXPO_PUBLIC_PAYCHANGU_BACKEND.");
  }
  return ENV.PAYCHANGU_BACKEND.replace(/\/+$/, "");
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

async function request<T>(pathname: string, init: RequestInit & { accessToken: string }): Promise<WalletApiResponse<T>> {
  const res = await fetch(`${getBackendBaseUrl()}${pathname}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${init.accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  const data = await parseJson(res);
  if (!res.ok) {
    const message = data?.message || data?.error || `Request failed (${res.status}).`;
    throw new Error(message);
  }

  return data as WalletApiResponse<T>;
}

export async function fetchWalletSummary(accessToken: string) {
  return request<{
    account: { user_id: string; balance_mwk: number; points: number };
    activities: {
      id: string;
      label: string;
      amount_mwk: number;
      type: "topup" | "payment" | "reward";
      meta?: Record<string, unknown>;
      created_at: string;
    }[];
  }>("/api/wallet/me", { method: "GET", accessToken });
}

export async function withdrawWallet(accessToken: string, input: { amountMwk: number; destination: string }) {
  return request<{
    account: { user_id: string; balance_mwk: number; points: number };
    activity: { id: string; label: string; amount_mwk: number; created_at: string };
  }>("/api/wallet/withdraw", {
    method: "POST",
    accessToken,
    body: JSON.stringify({
      amount_mwk: input.amountMwk,
      destination: input.destination,
    }),
  });
}

export async function sendWalletMoney(
  accessToken: string,
  input: { amountMwk: number; recipientName: string; recipientPhone: string },
) {
  return request<{
    account: { user_id: string; balance_mwk: number; points: number };
    activity: { id: string; label: string; amount_mwk: number; created_at: string };
    recipient: { id: string; name: string; phone: string };
  }>("/api/wallet/send", {
    method: "POST",
    accessToken,
    body: JSON.stringify({
      amount_mwk: input.amountMwk,
      recipient_name: input.recipientName,
      recipient_phone: input.recipientPhone,
    }),
  });
}

export async function requestWalletMoney(
  accessToken: string,
  input: { amountMwk: number; recipientName: string; recipientPhone: string },
) {
  return request<{
    request: { amount_mwk: number; recipient_name: string; recipient_phone: string };
  }>("/api/wallet/request", {
    method: "POST",
    accessToken,
    body: JSON.stringify({
      amount_mwk: input.amountMwk,
      recipient_name: input.recipientName,
      recipient_phone: input.recipientPhone,
    }),
  });
}
