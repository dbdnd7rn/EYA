import React, { useState } from "react";
import { View, TextInput, Pressable, Text } from "react-native";

export default function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (msg: string) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  const submit = async () => {
    const msg = value.trim();
    if (!msg) return;
    setValue("");
    await onSend(msg);
  };

  return (
    <View style={{ flexDirection: "row", gap: 10, padding: 12, backgroundColor: "#f6f7fb" }}>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="Type a message..."
        placeholderTextColor="#9aa3bd"
        style={{
          flex: 1,
          backgroundColor: "#fff",
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: "#e1e4ef",
          color: "#0e2756",
        }}
      />

      <Pressable
        onPress={submit}
        disabled={disabled || !value.trim()}
        style={{
          backgroundColor: disabled || !value.trim() ? "rgba(255,15,100,0.45)" : "#ff0f64",
          borderRadius: 18,
          paddingHorizontal: 16,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "800" }}>Send</Text>
      </Pressable>
    </View>
  );
}
