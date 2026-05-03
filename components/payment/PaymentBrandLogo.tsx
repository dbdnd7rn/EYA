import React from "react";
import Svg, { G, Path, Rect, Text as SvgText } from "react-native-svg";

type Brand = "airtel_money" | "mpamba";

export default function PaymentBrandLogo({
  brand,
  size = 34,
  active = false,
}: {
  brand: Brand;
  size?: number;
  active?: boolean;
}) {
  if (brand === "airtel_money") {
    return <AirtelMoneyLogo size={size} active={active} />;
  }
  return <MpambaLogo size={size} active={active} />;
}

function AirtelMoneyLogo({ size, active }: { size: number; active: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <Rect x="3.5" y="3.5" width="65" height="65" rx="20" fill="#ED1C24" stroke={active ? "#FFFFFF" : "#F86F75"} strokeWidth="2.2" />
      <Path
        d="M34.6 15.8C40.6 14.3 46.5 14.9 50.6 18.2C54.6 21.3 55.7 26.4 53.4 30.8C50.2 36.9 43.2 39.5 35.2 40.8C37.8 37.8 40.1 34.6 40.8 31.7C41.2 30.2 40.9 29 39.8 28.4C38.3 27.6 35.7 28.1 33.1 30C31.7 31 30.2 32.7 28.9 34.9C27 33.8 25.9 32.4 25.5 30.7C24.1 25.5 27.8 17.6 34.6 15.8Z"
        fill="#FFFFFF"
      />
      <Path
        d="M28.6 42.1C30.5 40 32.6 38.9 34.6 39.2C36.4 39.4 37.1 40.8 36.1 42.7C34.5 45.8 30.8 48.5 26 50.1C24 50.8 22.3 51.1 20.9 51.1C20.1 51.1 19.4 50.6 19.2 49.8C18.8 48.4 19.3 46.9 20.5 45.9C22.2 44.4 24.8 43.1 28.6 42.1Z"
        fill="#FFFFFF"
      />
      <SvgText x="36" y="54" textAnchor="middle" fontSize="13.8" fontWeight="900" fill="#FFFFFF">
        airtel
      </SvgText>
      <SvgText x="36" y="63.2" textAnchor="middle" fontSize="6.9" fontWeight="500" letterSpacing="0.35" fill="#FFFFFF">
        money
      </SvgText>
    </Svg>
  );
}

function MpambaLogo({ size, active }: { size: number; active: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <Rect x="3.5" y="3.5" width="65" height="65" rx="20" fill="#FFFFFF" stroke={active ? "#2FA84F" : "#D4E8D8"} strokeWidth="2.2" />

      <G transform="translate(17 9)">
        <Path d="M0 12 16 6 18.8 21.2 3.2 27.1 0 12Z" fill="none" stroke="#2FA84F" strokeWidth="2.3" strokeLinejoin="round" />
        <Path d="M14.2 5 31 2 33.8 16.8 17.2 20.1 14.2 5Z" fill="none" stroke="#2FA84F" strokeWidth="2.3" strokeLinejoin="round" />
        <Path d="M18.3 13.2 23.2 11.9 24.8 31 19.6 32.1 18.3 13.2Z" fill="#2FA84F" />
        <Path d="M14.8 11.8 27.8 9.3 31.3 12.1 17.9 14.8 14.8 11.8Z" fill="#2FA84F" />
      </G>

      <SvgText x="36" y="50.2" textAnchor="middle" fontSize="17.5" fontWeight="900" fill="#2FA84F">
        tnm
      </SvgText>
      <SvgText x="36" y="60.5" textAnchor="middle" fontSize="8.4" fontWeight="800" fill="#171717">
        Mpamba
      </SvgText>
    </Svg>
  );
}
