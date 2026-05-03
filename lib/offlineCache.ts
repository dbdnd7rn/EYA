import AsyncStorage from "@react-native-async-storage/async-storage";

type Envelope<T> = {
  v: number;
  ts: number;
  data: T;
};

const CACHE_VERSION = 1;
const PREFIX = "eya:cache:";

function key(name: string) {
  return `${PREFIX}${name}`;
}

export async function setCachedJson<T>(name: string, data: T) {
  const payload: Envelope<T> = { v: CACHE_VERSION, ts: Date.now(), data };
  try {
    await AsyncStorage.setItem(key(name), JSON.stringify(payload));
  } catch {
    // Cache writes should never break app flows.
  }
}

export async function getCachedJson<T>(name: string): Promise<{ data: T; ts: number } | null> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(key(name));
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed || parsed.v !== CACHE_VERSION) return null;
    return { data: parsed.data, ts: parsed.ts };
  } catch {
    return null;
  }
}

export async function removeCachedJson(name: string) {
  try {
    await AsyncStorage.removeItem(key(name));
  } catch {
    // Ignore cache cleanup failures.
  }
}

export function isCacheStale(ts: number | null | undefined, maxAgeMs: number) {
  if (!ts || !Number.isFinite(ts)) return true;
  return Date.now() - ts > maxAgeMs;
}

export function formatCacheTime(ts?: number | null) {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return null;
  }
}

