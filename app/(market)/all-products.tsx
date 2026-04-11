import React from "react";
import AllProductsScreen from "@/components/market/AllProductsScreen";

export default function MarketAllProductsPage() {
  return <AllProductsScreen detailRoute="/(market)/item/[id]" />;
}

