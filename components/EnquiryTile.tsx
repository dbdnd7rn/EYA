import { View, Text, Pressable, Image } from "react-native";
import type { EnquiryRow, ListingMini, ProfileMini } from "../lib/types";
import { fullName, formatWhen } from "../lib/types";

export default function EnquiryTile({
  enquiry,
  listing,
  student,
  onPress,
  mode,
}: {
  enquiry: EnquiryRow;
  listing: ListingMini | null;
  student?: ProfileMini | null;
  onPress: () => void;
  mode: "student" | "landlord";
}) {
  const img = listing?.image_urls?.[0];

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: "white",
        borderRadius: 20,
        padding: 12,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: "#eef1fb",
          }}
        >
          {img ? (
            <Image source={{ uri: img }} style={{ width: "100%", height: "100%" }} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#5f6b85", fontWeight: "700" }}>IMG</Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
            <Text numberOfLines={1} style={{ fontWeight: "800", color: "#0e2756", flex: 1 }}>
              {listing?.title ?? "Listing"}
            </Text>

            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: enquiry.status === "new" ? "#fff0f6" : "#f6f7fb",
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "800", color: enquiry.status === "new" ? "#ff0f64" : "#0e2756" }}>
                {String(enquiry.status ?? "open").toUpperCase()}
              </Text>
            </View>
          </View>

          <Text numberOfLines={1} style={{ marginTop: 4, color: "#5f6b85", fontSize: 12 }}>
            {[listing?.area, listing?.city, listing?.campus].filter(Boolean).join(" • ") || "Location not provided"}
          </Text>

          {mode === "landlord" && (
            <Text numberOfLines={1} style={{ marginTop: 4, color: "#0e2756", fontSize: 12, fontWeight: "700" }}>
              From: {fullName(student)}
            </Text>
          )}

          <Text numberOfLines={1} style={{ marginTop: 4, color: "#5f6b85", fontSize: 12 }}>
            {formatWhen(enquiry.created_at)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}