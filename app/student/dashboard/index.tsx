import React, { useEffect } from "react";
import { useRouter } from "expo-router";

export default function StudentDashboardAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(student)/(tabs)/home");
  }, [router]);

  return null;
}
