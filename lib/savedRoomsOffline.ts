import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { supabase } from "@/lib/supabase";

export type SavedListingSnapshot = {
  id: string;
  title: string;
  listing_type: "hostel" | "bedsitter";
  campus: string | null;
  area: string | null;
  city: string | null;
  price_from: number | null;
  room_types: string[] | null;
  image_urls: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string | null;
};

export type SavedRowCache = {
  id: string;
  listing_id: string;
  created_at: string | null;
  listings: SavedListingSnapshot | null;
};

type PendingSavedOp = {
  studentId: string;
  listingId: string;
  action: "save" | "unsave";
  queuedAt: number;
  snapshot?: SavedListingSnapshot | null;
};

const queueKey = "saved_rooms_queue";

function savedCacheKey(studentId: string) {
  return `saved_rooms:${studentId}`;
}

async function getQueue(): Promise<PendingSavedOp[]> {
  return (await getCachedJson<PendingSavedOp[]>(queueKey))?.data ?? [];
}

async function setQueue(ops: PendingSavedOp[]) {
  await setCachedJson(queueKey, ops);
}

export async function enqueueSavedRoomOp(op: PendingSavedOp) {
  const ops = await getQueue();
  const filtered = ops.filter((x) => !(x.studentId === op.studentId && x.listingId === op.listingId));
  filtered.push(op);
  await setQueue(filtered);
}

export async function getPendingSavedOps(studentId?: string | null) {
  if (!studentId) return [];
  const ops = await getQueue();
  return ops.filter((x) => x.studentId === studentId).sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function getSavedRoomsCache(studentId: string) {
  return await getCachedJson<SavedRowCache[]>(savedCacheKey(studentId));
}

export async function setSavedRoomsCache(studentId: string, rows: SavedRowCache[]) {
  await setCachedJson(savedCacheKey(studentId), rows);
}

export async function applyPendingSavedOpsToRows(studentId: string, rows: SavedRowCache[]) {
  const pending = await getPendingSavedOps(studentId);
  let next = [...rows];

  for (const op of pending) {
    if (op.action === "unsave") {
      next = next.filter((r) => r.listing_id !== op.listingId);
      continue;
    }

    const exists = next.some((r) => r.listing_id === op.listingId);
    if (exists) continue;
    next.unshift({
      id: `local:${op.listingId}`,
      listing_id: op.listingId,
      created_at: new Date(op.queuedAt).toISOString(),
      listings: op.snapshot ?? null,
    });
  }

  return next;
}

export async function syncSavedRoomsQueue(studentId: string) {
  const ops = await getQueue();
  const mine = ops.filter((x) => x.studentId === studentId).sort((a, b) => a.queuedAt - b.queuedAt);
  if (!mine.length) return { synced: 0 };

  let synced = 0;
  const remaining = [...ops];

  for (const op of mine) {
    if (op.action === "save") {
      const { error } = await supabase.from("saved_rooms").upsert(
        { student_id: studentId, listing_id: op.listingId },
        { onConflict: "student_id,listing_id" },
      );
      if (error) continue;
    } else {
      const { error } = await supabase.from("saved_rooms").delete().eq("student_id", studentId).eq("listing_id", op.listingId);
      if (error) continue;
    }

    const idx = remaining.findIndex(
      (x) => x.studentId === op.studentId && x.listingId === op.listingId && x.queuedAt === op.queuedAt,
    );
    if (idx >= 0) remaining.splice(idx, 1);
    synced += 1;
  }

  if (synced > 0) await setQueue(remaining);
  return { synced };
}

export async function queueOfflineSaveToggle(params: {
  studentId: string;
  listingId: string;
  nextSaved: boolean;
  snapshot?: SavedListingSnapshot | null;
}) {
  const { studentId, listingId, nextSaved, snapshot } = params;
  await enqueueSavedRoomOp({
    studentId,
    listingId,
    action: nextSaved ? "save" : "unsave",
    queuedAt: Date.now(),
    snapshot: snapshot ?? null,
  });

  const cached = await getSavedRoomsCache(studentId);
  const current = cached?.data ?? [];
  const projected = await applyPendingSavedOpsToRows(studentId, current);
  await setSavedRoomsCache(studentId, projected);
}

export async function getSavedStatusWithPending(studentId: string, listingId: string) {
  const pending = await getPendingSavedOps(studentId);
  const finalOp = [...pending].reverse().find((x) => x.listingId === listingId);
  if (finalOp) return finalOp.action === "save";

  const cached = await getSavedRoomsCache(studentId);
  return (cached?.data ?? []).some((r) => r.listing_id === listingId);
}

