import React from "react";
import FoodDetailScreen from "@/components/food/FoodDetailScreen";

export default function StudentFoodItemPage() {
  return <FoodDetailScreen fallbackRoute="/(student)/(tabs)/food" />;
}
