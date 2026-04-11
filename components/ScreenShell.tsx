import React from "react";
import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TopNav from "@/components/TopNav";

export default function ScreenShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-[#f6f7fb]">
      <TopNav />
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View className="px-6 py-8">
          {title ? <Text className="text-2xl font-extrabold text-[#0e2756]">{title}</Text> : null}

          <View className="mt-4 rounded-3xl bg-white p-6 shadow-lg">
            {children}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
