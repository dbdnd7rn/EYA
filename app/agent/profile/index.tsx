import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function AgentProfileAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(agent)/(tabs)/profile");
  }, [router]);

  return null;
}
