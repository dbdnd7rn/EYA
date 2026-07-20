import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabaseNewApp } from "../supabaseNewApp";
import { ENV } from "../env";
import { listMyVendors } from "./vendors";
import type { SalesChannel, VendorConversationRow, VendorMessageRow } from "./types";
import { createInAppNotification } from "@/lib/appNotifications";

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${field} is unavailable. Please close this page and open it again.`);
  }
  return normalized;
}

function normalizeOptionalUuid(value: string | null | undefined, field: string): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized || normalized.toLowerCase() === "null" || normalized.toLowerCase() === "undefined") {
    return null;
  }
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`${field} is invalid. Please close this page and open it again.`);
  }
  return normalized;
}

const DEV_VENDOR_CHAT_KEY = "eya_dev_vendor_messages_v1";

type DevVendorChatStore = {
  conversations: VendorConversationRow[];
  messages: VendorMessageRow[];
};

const EMPTY_STORE: DevVendorChatStore = {
  conversations: [],
  messages: [],
};

async function readStore(): Promise<DevVendorChatStore> {
  const raw = await AsyncStorage.getItem(DEV_VENDOR_CHAT_KEY);
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as Partial<DevVendorChatStore>;
    return {
      conversations: parsed.conversations ?? [],
      messages: parsed.messages ?? [],
    };
  } catch {
    return EMPTY_STORE;
  }
}

async function writeStore(store: DevVendorChatStore) {
  await AsyncStorage.setItem(DEV_VENDOR_CHAT_KEY, JSON.stringify(store));
}

export async function listVendorConversationsForOwner(ownerId: string): Promise<VendorConversationRow[]> {
  if (ENV.DEV_AUTH_MODE) {
    const [store, vendors] = await Promise.all([readStore(), listMyVendors(ownerId)]);
    const vendorIds = new Set(vendors.map((row) => row.id));
    return store.conversations
      .filter((row) => vendorIds.has(row.vendor_id))
      .sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at));
  }

  const { data: vendors, error: vendorError } = await supabaseNewApp.from("vendors").select("id").eq("owner_id", ownerId);
  throwIfError(vendorError);
  const vendorIds = (vendors ?? []).map((row) => (row as { id: string }).id);
  if (!vendorIds.length) return [];

  const { data, error } = await supabaseNewApp
    .from("vendor_conversations")
    .select("id, vendor_id, customer_id, channel, catalog_item_id, subject, last_message_at, created_at, updated_at")
    .in("vendor_id", vendorIds)
    .order("last_message_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as VendorConversationRow[];
}

export async function listVendorConversationsForCustomer(customerId: string): Promise<VendorConversationRow[]> {
  if (ENV.DEV_AUTH_MODE) {
    const store = await readStore();
    return store.conversations
      .filter((row) => row.customer_id === customerId)
      .sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at));
  }

  const { data, error } = await supabaseNewApp
    .from("vendor_conversations")
    .select("id, vendor_id, customer_id, channel, catalog_item_id, subject, last_message_at, created_at, updated_at")
    .eq("customer_id", customerId)
    .order("last_message_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as VendorConversationRow[];
}

export async function listVendorMessages(conversationId: string): Promise<VendorMessageRow[]> {
  if (ENV.DEV_AUTH_MODE) {
    const store = await readStore();
    return store.messages
      .filter((row) => row.conversation_id === conversationId)
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  }

  const { data, error } = await supabaseNewApp
    .from("vendor_messages")
    .select("id, conversation_id, sender_id, receiver_id, sender_role, receiver_role, content, message_type, image_url, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  throwIfError(error);
  return (data ?? []) as VendorMessageRow[];
}

export async function sendVendorMessage(input: {
  conversationId: string;
  senderId: string;
  receiverId: string;
  senderRole: "customer" | "vendor" | "admin";
  receiverRole: "customer" | "vendor" | "admin";
  content?: string | null;
  imageUrl?: string | null;
  messageType: "text" | "image";
}): Promise<VendorMessageRow> {
  if (ENV.DEV_AUTH_MODE) {
    const store = await readStore();
    const createdAt = new Date().toISOString();
    const message: VendorMessageRow = {
      id: `dev-vendor-message-${Date.now()}`,
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      receiver_id: input.receiverId,
      sender_role: input.senderRole,
      receiver_role: input.receiverRole,
      content: input.content ?? null,
      image_url: input.imageUrl ?? null,
      message_type: input.messageType,
      created_at: createdAt,
    };
    const conversations = store.conversations.map((conversation) =>
      conversation.id === input.conversationId
        ? {
            ...conversation,
            last_message_at: createdAt,
            updated_at: createdAt,
          }
        : conversation,
    );
    await writeStore({
      conversations,
      messages: [...store.messages, message],
    });
    return message;
  }

  const { data, error } = await supabaseNewApp
    .from("vendor_messages")
    .insert({
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      receiver_id: input.receiverId,
      sender_role: input.senderRole,
      receiver_role: input.receiverRole,
      content: input.content ?? null,
      image_url: input.imageUrl ?? null,
      message_type: input.messageType,
    })
    .select("id, conversation_id, sender_id, receiver_id, sender_role, receiver_role, content, message_type, image_url, created_at")
    .single();
  throwIfError(error);
  const message = data as VendorMessageRow;

  try {
    await createInAppNotification({
      userId: input.receiverId,
      title: input.senderRole === "vendor" ? "Seller message" : input.senderRole === "admin" ? "Admin message" : "Customer message",
      message: input.content?.trim() || "You received a new message.",
      type: "vendor_message",
      priority: "important",
      data: {
        conversationId: input.conversationId,
        senderRole: input.senderRole,
        receiverRole: input.receiverRole,
      },
    });
  } catch {
    // Messaging should still succeed if notifications fail.
  }

  return message;
}

export async function getOrCreateVendorConversation(input: {
  vendorId: string;
  customerId: string;
  channel: SalesChannel;
  catalogItemId?: string | null;
  subject?: string | null;
}): Promise<VendorConversationRow> {
  if (ENV.DEV_AUTH_MODE) {
    const store = await readStore();
    const existing = store.conversations.find((row) => {
      if (row.vendor_id !== input.vendorId || row.customer_id !== input.customerId || row.channel !== input.channel) {
        return false;
      }
      if (input.catalogItemId) return row.catalog_item_id === input.catalogItemId;
      return !row.catalog_item_id;
    });
    if (existing) return existing;

    const now = new Date().toISOString();
    const created: VendorConversationRow = {
      id: `dev-vendor-conversation-${Date.now()}`,
      vendor_id: input.vendorId,
      customer_id: input.customerId,
      channel: input.channel,
      catalog_item_id: input.catalogItemId ?? null,
      subject: input.subject ?? null,
      last_message_at: now,
      created_at: now,
      updated_at: now,
    };
    await writeStore({
      conversations: [created, ...store.conversations],
      messages: store.messages,
    });
    return created;
  }

  const vendorId = requireUuid(input.vendorId, "Seller");
  const customerId = requireUuid(input.customerId, "Customer");
  const catalogItemId = normalizeOptionalUuid(input.catalogItemId, "Marketplace item");

  let existingQuery = supabaseNewApp
    .from("vendor_conversations")
    .select("id, vendor_id, customer_id, channel, catalog_item_id, subject, last_message_at, created_at, updated_at")
    .eq("vendor_id", vendorId)
    .eq("customer_id", customerId)
    .eq("channel", input.channel);

  existingQuery = catalogItemId
    ? existingQuery.eq("catalog_item_id", catalogItemId)
    : existingQuery.is("catalog_item_id", null);

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  throwIfError(existingError);
  if (existing) return existing as VendorConversationRow;

  const { data, error } = await supabaseNewApp
    .from("vendor_conversations")
    .insert({
      vendor_id: vendorId,
      customer_id: customerId,
      channel: input.channel,
      catalog_item_id: catalogItemId,
      subject: input.subject ?? null,
    })
    .select("id, vendor_id, customer_id, channel, catalog_item_id, subject, last_message_at, created_at, updated_at")
    .single();
  throwIfError(error);
  return data as VendorConversationRow;
}
