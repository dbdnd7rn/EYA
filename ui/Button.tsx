import React from "react";
import { Pressable, Text, PressableProps, ActivityIndicator } from "react-native";

type Props = PressableProps & {
  title: string;
  loading?: boolean;
  variant?: "primary" | "ghost" | "outline";
};

export function Button({ title, loading, variant = "primary", ...props }: Props) {
  const base = "rounded-2xl px-4 py-3 items-center justify-center";
  const styles =
    variant === "primary"
      ? "bg-pink"
      : variant === "outline"
      ? "bg-white border border-line"
      : "bg-transparent";
  const textStyle = variant === "primary" ? "text-white" : "text-ink";

  return (
    <Pressable className={`${base} ${styles} ${props.disabled ? "opacity-60" : ""}`} {...props}>
      {loading ? <ActivityIndicator /> : <Text className={`text-sm font-semibold ${textStyle}`}>{title}</Text>}
    </Pressable>
  );
}
