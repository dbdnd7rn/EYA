import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from "react-native";

type Props = {
  onComplete: () => void;
};

const LOGO = require("../assets/eya-logo-transparent.png");

export default function EyaLaunchAnimation({ onComplete }: Props) {
  const { width } = useWindowDimensions();
  const completedRef = useRef(false);
  const containerFade = useRef(new Animated.Value(1)).current;
  const logoProgress = useRef(new Animated.Value(0)).current;
  const glowProgress = useRef(new Animated.Value(0)).current;
  const underlineProgress = useRef(new Animated.Value(0)).current;

  const logoWidth = Math.min(width - 56, 360);

  const complete = React.useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const fallback = setTimeout(complete, 3200);
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(logoProgress, {
          toValue: 1,
          duration: 760,
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          useNativeDriver: true,
        }),
        Animated.timing(glowProgress, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(underlineProgress, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(780),
      Animated.timing(containerFade, {
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
  }, [complete, containerFade, glowProgress, logoProgress, underlineProgress]);

  const logoTranslateX = logoProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [width * 0.62, 0],
  });

  const logoTranslateY = logoProgress.interpolate({
    inputRange: [0, 0.76, 1],
    outputRange: [8, -4, 0],
  });

  const logoScale = logoProgress.interpolate({
    inputRange: [0, 0.78, 1],
    outputRange: [0.9, 1.04, 1],
  });

  const logoOpacity = logoProgress.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [0, 1, 1],
  });

  const glowScale = glowProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.76, 1.2],
  });

  const glowOpacity = glowProgress.interpolate({
    inputRange: [0, 0.48, 1],
    outputRange: [0, 0.16, 0],
  });

  return (
    <Animated.View style={[styles.overlay, { opacity: containerFade }]}>
      <View style={styles.stage}>
        <Animated.View
          style={[
            styles.glow,
            {
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
            },
          ]}
        />

        <Animated.View
          style={[
            styles.logoWrap,
            {
              opacity: logoOpacity,
              transform: [{ translateX: logoTranslateX }, { translateY: logoTranslateY }, { scale: logoScale }],
            },
          ]}
        >
          <Image source={LOGO} style={[styles.logo, { width: logoWidth }]} resizeMode="contain" />
          <Text style={styles.logoFallback}>EYA</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.underline,
            {
              opacity: underlineProgress,
              transform: [{ scaleX: underlineProgress }],
            },
          ]}
        />
      </View>
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
  stage: {
    width: "100%",
    minHeight: 330,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  glow: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#eef3ff",
    borderWidth: 1,
    borderColor: "#f02268",
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    height: 170,
  },
  logoFallback: {
    position: "absolute",
    color: "#102a54",
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  underline: {
    marginTop: 6,
    width: 150,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#102a54",
  },
});
