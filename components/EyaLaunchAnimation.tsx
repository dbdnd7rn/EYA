import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, useWindowDimensions } from "react-native";

type Props = {
  onComplete: () => void;
};

const LOGO = require("../assets/eya-logo-transparent.png");

export default function EyaLaunchAnimation({ onComplete }: Props) {
  const { width } = useWindowDimensions();
  const completedRef = useRef(false);
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.94)).current;
  const logoWidth = Math.min(width - 56, 380);

  const complete = React.useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const fallback = setTimeout(complete, 2200);
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 620,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(620),
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 420,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) complete();
    });

    return () => {
      clearTimeout(fallback);
      animation.stop();
    };
  }, [complete, containerOpacity, logoOpacity, logoScale]);

  return (
    <Animated.View style={[styles.overlay, { opacity: containerOpacity }]}>
      <Animated.Image
        source={LOGO}
        style={[
          styles.logo,
          {
            width: logoWidth,
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  logo: {
    height: 190,
  },
});
