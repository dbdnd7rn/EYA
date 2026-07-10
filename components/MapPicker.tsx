import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import MapView, { Marker, type MapPressEvent, type Region } from "react-native-maps";

type LatLng = { lat: number; lng: number };

const MALAWI_DEFAULT: LatLng = { lat: -13.9626, lng: 33.7741 };

function regionFor(point: LatLng): Region {
  return {
    latitude: point.lat,
    longitude: point.lng,
    latitudeDelta: 0.18,
    longitudeDelta: 0.18,
  };
}

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
  const mapRef = useRef<MapView | null>(null);
  const [latText, setLatText] = useState(String(defaultCenter.lat));
  const [lngText, setLngText] = useState(String(defaultCenter.lng));
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    if (initializeWithDefault && !value) onChange(defaultCenter);
    // Initialize the form with a valid Malawi pin while still allowing manual movement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializeWithDefault]);

  useEffect(() => {
    if (!value) return;
    setLatText(String(value.lat));
    setLngText(String(value.lng));
    mapRef.current?.animateToRegion(regionFor(value), 350);
  }, [value]);

  useEffect(() => {
    let active = true;
    void Location.getForegroundPermissionsAsync()
      .then((permission) => {
        if (!active) return;
        setPermissionGranted(permission.granted);
        setPermissionBlocked(!permission.granted && !permission.canAskAgain);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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
    const point = { lat, lng };
    selectPoint(point);
    mapRef.current?.animateToRegion(regionFor(point), 350);
  };

  const useCurrentLocation = async () => {
    setGeoError(null);
    setPermissionBlocked(false);
    setLoadingGeo(true);

    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (!permission.granted) {
        setPermissionGranted(false);
        setPermissionBlocked(!permission.canAskAgain);
        setGeoError(
          permission.canAskAgain
            ? "Location permission was denied. You can still tap the map or drag the pin manually."
            : "Location access is blocked. Open your phone settings to allow location for EYA, or place the pin manually.",
        );
        return;
      }

      setPermissionGranted(true);
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      selectPoint(point);
      mapRef.current?.animateToRegion(regionFor(point), 450);
    } catch (error: any) {
      setGeoError(error?.message ?? "Could not get your current location. Place the pin manually and continue.");
    } finally {
      setLoadingGeo(false);
    }
  };

  const handleMapPress = (event: MapPressEvent) => {
    const point = {
      lat: event.nativeEvent.coordinate.latitude,
      lng: event.nativeEvent.coordinate.longitude,
    };
    setGeoError(null);
    selectPoint(point);
  };

  const mapPoint = value ?? defaultCenter;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.copy}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.sub}>Use your location, tap the map, or drag the pin to the correct place.</Text>
        </View>

        <Pressable onPress={() => void useCurrentLocation()} disabled={loadingGeo} style={styles.primaryBtn}>
          {loadingGeo ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Use my location</Text>
          )}
        </Pressable>
      </View>

      {geoError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{geoError}</Text>
          {permissionBlocked ? (
            <Pressable style={styles.settingsBtn} onPress={() => void Linking.openSettings()}>
              <Text style={styles.settingsBtnText}>Open settings</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={regionFor(mapPoint)}
          onPress={handleMapPress}
          showsUserLocation={permissionGranted}
          showsMyLocationButton={false}
          showsCompass
        >
          <Marker
            coordinate={{ latitude: mapPoint.lat, longitude: mapPoint.lng }}
            draggable
            pinColor="#0f8f8d"
            onDragEnd={(event) => {
              const point = {
                lat: event.nativeEvent.coordinate.latitude,
                lng: event.nativeEvent.coordinate.longitude,
              };
              setGeoError(null);
              selectPoint(point);
            }}
          />
        </MapView>
      </View>

      <Text style={styles.mapHint}>Pin selected in Malawi. Move it to your exact food-provider location.</Text>

      <View style={styles.fields}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Latitude</Text>
          <TextInput
            value={latText}
            onChangeText={setLatText}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Longitude</Text>
          <TextInput
            value={lngText}
            onChangeText={setLngText}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
          />
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
  topRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  copy: { flex: 1, gap: 3 },
  label: { color: "#0e2756", fontWeight: "900", fontSize: 14 },
  sub: { color: "#5f6b85", fontWeight: "600", fontSize: 12, lineHeight: 18 },
  errorBox: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderWidth: 1,
    borderRadius: 16,
    padding: 11,
    gap: 9,
  },
  errorText: { color: "#9a3412", fontWeight: "800", fontSize: 12, lineHeight: 17 },
  settingsBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#fdba74",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  settingsBtnText: { color: "#9a3412", fontWeight: "900", fontSize: 12 },
  mapWrap: {
    height: 250,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#d9e4ef",
    backgroundColor: "#e7eef2",
  },
  mapHint: { color: "#66738e", fontSize: 11, fontWeight: "700", lineHeight: 16 },
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
