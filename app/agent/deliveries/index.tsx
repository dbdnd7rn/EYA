import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function AgentDeliveriesAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(agent)/(tabs)/deliveries");
  }, [router]);

  return null;
}
