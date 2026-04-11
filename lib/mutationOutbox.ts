import type { CatalogItemRow, OrderStatus, SalesChannel, VendorMessageRow } from "@/lib/newApp/types";
import { createCatalogItem, deleteCatalogItem, updateCatalogItem } from "@/lib/newApp/catalog";
import { updateOrderStatus } from "@/lib/newApp/orders";
import { sendVendorMessage } from "@/lib/newApp/vendorMessages";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import type { SellerWorkspace } from "@/components/seller/useSellerWorkspace";

type BaseOutboxEntry = {
  id: string;
  ownerUserId: string;
  queuedAt: number;
};

export type QueuedProductSave = BaseOutboxEntry & {
  kind: "seller_product_save";
  payload: {
    vendorId: string;
    itemId?: string | null;
    localItemId?: string | null;
    name: string;
    price_mwk: number;
    description?: string | null;
    stock_qty?: number | null;
    channel: SalesChannel;
    image_url?: string | null;
  };
};

export type QueuedProductArchive = BaseOutboxEntry & {
  kind: "seller_product_archive";
  payload: {
    itemId: string;
  };
};

export type QueuedProductActive = BaseOutboxEntry & {
  kind: "seller_product_active";
  payload: {
    itemId: string;
    isActive: boolean;
  };
};

export type QueuedOrderStatus = BaseOutboxEntry & {
  kind: "seller_order_status";
  payload: {
    orderId: string;
    status: OrderStatus;
  };
};

export type QueuedVendorMessage = BaseOutboxEntry & {
  kind: "vendor_message_send";
  payload: {
    conversationId: string;
    senderId: string;
    receiverId: string;
    senderRole: "customer" | "vendor" | "admin";
    receiverRole: "customer" | "vendor" | "admin";
    content?: string | null;
    imageUrl?: string | null;
    messageType: "text" | "image";
  };
};

export type MutationOutboxEntry =
  | QueuedProductSave
  | QueuedProductArchive
  | QueuedProductActive
  | QueuedOrderStatus
  | QueuedVendorMessage;

const OUTBOX_KEY = "mutation_outbox_v1";

function makeOutboxId(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

async function getQueue(): Promise<MutationOutboxEntry[]> {
  return (await getCachedJson<MutationOutboxEntry[]>(OUTBOX_KEY))?.data ?? [];
}

async function setQueue(entries: MutationOutboxEntry[]) {
  await setCachedJson(OUTBOX_KEY, entries);
}

function isSameTarget(a: MutationOutboxEntry, b: MutationOutboxEntry) {
  if (a.kind !== b.kind || a.ownerUserId !== b.ownerUserId) return false;

  if (a.kind === "seller_product_save" && b.kind === "seller_product_save") {
    return (a.payload.itemId && a.payload.itemId === b.payload.itemId)
      || (a.payload.localItemId && a.payload.localItemId === b.payload.localItemId);
  }
  if (a.kind === "seller_product_archive" && b.kind === "seller_product_archive") return a.payload.itemId === b.payload.itemId;
  if (a.kind === "seller_product_active" && b.kind === "seller_product_active") return a.payload.itemId === b.payload.itemId;
  if (a.kind === "seller_order_status" && b.kind === "seller_order_status") return a.payload.orderId === b.payload.orderId;
  return false;
}

export async function enqueueMutation(entry: MutationOutboxEntry) {
  const entries = await getQueue();
  const next = entries.filter((existing) => !isSameTarget(existing, entry));
  next.push(entry);
  await setQueue(next);
}

export async function getPendingMutations(ownerUserId?: string | null) {
  const entries = await getQueue();
  return entries
    .filter((entry) => !ownerUserId || entry.ownerUserId === ownerUserId)
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

export async function enqueueSellerProductSave(params: {
  ownerUserId: string;
  vendorId: string;
  itemId?: string | null;
  name: string;
  price_mwk: number;
  description?: string | null;
  stock_qty?: number | null;
  channel: SalesChannel;
  image_url?: string | null;
}) {
  const localItemId = params.itemId ?? `local-product:${Date.now()}`;
  const entry: QueuedProductSave = {
    id: makeOutboxId("seller-product-save"),
    kind: "seller_product_save",
    ownerUserId: params.ownerUserId,
    queuedAt: Date.now(),
    payload: {
      vendorId: params.vendorId,
      itemId: params.itemId ?? null,
      localItemId,
      name: params.name,
      price_mwk: params.price_mwk,
      description: params.description ?? null,
      stock_qty: params.stock_qty ?? null,
      channel: params.channel,
      image_url: params.image_url ?? null,
    },
  };
  await enqueueMutation(entry);
  return entry;
}

export async function enqueueSellerProductArchive(ownerUserId: string, itemId: string) {
  const entry: QueuedProductArchive = {
    id: makeOutboxId("seller-product-archive"),
    kind: "seller_product_archive",
    ownerUserId,
    queuedAt: Date.now(),
    payload: { itemId },
  };
  await enqueueMutation(entry);
  return entry;
}

export async function enqueueSellerProductActive(ownerUserId: string, itemId: string, isActive: boolean) {
  const entry: QueuedProductActive = {
    id: makeOutboxId("seller-product-active"),
    kind: "seller_product_active",
    ownerUserId,
    queuedAt: Date.now(),
    payload: { itemId, isActive },
  };
  await enqueueMutation(entry);
  return entry;
}

export async function enqueueSellerOrderStatus(ownerUserId: string, orderId: string, status: OrderStatus) {
  const entry: QueuedOrderStatus = {
    id: makeOutboxId("seller-order-status"),
    kind: "seller_order_status",
    ownerUserId,
    queuedAt: Date.now(),
    payload: { orderId, status },
  };
  await enqueueMutation(entry);
  return entry;
}

export async function enqueueVendorMessage(params: {
  ownerUserId: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  senderRole: "customer" | "vendor" | "admin";
  receiverRole: "customer" | "vendor" | "admin";
  content?: string | null;
  imageUrl?: string | null;
  messageType: "text" | "image";
}) {
  const entry: QueuedVendorMessage = {
    id: makeOutboxId("vendor-message"),
    kind: "vendor_message_send",
    ownerUserId: params.ownerUserId,
    queuedAt: Date.now(),
    payload: {
      conversationId: params.conversationId,
      senderId: params.senderId,
      receiverId: params.receiverId,
      senderRole: params.senderRole,
      receiverRole: params.receiverRole,
      content: params.content ?? null,
      imageUrl: params.imageUrl ?? null,
      messageType: params.messageType,
    },
  };
  await enqueueMutation(entry);
  return entry;
}

function buildLocalProduct(entry: QueuedProductSave): CatalogItemRow {
  const now = new Date(entry.queuedAt).toISOString();
  return {
    id: entry.payload.itemId ?? entry.payload.localItemId ?? makeOutboxId("local-product"),
    vendor_id: entry.payload.vendorId,
    channel: entry.payload.channel,
    name: entry.payload.name,
    description: entry.payload.description ?? null,
    price_mwk: entry.payload.price_mwk,
    stock_qty: entry.payload.stock_qty ?? null,
    image_url: entry.payload.image_url ?? null,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
}

export async function applyOutboxToSellerWorkspace(ownerUserId: string, workspace: SellerWorkspace) {
  const pending = await getPendingMutations(ownerUserId);
  if (!pending.length) return workspace;

  const next: SellerWorkspace = {
    ...workspace,
    products: [...workspace.products],
    orders: [...workspace.orders],
  };

  for (const entry of pending) {
    if (entry.kind === "seller_product_save") {
      const targetId = entry.payload.itemId ?? entry.payload.localItemId;
      const index = next.products.findIndex((row) => row.id === targetId);
      const optimistic = buildLocalProduct(entry);
      if (index >= 0) next.products[index] = { ...next.products[index], ...optimistic, id: next.products[index].id };
      else next.products.unshift(optimistic);
      continue;
    }

    if (entry.kind === "seller_product_archive") {
      next.products = next.products.filter((row) => row.id !== entry.payload.itemId);
      continue;
    }

    if (entry.kind === "seller_product_active") {
      next.products = next.products.map((row) => (row.id === entry.payload.itemId ? { ...row, is_active: entry.payload.isActive } : row));
      continue;
    }

    if (entry.kind === "seller_order_status") {
      next.orders = next.orders.map((row) =>
        row.id === entry.payload.orderId
          ? { ...row, status: entry.payload.status, updated_at: new Date(entry.queuedAt).toISOString() }
          : row,
      );
    }
  }

  return next;
}

export async function getPendingVendorMessages(conversationId: string) {
  const entries = await getQueue();
  return entries
    .filter((entry): entry is QueuedVendorMessage => entry.kind === "vendor_message_send" && entry.payload.conversationId === conversationId)
    .sort((a, b) => a.queuedAt - b.queuedAt)
    .map<VendorMessageRow>((entry) => ({
      id: `local-message:${entry.id}`,
      conversation_id: entry.payload.conversationId,
      sender_id: entry.payload.senderId,
      receiver_id: entry.payload.receiverId,
      sender_role: entry.payload.senderRole,
      receiver_role: entry.payload.receiverRole,
      content: entry.payload.content ?? null,
      message_type: entry.payload.messageType,
      image_url: entry.payload.imageUrl ?? null,
      created_at: new Date(entry.queuedAt).toISOString(),
    }));
}

export async function syncMutationOutbox(ownerUserId?: string | null) {
  const entries = await getQueue();
  const pending = entries
    .filter((entry) => !ownerUserId || entry.ownerUserId === ownerUserId)
    .sort((a, b) => a.queuedAt - b.queuedAt);
  if (!pending.length) return { synced: 0 };

  const remaining = [...entries];
  const localIdMap = new Map<string, string>();
  let synced = 0;

  for (const entry of pending) {
    try {
      if (entry.kind === "seller_product_save") {
        const resolvedItemId = entry.payload.itemId
          ?? (entry.payload.localItemId ? localIdMap.get(entry.payload.localItemId) : undefined)
          ?? null;

        if (resolvedItemId) {
          await updateCatalogItem(resolvedItemId, {
            name: entry.payload.name,
            description: entry.payload.description ?? null,
            price_mwk: entry.payload.price_mwk,
            stock_qty: entry.payload.stock_qty ?? null,
            image_url: entry.payload.image_url ?? null,
          });
        } else {
          const created = await createCatalogItem({
            vendor_id: entry.payload.vendorId,
            channel: entry.payload.channel,
            name: entry.payload.name,
            description: entry.payload.description ?? null,
            price_mwk: entry.payload.price_mwk,
            stock_qty: entry.payload.stock_qty ?? null,
            image_url: entry.payload.image_url ?? null,
          });
          if (entry.payload.localItemId) localIdMap.set(entry.payload.localItemId, created.id);
        }
      } else if (entry.kind === "seller_product_archive") {
        const resolvedItemId = localIdMap.get(entry.payload.itemId) ?? entry.payload.itemId;
        if (!resolvedItemId.startsWith("local-product:")) await deleteCatalogItem(resolvedItemId);
      } else if (entry.kind === "seller_product_active") {
        const resolvedItemId = localIdMap.get(entry.payload.itemId) ?? entry.payload.itemId;
        if (!resolvedItemId.startsWith("local-product:")) {
          await updateCatalogItem(resolvedItemId, { is_active: entry.payload.isActive });
        }
      } else if (entry.kind === "seller_order_status") {
        await updateOrderStatus(entry.payload.orderId, entry.payload.status);
      } else if (entry.kind === "vendor_message_send") {
        await sendVendorMessage({
          conversationId: entry.payload.conversationId,
          senderId: entry.payload.senderId,
          receiverId: entry.payload.receiverId,
          senderRole: entry.payload.senderRole,
          receiverRole: entry.payload.receiverRole,
          content: entry.payload.content ?? null,
          imageUrl: entry.payload.imageUrl ?? null,
          messageType: entry.payload.messageType,
        });
      }
    } catch {
      continue;
    }

    const index = remaining.findIndex((row) => row.id === entry.id);
    if (index >= 0) remaining.splice(index, 1);
    synced += 1;
  }

  if (synced > 0) await setQueue(remaining);
  return { synced };
}
