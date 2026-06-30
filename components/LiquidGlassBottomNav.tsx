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
const ACTIVE_BACKGROUND = "rgba(16, 43, 92, 0.10)";
const BAR_BACKGROUND = "rgba(255, 255, 255, 0.78)";
const BORDER_COLOR = "rgba(255, 255, 255, 0.65)";

export const LIQUID_GLASS_NAV_CONTENT_PADDING = 164;

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
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === activeKey),
  );
  const [barWidth, setBarWidth] = React.useState(0);
  const tabCount = items.length || 1;
  const tabWidth = barWidth > 0 ? barWidth / tabCount : 0;
  const bubbleX = useSharedValue(0);

  React.useEffect(() => {
    bubbleX.value = withSpring(activeIndex * tabWidth, {
      damping: 19,
      stiffness: 185,
      mass: 0.86,
    });
  }, [activeIndex, bubbleX, tabWidth]);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: tabWidth > 0 ? 1 : 0,
    width: Math.max(tabWidth - 10, 0),
    transform: [{ translateX: bubbleX.value + 5 }],
  }));

  return (
    <View pointerEvents="box-none" style={[styles.safeArea, { bottom: insets.bottom + 20 }]}>
      <View style={styles.shadowWrap}>
        <BlurView
          experimentalBlurMethod="dimezisBlurView"
          intensity={48}
          tint="systemUltraThinMaterialLight"
          onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
          style={styles.glassShell}
        >
          <View pointerEvents="none" style={styles.glassTint} />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(255,255,255,0.74)", "rgba(255,255,255,0.34)", "rgba(255,255,255,0.56)"]}
            locations={[0, 0.48, 1]}
            start={{ x: 0.08, y: 0 }}
            end={{ x: 0.96, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(255,255,255,0.82)", "rgba(255,255,255,0.12)", "rgba(16,43,92,0.06)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.85 }}
            style={styles.refractionWash}
          />
          <View pointerEvents="none" style={styles.topHighlight} />
          <View pointerEvents="none" style={styles.innerBorder} />

          <Animated.View pointerEvents="none" style={[styles.activeBubble, bubbleStyle]}>
            <BlurView experimentalBlurMethod="dimezisBlurView" intensity={36} tint="systemThinMaterialLight" style={styles.bubbleBlur}>
              <View style={styles.bubbleTint} />
              <LinearGradient
                colors={["rgba(255,255,255,0.78)", "rgba(16,43,92,0.08)", "rgba(255,255,255,0.28)"]}
                start={{ x: 0.08, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.bubbleHighlight} />
            </BlurView>
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
                    size: 24,
                    strokeWidth: focused ? 2.7 : 2.25,
                  })}
                  label={item.label}
                  onPress={item.onPress}
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
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [focusProgress, focused]);

  const itemStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pressed.value },
      { translateY: interpolate(focusProgress.value, [0, 1], [0, -1]) },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focusProgress.value, [0, 1], [INACTIVE_COLOR, ACTIVE_COLOR]),
  }));

  return (
    <Animated.View style={[styles.itemWrap, itemStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        onLongPress={onLongPress}
        onPress={onPress}
        onPressIn={() => {
          pressed.value = withTiming(0.96, { duration: 90 });
        }}
        onPressOut={() => {
          pressed.value = withSpring(1, { damping: 13, stiffness: 240 });
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
    position: "absolute",
    left: 18,
    right: 18,
  },
  shadowWrap: {
    height: 92,
    borderRadius: 42,
    shadowColor: "#102B5C",
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  glassShell: {
    height: 92,
    borderRadius: 42,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    backgroundColor: BAR_BACKGROUND,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BAR_BACKGROUND,
  },
  refractionWash: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 6,
    height: 46,
    borderRadius: 34,
    opacity: 0.86,
  },
  topHighlight: {
    position: "absolute",
    left: 24,
    right: 24,
    top: 7,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.88)",
  },
  innerBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 42,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",
  },
  activeBubble: {
    position: "absolute",
    top: 10,
    bottom: 10,
    left: 0,
    borderRadius: 34,
    overflow: "hidden",
    backgroundColor: ACTIVE_BACKGROUND,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
    shadowColor: "#102B5C",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  bubbleBlur: {
    flex: 1,
    borderRadius: 34,
    overflow: "hidden",
  },
  bubbleTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ACTIVE_BACKGROUND,
  },
  bubbleHighlight: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 8,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.82)",
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
    borderRadius: 34,
  },
  pressable: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 2,
  },
  iconWrap: {
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center",
  },
  badgeWrap: {
    position: "absolute",
    top: 9,
    right: 16,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: "#ff3864",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
  },
});
