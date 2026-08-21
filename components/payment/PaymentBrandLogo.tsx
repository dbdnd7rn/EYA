import React from "react";
import { Image, StyleSheet, View } from "react-native";

type Brand = "airtel_money" | "mpamba";

const BRAND_IMAGES = {
  airtel_money: require("../../assets/payment/airtel money icon 2.png"),
  mpamba: require("../../assets/payment/tnm mpamba icon 2.png"),
} as const;

const ACTIVE_BORDER = {
  airtel_money: "#E60012",
  mpamba: "#149447",
} as const;

export default function PaymentBrandLogo({
  brand,
  size = 42,
  active = false,
}: {
  brand: Brand;
  size?: number;
  active?: boolean;
}) {
  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: Math.max(8, Math.round(size * 0.22)),
          borderColor: active ? ACTIVE_BORDER[brand] : "#E5E7EB",
          borderWidth: active ? 1.5 : 1,
        },
      ]}
    >
      <Image
        source={BRAND_IMAGES[brand]}
        resizeMode="contain"
        style={styles.image}
        accessibilityLabel={brand === "airtel_money" ? "Airtel Money" : "TNM Mpamba"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    padding: 3,
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
