/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, ImagePlus, MapPin, Send } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import TopNav from "@/components/TopNav";
import { encodeCallSignal, newCallId, parseCallSignal } from "@/lib/callSignals";
import { goBackOrFallback } from "@/lib/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type EnquiryStatus = "new" | "replied" | "closed";

type MessageRow = {
  id: string;
  enquiry_id: string;
  sender_id: string | null;
  receiver_id: string | null;
  sender_role: "student" | "landlord";
  receiver_role: "student" | "landlord";
  content: string | null;
  message_type: "text" | "image" | null;
  image_url: string | null;
  created_at: string;
};

type ListingMini = {
  id: string;
  title: string | null;
  area: string | null;
  city: string | null;
  campus: string | null;
  image_urls: string[] | null;
  contact_phone?: string | null;
};

type EnquiryJoinDb = {
  id: string;
  status: EnquiryStatus | null;
  landlord_id: string | null;
  listing: ListingMini[] | ListingMini | null;
};

type EnquiryJoin = {
  id: string;
  status: EnquiryStatus;
  landlord_id: string | null;
  listing: ListingMini | null;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtLastSeen(iso?: string | null, nowMs?: number) {
  if (!iso) return "No activity yet";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "No activity yet";
  const diffSec = Math.max(0, Math.floor(((nowMs ?? Date.now()) - ts) / 1000));
  if (diffSec < 60) return `Last seen ${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `Last seen ${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Last seen ${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `Last seen ${day}d ago`;
}

function initials(name?: string | null) {
  const s = (name || "").trim();
  if (!s) return "H";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "H";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

function getUploadFileMeta(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const mime = asset.mimeType || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  return {
    name: `chat-${Date.now()}.${ext === "heic" || ext === "heif" ? "jpg" : ext}`,
    type: mime,
  };
}

async function uploadChatImageExpo(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary env vars missing (CLOUD_NAME / UPLOAD_PRESET).");
  }

  const meta = getUploadFileMeta(asset);
  const form = new FormData();
  form.append("file", { uri: asset.uri, name: meta.name, type: meta.type } as any);
  form.append("upload_preset", uploadPreset);
  form.append("folder", "palevel/chat");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Image upload failed.");
  return json.secure_url as string;
}

export default function StudentEnquiryChat() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ enquiryId?: string }>();
  const enquiryId = typeof params.enquiryId === "string" ? params.enquiryId : null;

  const [enquiry, setEnquiry] = useState<EnquiryJoin | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  const scrollRef = useRef<ScrollView | null>(null);

  const hostelName = useMemo(() => enquiry?.listing?.title?.trim() || "Hostel", [enquiry]);
  const location = useMemo(() => {
    const l = enquiry?.listing;
    return [l?.area, l?.city, l?.campus].filter(Boolean).join(" • ") || "Location not provided";
  }, [enquiry]);
  const avatar = enquiry?.listing?.image_urls?.[0] || null;
  const isClosed = enquiry?.status === "closed";
  const displayMessages = useMemo(
    () => messages.filter((m) => !parseCallSignal(m.content)),
    [messages],
  );
  const callFlow = useMemo(() => {
    const signals = messages
      .map((m) => ({ m, signal: parseCallSignal(m.content) }))
      .filter((x) => !!x.signal) as { m: MessageRow; signal: { kind: "invite" | "accept" | "decline"; callId: string } }[];

    const latestInvite = [...signals].reverse().find((x) => x.signal.kind === "invite");
    if (!latestInvite) return null;

    const inviteTime = new Date(latestInvite.m.created_at).getTime();
    const expired = !Number.isFinite(inviteTime) ? false : nowTick - inviteTime > 120000;
    const response = signals.find(
      (x) =>
        x.signal.callId === latestInvite.signal.callId &&
        x.signal.kind !== "invite" &&
        new Date(x.m.created_at).getTime() >= inviteTime,
    );

    return {
      callId: latestInvite.signal.callId,
      invitedByMe: latestInvite.m.sender_id === user?.id,
      expired,
      responseKind: response?.signal.kind ?? null,
    };
  }, [messages, nowTick, user?.id]);
  const incomingRinging = !!callFlow && !callFlow.invitedByMe && !callFlow.expired && !callFlow.responseKind;
  const outgoingRinging = !!callFlow && callFlow.invitedByMe && !callFlow.expired && !callFlow.responseKind;
  const acceptedByOther = !!callFlow && callFlow.invitedByMe && callFlow.responseKind === "accept";
  const declinedByOther = !!callFlow && callFlow.invitedByMe && callFlow.responseKind === "decline";
  const lastSeenLabel = useMemo(
    () => fmtLastSeen(messages.length ? messages[messages.length - 1].created_at : null, nowTick),
    [messages, nowTick],
  );

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000 * 20);
    return () => clearInterval(t);
  }, []);

  const loadAll = async () => {
    if (!user || !enquiryId) return;

    setLoading(true);

    const { data: enquiryData, error: enquiryErr } = await supabase
      .from("enquiries")
      .select(
        `
        id,
        status,
        landlord_id,
        listing:listing_id (
          id,
          title,
          area,
          city,
          campus,
          image_urls,
          contact_phone
        )
      `,
      )
      .eq("id", enquiryId)
      .eq("student_id", user.id)
      .maybeSingle();

    if (enquiryErr || !enquiryData) {
      router.replace("/(student)/(tabs)/messages");
      return;
    }

    const row = enquiryData as EnquiryJoinDb;
    const listing = Array.isArray(row.listing) ? row.listing[0] ?? null : row.listing ?? null;
    const safeStatus: EnquiryStatus =
      row.status === "new" || row.status === "replied" || row.status === "closed" ? row.status : "new";

    setEnquiry({ id: row.id, status: safeStatus, landlord_id: row.landlord_id ?? null, listing });

    const { data: msgs } = await supabase
      .from("messages")
      .select("id,enquiry_id,sender_id,receiver_id,sender_role,receiver_role,content,message_type,image_url,created_at")
      .eq("enquiry_id", enquiryId)
      .order("created_at", { ascending: true });

    setMessages((msgs ?? []) as MessageRow[]);
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
  };

  useEffect(() => {
    if (!user || !enquiryId) return;
    void loadAll();
  }, [user?.id, enquiryId]);

  useEffect(() => {
    if (!user || !enquiryId) return;

    const channel = supabase
      .channel(`student-enquiry-${enquiryId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `enquiry_id=eq.${enquiryId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, enquiryId]);

  const sendText = async () => {
    if (!user || !enquiry || isClosed) return;
    const studentId = user.id;
    const content = text.trim();
    if (!content) return;

    setSending(true);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        enquiry_id: enquiry.id,
        sender_id: user.id,
        receiver_id: enquiry.landlord_id,
        sender_role: "student",
        receiver_role: "landlord",
        message_type: "text",
        content,
        image_url: null,
      })
      .select("id,enquiry_id,sender_id,receiver_id,sender_role,receiver_role,content,message_type,image_url,created_at")
      .single();
    setSending(false);

    if (error) return;
    if (data) {
      setMessages((prev) => (prev.some((m) => m.id === (data as MessageRow).id) ? prev : [...prev, data as MessageRow]));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
    }
    await supabase.from("enquiries").update({ status: "new" }).eq("id", enquiry.id).eq("student_id", studentId);
    setEnquiry((prev) => (prev ? { ...prev, status: "new" } : prev));
    setText("");
  };

  const pickAndSendImage = async () => {
    if (!user || !enquiry || isClosed) return;
    const studentId = user.id;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return;

    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setSending(true);
    try {
      const url = await uploadChatImageExpo(asset);
      const { data, error } = await supabase
        .from("messages")
        .insert({
          enquiry_id: enquiry.id,
          sender_id: user.id,
          receiver_id: enquiry.landlord_id,
          sender_role: "student",
          receiver_role: "landlord",
          message_type: "image",
          image_url: url,
          content: null,
        })
        .select("id,enquiry_id,sender_id,receiver_id,sender_role,receiver_role,content,message_type,image_url,created_at")
        .single();

      if (error) throw new Error(error.message);
      if (data) {
        setMessages((prev) => (prev.some((m) => m.id === (data as MessageRow).id) ? prev : [...prev, data as MessageRow]));
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
      }
      await supabase.from("enquiries").update({ status: "new" }).eq("id", enquiry.id).eq("student_id", studentId);
      setEnquiry((prev) => (prev ? { ...prev, status: "new" } : prev));
    } catch (e: any) {
      const msg = String(e?.message ?? "Image upload failed.");
      if (msg.toLowerCase().includes("heic")) {
        Alert.alert(
          "Image format not supported",
          "Please choose a JPG or PNG image. On iPhone, try a screenshot or camera setting 'Most Compatible'.",
        );
      } else {
        Alert.alert("Upload failed", msg);
      }
    } finally {
      setSending(false);
    }
  };

  const sendCallSignal = async (kind: "invite" | "accept" | "decline", callId: string) => {
    if (!user || !enquiry) return false;
    const studentId = user.id;
    const { data, error } = await supabase
      .from("messages")
      .insert({
        enquiry_id: enquiry.id,
        sender_id: user?.id ?? null,
        receiver_id: enquiry.landlord_id,
        sender_role: "student",
        receiver_role: "landlord",
        message_type: "text",
        content: encodeCallSignal(kind, callId),
        image_url: null,
      })
      .select("id,enquiry_id,sender_id,receiver_id,sender_role,receiver_role,content,message_type,image_url,created_at")
      .single();

    if (error) {
      Alert.alert("Call error", error.message || "Failed to send call signal.");
      return false;
    }

    if (data) {
      setMessages((prev) => (prev.some((m) => m.id === (data as MessageRow).id) ? prev : [...prev, data as MessageRow]));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
    }
    await supabase.from("enquiries").update({ status: "new" }).eq("id", enquiry.id).eq("student_id", studentId);
    setEnquiry((prev) => (prev ? { ...prev, status: "new" } : prev));
    return true;
  };

  const callNow = async () => {
    if (!enquiry || isClosed) return;
    await sendCallSignal("invite", newCallId());
  };

  const acceptIncomingCall = async () => {
    if (!enquiry || !callFlow) return;
    const ok = await sendCallSignal("accept", callFlow.callId);
    if (ok) router.push({ pathname: "/call/[enquiryId]", params: { enquiryId: enquiry.id } });
  };

  const declineIncomingCall = async () => {
    if (!enquiry || !callFlow) return;
    await sendCallSignal("decline", callFlow.callId);
  };

  const joinAcceptedCall = () => {
    if (!enquiry) return;
    router.push({ pathname: "/call/[enquiryId]", params: { enquiryId: enquiry.id } });
  };

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <TopNav title="Messages" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#ff0f64" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <TopNav title="Messages" />

      <View style={styles.headerBar}>
        <Pressable onPress={() => goBackOrFallback(router, "/(student)/(tabs)/messages")} style={styles.backBtn}>
          <ArrowLeft size={18} color="#0e2756" />
        </Pressable>

        <View style={styles.avatarWrap}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>{initials(hostelName)}</Text>
          )}
        </View>

        <View style={styles.headerTextWrap}>
          <Text numberOfLines={1} style={styles.hostelName}>{hostelName}</Text>
          <View style={styles.locRow}>
            <MapPin size={14} color="#5f6b85" />
            <Text numberOfLines={1} style={styles.locText}>{location}</Text>
          </View>
          {isClosed ? <Text style={styles.closed}>This chat is closed</Text> : null}
        </View>

        <Pressable style={[styles.callBtn, isClosed && { opacity: 0.5 }]} onPress={callNow} disabled={isClosed}>
          <Text style={styles.callBtnText}>Call</Text>
        </Pressable>
      </View>

      <View style={styles.lastSeenBar}>
        <View style={styles.dotOnline} />
        <Text style={styles.lastSeenText}>{lastSeenLabel}</Text>
      </View>

      {incomingRinging ? (
        <View style={styles.callBannerIncoming}>
          <Text style={styles.callBannerTitle}>Incoming call...</Text>
          <View style={styles.callBannerRow}>
            <Pressable style={styles.callAcceptBtn} onPress={acceptIncomingCall}>
              <Text style={styles.callAcceptBtnText}>Accept</Text>
            </Pressable>
            <Pressable style={styles.callDeclineBtn} onPress={declineIncomingCall}>
              <Text style={styles.callDeclineBtnText}>Decline</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {outgoingRinging ? (
        <View style={styles.callBannerOutgoing}>
          <Text style={styles.callBannerOutgoingText}>Calling landlord... ringing</Text>
        </View>
      ) : null}

      {acceptedByOther ? (
        <View style={styles.callBannerOutgoing}>
          <Text style={styles.callBannerOutgoingText}>Call accepted.</Text>
          <Pressable style={styles.joinBtn} onPress={joinAcceptedCall}>
            <Text style={styles.joinBtnText}>Join now</Text>
          </Pressable>
        </View>
      ) : null}

      {declinedByOther ? (
        <View style={styles.callBannerOutgoing}>
          <Text style={styles.callBannerOutgoingText}>Call declined.</Text>
        </View>
      ) : null}

      <ScrollView ref={scrollRef as any} contentContainerStyle={styles.chat}>
        {displayMessages.length === 0 ? (
          <View style={styles.emptyChatCard}>
            <Text style={styles.emptyChatTitle}>No messages yet</Text>
            <Text style={styles.emptyChatSub}>Start the conversation with the landlord.</Text>
          </View>
        ) : null}

        {displayMessages.map((m) => {
          const mine = m.sender_role === "student";
          return (
            <View key={m.id} style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowOther]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                {m.message_type === "image" && m.image_url ? (
                  <Image source={{ uri: m.image_url }} style={styles.chatImage} resizeMode="cover" />
                ) : (
                  <Text style={[styles.msgText, mine ? styles.msgTextMine : styles.msgTextOther]}>{m.content}</Text>
                )}
                <Text style={[styles.time, mine ? styles.timeMine : styles.timeOther]}>{fmtTime(m.created_at)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.inputBar}>
          <Pressable style={styles.iconBtn} onPress={pickAndSendImage} disabled={sending || isClosed}>
            <ImagePlus size={18} color="#0e2756" />
          </Pressable>

          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder={isClosed ? "Chat closed" : "Type a message..."}
            placeholderTextColor="#9aa3bd"
            editable={!isClosed}
            onSubmitEditing={sendText}
            returnKeyType="send"
          />

          <Pressable
            style={[styles.sendBtn, (sending || isClosed) && { opacity: 0.6 }]}
            onPress={sendText}
            disabled={sending || isClosed}
          >
            <Send size={16} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerBar: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e7eaf6",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#f6f7fb",
    borderWidth: 1,
    borderColor: "#e7eaf6",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#0e2756",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarText: { color: "#fff", fontWeight: "900" },
  headerTextWrap: { flex: 1, minWidth: 0 },
  hostelName: { color: "#0e2756", fontWeight: "900", fontSize: 15 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  locText: { color: "#5f6b85", fontWeight: "600", fontSize: 12, flex: 1 },
  closed: { marginTop: 3, color: "#ef4444", fontWeight: "700", fontSize: 12 },
  callBtn: {
    borderWidth: 1,
    borderColor: "#ffd4e3",
    backgroundColor: "#fff0f6",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  callBtnText: { color: "#b0003a", fontWeight: "900", fontSize: 12 },
  lastSeenBar: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e7eaf6",
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dotOnline: { width: 8, height: 8, borderRadius: 99, backgroundColor: "#22c55e" },
  lastSeenText: { color: "#5f6b85", fontWeight: "700", fontSize: 12 },
  callBannerIncoming: {
    backgroundColor: "#fff0f6",
    borderBottomWidth: 1,
    borderBottomColor: "#ffd4e3",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  callBannerTitle: { color: "#b0003a", fontWeight: "900" },
  callBannerRow: { flexDirection: "row", gap: 8 },
  callAcceptBtn: {
    flex: 1,
    backgroundColor: "#0e2756",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  callAcceptBtnText: { color: "#fff", fontWeight: "900" },
  callDeclineBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ffd4e3",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  callDeclineBtnText: { color: "#b0003a", fontWeight: "900" },
  callBannerOutgoing: {
    backgroundColor: "#eef1fb",
    borderBottomWidth: 1,
    borderBottomColor: "#e1e4ef",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  callBannerOutgoingText: { color: "#0e2756", fontWeight: "800", flex: 1 },
  joinBtn: {
    borderRadius: 999,
    backgroundColor: "#ff0f64",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  joinBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  chat: { padding: 14, gap: 10, paddingBottom: 20 },
  emptyChatCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e7eaf6",
    padding: 16,
  },
  emptyChatTitle: { color: "#0e2756", fontWeight: "900", fontSize: 15, textAlign: "center" },
  emptyChatSub: { color: "#5f6b85", fontWeight: "600", fontSize: 12, textAlign: "center", marginTop: 4 },
  bubbleRow: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10 },
  bubbleMine: { backgroundColor: "#ff0f64" },
  bubbleOther: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e1e4ef" },
  msgText: { fontSize: 14, fontWeight: "700" },
  msgTextMine: { color: "#fff" },
  msgTextOther: { color: "#0e2756" },
  time: { marginTop: 6, fontSize: 10, fontWeight: "700" },
  timeMine: { color: "rgba(255,255,255,0.85)", textAlign: "right" },
  timeOther: { color: "#9aa3bd" },
  chatImage: { width: 240, height: 220, borderRadius: 14, marginBottom: 8 },
  inputBar: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e7eaf6",
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e7eaf6",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    flex: 1,
    backgroundColor: "#f6f7fb",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#0e2756",
    fontWeight: "600",
  },
  sendBtn: {
    backgroundColor: "#ff0f64",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
