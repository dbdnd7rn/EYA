import React from "react";
import { Image, View } from "react-native";

type Props = {
  width?: number;
  height?: number;
  withTagline?: boolean;
};

const LOGO = require("@/assets/eya-logo-transparent.png");

export default function EyaWordmark({ width = 118, height = 44 }: Props) {
  return (
    <View style={{ width, height }}>
      <Image
        source={LOGO}
        style={{ width: "100%", height: "100%" }}
        resizeMode="contain"
      />
    </View>
  );
}
