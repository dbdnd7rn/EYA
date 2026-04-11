import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
};

type Props = BottomTabBarProps & {
  theme: AnimatedTabTheme;
  visibleTabNames?: string[];
};

type TabBadge = string | number | undefined;

export function AnimatedTabBar({ state, descriptors, navigation, theme, visibleTabNames }: Props) {
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
    opacity: tabWidth > 0 ? 1 : 0,
  }));

  return (
    <View pointerEvents="box-none" style={styles.safeArea}>
      <View
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        style={[
          styles.shell,
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
              width: Math.max(tabWidth - 10, 0),
              backgroundColor: theme.indicatorColor,
              shadowColor: theme.glowColor,
            },
          ]}
        />

        {visibleRoutes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const { options } = descriptor;
          const label =
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : typeof options.title === "string"
                ? options.title
                : route.name;
          const isFocused = activeRouteKey === route.key;

          return (
            <TabBarItem
              key={route.key}
              badge={options.tabBarBadge as TabBadge}
              isFocused={isFocused}
              label={label}
              tabWidth={tabWidth}
              theme={theme}
              icon={options.tabBarIcon?.({
                focused: isFocused,
                color: isFocused ? theme.activeColor : theme.inactiveColor,
                size: 22,
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
  icon,
  isFocused,
  label,
  onLongPress,
  onPress,
  tabWidth,
  theme,
}: {
  badge?: TabBadge;
  icon: React.ReactNode;
  isFocused: boolean;
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
    const color = interpolateColor(
      focusProgress.value,
      [0, 1],
      [theme.inactiveColor, theme.activeColor],
    );

    return {
      transform: [{ scale: pressedScale.value }],
      shadowOpacity: focusProgress.value * 0.28,
      shadowRadius: 14 * focusProgress.value,
      shadowColor: theme.glowColor,
      elevation: 7 * focusProgress.value,
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
        animatedStyle,
        {
          width: tabWidth || undefined,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        onLongPress={onLongPress}
        onPressIn={() => {
          pressedScale.value = withTiming(0.95, { duration: 80 });
        }}
        onPressOut={() => {
          pressedScale.value = withSpring(1, { damping: 12, stiffness: 220 });
        }}
        onPress={onPress}
        style={styles.pressable}
      >
        <View style={styles.iconWrap}>{icon}</View>
        {badge ? (
          <View style={styles.badgeWrap}>
            <Animated.Text style={styles.badgeText} numberOfLines={1}>
              {badge}
            </Animated.Text>
          </View>
        ) : null}
        <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
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
  return (props: BottomTabBarProps) => <AnimatedTabBar {...props} theme={theme} visibleTabNames={visibleTabNames} />;
}

const styles = StyleSheet.create({
  safeArea: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
  },
  shell: {
    overflow: "hidden",
    borderRadius: 34,
    borderWidth: 1,
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  indicator: {
    position: "absolute",
    top: 8,
    bottom: 8,
    left: 5,
    borderRadius: 28,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  itemWrap: {
    borderRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  pressable: {
    minHeight: 66,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  iconWrap: {
    minHeight: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeWrap: {
    position: "absolute",
    top: 8,
    right: 16,
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
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.1,
  },
});
