import React from "react";
import Svg, { Circle, Ellipse, Path, Rect, Text as SvgText } from "react-native-svg";

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
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Rect x="2" y="2" width="60" height="60" rx="18" fill={active ? "#FFFFFF" : "#FFF6F6"} />
      <Path
        d="M20 21C25 12 39 8 46 14C51 18 47 31 35 39C30 42 25 43 22 40C18 36 18 28 20 21Z"
        fill="#ED1C24"
      />
      <Path d="M25 41C28 37 33 35 36 36C39 37 38 40 33 44C28 48 23 48 25 41Z" fill="#ED1C24" />
      <SvgText x="32" y="50" textAnchor="middle" fontSize="11" fontWeight="800" fill="#ED1C24">
        airtel
      </SvgText>
      <SvgText x="32" y="59" textAnchor="middle" fontSize="7" fontWeight="800" fill="#ED1C24">
        money
      </SvgText>
    </Svg>
  );
}

function MpambaLogo({ size, active }: { size: number; active: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Rect x="2" y="2" width="60" height="60" rx="18" fill={active ? "#FFFFFF" : "#F5FBF3"} />
      <Circle cx="32" cy="28" r="18" fill="#2F7D31" />
      <Path d="M15 29C22 22 31 19 49 20C42 29 34 34 17 38L15 29Z" fill="#F0C31A" />
      <Rect x="27" y="16" width="12" height="22" rx="2.5" fill="#FFFFFF" />
      <Rect x="29" y="19" width="8" height="10" rx="1.6" fill="#7FB561" />
      <Circle cx="31" cy="32.5" r="1.15" fill="#2F7D31" />
      <Circle cx="35" cy="32.5" r="1.15" fill="#2F7D31" />
      <Circle cx="31" cy="36" r="1.15" fill="#2F7D31" />
      <Circle cx="35" cy="36" r="1.15" fill="#2F7D31" />
      <Ellipse cx="32" cy="17.5" rx="5.4" ry="4.3" fill="#67B43F" />
      <Path d="M12 41.5H52L47 49H17L12 41.5Z" fill="#F0C31A" />
      <SvgText x="32" y="47" textAnchor="middle" fontSize="8" fontWeight="800" fill="#D62F2F">
        Mpamba
      </SvgText>
      <SvgText x="32" y="54.5" textAnchor="middle" fontSize="5.4" fontWeight="800" fill="#D62F2F">
        TNM
      </SvgText>
    </Svg>
  );
}
