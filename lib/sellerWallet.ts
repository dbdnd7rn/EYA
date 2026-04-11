import AsyncStorage from "@react-native-async-storage/async-storage";

const SELLER_WALLET_KEY = "pamaketi_seller_wallet_v1";

export type SellerWithdrawalRow = {
  id: string;
  vendorId: string;
  amountMwk: number;
  destination: string;
  note: string | null;
  createdAt: string;
  status: "processing" | "paid";
};

type SellerWalletStore = {
  withdrawals: SellerWithdrawalRow[];
};

const EMPTY_STORE: SellerWalletStore = {
  withdrawals: [],
};

async function readStore(): Promise<SellerWalletStore> {
  const raw = await AsyncStorage.getItem(SELLER_WALLET_KEY);
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as Partial<SellerWalletStore>;
    return {
      withdrawals: parsed.withdrawals ?? [],
    };
  } catch {
    return EMPTY_STORE;
  }
}

async function writeStore(store: SellerWalletStore) {
  await AsyncStorage.setItem(SELLER_WALLET_KEY, JSON.stringify(store));
}

export async function listSellerWithdrawals(vendorId: string) {
  const store = await readStore();
  return store.withdrawals
    .filter((row) => row.vendorId === vendorId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function createSellerWithdrawal(input: {
  vendorId: string;
  amountMwk: number;
  destination: string;
  note?: string | null;
}) {
  const store = await readStore();
  const created: SellerWithdrawalRow = {
    id: `seller-withdrawal-${Date.now()}`,
    vendorId: input.vendorId,
    amountMwk: input.amountMwk,
    destination: input.destination.trim(),
    note: input.note?.trim() || null,
    createdAt: new Date().toISOString(),
    status: "processing",
  };
  await writeStore({
    withdrawals: [created, ...store.withdrawals],
  });
  return created;
}
