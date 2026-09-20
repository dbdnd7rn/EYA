import { useSafeAreaInsets } from "react-native-safe-area-context";

export const FLOATING_NAV_HEIGHT = 66;
export const LIQUID_GLASS_NAV_HEIGHT = 92;
export const FLOATING_NAV_MIN_GAP = 10;
export const FLOATING_NAV_CONTENT_GAP = 24;

export function useFloatingNavBottomOffset(minGap = FLOATING_NAV_MIN_GAP) {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, minGap);
}

export function useFloatingNavContentPadding(
  navHeight = FLOATING_NAV_HEIGHT,
  extraGap = FLOATING_NAV_CONTENT_GAP,
) {
  const insets = useSafeAreaInsets();
  return navHeight + Math.max(insets.bottom, FLOATING_NAV_MIN_GAP) + extraGap;
}
