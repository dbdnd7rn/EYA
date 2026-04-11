import { getCachedJson, removeCachedJson, setCachedJson } from "@/lib/offlineCache";

export type CheckoutDraft = {
  scope: string;
  payMethod: "airtel_money" | "mpamba" | "bank_transfer" | "wallet" | "cash";
  mobileNumber: string;
  couponCode: string;
  quantity?: number;
  savedAt: number;
};

export type WalletSnapshot = {
  balance: number;
  points: number;
  activity: Array<{
    id: string;
    label: string;
    mode: string | null;
    time: string;
    amount: number;
    type: "topup" | "payment" | "reward";
  }>;
};

function checkoutDraftKey(userId: string | null | undefined) {
  return `checkout_draft:${userId || "guest"}`;
}

function walletSnapshotKey(userId: string | null | undefined) {
  return `wallet_snapshot:${userId || "guest"}`;
}

export async function saveCheckoutDraft(userId: string | null | undefined, draft: CheckoutDraft) {
  await setCachedJson(checkoutDraftKey(userId), draft);
}

export async function getCheckoutDraft(userId: string | null | undefined) {
  return getCachedJson<CheckoutDraft>(checkoutDraftKey(userId));
}

export async function clearCheckoutDraft(userId: string | null | undefined) {
  await removeCachedJson(checkoutDraftKey(userId));
}

export async function saveWalletSnapshot(userId: string | null | undefined, snapshot: WalletSnapshot) {
  await setCachedJson(walletSnapshotKey(userId), snapshot);
}

export async function getWalletSnapshot(userId: string | null | undefined) {
  return getCachedJson<WalletSnapshot>(walletSnapshotKey(userId));
}
