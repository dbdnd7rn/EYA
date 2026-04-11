import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, CalendarClock, Heart, ImagePlus, MapPin, Send } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/providers/AuthProvider";
import { getVendorById } from "@/lib/newApp/vendors";
import { getOrCreateVendorConversation, listVendorMessages, sendVendorMessage } from "@/lib/newApp/vendorMessages";
import type { SalesChannel, VendorMessageRow, VendorRow } from "@/lib/newApp/types";
import { supabaseNewApp } from "@/lib/supabaseNewApp";
import { enqueueVendorMessage, getPendingVendorMessages } from "@/lib/mutationOutbox";
import { useNetwork } from "@/providers/NetworkProvider";
import { addMarketRequestMessage, ensureMarketInterest, setMarketRequestStatus } from "@/lib/marketInterest";

function initials(name?: string | null) {
  const parts = (name || "Shop").split(" ").filter(Boolean);
  return `${parts[0]?.[0] ?? "S"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getUploadFileMeta(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const mime = asset.mimeType || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  return {
    name: `student-vendor-chat-${Date.now()}.${ext === "heic" || ext === "heif" ? "jpg" : ext}`,
    type: mime,
  };
}

async function uploadChatImage(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) throw new Error("Cloudinary env vars missing.");

  const meta = getUploadFileMeta(asset);
  const form = new FormData();
  form.append("file", { uri: asset.uri, name: meta.name, type: meta.type } as any);
  form.append("upload_preset", uploadPreset);
  form.append("folder", "pamaketi/vendor-chat");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Image upload failed.");
  return json.secure_url as string;
}

export default function StudentVendorChatPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const params = useLocalSearchParams<{ vendorId?: string; channel?: string; message?: string; itemId?: string; subject?: string; requestId?: string; itemName?: string; image?: string; price?: string; category?: string; vendorName?: string }>();
  const vendorId = typeof params.vendorId === "string" ? params.vendorId : "";
  const channel = (params.channel === "food" ? "food" : "market") as SalesChannel;
  const initialMessage = typeof params.message === "string" ? params.message : "";
  const itemId = typeof params.itemId === "string" ? params.itemId : "";
  const initialSubject = typeof params.subject === "string" ? params.subject : "";
  const requestId = typeof params.requestId === "string" ? params.requestId : "";
  const itemName = typeof params.itemName === "string" ? params.itemName : "";
  const itemImage = typeof params.image === "string" ? params.image : "";
  const itemPrice = Number(typeof params.price === "string" ? params.price : 0);
  const itemCategory = typeof params.category === "string" ? params.category : "Essentials";
  const vendorName = typeof params.vendorName === "string" ? params.vendorName : "";
  const [vendor, setVendor] = useState<VendorRow | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationSubject, setConversationSubject] = useState("");
  const [messages, setMessages] = useState<VendorMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const quickPrompts = [
    "Is this still available?",
    "Where are you located?",
    "Can I pick it up today?",
    "Is the price negotiable?",
  ];

  const syncMessagesWithPending = async (conversationIdToSync: string, liveRows: VendorMessageRow[]) => {
    const pending = await getPendingVendorMessages(conversationIdToSync);
    const merged = [...liveRows];
    for (const pendingRow of pending) {
      if (!merged.some((row) => row.id === pendingRow.id)) merged.push(pendingRow);
    }
    merged.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    setMessages(merged);
  };

  useEffect(() => {
    if (!user || !vendorId) return;
    let active = true;

    const run = async () => {
      const [vendorRow, conversation] = await Promise.all([
        getVendorById(vendorId),
        getOrCreateVendorConversation({
          vendorId,
          customerId: user.id,
          channel,
          catalogItemId: itemId || undefined,
          subject: initialSubject || (channel === "food" ? "Food enquiry" : "Shop enquiry"),
        }),
      ]);
      if (!active) return;
      setVendor(vendorRow);
      setConversationId(conversation.id);
      setConversationSubject(conversation.subject ?? initialSubject);
      const rows = await listVendorMessages(conversation.id).catch(() => []);
      if (active) await syncMessagesWithPending(conversation.id, rows);
    };

    void run();
    return () => {
      active = false;
    };
  }, [channel, initialSubject, itemId, user?.id, vendorId]);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    const channelSub = supabaseNewApp
      .channel(`student-vendor-chat-${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_messages", filter: `conversation_id=eq.${conversationId}` }, async () => {
        const rows = await listVendorMessages(conversationId).catch(() => []);
        if (active) await syncMessagesWithPending(conversationId, rows);
      })
      .subscribe();
    return () => {
      active = false;
      supabaseNewApp.removeChannel(channelSub);
    };
  }, [conversationId]);

  useEffect(() => {
    if (!initialMessage.trim()) return;
    setDraft((current) => (current.trim() ? current : initialMessage));
  }, [initialMessage]);

  const sendText = async () => {
    if (!user || !conversationId || !draft.trim() || !vendor?.owner_id) return;

    if (!isOnline) {
      const queued = await enqueueVendorMessage({
        ownerUserId: user.id,
        conversationId,
        senderId: user.id,
        receiverId: vendor.owner_id,
        senderRole: "customer",
        receiverRole: "vendor",
        content: draft.trim(),
        messageType: "text",
      });
      setMessages((current) => [
        ...current,
        {
          id: `local-message:${queued.id}`,
          conversation_id: conversationId,
          sender_id: user.id,
          receiver_id: vendor.owner_id,
          sender_role: "customer",
          receiver_role: "vendor",
          content: draft.trim(),
          image_url: null,
          message_type: "text",
          created_at: new Date(queued.queuedAt).toISOString(),
        },
      ]);
      setDraft("");
      if (requestId) await addMarketRequestMessage(requestId, draft.trim());
      return;
    }

    setSending(true);
    try {
      const row = await sendVendorMessage({
        conversationId,
        senderId: user.id,
        receiverId: vendor.owner_id,
        senderRole: "customer",
        receiverRole: "vendor",
        content: draft.trim(),
        messageType: "text",
      });
      setMessages((current) => [...current, row]);
      if (requestId) await addMarketRequestMessage(requestId, draft.trim());
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  const sendImage = async () => {
    if (!user || !conversationId || !vendor?.owner_id) return;
    if (!isOnline) {
      Alert.alert("Offline", "Connect to the internet before sending images.");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.88,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    setSending(true);
    try {
      const imageUrl = await uploadChatImage(asset);
      const row = await sendVendorMessage({
        conversationId,
        senderId: user.id,
        receiverId: vendor.owner_id,
        senderRole: "customer",
        receiverRole: "vendor",
        imageUrl,
        messageType: "image",
      });
      setMessages((current) => [...current, row]);
    } finally {
      setSending(false);
    }
  };

  const title = useMemo(() => vendor?.name || "Shop chat", [vendor?.name]);

  const markInterested = async () => {
    if (!user || !vendorId || !itemId) return;
    const request = await ensureMarketInterest({
      itemId,
      itemName: itemName || conversationSubject || "Item",
      image: itemImage,
      priceMwk: itemPrice,
      category: itemCategory,
      vendorId,
      vendorName: vendorName || title,
      customerId: user.id,
      customerName: user.email?.split("@")[0] || "Student",
      area: vendor?.area ?? "Near campus",
      campus: vendor?.campus ?? "MUST",
    });
    await addMarketRequestMessage(request.id, "Marked as interested");
    router.push({ pathname: "/(student)/requests/[requestId]", params: { requestId: request.id } });
  };

  const arrangePickup = async () => {
    if (!user || !vendorId || !itemId) return;
    const request = await ensureMarketInterest({
      itemId,
      itemName: itemName || conversationSubject || "Item",
      image: itemImage,
      priceMwk: itemPrice,
      category: itemCategory,
      vendorId,
      vendorName: vendorName || title,
      customerId: user.id,
      customerName: user.email?.split("@")[0] || "Student",
      area: vendor?.area ?? "Near campus",
      campus: vendor?.campus ?? "MUST",
    });
    await setMarketRequestStatus(request.id, "arranged", {
      pickupTimeLabel: "Tomorrow at 11:00 AM",
      pickupLocation: "Campus Library Entrance",
      pickupNote: "Simple meetup near the main entrance.",
      lastMessage: "Meetup scheduled",
    });
    router.push({ pathname: "/(student)/requests/[requestId]", params: { requestId: request.id } });
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={18} color="#0e2756" />
        </Pressable>

        <View style={styles.avatarWrap}>
          <Text style={styles.avatarText}>{initials(title)}</Text>
        </View>

        <View style={styles.headerTextWrap}>
          <Text numberOfLines={1} style={styles.hostelName}>{title}</Text>
          <Text style={styles.locText}>{conversationSubject || vendor?.area || vendor?.campus || "Campus seller"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.chat}>
        {itemId ? (
          <View style={styles.summaryCard}>
            {itemImage ? <Image source={{ uri: itemImage }} style={styles.summaryImage} /> : null}
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle}>{itemName || conversationSubject || "Interested item"}</Text>
              <Text style={styles.summaryPrice}>K{itemPrice.toLocaleString("en-MW")}</Text>
              <Text style={styles.summaryMeta}>{itemCategory} • {vendorName || title}</Text>
            </View>
            <Pressable
              style={styles.summaryBtn}
              onPress={() => router.push({ pathname: "/(student)/market/[id]", params: { id: itemId } })}
            >
              <Text style={styles.summaryBtnText}>View item</Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptRow}>
          {quickPrompts.map((prompt) => (
            <Pressable key={prompt} style={styles.promptChip} onPress={() => setDraft(prompt)}>
              <Text style={styles.promptChipText}>{prompt}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {messages.map((m) => {
          const mine = m.sender_role === "customer";
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

        {itemId ? (
          <View style={styles.flowRow}>
            <Pressable style={styles.flowBtn} onPress={markInterested}>
              <Heart size={16} color="#0f6d80" />
              <Text style={styles.flowBtnText}>Mark as interested</Text>
            </Pressable>
            <Pressable style={styles.flowBtnWarm} onPress={arrangePickup}>
              <MapPin size={16} color="#102a54" />
              <Text style={styles.flowBtnWarmText}>Arrange pickup</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.inputBar}>
        <Pressable style={styles.iconBtn} onPress={sendImage} disabled={sending}>
          <ImagePlus size={18} color="#0e2756" />
        </Pressable>

        <TextInput
          style={styles.textInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message..."
          placeholderTextColor="#9aa3bd"
          onSubmitEditing={sendText}
          returnKeyType="send"
        />

        <Pressable style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={sendText} disabled={sending}>
          <Send size={16} color="#fff" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
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
  backBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#f6f7fb", borderWidth: 1, borderColor: "#e7eaf6", alignItems: "center", justifyContent: "center" },
  avatarWrap: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#0e2756", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "900" },
  headerTextWrap: { flex: 1, minWidth: 0 },
  hostelName: { color: "#0e2756", fontWeight: "900", fontSize: 15 },
  locText: { color: "#5f6b85", fontWeight: "600", fontSize: 12 },
  chat: { padding: 14, gap: 10, paddingBottom: 20 },
  summaryCard: {
    borderRadius: 24,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e6ebf6",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  summaryImage: { width: 84, height: 84, borderRadius: 18, backgroundColor: "#dbe6f3" },
  summaryCopy: { flex: 1, gap: 4 },
  summaryTitle: { color: "#0e2756", fontWeight: "900", fontSize: 16 },
  summaryPrice: { color: "#0e2756", fontWeight: "900", fontSize: 18 },
  summaryMeta: { color: "#6d7892", fontWeight: "700", fontSize: 12 },
  summaryBtn: { borderRadius: 999, backgroundColor: "#0f6d80", paddingHorizontal: 14, paddingVertical: 10 },
  summaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  promptRow: { gap: 8, paddingRight: 6 },
  promptChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e3e8f5",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  promptChipText: { color: "#55627d", fontWeight: "700", fontSize: 13 },
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
  flowRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  flowBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#b9d2db",
    backgroundColor: "#f5fbfd",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flowBtnText: { color: "#0f6d80", fontWeight: "900", fontSize: 13 },
  flowBtnWarm: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f0dcaa",
    backgroundColor: "#fff7df",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flowBtnWarmText: { color: "#102a54", fontWeight: "900", fontSize: 13 },
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
  iconBtn: { width: 44, height: 44, borderRadius: 999, borderWidth: 1, borderColor: "#e7eaf6", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  textInput: { flex: 1, backgroundColor: "#f6f7fb", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 12, color: "#0e2756", fontWeight: "600" },
  sendBtn: { backgroundColor: "#ff0f64", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
});
