import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import SingleTicketScreen from "@/components/market/SingleTicketScreen";
import TicketTransferShortcut from "@/components/market/TicketTransferShortcut";

export default function StudentSingleTicketPage() {
  const { ticketId } = useLocalSearchParams<{ ticketId?: string }>();
  return (
    <View style={{ flex: 1 }}>
      <SingleTicketScreen />
      <TicketTransferShortcut ticketId={ticketId} />
    </View>
  );
}
