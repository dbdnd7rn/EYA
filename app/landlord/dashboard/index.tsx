import React, { useEffect } from "react";
import { useRouter } from "expo-router";

export default function LandlordDashboardAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(landlord)/(tabs)/dashboard");
  }, [router]);

  return null;
}
