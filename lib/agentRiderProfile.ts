import AsyncStorage from "@react-native-async-storage/async-storage";

const AGENT_PROFILE_KEY = "pamaketi_agent_profile_v1";

export type AgentRiderProfile = {
  userId: string;
  avatarUrl?: string | null;
  vehicleType?: string | null;
  isOnline?: boolean;
};

type AgentProfileMap = Record<string, AgentRiderProfile>;

async function readMap(): Promise<AgentProfileMap> {
  const raw = await AsyncStorage.getItem(AGENT_PROFILE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as AgentProfileMap;
  } catch {
    return {};
  }
}

export async function getAgentRiderProfile(userId: string) {
  const map = await readMap();
  return map[userId] ?? null;
}

export async function setAgentRiderProfile(input: AgentRiderProfile) {
  const map = await readMap();
  map[input.userId] = {
    userId: input.userId,
    avatarUrl: input.avatarUrl ?? null,
    vehicleType: input.vehicleType ?? null,
    isOnline: input.isOnline ?? false,
  };
  await AsyncStorage.setItem(AGENT_PROFILE_KEY, JSON.stringify(map));
  return map[input.userId];
}
