import React, { useEffect } from "react";
import { useRouter } from "expo-router";

export default function StudentSavedAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(student)/(tabs)/saved");
  }, [router]);

  return null;
}
