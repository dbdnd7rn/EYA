import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from "react-native";

type Props = {
  onComplete: () => void;
};

const LOGO = require("../assets/eya-logo-transparent.png");

export default function EyaLaunchAnimation({ onComplete }: Props) {
  const { width } = useWindowDimensions();
  const completedRef = useRef(false);

  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const logoTranslateY = useRef(new Animated.Value(14)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.72)).current;
  const accentOpacity = useRef(new Animated.Value(0)).current;
  const accentScale = useRef(new Animated.Value(0.55)).current;

  const logoWidth = Math.min(width * 0.56, 228);
  const logoHeight = Math.max(82, Math.round(logoWidth * 0.5));

  const complete = React.useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          speed: 12,
          bounciness: 7,
          useNativeDriver: true,
        }),
        Animated.timing(logoTranslateY, {
          toValue: 0,
          duration: 440,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.18,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(glowScale, {
          toValue: 1,
          duration: 460,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(logoScale, {
            toValue: 1.035,
            duration: 180,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 1,
            duration: 210,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.parallel([
            Animated.timing(accentOpacity, {
              toValue: 0.62,
              duration: 150,
              useNativeDriver: true,
            }),
            Animated.timing(accentScale, {
              toValue: 1,
              duration: 260,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(accentOpacity, {
              toValue: 0,
              duration: 230,
              useNativeDriver: true,
            }),
            Animated.timing(accentScale, {
              toValue: 1.5,
              duration: 230,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
      Animated.delay(170),
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 300,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 0.97,
          duration: 300,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start(({ finished }) => {
      if (finished) complete();
    });

    const fallback = setTimeout(complete, 2200);

    return () => {
      clearTimeout(fallback);
      animation.stop();
    };
  }, [accentOpacity, accentScale, complete, glowOpacity, glowScale, logoOpacity, logoScale, logoTranslateY, overlayOpacity]);

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} pointerEvents="none">
      <View style={[styles.stage, { width: logoWidth + 72, height: logoHeight + 72 }]}>
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
            styles.accentRing,
            {
              opacity: accentOpacity,
              transform: [{ scale: accentScale }],
            },
          ]}
        />

        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{ translateY: logoTranslateY }, { scale: logoScale }],
          }}
        >
          <Image
            source={LOGO}
            style={{ width: logoWidth, height: logoHeight }}
            resizeMode="contain"
          />
        </Animated.View>
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
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 188,
    height: 188,
    borderRadius: 94,
    backgroundColor: "#8fd7e8",
  },
  accentRing: {
    position: "absolute",
    width: 166,
    height: 166,
    borderRadius: 83,
    borderWidth: 1.5,
    borderColor: "#5b8ff1",
  },
});
