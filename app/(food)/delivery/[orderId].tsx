import React from "react";
import FoodDeliveryTrackingScreen from "@/components/food/FoodDeliveryTrackingScreen";

export default function FoodDeliveryPage() {
  return <FoodDeliveryTrackingScreen fallbackRoute="/(food)/(tabs)/orders" />;
}
