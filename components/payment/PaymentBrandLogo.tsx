import React from "react";
import Svg, { Path, Rect, Text as SvgText } from "react-native-svg";

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
    <Svg width={size} height={size} viewBox="0 0 96 72" fill="none">
      <Rect x="3" y="3" width="90" height="66" rx="16" fill="#FFFFFF" stroke={active ? "#ED1C24" : "#F6B2B6"} strokeWidth="2" />
      <Path
        d="M35.3 14.9C44.4 11.9 54 14.2 59.2 20.3C65.3 27.4 61.2 37.5 51.3 42.4C45.7 45.2 38.7 46.4 31.4 46.1C36.6 40.8 41.1 34.4 40.5 30.7C40.1 28.5 37.9 27.9 34.8 29.5C31.9 31 28.7 34.4 26.6 39.5C22.8 37.1 20.9 33.7 21.6 29.5C22.5 23.3 27.8 17.4 35.3 14.9Z"
        fill="#ED1C24"
      />
      <Path
        d="M28.7 46.3C31.1 43.6 34 42.3 36.2 43.2C38.7 44.2 38.2 47.2 34.9 50C31.7 52.8 26.3 54.8 21.4 54.8C19.7 54.8 18.8 53.5 19.7 52.1C21 50 24.1 47.9 28.7 46.3Z"
        fill="#ED1C24"
      />
      <SvgText x="48" y="56" textAnchor="middle" fontSize="20" fontWeight="900" fill="#ED1C24">
        airtel
      </SvgText>
      <SvgText x="48" y="65" textAnchor="middle" fontSize="9" fontWeight="800" fill="#ED1C24">
        money
      </SvgText>
    </Svg>
  );
}

function MpambaLogo({ size, active }: { size: number; active: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 72" fill="none">
      <Rect x="3" y="3" width="90" height="66" rx="16" fill="#FFFFFF" stroke={active ? "#25A64A" : "#D4E8D8"} strokeWidth="2" />
      <Rect x="19" y="15" width="16" height="7" rx="3.5" fill="#25A64A" />
      <Rect x="40" y="15" width="16" height="7" rx="3.5" fill="#FDB913" />
      <Rect x="61" y="15" width="16" height="7" rx="3.5" fill="#1D71B8" />
      <SvgText x="48" y="45" textAnchor="middle" fontSize="26" fontWeight="900" fill="#25A64A">
        TNM
      </SvgText>
      <SvgText x="48" y="59" textAnchor="middle" fontSize="13" fontWeight="900" fill="#171717">
        Mpamba
      </SvgText>
    </Svg>
  );
}
