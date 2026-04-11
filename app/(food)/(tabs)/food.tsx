import React from "react";
import FoodBrowseScreen from "@/components/food/FoodBrowseScreen";

export default function FoodTabPage() {
  return <FoodBrowseScreen detailRoute="/(food)/item/[id]" />;
}
