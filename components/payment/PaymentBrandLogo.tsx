import React from "react";
import { Image, StyleSheet, View } from "react-native";

type Brand = "airtel_money" | "mpamba";

const BRAND_IMAGES = {
  airtel_money: require("../../assets/payment/airtel money icon 2.png"),
  mpamba: require("../../assets/payment/tnm mpamba icon 2.png"),
} as const;

const ACTIVE_BORDER = {
  airtel_money: "#ED1C24",
  mpamba: "#159447",
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
  const compact = size <= 32;

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: Math.max(9, Math.round(size * 0.24)),
          borderColor: active ? ACTIVE_BORDER[brand] : "#E4E8F1",
          borderWidth: active ? 1.75 : 1,
          padding: compact ? 1 : Math.max(2, Math.round(size * 0.055)),
        },
      ]}
    >
      <Image
        source={BRAND_IMAGES[brand]}
        resizeMode="contain"
        style={[
          styles.image,
          brand === "airtel_money" ? styles.airtelImage : styles.mpambaImage,
        ]}
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
    shadowColor: "#13285F",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  airtelImage: {
    transform: [{ scale: 1.62 }],
  },
  mpambaImage: {
    transform: [{ scale: 0.94 }],
  },
});
