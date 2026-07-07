import React, { useEffect, useRef } from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";

type Props = {
  onComplete: () => void;
};

const LOGO = require("../assets/eya-logo-transparent.png");

export default function EyaLaunchAnimation({ onComplete }: Props) {
  const { width } = useWindowDimensions();
  const completedRef = useRef(false);
  const logoWidth = Math.min(width - 56, 380);

  const complete = React.useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const timer = setTimeout(complete, 1400);
    return () => clearTimeout(timer);
  }, [complete]);

  return (
    <View style={styles.overlay}>
      <Image source={LOGO} style={[styles.logo, { width: logoWidth }]} resizeMode="contain" />
    </View>
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
