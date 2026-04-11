import React from "react";
import FoodBrowseScreen from "@/components/food/FoodBrowseScreen";

export default function StudentFoodTabPage() {
  return <FoodBrowseScreen detailRoute="/(student)/food/[id]" showModeSwitch />;
}
