import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";
import { supabase } from "@/lib/supabase";

type SupportType = "report_listing" | "message_us" | "suggestion";

export default function SupportPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ listing_id?: string; type?: string }>();

  const [type, setType] = React.useState<SupportType>(
    params.type === "report_listing" || params.type === "suggestion" || params.type === "message_us"
      ? params.type
      : "message_us",
  );
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const listingId = params.listing_id;

  const submit = async () => {
    setMsg(null);
    setSending(true);

    try {
      const { data: u, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!u.user) {
        setMsg("Please login first to submit.");
        return;
      }
      if (!message.trim()) {
        setMsg("Please write a message.");
        return;
      }

      const { error } = await supabase.from("support_tickets").insert({
        user_id: u.user.id,
        type,
        listing_id: listingId ? String(listingId) : null,
        subject: subject.trim() || null,
        message: message.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        name: name.trim() || null,
        status: "new",
      });

      if (error) throw error;
      setMsg("Submitted. Thank you, we'll review it.");
      setTimeout(() => router.back(), 700);
    } catch (e: any) {
      setMsg(e?.message || "Failed to submit. Try again.");
    } finally {
      setSending(false);
    }
  };

  const input = {
    borderRadius: 14,
    backgroundColor: "#f6f7fb",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#e1e4ef",
  } as const;

  return (
    <PublicPageShell title="Support">
      <View style={{ gap: 10 }}>
        {!!listingId && (
          <View style={{ borderRadius: 12, backgroundColor: "#f6f7fb", padding: 12, borderWidth: 1, borderColor: "#e1e4ef" }}>
            <Text style={{ color: "#0e2756", fontSize: 13, fontWeight: "700" }}>Listing ID attached</Text>
            <Text style={{ color: "#5f6b85", fontSize: 12 }}>{String(listingId)}</Text>
          </View>
        )}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            { k: "message_us", label: "Message us" },
            { k: "report_listing", label: "Report listing" },
            { k: "suggestion", label: "Suggestion" },
          ].map((option) => (
            <Pressable
              key={option.k}
              onPress={() => setType(option.k as SupportType)}
              style={{
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: type === option.k ? "#ff0f64" : "#f6f7fb",
                borderWidth: 1,
                borderColor: type === option.k ? "#ff0f64" : "#e1e4ef",
              }}
            >
              <Text style={{ color: type === option.k ? "#fff" : "#0e2756", fontWeight: "700", fontSize: 12 }}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <TextInput placeholder="Name (optional)" placeholderTextColor="#9ba3c4" value={name} onChangeText={setName} style={input} />
        <TextInput placeholder="Subject (optional)" placeholderTextColor="#9ba3c4" value={subject} onChangeText={setSubject} style={input} />
        <TextInput placeholder="Email (optional)" placeholderTextColor="#9ba3c4" value={email} onChangeText={setEmail} style={input} />
        <TextInput placeholder="Phone (optional)" placeholderTextColor="#9ba3c4" value={phone} onChangeText={setPhone} style={input} />
        <TextInput
          placeholder="Write your message..."
          placeholderTextColor="#9ba3c4"
          value={message}
          onChangeText={setMessage}
          multiline
          style={[input, { minHeight: 120, textAlignVertical: "top" }]}
        />

        {msg ? (
          <View style={{ borderRadius: 12, backgroundColor: "#fff0f6", padding: 10, borderWidth: 1, borderColor: "#ffd4e3" }}>
            <Text style={{ color: "#b0003a", fontSize: 13 }}>{msg}</Text>
          </View>
        ) : null}

        <Pressable onPress={submit} disabled={sending} style={{ borderRadius: 14, backgroundColor: "#0e2756", paddingVertical: 12, alignItems: "center", opacity: sending ? 0.7 : 1 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{sending ? "Submitting..." : "Submit"}</Text>
        </Pressable>
      </View>
    </PublicPageShell>
  );
}
