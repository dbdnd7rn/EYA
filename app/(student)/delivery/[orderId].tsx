import React from "react";
import FoodDeliveryTrackingScreen from "@/components/food/FoodDeliveryTrackingScreen";

export default function StudentFoodDeliveryPage() {
  return <FoodDeliveryTrackingScreen fallbackRoute="/(student)/(tabs)/orders" />;
}
