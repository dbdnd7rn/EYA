import React, { useEffect } from "react";
import { useRouter } from "expo-router";

export default function LandlordListingsAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(landlord)/(tabs)/listings");
  }, [router]);

  return null;
}
