import React from "react";
import { View, Text } from "react-native";

export default function Stars({ avg }: { avg: number }) {
  const rounded = Math.round(avg * 2) / 2;
  const full = Math.floor(rounded);
  const half = rounded - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);

  return (
    <View style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
      {Array.from({ length: full }).map((_, i) => (
        <Text key={`f${i}`} style={{ color: "#ff0f64", fontSize: 14, fontWeight: "900" }}>
          *
        </Text>
      ))}
      {half ? (
        <Text style={{ color: "#ff0f64", fontSize: 14, fontWeight: "900" }}>~</Text>
      ) : null}
      {Array.from({ length: empty }).map((_, i) => (
        <Text key={`e${i}`} style={{ color: "#c3c9d9", fontSize: 14, fontWeight: "900" }}>
          *
        </Text>
      ))}
    </View>
  );
}

