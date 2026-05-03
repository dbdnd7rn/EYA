import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { ArrowLeft, Crosshair, MapPin, Search } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import MapPicker from "@/components/MapPicker";
import { usePreferredLocation } from "@/providers/PreferredLocationProvider";

type LatLng = { lat: number; lng: number };

const CAMPUS_OPTIONS = ["MUST", "MUBAS", "UNIMA", "LUANAR", "KUHeS"];

function guessCampus(input: string) {
  const text = input.toLowerCase();
  if (text.includes("mubas")) return "MUBAS";
  if (text.includes("must") || text.includes("poly")) return "MUST";
  if (text.includes("unima") || text.includes("zomba")) return "UNIMA";
  if (text.includes("luanar")) return "LUANAR";
  if (text.includes("kuhes")) return "KUHeS";
  return "";
}

export default function StudentAddressScreen() {
  const router = useRouter();
  const { location, saveLocation } = usePreferredLocation();
  const [label, setLabel] = useState(location?.label ?? "");
  const [area, setArea] = useState(location?.area ?? "");
  const [campus, setCampus] = useState(location?.campus ?? "MUST");
  const [city, setCity] = useState(location?.city ?? "Blantyre");
  const [coords, setCoords] = useState<LatLng | null>(
    location ? { lat: location.latitude ?? -15.385, lng: location.longitude ?? 35.3387 } : { lat: -15.385, lng: 35.3387 },
  );
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [saving, setSaving] = useState(false);

  const subtitle = useMemo(() => [area, campus || city].filter(Boolean).join(" • "), [area, campus, city]);

  const applyCurrentLocation = async () => {
    setLoadingGeo(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Allow location access to use your current location.");
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setCoords({ lat, lng });

      const reverse = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const place = reverse[0];
      const nextArea = place?.district || place?.subregion || place?.street || area || "Soche";
      const nextCity = place?.city || place?.region || city || "Blantyre";
      const nextLabel = [place?.name, nextArea, nextCity].filter(Boolean).join(", ");

      setArea(nextArea);
      setCity(nextCity);
      setCampus((current) => current || guessCampus(nextLabel) || "MUST");
      if (nextLabel) setLabel(nextLabel);
    } catch {
      Alert.alert("Location error", "Could not fetch your current location.");
    } finally {
      setLoadingGeo(false);
    }
  };

  const onSave = async () => {
    if (!area.trim()) {
      Alert.alert("Area required", "Enter or detect the area you want to use.");
      return;
    }

    setSaving(true);
    try {
      await saveLocation({
        label: label.trim() || [area, city].filter(Boolean).join(", "),
        area,
        campus,
        city,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <SoftPageGlow topColor="rgba(170, 190, 255, 0.16)" middleColor="rgba(220, 201, 255, 0.14)" bottomColor="rgba(255, 220, 201, 0.14)" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.circleBtn} onPress={() => router.back()}>
            <ArrowLeft size={22} color="#273464" />
          </Pressable>
          <Text style={styles.title}>Add Address</Text>
          <Pressable style={styles.saveChip} onPress={() => void onSave()} disabled={saving}>
            <Text style={styles.saveChipText}>{saving ? "Saving..." : "Save"}</Text>
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchWrap}>
            <Search size={18} color="#8c95af" />
            <TextInput
              value={label}
              onChangeText={setLabel}
              style={styles.searchInput}
              placeholder="Search address"
              placeholderTextColor="#9aa3bd"
            />
          </View>
          <Pressable style={styles.currentBtn} onPress={() => void applyCurrentLocation()} disabled={loadingGeo}>
            {loadingGeo ? <ActivityIndicator size="small" color="#5f64af" /> : <Crosshair size={18} color="#5f64af" />}
            <Text style={styles.currentBtnText}>Use current location</Text>
          </Pressable>
        </View>

        <MapPicker value={coords} onChange={setCoords} label="Set your location" />

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Set your location</Text>
          <Text style={styles.sectionSub}>Save the location you want rooms, food, and market results to prioritize.</Text>

          <View style={styles.inputWrap}>
            <Text style={styles.labelText}>Area</Text>
            <TextInput value={area} onChangeText={setArea} style={styles.input} placeholder="Soche" placeholderTextColor="#98a1ba" />
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.labelText}>City</Text>
            <TextInput value={city} onChangeText={setCity} style={styles.input} placeholder="Blantyre" placeholderTextColor="#98a1ba" />
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.labelText}>Campus</Text>
            <View style={styles.chipRow}>
              {CAMPUS_OPTIONS.map((option) => {
                const active = campus === option;
                return (
                  <Pressable key={option} style={[styles.optionChip, active && styles.optionChipActive]} onPress={() => setCampus(option)}>
                    <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.selectedRow}>
            <View style={styles.selectedIcon}>
              <MapPin size={18} color="#5768b5" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedTitle}>{label.trim() || "Selected location"}</Text>
              <Text style={styles.selectedSub}>{subtitle || "Choose your exact area and campus"}</Text>
            </View>
          </View>
        </View>

        <Pressable style={styles.bottomSaveBtn} onPress={() => void onSave()} disabled={saving}>
          <Text style={styles.bottomSaveText}>{saving ? "Saving..." : "Save"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f2fb" },
  content: { padding: 16, paddingBottom: 34, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  circleBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#eef1fb",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5eaf6",
  },
  title: { flex: 1, color: "#273464", fontSize: 22, fontWeight: "900" },
  saveChip: {
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: "rgba(151,131,255,0.12)",
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5dafd",
  },
  saveChipText: { color: "#5e63a8", fontSize: 16, fontWeight: "800" },
  searchRow: { gap: 10 },
  searchWrap: {
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e8ebf7",
    paddingHorizontal: 16,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchInput: { flex: 1, color: "#273464", fontSize: 16, fontWeight: "600" },
  currentBtn: {
    alignSelf: "flex-end",
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e8ebf7",
    paddingHorizontal: 16,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  currentBtnText: { color: "#5f64af", fontSize: 14, fontWeight: "800" },
  formCard: {
    borderRadius: 30,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eceffa",
    padding: 18,
    gap: 14,
  },
  sectionTitle: { color: "#273464", fontSize: 24, fontWeight: "900" },
  sectionSub: { color: "#7c84a0", fontSize: 14, fontWeight: "600", lineHeight: 21 },
  inputWrap: { gap: 8 },
  labelText: { color: "#5f6987", fontSize: 12, fontWeight: "800" },
  input: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: "#fafbff",
    borderWidth: 1,
    borderColor: "#e2e7f3",
    paddingHorizontal: 14,
    color: "#273464",
    fontWeight: "700",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  optionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dfe5f2",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionChipActive: { backgroundColor: "#edf1ff", borderColor: "#6175d8" },
  optionChipText: { color: "#62708e", fontSize: 13, fontWeight: "800" },
  optionChipTextActive: { color: "#243c87" },
  selectedRow: {
    marginTop: 4,
    borderRadius: 22,
    backgroundColor: "#f7f8fe",
    borderWidth: 1,
    borderColor: "#e8ebf7",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectedIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#e8edff",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedTitle: { color: "#273464", fontSize: 16, fontWeight: "900" },
  selectedSub: { marginTop: 3, color: "#7d86a3", fontSize: 13, fontWeight: "600" },
  bottomSaveBtn: {
    minHeight: 64,
    borderRadius: 999,
    backgroundColor: "#7083ff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7083ff",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  bottomSaveText: { color: "#fff", fontSize: 22, fontWeight: "900" },
});
