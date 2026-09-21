import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type LatLng = { lat: number; lng: number };

const MALAWI_DEFAULT: LatLng = { lat: -13.9626, lng: 33.7741 };

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
  const defaultCenter = useMemo<LatLng>(() => value ?? MALAWI_DEFAULT, [value]);
  const [latText, setLatText] = useState(String(defaultCenter.lat));
  const [lngText, setLngText] = useState(String(defaultCenter.lng));
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (initializeWithDefault && !value) onChange(defaultCenter);
    // Match the native picker by starting with a valid Malawi location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializeWithDefault]);

  useEffect(() => {
    if (!value) return;
    setLatText(String(value.lat));
    setLngText(String(value.lng));
  }, [value]);

  const selectPoint = (point: LatLng) => {
    setLatText(String(point.lat));
    setLngText(String(point.lng));
    onChange(point);
  };

  const applyCoords = () => {
    const lat = Number(latText);
    const lng = Number(lngText);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setGeoError("Enter valid latitude and longitude values.");
      return;
    }

    setGeoError(null);
    selectPoint({ lat, lng });
  };

  const useCurrentLocation = async () => {
    setGeoError(null);
    setLoadingGeo(true);

    try {
      const browserNavigator = (globalThis as typeof globalThis & {
        navigator?: {
          geolocation?: {
            getCurrentPosition: (
              success: (position: { coords: { latitude: number; longitude: number } }) => void,
              error?: (error: { message?: string }) => void,
              options?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
            ) => void;
          };
        };
      }).navigator;

      if (!browserNavigator?.geolocation) {
        setGeoError("Browser location is unavailable. Enter the coordinates manually.");
        return;
      }

      const point = await new Promise<LatLng>((resolve, reject) => {
        browserNavigator.geolocation?.getCurrentPosition(
          (position) =>
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          (error) => reject(new Error(error?.message || "Could not get your current location.")),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 },
        );
      });

      selectPoint(point);
    } catch (error: any) {
      setGeoError(error?.message ?? "Could not get your current location. Enter the coordinates manually.");
    } finally {
      setLoadingGeo(false);
    }
  };

  const mapPoint = value ?? defaultCenter;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.copy}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.sub}>Use your browser location or enter the coordinates below.</Text>
        </View>

        <Pressable onPress={() => void useCurrentLocation()} disabled={loadingGeo} style={styles.primaryBtn}>
          {loadingGeo ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.primaryBtnText}>Use my location</Text>}
        </Pressable>
      </View>

      {geoError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{geoError}</Text>
        </View>
      ) : null}

      <View style={styles.webMapPlaceholder}>
        <Text style={styles.webMapEyebrow}>WEB LOCATION</Text>
        <Text style={styles.webMapTitle}>Location selected</Text>
        <Text style={styles.webMapCoords}>
          {mapPoint.lat.toFixed(6)}, {mapPoint.lng.toFixed(6)}
        </Text>
        <Text style={styles.webMapHint}>Interactive pin placement remains available in the EYA mobile app.</Text>
      </View>

      <View style={styles.fields}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Latitude</Text>
          <TextInput value={latText} onChangeText={setLatText} keyboardType="numbers-and-punctuation" style={styles.input} />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Longitude</Text>
          <TextInput value={lngText} onChangeText={setLngText} keyboardType="numbers-and-punctuation" style={styles.input} />
        </View>
      </View>

      <Pressable onPress={applyCoords} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>Confirm selected location</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e1e4ef",
    gap: 12,
  },
  topRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  copy: { flex: 1, minWidth: 220, gap: 3 },
  label: { color: "#0e2756", fontWeight: "900", fontSize: 14 },
  sub: { color: "#5f6b85", fontWeight: "600", fontSize: 12, lineHeight: 18 },
  errorBox: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderWidth: 1,
    borderRadius: 16,
    padding: 11,
  },
  errorText: { color: "#9a3412", fontWeight: "800", fontSize: 12, lineHeight: 17 },
  webMapPlaceholder: {
    minHeight: 180,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d9e4ef",
    backgroundColor: "#f5f8fc",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 6,
  },
  webMapEyebrow: { color: "#71809d", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  webMapTitle: { color: "#0e2756", fontSize: 18, fontWeight: "900" },
  webMapCoords: { color: "#0f8f8d", fontSize: 14, fontWeight: "800" },
  webMapHint: { marginTop: 4, color: "#66738e", fontSize: 11, fontWeight: "700", lineHeight: 16, textAlign: "center" },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  field: { flex: 1, minWidth: 135, gap: 5 },
  fieldLabel: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d7def1",
    color: "#0e2756",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fbfcff",
  },
  primaryBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#0f8f8d",
    minWidth: 124,
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "white", fontWeight: "900", fontSize: 12 },
  secondaryBtn: {
    alignSelf: "stretch",
    backgroundColor: "#102b66",
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: "#ffffff", fontWeight: "900", fontSize: 13 },
});
