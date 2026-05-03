import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";

type RoomLocationMapProps = {
  latitude: number;
  longitude: number;
  title: string;
  description: string;
  mapsHref: string | null;
};

export default function RoomLocationMap({ latitude, longitude, title, description, mapsHref }: RoomLocationMapProps) {
  return (
    <View style={styles.mapCard}>
      <View style={styles.pin}>
        <Text style={styles.pinText}>Pin</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description || "Exact location available through maps."}</Text>
      <Text style={styles.coords}>
        {latitude.toFixed(5)}, {longitude.toFixed(5)}
      </Text>

      <Pressable disabled={!mapsHref} style={styles.mapOverlayBtn} onPress={() => mapsHref && Linking.openURL(mapsHref)}>
        <Text style={styles.mapOverlayBtnText}>Open in Maps</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  mapCard: {
    marginTop: 12,
    borderRadius: 24,
    minHeight: 220,
    backgroundColor: "#dbe7ff",
    borderWidth: 1,
    borderColor: "#c3d5ff",
    padding: 18,
    justifyContent: "center",
    gap: 8,
  },
  pin: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ff0f64",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pinText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  title: {
    color: "#0e2756",
    fontSize: 18,
    fontWeight: "900",
  },
  description: {
    color: "#5f6b85",
    fontSize: 13,
    fontWeight: "700",
  },
  coords: {
    color: "#0e2756",
    fontSize: 12,
    fontWeight: "900",
  },
  mapOverlayBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    backgroundColor: "#0e2756",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mapOverlayBtnText: {
    color: "white",
    fontWeight: "900",
    fontSize: 12,
  },
});
