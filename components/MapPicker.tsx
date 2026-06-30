import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

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
  const [latText, setLatText] = useState(String(defaultCenter.lat));
  const [lngText, setLngText] = useState(String(defaultCenter.lng));
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    if (initializeWithDefault && !value) onChange(defaultCenter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializeWithDefault]);

  useEffect(() => {
    if (!value) return;
    setLatText(String(value.lat));
    setLngText(String(value.lng));
  }, [value]);

  const applyCoords = () => {
    const lat = Number(latText);
    const lng = Number(lngText);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    onChange({ lat, lng });
  };

  const useCurrentLocation = () => {
    setGeoError(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Location is not available in this browser.");
      return;
    }

    setLoadingGeo(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLatText(String(lat));
        setLngText(String(lng));
        onChange({ lat, lng });
        setLoadingGeo(false);
      },
      () => {
        setGeoError("Could not get your location. Allow location access and try again.");
        setLoadingGeo(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const mapPoint = value ?? defaultCenter;
  const mapsUrl = `https://www.google.com/maps?q=${mapPoint.lat},${mapPoint.lng}&z=16&output=embed`;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.sub}>Use your current location or set coordinates from Google Maps.</Text>
        </View>

        <Pressable onPress={useCurrentLocation} disabled={loadingGeo} style={styles.pinkBtn}>
          {loadingGeo ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.pinkBtnTxt}>Use my location</Text>}
        </Pressable>
      </View>

      {geoError ? (
        <View style={styles.errBox}>
          <Text style={styles.errTxt}>{geoError}</Text>
        </View>
      ) : null}

      <View style={styles.mapWrap}>
        {React.createElement("iframe", {
          title: label,
          src: mapsUrl,
          style: { border: 0, width: "100%", height: "100%" },
          loading: "lazy",
          referrerPolicy: "no-referrer-when-downgrade",
        })}
      </View>

      <View style={styles.fields}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Latitude</Text>
          <TextInput value={latText} onChangeText={setLatText} keyboardType="numeric" style={styles.input} />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Longitude</Text>
          <TextInput value={lngText} onChangeText={setLngText} keyboardType="numeric" style={styles.input} />
        </View>
      </View>

      <Pressable onPress={applyCoords} style={styles.pinkBtn}>
        <Text style={styles.pinkBtnTxt}>Set coordinates</Text>
      </Pressable>
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
    gap: 10,
  },
  topRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  label: { color: "#0e2756", fontWeight: "900", fontSize: 14 },
  sub: { color: "#5f6b85", fontWeight: "600", fontSize: 12, lineHeight: 18 },
  errBox: {
    backgroundColor: "#fff0f6",
    borderColor: "#ffd4e3",
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
  },
  errTxt: { color: "#b0003a", fontWeight: "800", fontSize: 12 },
  mapWrap: {
    height: 220,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e1e4ef",
  },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  field: { flex: 1, minWidth: 180, gap: 5 },
  fieldLabel: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d7def1",
    color: "#0e2756",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pinkBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#ff0f64",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
  },
  pinkBtnTxt: { color: "white", fontWeight: "900", fontSize: 12 },
});
