import { LogBox } from "react-native";

declare global {
  // eslint-disable-next-line no-var
  var __EYA_FETCH_GUARD_INSTALLED__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __EYA_FETCH_GUARD_VERSION__: number | undefined;
  // eslint-disable-next-line no-var
  var __EYA_CONSOLE_GUARD_INSTALLED__: boolean | undefined;
}

const FETCH_GUARD_VERSION = 3;
const NETWORK_FAILURE_TEXT = [
  "network request failed",
  "network unavailable",
  "failed to fetch",
];

function isNetworkRequestFailure(error: unknown) {
  if (!(error instanceof TypeError)) return false;
  const message = String(error.message ?? "").toLowerCase();
  return NETWORK_FAILURE_TEXT.some((text) => message.includes(text));
}

async function isLegacySyntheticNetworkResponse(response: Response) {
  if (response.status !== 503) return false;

  try {
    const text = await response.clone().text();
    return text.includes("network_unavailable") || text.includes("/auth/v1/token");
  } catch {
    return false;
  }
}

export function installRuntimeDiagnostics() {
  LogBox.ignoreLogs([
    "SafeAreaView has been deprecated",
    "Network request failed",
    "Network unavailable",
  ]);

  if (!globalThis.__EYA_CONSOLE_GUARD_INSTALLED__) {
    const originalConsoleError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const isGenericNetworkError = args.some((arg) => {
        const text = String(arg instanceof TypeError ? arg.message : arg ?? "").toLowerCase();
        return NETWORK_FAILURE_TEXT.some((message) => text.includes(message));
      });

      if (isGenericNetworkError) return;
      originalConsoleError(...args);
    };
    globalThis.__EYA_CONSOLE_GUARD_INSTALLED__ = true;
  }

  if (globalThis.__EYA_FETCH_GUARD_VERSION__ === FETCH_GUARD_VERSION || typeof globalThis.fetch !== "function") return;

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const response = await originalFetch(input, init);
      if (await isLegacySyntheticNetworkResponse(response)) {
        throw new TypeError("Network unavailable. Check your internet connection and try again.");
      }
      return response;
    } catch (error) {
      if (isNetworkRequestFailure(error)) {
        throw new TypeError("Network unavailable. Check your internet connection and try again.");
      }

      throw error;
    }
  };

  globalThis.__EYA_FETCH_GUARD_INSTALLED__ = true;
  globalThis.__EYA_FETCH_GUARD_VERSION__ = FETCH_GUARD_VERSION;
}
