import React, { useEffect } from "react";
import { useRouter } from "expo-router";

export default function LandlordCreateAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(landlord)/(tabs)/create");
  }, [router]);

  return null;
}
