import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, ImagePlus, SendHorizonal } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import SoftPageGlow from "@/components/SoftPageGlow";
import { useSellerWorkspace } from "@/components/seller/useSellerWorkspace";
import { listVendorMessages, sendVendorMessage } from "@/lib/newApp/vendorMessages";
import type { VendorMessageRow } from "@/lib/newApp/types";
import { enqueueVendorMessage, getPendingVendorMessages } from "@/lib/mutationOutbox";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { supabaseNewApp } from "@/lib/supabaseNewApp";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getUploadFileMeta(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const mime = asset.mimeType || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  return {
    name: `vendor-chat-${Date.now()}.${ext === "heic" || ext === "heif" ? "jpg" : ext}`,
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
  form.append("folder", "eya/vendor-chat");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Image upload failed.");
  return json.secure_url as string;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function SellerMessagesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const { workspace } = useSellerWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<VendorMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = React.useRef<ScrollView | null>(null);

  const syncMessagesWithPending = async (conversationId: string, liveRows: VendorMessageRow[]) => {
    const pending = await getPendingVendorMessages(conversationId);
    const merged = [...liveRows];
    for (const pendingRow of pending) {
      if (!merged.some((row) => row.id === pendingRow.id)) merged.push(pendingRow);
    }
    merged.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    setMessages(merged);
  };

  const selectedConversation = useMemo(
    () => workspace.conversations.find((thread) => thread.id === selectedId) ?? workspace.conversations[0] ?? null,
    [selectedId, workspace.conversations],
  );

  useEffect(() => {
    if (!selectedConversation) {
      setMessages([]);
      return;
    }

    let active = true;
    const run = async () => {
      const rows = await listVendorMessages(selectedConversation.id).catch(() => []);
      if (active) await syncMessagesWithPending(selectedConversation.id, rows);
    };
    void run();
    setSelectedId(selectedConversation.id);

    const channel = supabaseNewApp
      .channel(`vendor-chat-${selectedConversation.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_messages", filter: `conversation_id=eq.${selectedConversation.id}` }, async () => {
        const rows = await listVendorMessages(selectedConversation.id).catch(() => []);
        if (active) await syncMessagesWithPending(selectedConversation.id, rows);
      })
      .subscribe();

    return () => {
      active = false;
      supabaseNewApp.removeChannel(channel);
    };
  }, [selectedConversation?.id]);

  const sendText = async () => {
    if (!user || !selectedConversation || !draft.trim()) return;

    if (!isOnline) {
      const queued = await enqueueVendorMessage({
        ownerUserId: user.id,
        conversationId: selectedConversation.id,
        senderId: user.id,
        receiverId: selectedConversation.customerId,
        senderRole: "vendor",
        receiverRole: "customer",
        content: draft.trim(),
        messageType: "text",
      });
      setMessages((current) => [
        ...current,
        {
          id: `local-message:${queued.id}`,
          conversation_id: selectedConversation.id,
          sender_id: user.id,
          receiver_id: selectedConversation.customerId,
          sender_role: "vendor",
          receiver_role: "customer",
          content: draft.trim(),
          image_url: null,
          message_type: "text",
          created_at: new Date(queued.queuedAt).toISOString(),
        },
      ]);
      setDraft("");
      return;
    }

    setSending(true);
    try {
      const row = await sendVendorMessage({
        conversationId: selectedConversation.id,
        senderId: user.id,
        receiverId: selectedConversation.customerId,
        senderRole: "vendor",
        receiverRole: "customer",
        content: draft.trim(),
        messageType: "text",
      });
      setMessages((current) => [...current, row]);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  const sendImage = async () => {
    if (!user || !selectedConversation) return;
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
        conversationId: selectedConversation.id,
        senderId: user.id,
        receiverId: selectedConversation.customerId,
        senderRole: "vendor",
        receiverRole: "customer",
        imageUrl,
        messageType: "image",
      });
      setMessages((current) => [...current, row]);
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow variant="account" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 12}
      >
      <ScrollView
        ref={scrollRef as any}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ChevronLeft size={22} color="#102a54" />
          </Pressable>
          <Text style={styles.title}>Messages</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.threadList}>
              {workspace.conversations.length ? (
                workspace.conversations.map((thread) => {
                  const active = selectedConversation?.id === thread.id;
                  return (
                    <Pressable key={thread.id} style={[styles.threadCard, active && styles.threadCardActive]} onPress={() => setSelectedId(thread.id)}>
                      <View style={[styles.avatar, { backgroundColor: thread.accent }]}>
                        <Text style={styles.avatarText}>{initials(thread.name)}</Text>
                      </View>
                      <View style={styles.threadMeta}>
                        <View style={styles.threadTopRow}>
                          <Text style={styles.threadName}>{thread.name}</Text>
                          <Text style={styles.threadTime}>{thread.timeLabel}</Text>
                        </View>
                        {thread.subject ? <Text numberOfLines={1} style={styles.threadSubject}>{thread.subject}</Text> : null}
                        <Text style={styles.threadInfo}>{thread.phone ?? thread.campus ?? thread.area ?? "Customer details pending"}</Text>
                        <Text numberOfLines={1} style={styles.threadPreview}>{thread.preview}</Text>
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No customer messages yet</Text>
                  <Text style={styles.emptySub}>When customers message your shop, their conversations will appear here.</Text>
                </View>
              )}
        </View>

        {selectedConversation ? (
          <View style={styles.chatCard}>
            <Text style={styles.chatTitle}>{selectedConversation.name}</Text>
            <Text style={styles.chatSub}>
              {selectedConversation.subject || [selectedConversation.phone, selectedConversation.campus, selectedConversation.area].filter(Boolean).join(" | ") || "Customer profile details"}
            </Text>
            {selectedConversation.subject ? (
              <Text style={styles.chatTopicNote}>
                {[selectedConversation.phone, selectedConversation.campus, selectedConversation.area].filter(Boolean).join(" | ") || "Customer profile details"}
              </Text>
            ) : null}
            <View
              style={styles.messageList}
              onLayout={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map((message) => {
                const mine = message.sender_role === "vendor";
                return (
                  <View key={message.id} style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowOther]}>
                    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                      {message.message_type === "image" && message.image_url ? (
                        <Image source={{ uri: message.image_url }} style={styles.chatImage} />
                      ) : (
                        <Text style={[styles.bubbleText, mine ? styles.bubbleTextMine : styles.bubbleTextOther]}>{message.content}</Text>
                      )}
                      <Text style={[styles.timeText, mine ? styles.timeTextMine : styles.timeTextOther]}>{fmtTime(message.created_at)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.composer}>
              <Pressable style={styles.iconBtn} onPress={sendImage} disabled={sending}>
                <ImagePlus size={18} color="#102a54" />
              </Pressable>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message..."
                placeholderTextColor="#98a3bd"
                style={styles.input}
                onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120)}
              />
              <Pressable style={styles.sendBtn} onPress={sendText} disabled={sending}>
                <SendHorizonal size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f1fb" },
  flex: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 18, paddingBottom: 42, gap: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  title: { color: "#102a54", fontSize: 26, fontWeight: "900" },
  headerSpacer: { width: 42, height: 42 },
  threadList: { gap: 12 },
  threadCard: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 14,
  },
  threadCardActive: { borderColor: "#cfdcff", backgroundColor: "#f8fbff" },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "900" },
  threadMeta: { flex: 1, gap: 4 },
  threadTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  threadName: { color: "#102a54", fontWeight: "900", fontSize: 18 },
  threadTime: { color: "#8895b3", fontWeight: "800", fontSize: 12 },
  threadSubject: { color: "#102a54", fontWeight: "800", fontSize: 13 },
  threadInfo: { color: "#8895b3", fontWeight: "700", fontSize: 12 },
  threadPreview: { color: "#6d7a99", fontWeight: "700", fontSize: 14 },
  emptyCard: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 18,
    gap: 6,
  },
  emptyTitle: { color: "#102a54", fontWeight: "900", fontSize: 18 },
  emptySub: { color: "#6d7a99", fontWeight: "700", fontSize: 14, lineHeight: 20 },
  chatCard: {
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "#ece9fb",
    padding: 16,
    gap: 14,
  },
  chatTitle: { color: "#102a54", fontWeight: "900", fontSize: 20 },
  chatSub: { color: "#7a87a5", fontWeight: "700", fontSize: 13, marginTop: -8 },
  chatTopicNote: { color: "#8b97b4", fontWeight: "700", fontSize: 12, marginTop: -10 },
  messageList: { gap: 10 },
  bubbleRow: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10 },
  bubbleMine: { backgroundColor: "#102a54" },
  bubbleOther: { backgroundColor: "#f5f7fe", borderWidth: 1, borderColor: "#e3e8f6" },
  bubbleText: { fontSize: 14, fontWeight: "700" },
  bubbleTextMine: { color: "#fff" },
  bubbleTextOther: { color: "#102a54" },
  timeText: { marginTop: 6, fontSize: 10, fontWeight: "700" },
  timeTextMine: { color: "rgba(255,255,255,0.8)" },
  timeTextOther: { color: "#8a95b2" },
  chatImage: { width: 220, height: 180, borderRadius: 14 },
  composer: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    borderRadius: 22,
    backgroundColor: "#f6f7fd",
    borderWidth: 1,
    borderColor: "#e6eaf7",
    padding: 10,
  },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  input: { flex: 1, color: "#102a54", fontWeight: "700", paddingHorizontal: 6 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#102a54", alignItems: "center", justifyContent: "center" },
});
