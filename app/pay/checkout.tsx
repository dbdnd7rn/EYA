import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { CreditCard, Lock, ShieldCheck } from "lucide-react-native";
import { isTrustedPayChanguCheckoutUrl } from "@/lib/standardTicketCheckout";

const CALLBACK_PATHS = new Set(["/v1/paychangu/callback", "/v1/paychangu/return"]);

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export default function PayCheckoutWebviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    url?: string;
    tx_ref?: string;
    order_id?: string;
    payment_id?: string;
    payment_method?: string;
  }>();
  const paymentUrl = typeof params.url === "string" ? decodeURIComponent(params.url) : "";
  const txRef = typeof params.tx_ref === "string" ? params.tx_ref.trim() : "";
  const orderId = typeof params.order_id === "string" ? params.order_id.trim() : "";
  const paymentId = typeof params.payment_id === "string" ? params.payment_id.trim() : "";
  const paymentMethod = typeof params.payment_method === "string" ? params.payment_method.trim() : "";
  const completedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const valid = useMemo(
    () => Boolean(
      orderId &&
      txRef &&
      paymentId &&
      paymentMethod === "card" &&
      isTrustedPayChanguCheckoutUrl(paymentUrl)
    ),
    [orderId, paymentId, paymentMethod, paymentUrl, txRef],
  );

  const finishCheckout = React.useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    router.replace({
      pathname: "/(student)/market/payment-processing",
      params: { orderId, txRef, paymentId, paymentMethod: "card" },
    } as any);
  }, [orderId, paymentId, router, txRef]);

  if (!valid) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.title}>Checkout blocked</Text>
          <Text style={styles.sub}>
            EYA rejected an invalid or untrusted card-payment session. No payment page was opened.
          </Text>
          <Pressable style={styles.btn} onPress={() => router.back()}>
            <Text style={styles.btnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.title}>Could not open PayChangu</Text>
          <Text style={styles.sub}>{loadError}</Text>
          <Pressable style={styles.btn} onPress={() => router.back()}>
            <Text style={styles.btnText}>Return to checkout</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <WebView
        source={{ uri: paymentUrl }}
        originWhitelist={["https://*"]}
        startInLoadingState
        cacheEnabled={false}
        incognito
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures={false}
        mixedContentMode="never"
        renderLoading={() => (
          <View style={styles.loadingWrap}>
            <View style={styles.loadingCard}>
              <View style={styles.cardIconStage}>
                <View style={styles.cardIconHalo} />
                <View style={styles.cardIconCore}>
                  <CreditCard size={30} color="#6B5CD4" />
                </View>
              </View>
              <ActivityIndicator size="small" color="#6B5CD4" />
              <Text style={styles.loadingTitle}>Opening secure card checkout</Text>
              <Text style={styles.loadingText}>Connecting to PayChangu’s protected PCI-compliant payment page…</Text>
              <View style={styles.securePill}>
                <ShieldCheck size={14} color="#159447" />
                <Text style={styles.securePillText}>Card details stay outside EYA</Text>
              </View>
              <View style={styles.lockRow}>
                <Lock size={12} color="#7A84A0" />
                <Text style={styles.lockText}>HTTPS only · trusted PayChangu checkout</Text>
              </View>
            </View>
          </View>
        )}
        onShouldStartLoadWithRequest={(request) => {
          const next = parseUrl(request.url ?? "");
          if (!next) return false;

          if (request.isTopFrame && request.url === paymentUrl) {
            return isTrustedPayChanguCheckoutUrl(request.url);
          }

          // PayChangu may redirect to an HTTPS 3-D Secure issuer page. Credentials
          // embedded in URLs and all non-HTTPS navigation remain blocked.
          return next.protocol === "https:" && !next.username && !next.password;
        }}
        onNavigationStateChange={(state) => {
          const parsed = parseUrl(state.url ?? "");
          if (!parsed || !CALLBACK_PATHS.has(parsed.pathname)) return;

          const returnedTxRef = parsed.searchParams.get("tx_ref")?.trim() ?? "";
          if (returnedTxRef && returnedTxRef !== txRef) {
            setLoadError("The returned payment reference did not match this order.");
            return;
          }

          if (state.loading === false) finishCheckout();
        }}
        onHttpError={(event) => {
          const statusCode = event.nativeEvent.statusCode;
          if (statusCode >= 500) {
            setLoadError("The payment provider is temporarily unavailable. Your order has not been marked as paid.");
          }
        }}
        onError={() => {
          setLoadError("The secure payment page could not be loaded. Check your internet and try again.");
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  title: { color: "#0e2756", fontWeight: "900", fontSize: 20 },
  sub: { color: "#5f6b85", fontWeight: "600", fontSize: 13, lineHeight: 20, textAlign: "center" },
  btn: { marginTop: 8, borderRadius: 14, backgroundColor: "#0e2756", paddingVertical: 12, paddingHorizontal: 17 },
  btnText: { color: "#fff", fontWeight: "900" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F5F6FC", paddingHorizontal: 24 },
  loadingCard: { width: "100%", maxWidth: 340, borderRadius: 30, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#E5E7F0", alignItems: "center", paddingHorizontal: 24, paddingVertical: 30, shadowColor: "#13285F", shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  cardIconStage: { width: 94, height: 94, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  cardIconHalo: { position: "absolute", width: 94, height: 94, borderRadius: 47, backgroundColor: "#F0EDFF" },
  cardIconCore: { width: 66, height: 66, borderRadius: 22, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#E1DDFB", alignItems: "center", justifyContent: "center", shadowColor: "#6B5CD4", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  loadingTitle: { color: "#13285F", fontWeight: "900", fontSize: 20, lineHeight: 26, textAlign: "center", marginTop: 12 },
  loadingText: { color: "#66708A", fontWeight: "700", fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 6 },
  securePill: { marginTop: 18, borderRadius: 999, backgroundColor: "#F0FAF4", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 9 },
  securePillText: { color: "#397453", fontWeight: "900", fontSize: 11 },
  lockRow: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  lockText: { color: "#7A84A0", fontWeight: "700", fontSize: 10 },
});