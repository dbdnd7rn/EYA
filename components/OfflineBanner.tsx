import React from "react";
import { Text, View } from "react-native";
import { useNetwork } from "@/providers/NetworkProvider";

export default function OfflineBanner() {
  const { isOnline } = useNetwork();

  if (isOnline) return null;

  return (
    <View
      style={{
        backgroundColor: "#fff0f6",
        borderBottomWidth: 1,
        borderBottomColor: "#ffd4e3",
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: "#b0003a", fontWeight: "800", textAlign: "center", fontSize: 12 }}>
        Offline mode: cached screens are available across student, seller, and agent flows. Payments, image uploads, and live sync still need internet.
      </Text>
    </View>
  );
}
