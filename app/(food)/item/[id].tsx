import React from "react";
import FoodDetailScreen from "@/components/food/FoodDetailScreen";

export default function FoodItemPage() {
  return <FoodDetailScreen fallbackRoute="/(food)/(tabs)/food" />;
}
