import React from "react";
import { TextInput, TextInputProps, View, Text } from "react-native";

type Props = TextInputProps & { label?: string; hint?: string };

export function Input({ label, hint, ...props }: Props) {
  return (
    <View className="gap-2">
      {label ? <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</Text> : null}
      <TextInput
        className="w-full rounded-2xl bg-bg px-4 py-3 text-sm text-ink border border-line"
        placeholderTextColor="#6B7280"
        {...props}
      />
      {hint ? <Text className="text-xs text-muted">{hint}</Text> : null}
    </View>
  );
}
