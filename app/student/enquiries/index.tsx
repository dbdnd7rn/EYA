import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function StudentEnquiriesAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(student)/(tabs)/room-messages");
  }, [router]);

  return null;
}
