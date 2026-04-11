import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

type SoftPageGlowProps = {
  variant?: "home" | "orders" | "account";
  topColor?: string;
  middleColor?: string;
  bottomColor?: string;
};

export default function SoftPageGlow({
  variant,
  topColor,
  middleColor,
  bottomColor,
}: SoftPageGlowProps) {
  const palette =
    variant === "orders"
      ? {
          top: "rgba(170, 184, 255, 0.18)",
          middle: "rgba(212, 199, 255, 0.16)",
          bottom: "rgba(255, 223, 205, 0.12)",
        }
      : variant === "account"
        ? {
            top: "rgba(169, 190, 255, 0.16)",
            middle: "rgba(206, 196, 255, 0.14)",
            bottom: "rgba(255, 214, 196, 0.12)",
          }
        : {
            top: "rgba(160, 190, 255, 0.20)",
            middle: "rgba(203, 192, 255, 0.16)",
            bottom: "rgba(255, 214, 196, 0.14)",
          };
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 5600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 5600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [drift]);

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View
        style={[
          styles.glow,
          styles.topGlow,
          {
            backgroundColor: topColor ?? palette.top,
            transform: [
              {
                translateX: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-12, 18],
                }),
              },
              {
                translateY: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 14],
                }),
              },
              {
                scale: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.06],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.glow,
          styles.middleGlow,
          {
            backgroundColor: middleColor ?? palette.middle,
            transform: [
              {
                translateX: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, -14],
                }),
              },
              {
                translateY: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-8, 10],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.glow,
          styles.bottomGlow,
          {
            backgroundColor: bottomColor ?? palette.bottom,
            transform: [
              {
                translateX: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-8, 10],
                }),
              },
              {
                translateY: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, -8],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    borderRadius: 999,
  },
  topGlow: {
    top: -30,
    right: -40,
    width: 240,
    height: 220,
  },
  middleGlow: {
    top: 180,
    left: -60,
    width: 220,
    height: 200,
  },
  bottomGlow: {
    right: -50,
    bottom: 90,
    width: 210,
    height: 190,
  },
});
