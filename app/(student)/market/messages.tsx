import React from "react";
import { StyleSheet, View } from "react-native";
import StudentMessagesPage from "@/app/(student)/(tabs)/messages";
import MarketBottomNav from "@/components/market/MarketBottomNav";

export default function StudentMarketMessagesPage() {
  return (
    <View style={styles.root}>
      <StudentMessagesPage contentBottomPadding={164} />
      <MarketBottomNav active="messages" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
