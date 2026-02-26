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
import { ArrowLeft, ImagePlus, Send } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import TopNav from "@/components/TopNav";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type EnquiryRow = {
  id: string;
  status: "new" | "read" | "closed" | string;
  student_id: string;
  listings: { title: string }[] | { title: string } | null;
};

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

function getUploadFileMeta(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const mime = asset.mimeType || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
  return {
    name: `chat-${Date.now()}.${ext === "heic" || ext === "heif" ? "jpg" : ext}`,
    type: mime,
    ext,
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

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Image upload failed.");
  return json.secure_url as string;
}

export default function LandlordEnquiryChatClient() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ enquiryId?: string }>();
  const enquiryId = typeof params.enquiryId === "string" ? params.enquiryId : null;

  const [enquiry, setEnquiry] = useState<EnquiryRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView | null>(null);
  const isClosed = useMemo(() => enquiry?.status === "closed", [enquiry?.status]);

  const loadAll = async () => {
    if (!user || !enquiryId) return;
    setLoading(true);
    setErr(null);

    const { data: enquiryData, error: enquiryErr } = await supabase
      .from("enquiries")
      .select(
        `
        id,
        status,
        student_id,
        listings:listing_id ( title )
      `,
      )
      .eq("id", enquiryId)
      .eq("landlord_id", user.id)
      .maybeSingle();

    if (enquiryErr || !enquiryData) {
      router.replace("/(landlord)/(tabs)/enquiries");
      return;
    }

    const castEnquiry = enquiryData as unknown as EnquiryRow;
    setEnquiry(castEnquiry);

    if (castEnquiry.status === "new") {
      await supabase.from("enquiries").update({ status: "read" }).eq("id", castEnquiry.id).eq("landlord_id", user.id);
      setEnquiry((prev) => (prev ? { ...prev, status: "read" } : prev));
    }

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
    loadAll();
  }, [user?.id, enquiryId]);

  useEffect(() => {
    if (!user || !enquiryId) return;

    const channel = supabase
      .channel(`landlord-enquiry-${enquiryId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `enquiry_id=eq.${enquiryId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
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
    const clean = text.trim();
    if (!clean) return;

    setSending(true);
    setErr(null);

    const { data, error } = await supabase
      .from("messages")
      .insert({
        enquiry_id: enquiry.id,
        sender_id: user.id,
        receiver_id: enquiry.student_id,
        sender_role: "landlord",
        receiver_role: "student",
        message_type: "text",
        content: clean,
        image_url: null,
      })
      .select("id,enquiry_id,sender_id,receiver_id,sender_role,receiver_role,content,message_type,image_url,created_at")
      .single();

    setSending(false);
    if (error) {
      setErr(error.message);
      return;
    }
    if (data) {
      setMessages((prev) => (prev.some((m) => m.id === (data as MessageRow).id) ? prev : [...prev, data as MessageRow]));
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
    }
    setText("");
  };

  const pickAndSendImage = async () => {
    if (!user || !enquiry || isClosed) return;

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
    setErr(null);
    try {
      const url = await uploadChatImageExpo(asset);
      const { data, error } = await supabase
        .from("messages")
        .insert({
          enquiry_id: enquiry.id,
          sender_id: user.id,
          receiver_id: enquiry.student_id,
          sender_role: "landlord",
          receiver_role: "student",
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
    } catch (e: any) {
      const msg = String(e?.message ?? "Image upload failed.");
      if (msg.toLowerCase().includes("heic")) {
        Alert.alert("Image format not supported", "Please choose a JPG or PNG image. On iPhone, try a screenshot or camera setting 'Most Compatible'.");
      } else {
        setErr(msg);
        Alert.alert("Upload failed", msg);
      }
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <TopNav title="Enquiry chat" />
        <View style={styles.center}><ActivityIndicator size="large" color="#ff0f64" /></View>
      </SafeAreaView>
    );
  }

  if (!enquiry) return null;

  const listingTitle = Array.isArray((enquiry as any).listings)
    ? (enquiry as any).listings[0]?.title ?? "Listing"
    : (enquiry as any)?.listings?.title ?? "Listing";

  return (
    <SafeAreaView style={styles.root}>
      <TopNav title="Enquiry chat" />
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/(landlord)/(tabs)/enquiries")} style={styles.backBtn}>
          <ArrowLeft size={18} color="#0e2756" />
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.smallLabel}>Enquiry about</Text>
          <Text numberOfLines={1} style={styles.title}>{listingTitle}</Text>
          <Text style={styles.sub}>Status: <Text style={{ fontWeight: "900" }}>{enquiry.status}</Text>{isClosed ? " - Chat closed" : ""}</Text>
        </View>
      </View>

      {err ? (
        <View style={styles.errorWrap}>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{err}</Text>
          </View>
        </View>
      ) : null}

      <ScrollView ref={scrollRef as any} contentContainerStyle={styles.chat}>
        {messages.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No messages yet.</Text>
          </View>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === "landlord";
            const showImage = (m.message_type === "image" || (!!m.image_url && !m.content)) && !!m.image_url;
            return (
              <View key={m.id} style={[styles.bubbleRow, mine ? { justifyContent: "flex-end" } : { justifyContent: "flex-start" }]}>
                <View style={[styles.bubble, mine ? styles.mine : styles.other]}>
                  {showImage ? <Image source={{ uri: m.image_url as string }} style={styles.chatImage} resizeMode="cover" /> : null}
                  {m.content ? (
                    <Text style={[styles.msg, mine ? { color: "#fff" } : { color: "#0e2756" }]}>{m.content}</Text>
                  ) : null}
                  <Text style={[styles.time, mine ? { color: "rgba(255,255,255,0.8)", textAlign: "right" } : null]}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.inputBar}>
          <Pressable style={styles.photoBtn} onPress={pickAndSendImage} disabled={sending || isClosed}>
            <ImagePlus size={16} color="#0e2756" />
            <Text style={styles.photoBtnText}>{sending ? "..." : "Photo"}</Text>
          </Pressable>

          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder={isClosed ? "Chat closed" : "Reply to student..."}
            placeholderTextColor="#9aa3bd"
            editable={!isClosed}
          />

          <Pressable style={[styles.sendBtn, (!text.trim() || sending || isClosed) && { opacity: 0.6 }]} onPress={sendText} disabled={!text.trim() || sending || isClosed}>
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
  header: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e7eaf6", padding: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  backBtn: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: "#e7eaf6", backgroundColor: "#f6f7fb", alignItems: "center", justifyContent: "center" },
  smallLabel: { color: "#5f6b85", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  title: { color: "#0e2756", fontWeight: "900", fontSize: 14, marginTop: 2 },
  sub: { color: "#5f6b85", fontWeight: "700", marginTop: 3 },
  errorWrap: { paddingHorizontal: 12, paddingTop: 10, backgroundColor: "#f6f7fb" },
  errorBox: { borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", borderRadius: 14, padding: 10 },
  errorText: { color: "#b0003a", fontWeight: "800" },
  chat: { padding: 14, gap: 10, paddingBottom: 20 },
  emptyCard: { backgroundColor: "#fff", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "#eef1fb" },
  emptyText: { color: "#5f6b85", fontWeight: "700" },
  bubbleRow: { flexDirection: "row" },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 10 },
  mine: { backgroundColor: "#0e2756" },
  other: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e1e4ef" },
  msg: { fontWeight: "700" },
  time: { marginTop: 6, fontSize: 10, fontWeight: "800", color: "#9aa3bd" },
  chatImage: { width: 240, height: 220, borderRadius: 14, marginBottom: 8 },
  inputBar: { backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e7eaf6", padding: 10, flexDirection: "row", gap: 10, alignItems: "center" },
  iconBtn: { width: 44, height: 44, borderRadius: 999, borderWidth: 1, borderColor: "#e7eaf6", alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  photoBtn: { borderRadius: 14, borderWidth: 1, borderColor: "#e7eaf6", backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  photoBtnText: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  textInput: { flex: 1, backgroundColor: "#f6f7fb", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 12, fontWeight: "700", color: "#0e2756" },
  sendBtn: { backgroundColor: "#ff0f64", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12 },
});
