import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function AgentDashboardAlias() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/(agent)/(tabs)/dashboard");
  }, [router]);

  return null;
}
