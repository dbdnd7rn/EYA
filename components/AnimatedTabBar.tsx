import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
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
  const indicatorX = useSharedValue(0);

  React.useEffect(() => {
    indicatorX.value = withSpring(activeVisibleIndex * tabWidth, {
      damping: 18,
      stiffness: 180,
      mass: 0.9,
    });
  }, [activeVisibleIndex, indicatorX, tabWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    opacity: tabWidth > 0 && !activeRouteIsFloating ? 1 : 0,
  }));

  return (
    <View pointerEvents="box-none" style={[styles.safeArea, { bottom: Math.max(10, insets.bottom + 8) }]}>
      <View
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        style={[
          styles.shell,
          hasFloatingTab && styles.shellFloating,
          {
            backgroundColor: theme.backgroundColor,
            borderColor: theme.borderColor,
            shadowColor: theme.glowColor,
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            indicatorStyle,
            {
              width: Math.max(tabWidth - 8, 0),
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
                size: isFloating ? 34 : 22,
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
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [focusProgress, isFocused]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pressedScale.value }],
      shadowOpacity: isFloating ? 0 : focusProgress.value * 0.28,
      shadowRadius: isFloating ? 0 : 14 * focusProgress.value,
      shadowColor: theme.glowColor,
      elevation: isFloating ? 0 : 7 * focusProgress.value,
    };
  });

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      focusProgress.value,
      [0, 1],
      [theme.inactiveColor, theme.activeColor],
    ),
    opacity: withTiming(isFocused ? 1 : 0.84, { duration: 160 }),
  }));

  return (
    <Animated.View
      style={[
        styles.itemWrap,
        isFloating && styles.itemWrapFloating,
        animatedStyle,
        {
          width: tabWidth || undefined,
        },
      ]}
    >
      <Pressable
        accessibilityLabel={`${label} tab`}
        accessibilityRole="tab"
        accessibilityState={isFocused ? { selected: true } : { selected: false }}
        hitSlop={8}
        onLongPress={onLongPress}
        onPressIn={() => {
          pressedScale.value = withTiming(0.95, { duration: 80 });
        }}
        onPressOut={() => {
          pressedScale.value = withSpring(1, { damping: 12, stiffness: 220 });
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
    animation: "fade" as const,
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
    left: 10,
    right: 10,
  },
  shell: {
    overflow: "hidden",
    borderRadius: 32,
    borderWidth: 1,
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 7,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  shellFloating: {
    overflow: "visible",
    paddingTop: 2,
  },
  indicator: {
    position: "absolute",
    top: 7,
    bottom: 7,
    left: 4,
    borderRadius: 27,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  itemWrap: {
    flex: 1,
    minWidth: 0,
    borderRadius: 27,
    shadowOffset: { width: 0, height: 0 },
  },
  itemWrapFloating: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: -34,
  },
  pressable: {
    minHeight: 64,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 7,
  },
  pressableFloating: {
    width: 88,
    minHeight: 88,
    borderRadius: 44,
    borderWidth: 6,
    paddingHorizontal: 0,
    paddingVertical: 0,
    shadowOpacity: 0.32,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  iconWrap: {
    minHeight: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeWrap: {
    position: "absolute",
    top: 7,
    right: 12,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#ff0f64",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
  },
  label: {
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center",
  },
});
