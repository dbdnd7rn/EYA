import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

type Props = {
  onComplete: () => void;
};

const LETTERS = ["p", "a", "m", "a", "k", "e", "t", "i"] as const;
const NAVY = "#102a54";
const PINK = "#ff1f6a";

export default function PaLevelLaunchAnimation({ onComplete }: Props) {
  const letterAnim = useRef(LETTERS.map(() => new Animated.Value(0))).current;
  const containerFade = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.98)).current;
  const taglineFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const revealSequence = letterAnim.map((value, index) =>
      Animated.timing(value, {
        toValue: 1,
        duration: 340,
        delay: index === 0 ? 140 : 0,
        easing: Easing.bezier(0.2, 0.9, 0.2, 1),
        useNativeDriver: true,
      })
    );

    Animated.sequence([
      Animated.parallel([
        Animated.sequence([
          Animated.timing(logoScale, {
            toValue: 1.02,
            duration: 420,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 1,
            duration: 260,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.stagger(100, revealSequence),
      ]),
      Animated.timing(taglineFade, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(420),
      Animated.timing(containerFade, {
        toValue: 0,
        duration: 380,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onComplete();
    });
  }, [containerFade, letterAnim, logoScale, onComplete, taglineFade]);

  return (
    <Animated.View style={[styles.overlay, { opacity: containerFade }]}>
      <Animated.View style={[styles.row, { transform: [{ scale: logoScale }] }]}>
        {LETTERS.map((letter, index) => {
          const translateX = letterAnim[index].interpolate({
            inputRange: [0, 1],
            outputRange: [44, 0],
          });

          const opacity = letterAnim[index].interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
          });

          return (
            <Animated.Text
              key={`${letter}-${index}`}
              style={[
                styles.letter,
                { color: index < 2 ? NAVY : PINK, opacity, transform: [{ translateX }] },
              ]}
            >
              {letter}
            </Animated.Text>
          );
        })}
      </Animated.View>
      <Animated.Text style={[styles.tagline, { opacity: taglineFade }]}>everything a student needs</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f1f4",
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  letter: {
    fontSize: 64,
    fontWeight: "900",
    letterSpacing: -1.4,
    lineHeight: 74,
  },
  tagline: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#6f7482",
  },
});
