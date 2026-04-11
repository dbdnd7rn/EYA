import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

export type PreferredLocation = {
  label: string;
  campus: string;
  area: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  updatedAt: string;
};

type PreferredLocationContextValue = {
  location: PreferredLocation | null;
  loading: boolean;
  saveLocation: (next: Omit<PreferredLocation, "updatedAt">) => Promise<void>;
  clearLocation: () => Promise<void>;
};

type ProfileLocationRow = {
  campus?: string | null;
  area?: string | null;
};

const STORAGE_PREFIX = "preferred_student_location_v1";
const PreferredLocationContext = createContext<PreferredLocationContextValue | null>(null);

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

export function locationMatchScore(
  preferred: PreferredLocation | null,
  candidate: {
    campus?: string | null;
    area?: string | null;
    city?: string | null;
  },
) {
  if (!preferred) return 0;

  const campus = normalizeText(candidate.campus).toLowerCase();
  const area = normalizeText(candidate.area).toLowerCase();
  const city = normalizeText(candidate.city).toLowerCase();
  const preferredCampus = preferred.campus.toLowerCase();
  const preferredArea = preferred.area.toLowerCase();
  const preferredCity = preferred.city.toLowerCase();

  let score = 0;
  if (preferredArea && area === preferredArea) score += 30;
  if (preferredCampus && campus === preferredCampus) score += 18;
  if (preferredCity && city === preferredCity) score += 10;
  if (preferredArea && area.includes(preferredArea)) score += 5;
  if (preferredCampus && campus.includes(preferredCampus)) score += 4;
  return score;
}

export function formatPreferredLocation(location: PreferredLocation | null) {
  if (!location) return "Set your location";
  return [location.area, location.campus || location.city].filter(Boolean).join(" • ");
}

export function PreferredLocationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location, setLocation] = useState<PreferredLocation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!user?.id) {
        setLocation(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      const raw = await AsyncStorage.getItem(storageKey(user.id));
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as PreferredLocation;
          if (active) {
            setLocation(parsed);
            setLoading(false);
          }
          return;
        } catch {
          await AsyncStorage.removeItem(storageKey(user.id));
        }
      }

      const { data } = await supabase.from("profiles").select("campus,area").eq("id", user.id).maybeSingle();
      if (!active) return;

      const profile = (data ?? null) as ProfileLocationRow | null;
      const campus = normalizeText(profile?.campus);
      const area = normalizeText(profile?.area);

      if (campus || area) {
        setLocation({
          label: [area, campus].filter(Boolean).join(", ") || "Saved location",
          campus,
          area,
          city: "Blantyre",
          latitude: null,
          longitude: null,
          updatedAt: new Date().toISOString(),
        });
      } else {
        setLocation(null);
      }

      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const saveLocation = async (next: Omit<PreferredLocation, "updatedAt">) => {
    if (!user?.id) return;

    const payload: PreferredLocation = {
      ...next,
      label: normalizeText(next.label),
      campus: normalizeText(next.campus),
      area: normalizeText(next.area),
      city: normalizeText(next.city),
      updatedAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(storageKey(user.id), JSON.stringify(payload));
    setLocation(payload);

    await supabase
      .from("profiles")
      .update({
        campus: payload.campus || null,
        area: payload.area || null,
      })
      .eq("id", user.id);
  };

  const clearLocation = async () => {
    if (!user?.id) return;
    await AsyncStorage.removeItem(storageKey(user.id));
    setLocation(null);
  };

  const value = useMemo<PreferredLocationContextValue>(
    () => ({
      location,
      loading,
      saveLocation,
      clearLocation,
    }),
    [location, loading],
  );

  return <PreferredLocationContext.Provider value={value}>{children}</PreferredLocationContext.Provider>;
}

export function usePreferredLocationOptional() {
  return useContext(PreferredLocationContext);
}

export function usePreferredLocation() {
  const value = useContext(PreferredLocationContext);
  if (!value) throw new Error("usePreferredLocation must be used within PreferredLocationProvider");
  return value;
}
