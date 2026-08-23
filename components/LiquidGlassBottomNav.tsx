import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TabBadge = string | number | undefined;

const ACTIVE_COLOR = "#102B5C";
const INACTIVE_COLOR = "#6F7890";
const ACTIVE_BACKGROUND = "rgba(74, 96, 166, 0.11)";
const BAR_BACKGROUND = "rgba(255, 255, 255, 0.68)";
const BORDER_COLOR = "rgba(255, 255, 255, 0.76)";
const PRESS_LOCK_MS = 420;
const BAR_HEIGHT = 70;
const ACTIVE_CAPSULE_MAX_WIDTH = 84;
const ACTIVE_CAPSULE_MIN_WIDTH = 58;

export const LIQUID_GLASS_NAV_CONTENT_PADDING = 104;

type IconProps = {
  color: string;
  focused: boolean;
  size: number;
  strokeWidth: number;
};

export type LiquidGlassNavItem = {
  badge?: TabBadge;
  key: string;
  label: string;
  onLongPress?: () => void;
  onPress: () => void;
  renderIcon: (props: IconProps) => React.ReactNode;
};

type LiquidGlassBottomNavProps = {
  activeKey: string;
  items: LiquidGlassNavItem[];
};

export function LiquidGlassBottomNav({ activeKey, items }: LiquidGlassBottomNavProps) {
  const insets = useSafeAreaInsets();
  const lastPressAtRef = React.useRef(0);
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === activeKey),
  );
  const [barWidth, setBarWidth] = React.useState(0);
  const tabCount = items.length || 1;
  const tabWidth = barWidth > 0 ? barWidth / tabCount : 0;
  const bubbleWidth = tabWidth > 0
    ? Math.max(ACTIVE_CAPSULE_MIN_WIDTH, Math.min(ACTIVE_CAPSULE_MAX_WIDTH, tabWidth - 24))
    : 0;
  const bubbleX = useSharedValue(0);

  React.useEffect(() => {
    const centeredOffset = Math.max(0, (tabWidth - bubbleWidth) / 2);
    bubbleX.value = withSpring(activeIndex * tabWidth + centeredOffset, {
      damping: 20,
      stiffness: 210,
      mass: 0.78,
    });
  }, [activeIndex, bubbleWidth, bubbleX, tabWidth]);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: tabWidth > 0 ? 1 : 0,
    width: bubbleWidth,
    transform: [{ translateX: bubbleX.value }],
  }));

  const handleItemPress = React.useCallback((item: LiquidGlassNavItem, focused: boolean) => {
    if (focused) return;

    const now = Date.now();
    if (now - lastPressAtRef.current < PRESS_LOCK_MS) return;
    lastPressAtRef.current = now;

    requestAnimationFrame(() => item.onPress());
  }, []);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.safeArea, { paddingBottom: Math.max(8, insets.bottom + 6) }]}
    >
      <View style={styles.shadowWrap}>
        <BlurView
          experimentalBlurMethod="dimezisBlurView"
          intensity={34}
          tint="systemUltraThinMaterialLight"
          onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
          style={styles.glassShell}
        >
          <View pointerEvents="none" style={styles.glassTint} />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(255,255,255,0.58)", "rgba(255,255,255,0.18)", "rgba(238,243,255,0.36)"]}
            locations={[0, 0.52, 1]}
            start={{ x: 0.08, y: 0 }}
            end={{ x: 0.96, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.topHighlight} />
          <View pointerEvents="none" style={styles.innerBorder} />

          <Animated.View pointerEvents="none" style={[styles.activeBubble, bubbleStyle]}>
            <LinearGradient
              colors={["rgba(255,255,255,0.52)", "rgba(78,103,177,0.10)", "rgba(255,255,255,0.24)"]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.bubbleHighlight} />
          </Animated.View>

          <View style={styles.row}>
            {items.map((item) => {
              const focused = activeKey === item.key;
              const color = focused ? ACTIVE_COLOR : INACTIVE_COLOR;
              return (
                <LiquidTabItem
                  key={item.key}
                  badge={item.badge}
                  color={color}
                  focused={focused}
                  icon={item.renderIcon({
                    color,
                    focused,
                    size: 23,
                    strokeWidth: focused ? 2.65 : 2.2,
                  })}
                  label={item.label}
                  onPress={() => handleItemPress(item, focused)}
                  onLongPress={item.onLongPress}
                />
              );
            })}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

function LiquidTabItem({
  badge,
  color,
  focused,
  icon,
  label,
  onLongPress,
  onPress,
}: {
  badge?: TabBadge;
  color: string;
  focused: boolean;
  icon: React.ReactNode;
  label: string;
  onLongPress?: () => void;
  onPress: () => void;
}) {
  const pressed = useSharedValue(1);
  const focusProgress = useSharedValue(focused ? 1 : 0);

  React.useEffect(() => {
    focusProgress.value = withTiming(focused ? 1 : 0, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
    });
  }, [focusProgress, focused]);

  const itemStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pressed.value },
      { translateY: interpolate(focusProgress.value, [0, 1], [0, -1.5]) },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focusProgress.value, [0, 1], [INACTIVE_COLOR, ACTIVE_COLOR]),
    opacity: interpolate(focusProgress.value, [0, 1], [0.82, 1]),
  }));

  return (
    <Animated.View style={[styles.itemWrap, itemStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        onLongPress={onLongPress}
        onPress={onPress}
        onPressIn={() => {
          pressed.value = withTiming(0.95, { duration: 80 });
        }}
        onPressOut={() => {
          pressed.value = withSpring(1, { damping: 14, stiffness: 260 });
        }}
        style={styles.pressable}
      >
        <View style={styles.iconWrap}>{icon}</View>
        {badge ? (
          <View style={styles.badgeWrap}>
            <Text style={styles.badgeText} numberOfLines={1} allowFontScaling={false}>
              {badge}
            </Text>
          </View>
        ) : null}
        <Animated.Text style={[styles.label, labelStyle, { color }]} numberOfLines={1} allowFontScaling={false}>
          {label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    paddingHorizontal: 16,
    paddingTop: 6,
    backgroundColor: "transparent",
  },
  shadowWrap: {
    width: "100%",
    height: BAR_HEIGHT,
    borderRadius: 28,
    shadowColor: "#102B5C",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  glassShell: {
    height: BAR_HEIGHT,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    backgroundColor: BAR_BACKGROUND,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BAR_BACKGROUND,
  },
  topHighlight: {
    position: "absolute",
    left: 22,
    right: 22,
    top: 5,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  activeBubble: {
    position: "absolute",
    top: 8,
    bottom: 8,
    left: 0,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: ACTIVE_BACKGROUND,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.48)",
    shadowColor: "#102B5C",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  bubbleHighlight: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 5,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.66)",
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    zIndex: 2,
  },
  itemWrap: {
    flex: 1,
    minWidth: 0,
    borderRadius: 22,
  },
  pressable: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 2,
  },
  iconWrap: {
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 10.5,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center",
  },
  badgeWrap: {
    position: "absolute",
    top: 5,
    right: 13,
    minWidth: 17,
    height: 17,
    borderRadius: 8.5,
    paddingHorizontal: 4,
    backgroundColor: "#ff3864",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 8.5,
    fontWeight: "900",
  },
});
