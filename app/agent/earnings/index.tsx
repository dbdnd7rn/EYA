import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function AgentEarningsAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(agent)/(tabs)/earnings");
  }, [router]);

  return null;
}
