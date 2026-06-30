import React from "react";
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";

type Props = {
  width?: number;
  height?: number;
};

export default function EyaTicketsWordmark({ width = 248, height = 58 }: Props) {
  return (
    <Svg width={width} height={height} viewBox="0 0 248 58" fill="none">
      <Defs>
        <LinearGradient id="eyaTicketsEya" x1="0" y1="0" x2="122" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#3F35A5" />
          <Stop offset="0.52" stopColor="#8738B4" />
          <Stop offset="1" stopColor="#F02F78" />
        </LinearGradient>
        <LinearGradient id="eyaTicketsTitle" x1="118" y1="0" x2="248" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#102B5C" />
          <Stop offset="0.55" stopColor="#5039A6" />
          <Stop offset="1" stopColor="#F02F78" />
        </LinearGradient>
      </Defs>

      <Path
        d="M2.5 43.2C21.4 51.4 58.2 51.1 91.8 45.8C104.9 43.8 112.6 40.8 121 36.4"
        stroke="#4037A6"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.86"
      />
      <SvgText
        x="3"
        y="38"
        fill="url(#eyaTicketsEya)"
        fontSize="38"
        fontWeight="900"
        fontStyle="italic"
        letterSpacing="-2"
      >
        EYA
      </SvgText>

      <Path
        d="M105.5 8.5C99.9 8.5 95.4 13 95.4 18.6C95.4 26.4 105.5 38.6 105.5 38.6C105.5 38.6 115.6 26.4 115.6 18.6C115.6 13 111.1 8.5 105.5 8.5Z"
        fill="#F02F78"
      />
      <Circle cx="105.5" cy="18.7" r="3.8" fill="#FFFFFF" />

      <SvgText
        x="123"
        y="39"
        fill="url(#eyaTicketsTitle)"
        fontSize="34"
        fontWeight="900"
        letterSpacing="-1.2"
      >
        Tickets
      </SvgText>
    </Svg>
  );
}
