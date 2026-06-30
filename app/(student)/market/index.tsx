import React from "react";
import MarketplaceBrowseScreen from "@/components/market/MarketplaceBrowseScreen";

export default function StudentMarketIndexPage() {
  return <MarketplaceBrowseScreen detailRoute="/(student)/market/[id]" showModeSwitch />;
}
