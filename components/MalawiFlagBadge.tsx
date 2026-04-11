import React from "react";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

export default function MalawiFlagBadge({ size = 66 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 66 66" fill="none">
      <Circle cx="33" cy="33" r="31.5" fill="#FFFFFF" stroke="rgba(255,255,255,0.86)" strokeWidth="3" />
      <G clipPath="url(#clip0)">
        <Rect x="3" y="3" width="60" height="20" fill="#111111" />
        <Rect x="3" y="23" width="60" height="20" fill="#D63841" />
        <Rect x="3" y="43" width="60" height="20" fill="#1D8C43" />
        <Path
          d="M33 9C26.2 9 20.365 12.556 17.014 17.906H48.986C45.635 12.556 39.8 9 33 9Z"
          fill="#D63841"
        />
        <Path d="M33 10.8L31.872 15.197H34.128L33 10.8Z" fill="#D63841" />
        <Path d="M24.719 13.228L26.758 17.28L28.393 15.745L24.719 13.228Z" fill="#D63841" />
        <Path d="M20.042 17.12L23.638 19.293L24.298 17.141L20.042 17.12Z" fill="#D63841" />
        <Path d="M41.281 13.228L37.607 15.745L39.242 17.28L41.281 13.228Z" fill="#D63841" />
        <Path d="M45.958 17.12L41.702 17.141L42.362 19.293L45.958 17.12Z" fill="#D63841" />
      </G>
      <Circle cx="33" cy="33" r="31.5" stroke="rgba(13,24,58,0.08)" strokeWidth="1" />
    </Svg>
  );
}
