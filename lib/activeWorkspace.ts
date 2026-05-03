import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeAppRole, type AppRole } from "@/lib/roleRouting";

const ACTIVE_WORKSPACE_KEY_PREFIX = "eya.active_workspace.v1";

function workspaceKey(userId: string) {
  return `${ACTIVE_WORKSPACE_KEY_PREFIX}:${userId}`;
}

export async function readStoredActiveWorkspace(userId?: string | null): Promise<AppRole> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(workspaceKey(userId));
    return normalizeAppRole(raw);
  } catch {
    return null;
  }
}

export async function storeActiveWorkspace(userId: string, role: Exclude<AppRole, null>) {
  try {
    await AsyncStorage.setItem(workspaceKey(userId), role);
  } catch {
    // Workspace storage is a convenience cache; routing should still work without it.
  }
}

export async function clearStoredActiveWorkspace(userId?: string | null) {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(workspaceKey(userId));
  } catch {
    // Ignore cache cleanup failures.
  }
}
