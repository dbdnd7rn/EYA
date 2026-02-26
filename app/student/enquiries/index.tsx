import React, { useEffect } from "react";
import { useRouter } from "expo-router";

export default function StudentEnquiriesAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(student)/(tabs)/messages");
  }, [router]);

  return null;
}
