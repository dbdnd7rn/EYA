import AsyncStorage from "@react-native-async-storage/async-storage";

type Envelope<T> = {
  v: number;
  ts: number;
  data: T;
};

const CACHE_VERSION = 1;
const PREFIX = "palevel:cache:";

function key(name: string) {
  return `${PREFIX}${name}`;
}

export async function setCachedJson<T>(name: string, data: T) {
  const payload: Envelope<T> = { v: CACHE_VERSION, ts: Date.now(), data };
  await AsyncStorage.setItem(key(name), JSON.stringify(payload));
}

export async function getCachedJson<T>(name: string): Promise<{ data: T; ts: number } | null> {
  const raw = await AsyncStorage.getItem(key(name));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed || parsed.v !== CACHE_VERSION) return null;
    return { data: parsed.data, ts: parsed.ts };
  } catch {
    return null;
  }
}

export function formatCacheTime(ts?: number | null) {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return null;
  }
}

