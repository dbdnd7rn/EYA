import React from "react";
import { View, Text } from "react-native";

export default function MessageBubble({
  mine,
  text,
  time,
}: {
  mine: boolean;
  text: string;
  time?: string | null;
}) {
  return (
    <View
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "82%",
        marginVertical: 6,
      }}
    >
      <View
        style={{
          backgroundColor: mine ? "#0e2756" : "#ffffff",
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderWidth: mine ? 0 : 1,
          borderColor: "#e1e4ef",
        }}
      >
        <Text style={{ color: mine ? "#fff" : "#0e2756", fontSize: 14, lineHeight: 20 }}>
          {text}
        </Text>

        {time ? (
          <Text style={{ marginTop: 6, fontSize: 11, opacity: 0.7, color: mine ? "#fff" : "#5f6b85" }}>
            {time}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
