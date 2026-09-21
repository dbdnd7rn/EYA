import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { AnimatedTabTheme } from "@/components/AnimatedTabBar";

type TabBadge = string | number | undefined;

type Props = BottomTabBarProps & {
  theme: AnimatedTabTheme;
  visibleTabNames: string[];
};

export default function StudentTabBar({ state, descriptors, navigation, theme, visibleTabNames }: Props) {
  const insets = useSafeAreaInsets();
  const activeRouteKey = state.routes[state.index]?.key;
  const visibleRoutes = React.useMemo(
    () =>
      state.routes.filter((route) => {
        if (!visibleTabNames.includes(route.name)) return false;
        const options = descriptors[route.key]?.options as { href?: unknown } | undefined;
        return options?.href !== null;
      }),
    [descriptors, state.routes, visibleTabNames],
  );

  const rawActiveIndex = visibleRoutes.findIndex((route) => route.key === activeRouteKey);
  const hasVisibleActiveRoute = rawActiveIndex >= 0;
  const activeVisibleIndex = hasVisibleActiveRoute ? rawActiveIndex : 0;
  const [barWidth, setBarWidth] = React.useState(0);
  const contentWidth = Math.max(barWidth - 12, 0);
  const tabCount = visibleRoutes.length || 1;
  const tabWidth = contentWidth > 0 ? contentWidth / tabCount : 0;
  const capsuleX = useSharedValue(0);

  React.useEffect(() => {
    if (!hasVisibleActiveRoute || !tabWidth) return;
    capsuleX.value = withSpring(activeVisibleIndex * tabWidth, {
      damping: 20,
      stiffness: 205,
      mass: 0.82,
    });
  }, [activeVisibleIndex, capsuleX, hasVisibleActiveRoute, tabWidth]);

  const capsuleStyle = useAnimatedStyle(() => ({
    width: Math.max(tabWidth - 8, 0),
    opacity: hasVisibleActiveRoute && tabWidth > 0 ? 1 : 0,
    transform: [{ translateX: capsuleX.value }],
  }));

  return (
    <View pointerEvents="box-none" style={[styles.safeArea, { bottom: Math.max(10, insets.bottom + 8) }]}>
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
            styles.activeCapsule,
            capsuleStyle,
            {
              backgroundColor: theme.indicatorColor,
              borderColor: theme.borderColor,
              shadowColor: theme.glowColor,
            },
          ]}
        />

        <View style={styles.row}>
          {visibleRoutes.map((route) => {
            const descriptor = descriptors[route.key];
            const { options } = descriptor;
            const focused = route.key === activeRouteKey;
            const label =
              typeof options.tabBarLabel === "string"
                ? options.tabBarLabel
                : typeof options.title === "string"
                  ? options.title
                  : route.name;
            const iconColor = focused ? theme.activeColor : theme.inactiveColor;

            return (
              <StudentTabItem
                key={route.key}
                badge={options.tabBarBadge as TabBadge}
                focused={focused}
                icon={options.tabBarIcon?.({ focused, color: iconColor, size: 23 })}
                label={label}
                tabWidth={tabWidth}
                theme={theme}
                onPress={() => {
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
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
    </View>
  );
}

function StudentTabItem({
  badge,
  focused,
  icon,
  label,
  onLongPress,
  onPress,
  tabWidth,
  theme,
}: {
  badge?: TabBadge;
  focused: boolean;
  icon: React.ReactNode;
  label: string;
  onLongPress: () => void;
  onPress: () => void;
  tabWidth: number;
  theme: AnimatedTabTheme;
}) {
  const focusProgress = useSharedValue(focused ? 1 : 0);
  const pressScale = useSharedValue(1);

  React.useEffect(() => {
    focusProgress.value = withTiming(focused ? 1 : 0, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
    });
  }, [focusProgress, focused]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(focusProgress.value, [0, 1], [0.52, 1]),
    transform: [
      { translateY: interpolate(focusProgress.value, [0, 1], [0, -2]) },
      { scale: pressScale.value * interpolate(focusProgress.value, [0, 1], [1, 1.055]) },
    ],
  }));

  const markStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
    transform: [{ scaleX: interpolate(focusProgress.value, [0, 1], [0.3, 1]) }],
  }));

  return (
    <View style={[styles.item, { width: tabWidth || undefined }]}>
      <Pressable
        accessibilityLabel={`${label} tab`}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        hitSlop={6}
        onLongPress={onLongPress}
        onPress={onPress}
        onPressIn={() => {
          pressScale.value = withTiming(0.94, { duration: 80 });
        }}
        onPressOut={() => {
          pressScale.value = withSpring(1, { damping: 14, stiffness: 260 });
        }}
        style={styles.pressable}
      >
        <Animated.View style={[styles.content, contentStyle]}>
          <View style={styles.iconWrap}>{icon}</View>
          <Animated.Text
            numberOfLines={1}
            allowFontScaling={false}
            style={[
              styles.label,
              {
                color: focused ? theme.activeColor : theme.inactiveColor,
                fontWeight: focused ? "900" : "800",
              },
            ]}
          >
            {label}
          </Animated.Text>
          <Animated.View style={[styles.activeMark, markStyle, { backgroundColor: theme.activeColor }]} />
        </Animated.View>

        {badge ? (
          <View style={[styles.badge, { borderColor: theme.backgroundColor }]}>
            <Animated.Text style={styles.badgeText} numberOfLines={1} allowFontScaling={false}>
              {badge}
            </Animated.Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    position: "absolute",
    left: 12,
    right: 12,
    alignItems: "center",
  },
  shell: {
    width: "100%",
    maxWidth: 760,
    minHeight: 72,
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 5,
    overflow: "hidden",
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 9,
  },
  activeCapsule: {
    position: "absolute",
    left: 10,
    top: 5,
    bottom: 5,
    borderRadius: 25,
    borderWidth: 1,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    zIndex: 2,
  },
  item: {
    flex: 1,
    minWidth: 0,
  },
  pressable: {
    flex: 1,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minWidth: 56,
  },
  iconWrap: {
    height: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 0,
    textAlign: "center",
  },
  activeMark: {
    width: 16,
    height: 2.5,
    borderRadius: 999,
    marginTop: 1,
  },
  badge: {
    position: "absolute",
    top: 5,
    right: 11,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: "#ff285d",
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
  },
});
