import React, { useEffect } from "react";
import { useRouter } from "expo-router";

export default function LandlordProfileAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(landlord)/(tabs)/profile");
  }, [router]);

  return null;
}
