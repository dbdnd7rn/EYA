import React from "react";
import * as Location from "expo-location";

export type LiveProximityStatus = "idle" | "detecting" | "ready" | "denied" | "unavailable" | "error";

export type LiveProximityPoint = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  checkedAt: string;
};

export type LiveProximityState = {
  status: LiveProximityStatus;
  point: LiveProximityPoint | null;
  message: string | null;
};

export function useLiveProximity(enabled: boolean) {
  const [state, setState] = React.useState<LiveProximityState>({
    status: enabled ? "detecting" : "idle",
    point: null,
    message: null,
  });

  const refresh = React.useCallback(async () => {
    if (!enabled) {
      setState({ status: "idle", point: null, message: null });
      return;
    }

    setState((current) => ({ ...current, status: "detecting", message: null }));

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setState({
          status: "denied",
          point: null,
          message: "Allow location access to rank listings near you.",
        });
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      const latitude = Number(pos.coords.latitude);
      const longitude = Number(pos.coords.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setState({
          status: "unavailable",
          point: null,
          message: "Live GPS location is unavailable on this device.",
        });
        return;
      }

      setState({
        status: "ready",
        point: {
          latitude,
          longitude,
          accuracy: typeof pos.coords.accuracy === "number" && Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          checkedAt: new Date().toISOString(),
        },
        message: null,
      });
    } catch (error: any) {
      setState({
        status: "error",
        point: null,
        message: error?.message ?? "Could not detect live location.",
      });
    }
  }, [enabled]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
