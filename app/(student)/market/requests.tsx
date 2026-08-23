import React from "react";
import { StyleSheet, View } from "react-native";
import StudentRequestsPage from "@/app/(student)/requests";
import MarketBottomNav from "@/components/market/MarketBottomNav";

export default function StudentMarketRequestsPage() {
  return (
    <View style={styles.root}>
      <StudentRequestsPage contentBottomPadding={28} />
      <MarketBottomNav active="requests" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
