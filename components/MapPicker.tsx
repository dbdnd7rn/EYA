import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type LatLng = { lat: number; lng: number };

export default function MapPicker({
  value,
  onChange,
  label = "Location",
}: {
  value: LatLng | null;
  onChange: (v: LatLng) => void;
  label?: string;
}) {
  const defaultCenter = useMemo<LatLng>(() => value ?? { lat: -13.9626, lng: 33.7741 }, [value]);
  const [latText, setLatText] = useState(String(defaultCenter.lat));
  const [lngText, setLngText] = useState(String(defaultCenter.lng));

  useEffect(() => {
    if (!value) onChange(defaultCenter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.sub}>
        Map picking is available in the mobile app. On web, enter the latitude and longitude manually.
      </Text>

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
  label: { color: "#0e2756", fontWeight: "900", fontSize: 14 },
  sub: { color: "#5f6b85", fontWeight: "600", fontSize: 12, lineHeight: 18 },
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
