import AsyncStorage from "@react-native-async-storage/async-storage";

const AGENT_DISMISSALS_KEY = "eya_agent_request_dismissals_v1";

type DismissalMap = Record<string, Record<string, string>>;

async function readMap(): Promise<DismissalMap> {
  const raw = await AsyncStorage.getItem(AGENT_DISMISSALS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as DismissalMap;
  } catch {
    return {};
  }
}

async function writeMap(map: DismissalMap) {
  await AsyncStorage.setItem(AGENT_DISMISSALS_KEY, JSON.stringify(map));
}

export async function getDismissedAgentRequests(userId: string) {
  const map = await readMap();
  return map[userId] ?? {};
}

export async function dismissAgentRequest(userId: string, orderId: string, updatedAt: string) {
  const map = await readMap();
  map[userId] = {
    ...(map[userId] ?? {}),
    [orderId]: updatedAt,
  };
  await writeMap(map);
}

export async function clearDismissedAgentRequest(userId: string, orderId: string) {
  const map = await readMap();
  if (!map[userId]?.[orderId]) return;
  delete map[userId][orderId];
  await writeMap(map);
}
