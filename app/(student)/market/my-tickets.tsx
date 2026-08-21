import { View } from "react-native";
import MyTicketsScreen from "@/components/market/MyTicketsScreen";
import TicketGuestPassShortcut from "@/components/market/TicketGuestPassShortcut";
import TicketTransferShortcut from "@/components/market/TicketTransferShortcut";

export default function StudentMyTicketsPage() {
  return (
    <View style={{ flex: 1 }}>
      <MyTicketsScreen />
      <TicketGuestPassShortcut />
      <TicketTransferShortcut />
    </View>
  );
}
