import React from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";

export default function AppHeader({ title }: { title?: string }) {
  return (
    <View className="px-4 pt-2 pb-3 border-b border-line bg-white">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => router.push("/(student)/(tabs)/home")}>
          <Text className="text-lg font-extrabold text-navy">
            Pa<Text className="text-pink">-Level</Text>
          </Text>
        </Pressable>
        <Text className="text-sm font-semibold text-ink">{title ?? ""}</Text>
      </View>
    </View>
  );
}
