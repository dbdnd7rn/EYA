import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { MapPressEvent, Region } from "react-native-maps";

type LatLng = { lat: number; lng: number };

export default function MapPicker({
  value,
  onChange,
  label = "Location",
  initializeWithDefault = true,
}: {
  value: LatLng | null;
  onChange: (v: LatLng) => void;
  label?: string;
  initializeWithDefault?: boolean;
}) {
  const defaultCenter = useMemo<LatLng>(() => value ?? { lat: -13.9626, lng: 33.7741 }, [value]);
  const mapRef = useRef<MapView | null>(null);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const region = useMemo<Region>(
    () => ({
      latitude: defaultCenter.lat,
      longitude: defaultCenter.lng,
      latitudeDelta: value ? 0.02 : 4.0,
      longitudeDelta: value ? 0.02 : 4.0,
    }),
    [defaultCenter.lat, defaultCenter.lng, value],
  );

  useEffect(() => {
    if (initializeWithDefault && !value) onChange(defaultCenter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializeWithDefault]);

  const onMapPress = (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    onChange({ lat: latitude, lng: longitude });
  };

  const useMyLocation = async () => {
    setGeoError(null);
    setLoadingGeo(true);

    try {
      const Location = await import("expo-location");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setGeoError("Permission denied. Please allow location access.");
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      onChange({ lat, lng });
      mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 450);
    } catch {
      setGeoError("Could not get your location.");
    } finally {
      setLoadingGeo(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.sub}>Tap the map or drag the pin. Or use your current location.</Text>
        </View>

        <Pressable onPress={useMyLocation} disabled={loadingGeo} style={styles.pinkBtn}>
          {loadingGeo ? <ActivityIndicator color="white" /> : <Text style={styles.pinkBtnTxt}>Use my location</Text>}
        </Pressable>
      </View>

      {geoError ? (
        <View style={styles.errBox}>
          <Text style={styles.errTxt}>{geoError}</Text>
        </View>
      ) : null}

      <View style={styles.mapWrap}>
        <MapView
          ref={(ref) => {
            mapRef.current = ref;
          }}
          style={StyleSheet.absoluteFill}
          initialRegion={region}
          onPress={onMapPress}
        >
          <Marker
            draggable
            coordinate={{
              latitude: value?.lat ?? defaultCenter.lat,
              longitude: value?.lng ?? defaultCenter.lng,
            }}
            onDragEnd={(event) => {
              const { latitude, longitude } = event.nativeEvent.coordinate;
              onChange({ lat: latitude, lng: longitude });
            }}
          />
        </MapView>
      </View>

      <CoordsRow value={value} />
    </View>
  );
}

function CoordsRow({ value }: { value: LatLng | null }) {
  return (
    <View style={styles.coordsRow}>
      <View style={styles.coordPill}>
        <Text style={styles.coordKey}>Latitude: </Text>
        <Text style={styles.coordVal}>{value?.lat?.toFixed?.(6) ?? "-"}</Text>
      </View>

      <View style={styles.coordPill}>
        <Text style={styles.coordKey}>Longitude: </Text>
        <Text style={styles.coordVal}>{value?.lng?.toFixed?.(6) ?? "-"}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "white",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e1e4ef",
  },
  topRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  label: { color: "#0e2756", fontWeight: "900", fontSize: 14 },
  sub: { color: "#5f6b85", fontWeight: "600", fontSize: 12, marginTop: 4 },
  pinkBtn: {
    backgroundColor: "#ff0f64",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
  },
  pinkBtnTxt: { color: "white", fontWeight: "900", fontSize: 12 },
  errBox: {
    marginTop: 10,
    backgroundColor: "#fff0f6",
    borderColor: "#ffd4e3",
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
  },
  errTxt: { color: "#b0003a", fontWeight: "800", fontSize: 12 },
  mapWrap: {
    marginTop: 12,
    height: 280,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e1e4ef",
  },
  coordsRow: { marginTop: 10, flexDirection: "row", gap: 10 },
  coordPill: { flex: 1, backgroundColor: "#f6f7fb", borderRadius: 16, padding: 10 },
  coordKey: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  coordVal: { color: "#5f6b85", fontWeight: "800", fontSize: 12 },
});
