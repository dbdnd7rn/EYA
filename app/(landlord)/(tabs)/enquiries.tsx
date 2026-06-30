/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  BadgeCheck,
  CheckCheck,
  ChevronRight,
  Ellipsis,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type EnquiryDbRow = {
  id: string;
  status: string | null;
  created_at: string;
  student_id: string;
  message: string | null;
  listings: { title: string | null }[] | { title: string | null } | null;
};

type MessageRow = {
  enquiry_id: string;
  sender_role: "student" | "landlord" | string;
  content: string | null;
  message_type: "text" | "image" | null;
  image_url: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
};

type FilterTab = "all" | "unread" | "request";

type ConversationRow = {
  id: string;
  status: string;
  studentId: string;
  studentName: string;
  avatarUrl: string | null;
  listingTitle: string;
  preview: string;
  lastActivityAt: string;
  unreadCount: number;
  needsResponse: boolean;
};

function initials(name?: string | null) {
  const clean = (name || "").trim();
  if (!clean) return "ST";
  const parts = clean.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "S";
  const b = parts[1]?.[0] ?? "T";
  return (a + b).toUpperCase();
}

function relativeTime(iso?: string | null) {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "";
  const diffMs = Date.now() - ts;
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  if (diffHours < 48) return "Yesterday";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function listingTitleFromJoin(listings: EnquiryDbRow["listings"]) {
  if (Array.isArray(listings)) return listings[0]?.title?.trim() || "Listing";
  return listings?.title?.trim() || "Listing";
}

function previewFromMessage(message: MessageRow | null, fallback?: string | null) {
  if (!message) return fallback?.trim() || "Tap to open conversation.";
  if (message.message_type === "image") {
    return message.sender_role === "landlord" ? "You shared a photo." : "Sent a photo.";
  }
  const text = message.content?.trim() || fallback?.trim() || "Tap to open conversation.";
  return message.sender_role === "landlord" ? `You: ${text}` : text;
}

function unreadCountFromThread(status: string, messages: MessageRow[], hasFallbackMessage: boolean) {
  if (String(status).toLowerCase() !== "new") return 0;
  const lastLandlordIndex = [...messages].map((m) => m.sender_role).lastIndexOf("landlord");
  const unreadMessages = messages.filter((m, index) => m.sender_role === "student" && index > lastLandlordIndex).length;
  if (unreadMessages > 0) return unreadMessages;
  return hasFallbackMessage ? 1 : 0;
}

export default function LandlordEnquiriesScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  const load = async (opts?: { silent?: boolean }) => {
    if (!user) return;

    if (!opts?.silent) setLoading(true);
    setErr(null);

    const { data: enquiryData, error: enquiryErr } = await supabase
      .from("enquiries")
      .select(
        `
        id,
        status,
        created_at,
        student_id,
        message,
        listings:listing_id ( title )
      `,
      )
      .eq("landlord_id", user.id)
      .order("created_at", { ascending: false });

    if (enquiryErr) {
      setErr(enquiryErr.message);
      setRows([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const enquiryRows = (enquiryData ?? []) as EnquiryDbRow[];
    const enquiryIds = enquiryRows.map((row) => row.id);
    const studentIds = [...new Set(enquiryRows.map((row) => row.student_id).filter(Boolean))];

    const [messagesRes, profilesRes] = await Promise.all([
      enquiryIds.length
        ? supabase
            .from("messages")
            .select("enquiry_id,sender_role,content,message_type,image_url,created_at")
            .in("enquiry_id", enquiryIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      studentIds.length
        ? supabase.from("profiles").select("id,full_name,avatar_url").in("id", studentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const messages = ((messagesRes.data ?? []) as MessageRow[]).reduce<Map<string, MessageRow[]>>((map, row) => {
      const existing = map.get(row.enquiry_id) ?? [];
      existing.push(row);
      map.set(row.enquiry_id, existing);
      return map;
    }, new Map());

    const profiles = new Map<string, ProfileRow>(
      (((profilesRes.data ?? []) as ProfileRow[]) || []).map((row) => [row.id, row]),
    );

    const normalized = enquiryRows
      .map((row, index) => {
        const thread = messages.get(row.id) ?? [];
        const profile = profiles.get(row.student_id);
        const hasLandlordReply = thread.some((message) => message.sender_role === "landlord");
        const lastMessage = thread[thread.length - 1] ?? null;
        const unreadCount = unreadCountFromThread(row.status ?? "new", thread, Boolean(row.message?.trim()));
        const safeName = profile?.full_name?.trim() || `Student ${index + 1}`;
        return {
          id: row.id,
          status: row.status ?? "new",
          studentId: row.student_id,
          studentName: safeName,
          avatarUrl: profile?.avatar_url ?? null,
          listingTitle: listingTitleFromJoin(row.listings),
          preview: previewFromMessage(lastMessage, row.message),
          lastActivityAt: lastMessage?.created_at ?? row.created_at,
          unreadCount,
          needsResponse: !hasLandlordReply || String(row.status ?? "").toLowerCase() === "new",
        } satisfies ConversationRow;
      })
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

    setRows(normalized);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;

    const enquiryChannel = supabase
      .channel(`landlord-enquiries-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "enquiries", filter: `landlord_id=eq.${user.id}` },
        () => {
          void load({ silent: true });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          void load({ silent: true });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(enquiryChannel);
    };
  }, [user?.id]);

  const unreadThreads = useMemo(
    () => rows.filter((row) => row.unreadCount > 0 || String(row.status).toLowerCase() === "new").length,
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (filterTab === "unread" && !(row.unreadCount > 0 || String(row.status).toLowerCase() === "new")) return false;
      if (filterTab === "request" && !row.needsResponse) return false;
      if (!term) return true;
      const haystack = [row.studentName, row.listingTitle, row.preview].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [filterTab, q, rows]);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View pointerEvents="none" style={[styles.backgroundOrb, styles.backgroundOrbLeft]} />
        <View pointerEvents="none" style={[styles.backgroundOrb, styles.backgroundOrbRight]} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#ff0f64" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View pointerEvents="none" style={[styles.backgroundOrb, styles.backgroundOrbLeft]} />
      <View pointerEvents="none" style={[styles.backgroundOrb, styles.backgroundOrbRight]} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load({ silent: true }); }} tintColor="#ff0f64" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.h1}>Enquiries</Text>
              <Text style={styles.sub}>Manage your messages & requests.</Text>
            </View>

            <Pressable style={styles.menuBtn} onPress={() => router.push("/(landlord)/(tabs)/profile")}>
              <Ellipsis size={22} color="#636d95" />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <Pressable
              style={[styles.filterChip, filterTab === "all" && styles.filterChipBlue]}
              onPress={() => setFilterTab("all")}
            >
              <Users size={18} color={filterTab === "all" ? "#22408b" : "#6b759b"} />
              <Text style={[styles.filterChipText, filterTab === "all" && styles.filterChipTextBlue]}>All</Text>
            </Pressable>

            <Pressable
              style={[styles.filterChip, filterTab === "unread" && styles.filterChipPink]}
              onPress={() => setFilterTab("unread")}
            >
              <Text style={[styles.filterChipText, filterTab === "unread" && styles.filterChipTextPink]}>Unread</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{unreadThreads}</Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.filterChip, filterTab === "request" && styles.filterChipSoft]}
              onPress={() => setFilterTab("request")}
            >
              <Text style={styles.filterChipText}>Request</Text>
              <ChevronRight size={18} color="#7a82a4" />
            </Pressable>
          </ScrollView>

          <View style={styles.searchWrap}>
            <Search size={22} color="#6b759b" />
            <TextInput
              style={styles.searchInput}
              value={q}
              onChangeText={setQ}
              placeholder="Search enquiries..."
              placeholderTextColor="#8b93ba"
            />
            <Pressable
              style={styles.filterBtn}
              onPress={() => setFilterTab((current) => (current === "all" ? "unread" : current === "unread" ? "request" : "all"))}
            >
              <SlidersHorizontal size={20} color="#5f6d9a" />
            </Pressable>
          </View>
        </View>

        {err ? (
          <View style={styles.errBox}>
            <Text style={styles.errText}>{err}</Text>
          </View>
        ) : null}

        <View style={styles.threadSheet}>
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No enquiries here yet</Text>
              <Text style={styles.emptyText}>New student messages and requests will appear on this page.</Text>
            </View>
          ) : (
            filtered.map((row, index) => {
              const showUnread = row.unreadCount > 0;
              return (
                <Pressable
                  key={row.id}
                  style={[styles.threadRow, index < filtered.length - 1 && styles.threadDivider]}
                  onPress={() => router.push({ pathname: "/(landlord)/chat/[enquiryId]", params: { enquiryId: row.id } })}
                >
                  <View style={styles.avatarShell}>
                    {row.avatarUrl ? (
                      <Image source={{ uri: row.avatarUrl }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarText}>{initials(row.studentName)}</Text>
                      </View>
                    )}
                    <View style={styles.avatarBadge}>
                      <BadgeCheck size={18} color="#3876d8" fill="#ffffff" />
                    </View>
                  </View>

                  <View style={styles.threadContent}>
                    <View style={styles.threadTopRow}>
                      <Text numberOfLines={1} style={styles.threadName}>
                        {row.studentName}
                      </Text>
                      <View style={styles.threadMeta}>
                        <Text style={styles.threadTime}>{relativeTime(row.lastActivityAt)}</Text>
                        {!showUnread ? <CheckCheck size={18} color="#5d90de" /> : <View style={styles.metaDot} />}
                      </View>
                    </View>

                    <Text numberOfLines={1} style={styles.threadListing}>
                      {row.listingTitle}
                    </Text>

                    <View style={styles.threadPreviewRow}>
                      <Text numberOfLines={1} style={styles.threadPreview}>
                        {row.preview}
                      </Text>
                      {showUnread ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{row.unreadCount}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8f5ff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundOrb: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.56,
  },
  backgroundOrbLeft: {
    width: 230,
    height: 230,
    left: -110,
    top: 30,
    backgroundColor: "#efeaff",
    shadowColor: "#b79bff",
    shadowOpacity: 0.2,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  backgroundOrbRight: {
    width: 260,
    height: 260,
    right: -120,
    bottom: 140,
    backgroundColor: "#ffe4ef",
    shadowColor: "#ff6ea8",
    shadowOpacity: 0.16,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 0 },
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 150,
    gap: 16,
  },
  heroCard: {
    backgroundColor: "rgba(255,255,255,0.88)",
    borderRadius: 34,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: "#ebe7fb",
    shadowColor: "#c9c0ea",
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  h1: {
    color: "#1f2f68",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  sub: {
    marginTop: 8,
    color: "#616d9a",
    fontSize: 14,
    fontWeight: "700",
  },
  menuBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#ece8fa",
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    alignItems: "center",
    gap: 12,
    paddingRight: 8,
  },
  filterChip: {
    minHeight: 50,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "#fbfbff",
    borderWidth: 1,
    borderColor: "#e4e1f1",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterChipBlue: {
    backgroundColor: "#eef1ff",
    borderColor: "#e4e7fb",
  },
  filterChipPink: {
    backgroundColor: "#fff0f6",
    borderColor: "#ffd7e6",
  },
  filterChipSoft: {
    backgroundColor: "#fbfbff",
  },
  filterChipText: {
    color: "#4b567f",
    fontSize: 14,
    fontWeight: "800",
  },
  filterChipTextBlue: {
    color: "#22408b",
  },
  filterChipTextPink: {
    color: "#d11b6f",
  },
  countBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ff0f64",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  countBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#e7e4f6",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  searchInput: {
    flex: 1,
    color: "#23356d",
    fontSize: 16,
    fontWeight: "700",
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fbfbff",
    borderWidth: 1,
    borderColor: "#ebe7fb",
    alignItems: "center",
    justifyContent: "center",
  },
  errBox: {
    borderWidth: 1,
    borderColor: "#ffd2e5",
    backgroundColor: "#fff1f7",
    borderRadius: 20,
    padding: 12,
  },
  errText: {
    color: "#b0003a",
    fontWeight: "900",
  },
  threadSheet: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 36,
    borderWidth: 1,
    borderColor: "#ebe7fb",
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: "#c9c0ea",
    shadowOpacity: 0.22,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  emptyState: {
    paddingHorizontal: 14,
    paddingVertical: 34,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: "#1f2f68",
    fontSize: 18,
    fontWeight: "900",
  },
  emptyText: {
    color: "#61709d",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
  },
  threadDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#efebf9",
  },
  avatarShell: {
    position: "relative",
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 22,
  },
  avatarFallback: {
    backgroundColor: "#dde8ff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#214088",
    fontSize: 20,
    fontWeight: "900",
  },
  avatarBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  threadContent: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  threadTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  threadName: {
    flex: 1,
    color: "#1f2f68",
    fontSize: 17,
    fontWeight: "900",
  },
  threadMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  threadTime: {
    color: "#5d678d",
    fontSize: 13,
    fontWeight: "700",
  },
  metaDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#d7d6ea",
  },
  threadListing: {
    color: "#56658f",
    fontSize: 14,
    fontWeight: "700",
  },
  threadPreviewRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  threadPreview: {
    flex: 1,
    color: "#555f83",
    fontSize: 15,
    fontWeight: "600",
  },
  unreadBadge: {
    minWidth: 38,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ff0f64",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  unreadBadgeText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
});
