import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter, type Href } from "expo-router";
import { goBackOrFallback } from "@/lib/navigation";
import EyaWordmark from "@/components/brand/EyaWordmark";

export default function TopNav({
  title = "EYA",
  showBack,
  backFallback = "/",
}: {
  title?: string;
  showBack?: boolean;
  backFallback?: Href;
}) {
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <View style={styles.inner}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {showBack ? (
            <Pressable onPress={() => goBackOrFallback(router, backFallback)} style={styles.backBtn}>
              <Text style={styles.backTxt}>{"<"}</Text>
            </Pressable>
          ) : null}

          {title === "EYA" ? <EyaWordmark width={92} height={34} /> : <Text style={styles.title}>{title}</Text>}
        </View>

        <View style={styles.rightSpacer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#f6f7fb",
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  inner: {
    backgroundColor: "white",
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#e7eaf6",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: "#f6f7fb",
    borderWidth: 1,
    borderColor: "#e1e4ef",
    alignItems: "center",
    justifyContent: "center",
  },
  backTxt: { fontSize: 16, color: "#0e2756", fontWeight: "800" },
  title: { fontSize: 16, fontWeight: "900", color: "#0e2756" },

  rightSpacer: { width: 36, height: 36 },
});

