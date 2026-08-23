import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

export type AnimatedTabTheme = {
  activeColor: string;
  inactiveColor: string;
  backgroundColor: string;
  borderColor: string;
  indicatorColor: string;
  glowColor: string;
  sceneBackgroundColor: string;
  blurTint?: "light" | "dark" | "default";
  floatingTabName?: string;
  floatingTabBackgroundColor?: string;
  floatingTabIconColor?: string;
  floatingTabBorderColor?: string;
  floatingTabShadowColor?: string;
};

type Props = BottomTabBarProps & {
  theme: AnimatedTabTheme;
  visibleTabNames?: string[];
};

type TabBadge = string | number | undefined;

const INDICATOR_MIN_WIDTH = 48;
const INDICATOR_MAX_WIDTH = 72;

export function AnimatedTabBar({ state, descriptors, navigation, theme, visibleTabNames }: Props) {
  const insets = useSafeAreaInsets();
  const activeRouteKey = state.routes[state.index]?.key;
  const visibleRoutes = React.useMemo(
    () =>
      state.routes.filter((route) => {
        if (visibleTabNames?.length && !visibleTabNames.includes(route.name)) return false;
        const options = descriptors[route.key]?.options as { href?: unknown } | undefined;
        return options?.href !== null;
      }),
    [descriptors, state.routes, visibleTabNames],
  );
  const activeVisibleIndex = Math.max(
    0,
    visibleRoutes.findIndex((route) => route.key === activeRouteKey),
  );
  const hasFloatingTab = Boolean(theme.floatingTabName && visibleRoutes.some((route) => route.name === theme.floatingTabName));
  const activeVisibleRoute = visibleRoutes[activeVisibleIndex];
  const activeRouteIsFloating = activeVisibleRoute?.name === theme.floatingTabName;
  const [barWidth, setBarWidth] = React.useState(0);
  const tabCount = visibleRoutes.length || 1;
  const tabWidth = barWidth > 0 ? barWidth / tabCount : 0;
  const indicatorWidth = tabWidth > 0
    ? Math.max(INDICATOR_MIN_WIDTH, Math.min(INDICATOR_MAX_WIDTH, tabWidth - 14))
    : 0;
  const indicatorX = useSharedValue(0);

  React.useEffect(() => {
    const centeredOffset = Math.max(0, (tabWidth - indicatorWidth) / 2);
    indicatorX.value = withSpring(activeVisibleIndex * tabWidth + centeredOffset, {
      damping: 20,
      stiffness: 210,
      mass: 0.78,
    });
  }, [activeVisibleIndex, indicatorWidth, indicatorX, tabWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: indicatorWidth,
    transform: [{ translateX: indicatorX.value }],
    opacity: tabWidth > 0 && !activeRouteIsFloating ? 1 : 0,
  }));

  return (
    <View pointerEvents="box-none" style={[styles.safeArea, { bottom: Math.max(8, insets.bottom + 6) }]}>
      <View
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        style={[
          styles.shell,
          hasFloatingTab && styles.shellFloating,
          {
            borderColor: theme.borderColor,
            shadowColor: theme.glowColor,
          },
        ]}
      >
        <BlurView
          pointerEvents="none"
          intensity={32}
          tint={theme.blurTint ?? "light"}
          style={styles.blurLayer}
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.backgroundColor }]} />
        </BlurView>

        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            indicatorStyle,
            {
              backgroundColor: theme.indicatorColor,
              shadowColor: theme.glowColor,
            },
          ]}
        />

        {visibleRoutes.map((route) => {
          const descriptor = descriptors[route.key];
          const { options } = descriptor;
          const isFloating = route.name === theme.floatingTabName;
          const label =
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : typeof options.title === "string"
                ? options.title
                : route.name;
          const isFocused = activeRouteKey === route.key;
          const iconColor = isFloating
            ? theme.floatingTabIconColor ?? "#fff"
            : isFocused
              ? theme.activeColor
              : theme.inactiveColor;

          return (
            <TabBarItem
              key={route.key}
              badge={options.tabBarBadge as TabBadge}
              floatingBorderColor={theme.floatingTabBorderColor}
              floatingButtonColor={theme.floatingTabBackgroundColor}
              floatingShadowColor={theme.floatingTabShadowColor ?? theme.glowColor}
              hideLabel={isFloating}
              isFocused={isFocused}
              isFloating={isFloating}
              label={label}
              tabWidth={tabWidth}
              theme={theme}
              icon={options.tabBarIcon?.({
                focused: isFocused,
                color: iconColor,
                size: isFloating ? 28 : 21,
              })}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              onLongPress={() =>
                navigation.emit({
                  type: "tabLongPress",
                  target: route.key,
                })
              }
            />
          );
        })}
      </View>
    </View>
  );
}

function TabBarItem({
  badge,
  floatingBorderColor,
  floatingButtonColor,
  floatingShadowColor,
  hideLabel,
  icon,
  isFocused,
  isFloating,
  label,
  onLongPress,
  onPress,
  tabWidth,
  theme,
}: {
  badge?: TabBadge;
  floatingBorderColor?: string;
  floatingButtonColor?: string;
  floatingShadowColor?: string;
  hideLabel?: boolean;
  icon: React.ReactNode;
  isFocused: boolean;
  isFloating?: boolean;
  label: string;
  onLongPress: () => void;
  onPress: () => void;
  tabWidth: number;
  theme: AnimatedTabTheme;
}) {
  const pressedScale = useSharedValue(1);
  const focusProgress = useSharedValue(isFocused ? 1 : 0);

  React.useEffect(() => {
    focusProgress.value = withTiming(isFocused ? 1 : 0, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
    });
  }, [focusProgress, isFocused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pressedScale.value },
      { translateY: isFloating ? 0 : interpolate(focusProgress.value, [0, 1], [0, -1.5]) },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      focusProgress.value,
      [0, 1],
      [theme.inactiveColor, theme.activeColor],
    ),
    opacity: interpolate(focusProgress.value, [0, 1], [0.78, 1]),
  }));

  return (
    <Animated.View
      style={[
        styles.itemWrap,
        isFloating && styles.itemWrapFloating,
        animatedStyle,
        { width: tabWidth || undefined },
      ]}
    >
      <Pressable
        accessibilityLabel={`${label} tab`}
        accessibilityRole="tab"
        accessibilityState={isFocused ? { selected: true } : { selected: false }}
        hitSlop={8}
        onLongPress={onLongPress}
        onPressIn={() => {
          pressedScale.value = withTiming(0.94, { duration: 80 });
        }}
        onPressOut={() => {
          pressedScale.value = withSpring(1, { damping: 14, stiffness: 260 });
        }}
        onPress={onPress}
        style={[
          styles.pressable,
          isFloating && styles.pressableFloating,
          isFloating && {
            backgroundColor: floatingButtonColor ?? theme.activeColor,
            borderColor: floatingBorderColor ?? "#fff",
            shadowColor: floatingShadowColor ?? theme.glowColor,
          },
        ]}
      >
        <View style={styles.iconWrap}>{icon}</View>
        {badge ? (
          <View style={styles.badgeWrap}>
            <Animated.Text style={styles.badgeText} numberOfLines={1}>
              {badge}
            </Animated.Text>
          </View>
        ) : null}
        {!hideLabel ? (
          <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1} allowFontScaling={false}>
            {label}
          </Animated.Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export function createTabScreenOptions(theme: AnimatedTabTheme) {
  return {
    headerShown: false,
    animation: "none" as const,
    freezeOnBlur: false,
    lazy: false,
    unmountOnBlur: false,
    sceneStyle: {
      backgroundColor: theme.sceneBackgroundColor,
    },
  };
}

export function renderAnimatedTabBar(theme: AnimatedTabTheme, visibleTabNames?: string[]) {
  function AnimatedTabBarRenderer(props: BottomTabBarProps) {
    return <AnimatedTabBar {...props} theme={theme} visibleTabNames={visibleTabNames} />;
  }

  AnimatedTabBarRenderer.displayName = "AnimatedTabBarRenderer";

  return AnimatedTabBarRenderer;
}

const styles = StyleSheet.create({
  safeArea: {
    position: "absolute",
    left: 12,
    right: 12,
  },
  shell: {
    minHeight: 66,
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    paddingVertical: 6,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  shellFloating: {
    overflow: "visible",
  },
  blurLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    overflow: "hidden",
  },
  indicator: {
    position: "absolute",
    top: 7,
    bottom: 7,
    left: 0,
    borderRadius: 21,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  itemWrap: {
    flex: 1,
    minWidth: 0,
    borderRadius: 22,
  },
  itemWrapFloating: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
  },
  pressable: {
    minHeight: 54,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    paddingHorizontal: 3,
    paddingVertical: 5,
  },
  pressableFloating: {
    width: 64,
    minHeight: 64,
    borderRadius: 32,
    borderWidth: 4,
    paddingHorizontal: 0,
    paddingVertical: 0,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  iconWrap: {
    minHeight: 23,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeWrap: {
    position: "absolute",
    top: 5,
    right: 10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "#ff0f64",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
  },
  label: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center",
  },
});
