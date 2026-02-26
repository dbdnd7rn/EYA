import React, { useEffect } from "react";
import { useRouter } from "expo-router";

export default function LandlordSubscriptionAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(landlord)/subscription");
  }, [router]);

  return null;
}
