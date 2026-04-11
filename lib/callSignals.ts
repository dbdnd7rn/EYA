export type CallSignalKind = "invite" | "accept" | "decline";

const PREFIX = "__CALL__:";

export function encodeCallSignal(kind: CallSignalKind, callId: string) {
  return `${PREFIX}${kind}:${callId}`;
}

export function parseCallSignal(content?: string | null): { kind: CallSignalKind; callId: string } | null {
  if (!content || !content.startsWith(PREFIX)) return null;
  const rest = content.slice(PREFIX.length);
  const idx = rest.indexOf(":");
  if (idx <= 0) return null;
  const kind = rest.slice(0, idx) as CallSignalKind;
  const callId = rest.slice(idx + 1);
  if (!callId) return null;
  if (kind !== "invite" && kind !== "accept" && kind !== "decline") return null;
  return { kind, callId };
}

export function newCallId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

