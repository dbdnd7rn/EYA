import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import MapView, { Marker } from "react-native-maps";

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
      <MapView
        style={styles.map}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }}
        scrollEnabled
        zoomEnabled
        rotateEnabled={false}
        pitchEnabled={false}
      >
        <Marker coordinate={{ latitude, longitude }} title={title} description={description} />
      </MapView>

      <View pointerEvents="box-none" style={styles.mapOverlay}>
        <Pressable style={styles.mapOverlayBtn} onPress={() => mapsHref && Linking.openURL(mapsHref)}>
          <Text style={styles.mapOverlayBtnText}>Open in Maps</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapCard: {
    marginTop: 12,
    borderRadius: 24,
    overflow: "hidden",
    height: 260,
    backgroundColor: "#dbe7ff",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: 12,
  },
  mapOverlayBtn: {
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
