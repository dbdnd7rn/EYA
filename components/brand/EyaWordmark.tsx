import React from "react";
import { Image, Text, View } from "react-native";

type Props = {
  width?: number;
  height?: number;
  withTagline?: boolean;
};

const PRIMARY_LOGO = require("../../assets/eya-logo-transparent.png");
const FALLBACK_LOGO = require("../../assets/icon.png");

type LogoStage = "primary" | "fallback" | "text";

export default function EyaWordmark({ width = 118, height = 44, withTagline = true }: Props) {
  const [logoStage, setLogoStage] = React.useState<LogoStage>("primary");

  const imageSource = logoStage === "fallback" ? FALLBACK_LOGO : PRIMARY_LOGO;
  const shouldRenderTextFallback = logoStage === "text";
  const showTagline = withTagline && height >= 44;

  return (
    <View style={{ width, minHeight: height, justifyContent: "center" }}>
      {shouldRenderTextFallback ? (
        <View>
          <Text style={{ color: "#0e2756", fontSize: Math.max(24, height * 0.68), fontWeight: "900", letterSpacing: -1.2 }}>
            EYA
          </Text>
          {showTagline ? (
            <Text style={{ color: "#6b7280", fontSize: Math.max(10, height * 0.24), fontWeight: "600", marginTop: -2 }}>
              Everything You Access
            </Text>
          ) : null}
        </View>
      ) : (
        <Image
          source={imageSource}
          style={{ width: "100%", height }}
          resizeMode="contain"
          onError={() => {
            setLogoStage((current) => {
              if (current === "primary") return "fallback";
              return "text";
            });
          }}
        />
      )}
    </View>
  );
}
