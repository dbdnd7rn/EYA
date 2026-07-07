import React from "react";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

type Brand = "airtel_money" | "mpamba";

export default function PaymentBrandLogo({
  brand,
  size = 42,
  active = false,
}: {
  brand: Brand;
  size?: number;
  active?: boolean;
}) {
  if (brand === "airtel_money") return <AirtelMoneyLogo size={size} active={active} />;
  return <MpambaLogo size={size} active={active} />;
}

function AirtelMoneyLogo({ size, active }: { size: number; active: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 112 82" fill="none">
      <Defs>
        <LinearGradient id="airtelBg" x1="8" y1="8" x2="104" y2="74" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#FFF1F2" />
        </LinearGradient>
      </Defs>
      <Rect x="4" y="4" width="104" height="74" rx="18" fill="url(#airtelBg)" stroke={active ? "#E60012" : "#F3B4BB"} strokeWidth="2.4" />
      <G transform="translate(13 8)">
        <Circle cx="30" cy="23" r="18" fill="#E60012" />
        <Path
          d="M24.5 13.5C34.8 9.9 46.1 11.5 52.4 17.9C58.7 24.2 56.1 33.6 47.9 39.3C41.5 43.8 32.5 45.3 22.4 43.8C28.4 38.5 33 32.5 32.1 28.7C31.5 26.4 29.2 26 26.2 27.7C23.3 29.3 20.8 32.3 18.6 37.4C14.4 35.2 12.5 31.6 13.2 27.5C14.1 21.8 18.8 15.5 24.5 13.5Z"
          fill="#FFFFFF"
        />
        <Path
          d="M19.9 43.8C23.5 41.3 27.7 40.8 29.2 42.8C30.9 45 28.2 48.7 23.1 51.1C19.1 53 14.8 53.5 12.9 52.4C11.2 51.4 11.9 49.3 14.5 47.4C15.8 46.4 17.6 45.2 19.9 43.8Z"
          fill="#FFFFFF"
        />
      </G>
      <SvgText x="68" y="36" textAnchor="middle" fontSize="21" fontWeight="900" fill="#E60012">
        airtel
      </SvgText>
      <SvgText x="68" y="56" textAnchor="middle" fontSize="15" fontWeight="900" fill="#E60012">
        money
      </SvgText>
    </Svg>
  );
}

function MpambaLogo({ size, active }: { size: number; active: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 112 82" fill="none">
      <Defs>
        <LinearGradient id="tnmBg" x1="8" y1="8" x2="104" y2="74" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#F1FFF5" />
        </LinearGradient>
      </Defs>
      <Rect x="4" y="4" width="104" height="74" rx="18" fill="url(#tnmBg)" stroke={active ? "#149447" : "#BFE5CA"} strokeWidth="2.4" />
      <G transform="translate(17 12)">
        <Rect x="0" y="0" width="22" height="10" rx="5" fill="#149447" />
        <Rect x="28" y="0" width="22" height="10" rx="5" fill="#F4B400" />
        <Rect x="56" y="0" width="22" height="10" rx="5" fill="#1E73BE" />
      </G>
      <SvgText x="56" y="44" textAnchor="middle" fontSize="29" fontWeight="900" fill="#149447">
        TNM
      </SvgText>
      <SvgText x="56" y="62" textAnchor="middle" fontSize="16" fontWeight="900" fill="#111827">
        Mpamba
      </SvgText>
    </Svg>
  );
}
