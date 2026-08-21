import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import SingleTicketScreen from "@/components/market/SingleTicketScreen";
import TicketGuestPassShortcut from "@/components/market/TicketGuestPassShortcut";
import TicketTransferShortcut from "@/components/market/TicketTransferShortcut";

export default function StudentSingleTicketPage() {
  const { ticketId } = useLocalSearchParams<{ ticketId?: string }>();
  return (
    <View style={{ flex: 1 }}>
      <SingleTicketScreen />
      <TicketGuestPassShortcut ticketId={ticketId} />
      <TicketTransferShortcut ticketId={ticketId} />
    </View>
  );
}
