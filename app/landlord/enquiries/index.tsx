import React, { useEffect } from "react";
import { useRouter } from "expo-router";

export default function LandlordEnquiriesAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(landlord)/(tabs)/enquiries");
  }, [router]);

  return null;
}
