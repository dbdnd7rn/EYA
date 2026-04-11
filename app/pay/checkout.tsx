import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

export default function PayCheckoutWebviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ url?: string; tx_ref?: string }>();
  const paymentUrl = typeof params.url === "string" ? decodeURIComponent(params.url) : "";
  const txRef = typeof params.tx_ref === "string" ? params.tx_ref : undefined;

  const valid = useMemo(() => /^https?:\/\//i.test(paymentUrl), [paymentUrl]);

  if (!valid) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.title}>Invalid payment link</Text>
          <Text style={styles.sub}>Could not open checkout. Please go back and retry.</Text>
          <Pressable style={styles.btn} onPress={() => router.back()}>
            <Text style={styles.btnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <WebView
        source={{ uri: paymentUrl }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#ff0f64" />
            <Text style={styles.loadingText}>Opening payment checkout...</Text>
          </View>
        )}
        onNavigationStateChange={(state) => {
          const url = state.url ?? "";
          if (!url) return;

          if (url.includes("/pay/success") || url.includes("status=success")) {
            router.replace({ pathname: "/pay/success", params: { tx_ref: txRef } });
            return;
          }

          if (url.includes("/pay/cancel") || url.includes("status=cancelled") || url.includes("status=failed")) {
            router.replace({ pathname: "/pay/cancel", params: { tx_ref: txRef } });
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, gap: 8 },
  title: { color: "#0e2756", fontWeight: "900", fontSize: 18 },
  sub: { color: "#5f6b85", fontWeight: "600", fontSize: 13, textAlign: "center" },
  btn: { marginTop: 6, borderRadius: 12, backgroundColor: "#0e2756", paddingVertical: 10, paddingHorizontal: 14 },
  btnText: { color: "#fff", fontWeight: "900" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: "#5f6b85", fontWeight: "700" },
});
