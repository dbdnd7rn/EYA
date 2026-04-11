import React from "react";
import MarketProductDetailScreen from "@/components/market/MarketProductDetailScreen";

export default function MarketItemPage() {
  return <MarketProductDetailScreen fallbackRoute="/(market)/(tabs)/marketplace" />;
}
