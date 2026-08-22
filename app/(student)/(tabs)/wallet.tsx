import React from "react";
import { Redirect } from "expo-router";

export default function SuspendedWalletRoute() {
  return <Redirect href="/(student)/(tabs)/account" />;
}
