import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { House, MapPin, MessageCircle, Search, ShoppingBag, Store, UtensilsCrossed } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { listStudentMarketRequests, type MarketInterestRequest } from "@/lib/marketInterest";
import { listVendorConversationsForCustomer } from "@/lib/newApp/vendorMessages";
import type { CatalogItemRow, SalesChannel, VendorConversationRow, VendorRow } from "@/lib/newApp/types";
import { supabaseNewApp } from "@/lib/supabaseNewApp";
import { supabase } from "@/lib/supabase";
import RoomsBottomNav from "@/components/rooms/RoomsBottomNav";
import RoomsSectionHeader from "@/components/rooms/RoomsSectionHeader";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

export type StudentMessagesScope = "all" | "rooms";

type InboxKind = "hostel" | "market" | "food";

type ListingMini = {
  id: string;
  title: string;
  listing_type: "hostel" | "bedsitter";
  campus: string | null;
  area: string | null;
  city: string | null;
};

type EnquiryRow = {
  id: string;
  message: string | null;
  created_at: string | null;
  listings: ListingMini[] | ListingMini | null;
};

type HostelMessageRow = {
  enquiry_id: string;
  content: string | null;
  created_at: string;
};

type VendorMessagePreviewRow = {
  conversation_id: string;
  content: string | null;
  image_url: string | null;
  message_type: "text" | "image";
  created_at: string;
};

type ChatInboxEntry = {
  id: string;
  kind: InboxKind;
  title: string;
  subtitle: string;
  preview: string;
  updatedAt: string;
  imageUrl: string | null;
  enquiryId?: string;
  vendorId?: string;
  channel?: SalesChannel;
  itemId?: string | null;
  itemName?: string | null;
  subject?: string | null;
  vendorName?: string | null;
  priceMwk?: number | null;
  requestStatus?: MarketInterestRequest["status"] | null;
  requestLabel?: string | null;
};

function inboxCacheKey(userId: string, scope: StudentMessagesScope) {
  return `student-chat-inbox:${scope}:${userId}`;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function initials(label?: string | null) {
  const parts = (label || "Chat").trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "C"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function locationLabel(parts: (string | null | undefined)[]) {
  return parts.filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" • ");
}

function hostelPreview(enquiry: EnquiryRow, latest: HostelMessageRow | null) {
  if (latest?.content?.trim()) return latest.content.trim();
  if (enquiry.message?.trim()) return enquiry.message.trim();
  return "Open hostel chat";
}

function vendorPreview(latest: VendorMessagePreviewRow | null, subject?: string | null) {
  if (latest?.message_type === "image") return "Sent a photo";
  if (latest?.content?.trim()) return latest.content.trim();
  if (subject?.trim()) return subject.trim();
  return "Open seller chat";
}

function sourceIcon(kind: InboxKind) {
  if (kind === "market") return <Store size={18} color="#0f6d80" />;
  if (kind === "food") return <UtensilsCrossed size={18} color="#9c4b1a" />;
  return <House size={18} color="#23457b" />;
}

function isDeliveryRequestStatus(status?: MarketInterestRequest["status"] | null) {
  return status === "discussing" || status === "arranged" || status === "completed";
}

async function loadHostelEntries(userId: string): Promise<ChatInboxEntry[]> {
  const { data: enquiries, error } = await supabase
    .from("enquiries")
    .select(
      `
      id,
      message,
      created_at,
      listings:listing_id (
        id,
        title,
        listing_type,
        campus,
        area,
        city
      )
    `,
    )
    .eq("student_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const enquiryRows = (enquiries ?? []) as EnquiryRow[];
  const enquiryIds = enquiryRows.map((row) => row.id);
  let latestMessages: HostelMessageRow[] = [];

  if (enquiryIds.length) {
    const { data: messageRows, error: messageError } = await supabase
      .from("messages")
      .select("enquiry_id,content,created_at")
      .in("enquiry_id", enquiryIds)
      .order("created_at", { ascending: false })
      .limit(400);
    if (messageError) throw messageError;
    latestMessages = (messageRows ?? []) as HostelMessageRow[];
  }

  const latestByEnquiry = new Map<string, HostelMessageRow>();
  for (const row of latestMessages) {
    if (!latestByEnquiry.has(row.enquiry_id)) latestByEnquiry.set(row.enquiry_id, row);
  }

  return enquiryRows.map((enquiry) => {
    const listing = (Array.isArray(enquiry.listings) ? enquiry.listings[0] : enquiry.listings) ?? null;
    const latest = latestByEnquiry.get(enquiry.id) ?? null;
    return {
      id: `hostel:${enquiry.id}`,
      kind: "hostel",
      title: listing?.title?.trim() || "Hostel chat",
      subtitle: locationLabel([listing?.area, listing?.city, listing?.campus]) || "Accommodation enquiry",
      preview: hostelPreview(enquiry, latest),
      updatedAt: latest?.created_at ?? enquiry.created_at ?? new Date().toISOString(),
      imageUrl: null,
      enquiryId: enquiry.id,
      requestStatus: null,
      requestLabel: null,
    };
  });
}

async function loadVendorEntries(userId: string): Promise<ChatInboxEntry[]> {
  const [conversations, requests] = await Promise.all([
    listVendorConversationsForCustomer(userId),
    listStudentMarketRequests(userId),
  ]);
  if (!conversations.length) return [];

  const vendorIds = [...new Set(conversations.map((row) => row.vendor_id))];
  const itemIds = [...new Set(conversations.map((row) => row.catalog_item_id).filter((value): value is string => Boolean(value)))];
  const conversationIds = conversations.map((row) => row.id);

  const [vendorRes, itemRes, messageRes] = await Promise.all([
    vendorIds.length ? supabaseNewApp.from("vendors").select("id,name,area,campus,city").in("id", vendorIds) : Promise.resolve({ data: [], error: null }),
    itemIds.length ? supabaseNewApp.from("catalog_items").select("id,name,image_url,price_mwk").in("id", itemIds) : Promise.resolve({ data: [], error: null }),
    supabaseNewApp
      .from("vendor_messages")
      .select("conversation_id,content,image_url,message_type,created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (vendorRes.error) throw vendorRes.error;
  if (itemRes.error) throw itemRes.error;
  if (messageRes.error) throw messageRes.error;

  const vendorsById = new Map(
    ((vendorRes.data ?? []) as Pick<VendorRow, "id" | "name" | "area" | "campus" | "city">[]).map((row) => [row.id, row]),
  );
  const itemsById = new Map(
    ((itemRes.data ?? []) as Pick<CatalogItemRow, "id" | "name" | "image_url" | "price_mwk">[]).map((row) => [row.id, row]),
  );
  const latestByConversation = new Map<string, VendorMessagePreviewRow>();
  for (const row of (messageRes.data ?? []) as VendorMessagePreviewRow[]) {
    if (!latestByConversation.has(row.conversation_id)) latestByConversation.set(row.conversation_id, row);
  }

  return conversations.map((conversation: VendorConversationRow) => {
    const vendor = vendorsById.get(conversation.vendor_id);
    const item = conversation.catalog_item_id ? itemsById.get(conversation.catalog_item_id) : null;
    const latest = latestByConversation.get(conversation.id) ?? null;
    const kind: InboxKind = conversation.channel === "food" ? "food" : "market";
    const request = requests.find((row) => row.vendorId === conversation.vendor_id && row.customerId === userId && row.itemId === conversation.catalog_item_id);
    return {
      id: `${kind}:${conversation.id}`,
      kind,
      title: vendor?.name?.trim() || (kind === "food" ? "Restaurant chat" : "Shop chat"),
      subtitle: item?.name?.trim() || conversation.subject?.trim() || locationLabel([vendor?.area, vendor?.city, vendor?.campus]) || "Seller conversation",
      preview: vendorPreview(latest, conversation.subject),
      updatedAt: latest?.created_at ?? conversation.last_message_at ?? conversation.created_at,
      imageUrl: item?.image_url ?? latest?.image_url ?? null,
      vendorId: conversation.vendor_id,
      channel: conversation.channel,
      itemId: conversation.catalog_item_id,
      itemName: item?.name ?? null,
      subject: conversation.subject ?? null,
      vendorName: vendor?.name ?? null,
      priceMwk: item?.price_mwk ?? null,
      requestStatus: request?.status ?? null,
      requestLabel: request?.pickupTimeLabel ? `${request.pickupTimeLabel} • ${request.pickupLocation}` : request?.lastMessage ?? null,
    };
  });
}

export default function StudentMessagesScreen({
  contentBottomPadding = 120,
  scope = "all",
  showRoomsNav = false,
}: {
  contentBottomPadding?: number;
  scope?: StudentMessagesScope;
  showRoomsNav?: boolean;
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { isOnline } = useNetwork();
  const { theme } = useStudentTheme();
  const roomsOnly = scope === "rooms";
  const [rows, setRows] = useState<ChatInboxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const refreshInbox = useCallback(async (opts?: { silent?: boolean }) => {
    const userId = user?.id;
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }

    try {
      if (!opts?.silent) setLoading(true);
      setError(null);

      if (!isOnline) {
        const cached = await getCachedJson<ChatInboxEntry[]>(inboxCacheKey(userId, scope));
        setRows(cached?.data ?? []);
        setError(cached?.data?.length ? null : roomsOnly ? "No room chats available offline yet." : "No chats available offline yet.");
        return;
      }

      const [hostelEntries, vendorEntries] = roomsOnly
        ? [await loadHostelEntries(userId), []]
        : await Promise.all([loadHostelEntries(userId), loadVendorEntries(userId)]);
      const nextRows = [...hostelEntries, ...vendorEntries].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
      await setCachedJson(inboxCacheKey(userId, scope), nextRows);
      setRows(nextRows);
    } catch (err: any) {
      const cached = await getCachedJson<ChatInboxEntry[]>(inboxCacheKey(userId, scope));
      setRows(cached?.data ?? []);
      setError(cached?.data?.length ? "Showing saved chats. Live refresh failed." : (err?.message ?? "Could not load chats right now."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOnline, roomsOnly, scope, user?.id]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!authLoading) void refreshInbox();
  }, [authLoading, refreshInbox]);

  useEffect(() => {
    if (!user?.id || !isOnline) return;

    const hostelChannel = supabase
      .channel(`student-chat-inbox-hostel-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "enquiries", filter: `student_id=eq.${user.id}` }, () => {
        void refreshInbox({ silent: true });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `receiver_id=eq.${user.id}` }, () => {
        void refreshInbox({ silent: true });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `sender_id=eq.${user.id}` }, () => {
        void refreshInbox({ silent: true });
      })
      .subscribe();

    const vendorChannel = roomsOnly
      ? null
      : supabaseNewApp
          .channel(`student-chat-inbox-vendor-${user.id}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "vendor_conversations", filter: `customer_id=eq.${user.id}` }, () => {
            void refreshInbox({ silent: true });
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "vendor_messages", filter: `receiver_id=eq.${user.id}` }, () => {
            void refreshInbox({ silent: true });
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "vendor_messages", filter: `sender_id=eq.${user.id}` }, () => {
            void refreshInbox({ silent: true });
          })
          .subscribe();

    return () => {
      supabase.removeChannel(hostelChannel);
      if (vendorChannel) supabaseNewApp.removeChannel(vendorChannel);
    };
  }, [isOnline, refreshInbox, roomsOnly, user?.id]);

  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.title, row.subtitle, row.preview, row.vendorName, row.itemName, row.requestLabel]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .some((value) => value.toLowerCase().includes(term)),
    );
  }, [query, rows]);

  const totalChats = rows.length;
  const hostelCount = rows.filter((row) => row.kind === "hostel").length;
  const deliveryCount = rows.filter((row) => isDeliveryRequestStatus(row.requestStatus)).length;

  const openChat = (row: ChatInboxEntry) => {
    if (row.kind === "hostel" && row.enquiryId) {
      router.push({
        pathname: "/(student)/chat/[enquiryId]",
        params: { enquiryId: row.enquiryId, ...(roomsOnly ? { from: "rooms" } : {}) },
      });
      return;
    }
    if (!row.vendorId || !row.channel) return;
    router.push({
      pathname: "/(student)/vendor-chat/[vendorId]",
      params: {
        vendorId: row.vendorId,
        channel: row.channel,
        ...(row.itemId ? { itemId: row.itemId } : {}),
        ...(row.subject ? { subject: row.subject } : {}),
        ...(row.vendorName ? { vendorName: row.vendorName } : {}),
        ...(row.itemName ? { itemName: row.itemName } : {}),
        ...(row.imageUrl ? { image: row.imageUrl } : {}),
        ...(row.priceMwk != null ? { price: String(row.priceMwk) } : {}),
      },
    });
  };

  if (authLoading || loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={styles.skeletonWrap}>
          {Array.from({ length: 5 }).map((_, index) => (
            <View key={index} style={[styles.skeletonRow, { backgroundColor: theme.surfaceMuted }]} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }, showRoomsNav && styles.contentWithRoomsNav]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void refreshInbox({ silent: true }); }} tintColor="#0f6d80" />}
        showsVerticalScrollIndicator={false}
      >
        {showRoomsNav ? <RoomsSectionHeader /> : null}

        <View style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.heroOrbLarge, { backgroundColor: theme.glowTop }]} />
          <View style={[styles.heroOrbSmall, { backgroundColor: theme.glowMiddle }]} />
          <Text style={[styles.heroEyebrow, { color: theme.textMuted }]}>{roomsOnly ? "Rooms inbox" : "Student inbox"}</Text>
          <Text style={[styles.heroTitle, { color: theme.text }]}>{roomsOnly ? "Room chats" : "Chats"}</Text>
          <Text style={[styles.heroSub, { color: theme.textMuted }]}>
            {roomsOnly ? "Chats between tenants and landlords about room enquiries." : "All your hostel, market, food, and delivery conversations in one place."}
          </Text>

          <View style={styles.metricsRow}>
            <MetricCard label="Total" value={String(totalChats)} tint="#e9f9f2" textColor="#156b45" />
            <MetricCard label="Hostels" value={String(hostelCount)} tint="#edf4ff" textColor="#2351a6" />
            {!roomsOnly ? <MetricCard label="Delivery" value={String(deliveryCount)} tint="#fff4e8" textColor="#995522" /> : null}
          </View>
        </View>

        <View style={[styles.searchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Search size={18} color={theme.textSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={roomsOnly ? "Search room chats, hostels..." : "Search chats, shops, hostels..."}
            placeholderTextColor={theme.textSoft}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>

        {error ? (
          <View style={[styles.errorCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.errorText, { color: theme.text }]}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.list}>
          {visibleRows.length ? (
            visibleRows.map((row) => (
              <Pressable key={row.id} style={[styles.chatCard, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => openChat(row)}>
                <View style={styles.chatLeft}>
                  {row.imageUrl ? (
                    <Image source={{ uri: row.imageUrl }} style={styles.chatImage} />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: row.kind === "hostel" ? "#24457a" : row.kind === "food" ? "#9c4b1a" : "#0f6d80" }]}>
                      <Text style={styles.avatarText}>{initials(row.title)}</Text>
                    </View>
                  )}
                  <View style={styles.chatCopy}>
                    <View style={styles.chatTopRow}>
                      <Text numberOfLines={1} style={[styles.chatTitle, { color: theme.text }]}>{row.title}</Text>
                      <Text style={[styles.chatTime, { color: theme.textMuted }]}>{formatTime(row.updatedAt)}</Text>
                    </View>

                    <View style={styles.badgesRow}>
                      <View style={styles.sourcePill}>
                        {sourceIcon(row.kind)}
                        <Text style={[styles.sourcePillText, { color: theme.text }]}>
                          {row.kind === "hostel" ? "Hostel" : row.kind === "food" ? "Food" : "Market"}
                        </Text>
                      </View>
                      {row.requestStatus && isDeliveryRequestStatus(row.requestStatus) ? (
                        <View style={styles.deliveryPill}>
                          <ShoppingBag size={14} color="#995522" />
                          <Text style={styles.deliveryPillText}>Delivery</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.locationRow}>
                      <MapPin size={13} color={theme.textSoft} />
                      <Text numberOfLines={1} style={[styles.locationText, { color: theme.textMuted }]}>{row.subtitle}</Text>
                    </View>

                    <Text numberOfLines={2} style={[styles.preview, { color: theme.textMuted }]}>{row.preview}</Text>
                    {row.requestLabel ? <Text numberOfLines={1} style={[styles.requestMeta, { color: theme.textSoft }]}>{row.requestLabel}</Text> : null}
                  </View>
                </View>
              </Pressable>
            ))
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.emptyIconWrap}>
                <MessageCircle size={24} color="#0f6d80" />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{roomsOnly ? "No room chats yet" : "No chats yet"}</Text>
              <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                {roomsOnly ? "Start a room enquiry and landlord chats will appear here." : "Start a hostel enquiry or message a seller and it will appear here."}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
      {showRoomsNav ? <RoomsBottomNav active="chats" /> : null}
    </SafeAreaView>
  );
}

function MetricCard({ label, value, tint, textColor }: { label: string; value: string; tint: string; textColor: string }) {
  return (
    <View style={[styles.metricCard, { backgroundColor: tint }]}>
      <Text style={[styles.metricValue, { color: textColor }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  content: { padding: 16, gap: 14 },
  contentWithRoomsNav: { paddingBottom: 164 },
  skeletonWrap: { padding: 16, gap: 12 },
  skeletonRow: { height: 96, borderRadius: 26 },
  heroCard: {
    borderRadius: 30,
    borderWidth: 1,
    padding: 20,
    overflow: "hidden",
    gap: 14,
  },
  heroOrbLarge: {
    position: "absolute",
    top: -36,
    right: -12,
    width: 180,
    height: 180,
    borderRadius: 999,
    opacity: 0.28,
  },
  heroOrbSmall: {
    position: "absolute",
    left: -24,
    bottom: -40,
    width: 150,
    height: 150,
    borderRadius: 999,
    opacity: 0.22,
  },
  heroEyebrow: { fontSize: 13, fontWeight: "800", textTransform: "uppercase" },
  heroTitle: { fontSize: 34, fontWeight: "900" },
  heroSub: { fontSize: 14, fontWeight: "700", lineHeight: 21, maxWidth: "92%" },
  metricsRow: { flexDirection: "row", gap: 10 },
  metricCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 2,
  },
  metricValue: { fontSize: 20, fontWeight: "900" },
  metricLabel: { fontSize: 12, fontWeight: "800" },
  searchCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: "700" },
  errorCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: { fontSize: 13, fontWeight: "700" },
  list: { gap: 12 },
  chatCard: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 14,
  },
  chatLeft: { flexDirection: "row", gap: 12 },
  chatImage: { width: 64, height: 64, borderRadius: 18, backgroundColor: "#d8e6ef" },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  chatCopy: { flex: 1, gap: 7 },
  chatTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  chatTitle: { flex: 1, fontSize: 17, fontWeight: "900" },
  chatTime: { fontSize: 12, fontWeight: "800" },
  badgesRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  sourcePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.72)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sourcePillText: { fontSize: 12, fontWeight: "800" },
  deliveryPill: {
    borderRadius: 999,
    backgroundColor: "#fff4e8",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  deliveryPillText: { color: "#995522", fontSize: 12, fontWeight: "900" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { flex: 1, fontSize: 12, fontWeight: "700" },
  preview: { fontSize: 13, fontWeight: "700", lineHeight: 19 },
  requestMeta: { fontSize: 11, fontWeight: "800" },
  emptyCard: {
    borderRadius: 26,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "#e7f6f8",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 18, fontWeight: "900" },
  emptySub: { fontSize: 13, fontWeight: "700", textAlign: "center", lineHeight: 20 },
});
