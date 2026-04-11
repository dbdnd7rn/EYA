import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/roleRouting";

const DEV_AUTH_KEY = "pamaketi_dev_auth_v1";

type DevAuthRecord = {
  id: string;
  email: string;
  role: Exclude<AppRole, null>;
};

type DevAccount = {
  email: string;
  password: string;
  role: Exclude<AppRole, null>;
};

const DEV_ACCOUNTS: DevAccount[] = [
  {
    email: "student@pamaketi.dev",
    password: "Student123",
    role: "student",
  },
  {
    email: "seller@pamaketi.dev",
    password: "Seller123",
    role: "vendor",
  },
  {
    email: "landlord@pamaketi.dev",
    password: "Landlord123",
    role: "landlord",
  },
  {
    email: "agent@pamaketi.dev",
    password: "Agent123",
    role: "agent",
  },
];

export function getDevAccount(role: Exclude<AppRole, null>) {
  return DEV_ACCOUNTS.find((account) => account.role === role) ?? null;
}

export function matchDevAccount(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return DEV_ACCOUNTS.find((account) => account.email === normalizedEmail && account.password === password) ?? null;
}

export async function getDevAuthRecord(): Promise<DevAuthRecord | null> {
  const raw = await AsyncStorage.getItem(DEV_AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DevAuthRecord;
  } catch {
    return null;
  }
}

export async function setDevAuthRecord(input: { email: string; role: Exclude<AppRole, null> }) {
  const record: DevAuthRecord = {
    id: `dev-${input.role}-${input.email.trim().toLowerCase() || "user"}`,
    email: input.email.trim().toLowerCase() || `${input.role}@local.dev`,
    role: input.role,
  };
  await AsyncStorage.setItem(DEV_AUTH_KEY, JSON.stringify(record));
  return record;
}

export async function clearDevAuthRecord() {
  await AsyncStorage.removeItem(DEV_AUTH_KEY);
}

export function recordToUser(record: DevAuthRecord): User {
  return {
    id: record.id,
    app_metadata: {},
    user_metadata: { role: record.role },
    aud: "authenticated",
    created_at: new Date().toISOString(),
    email: record.email,
  } as User;
}
