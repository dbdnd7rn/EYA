import { Stack } from "expo-router";
import AgentGuard from "@/components/AgentGuard";

export default function AgentLayout() {
  return (
    <AgentGuard>
      <Stack screenOptions={{ headerShown: false, animation: "none", freezeOnBlur: false }} />
    </AgentGuard>
  );
}
