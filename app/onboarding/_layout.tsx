import React from "react";
import { Redirect, Slot, useLocalSearchParams } from "expo-router";

export default function OnboardingLayout() {
  const params = useLocalSearchParams<{ mode?: string | string[] }>();
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;

  if (rawMode !== "apply") {
    return <Redirect href="/(student)/workspaces" />;
  }

  return <Slot />;
}
