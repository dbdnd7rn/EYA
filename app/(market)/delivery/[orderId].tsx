import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Bike, MapPin, Phone } from "lucide-react-native";
import { goBackOrFallback } from "@/lib/navigation";

export default function DeliveryTrackingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string; from?: string; to?: string; eta?: string }>();
  const [loading, setLoading] = useState(true);
  const reveal = useRef(new Animated.Value(0)).current;
  const etaPulse = useRef(new Animated.Value(1)).current;

  const orderId = params.orderId ?? "ORD-1001";
  const from = params.from ?? "Vendor pickup";
  const to = params.to ?? "Customer location";
  const eta = params.eta ?? "18 min";

  const progress = useMemo(
    () => [
      { title: "Order confirmed", done: true },
      { title: "Rider assigned", done: true },
      { title: "Picked up", done: true },
      { title: "On the way", done: true },
      { title: "Delivered", done: false },
    ],
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 300);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(etaPulse, { toValue: 1.04, duration: 700, useNativeDriver: true }),
        Animated.timing(etaPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    ).start();

    return () => clearTimeout(t);
  }, [etaPulse, reveal]);

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.skeletonWrap}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.skeletonCard} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={{
          opacity: reveal,
          transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
        }}
      >
        <Pressable style={styles.backBtn} onPress={() => goBackOrFallback(router, "/(market)/(tabs)/orders")}>
          <ArrowLeft size={16} color="#0e2756" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.h1}>Live Delivery</Text>
        <Text style={styles.sub}>Order {orderId}</Text>

        <View style={styles.mapMock}>
          <Text style={styles.mapLabel}>Live route preview</Text>
          <View style={styles.routePoint}>
            <MapPin size={14} color="#0e2756" />
            <Text style={styles.routeText}>{from}</Text>
          </View>
          <View style={styles.routePoint}>
            <MapPin size={14} color="#0d7a37" />
            <Text style={styles.routeText}>{to}</Text>
          </View>
          <Animated.View style={[styles.etaPill, { transform: [{ scale: etaPulse }] }]}>
            <Bike size={14} color="#fff" />
            <Text style={styles.etaText}>ETA {eta}</Text>
          </Animated.View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery progress</Text>
          <View style={{ gap: 8 }}>
            {progress.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No delivery timeline</Text>
                <Text style={styles.emptySub}>Timeline updates will appear once the rider is assigned.</Text>
              </View>
            ) : (
              progress.map((step, index) => (
                <Animated.View
                  key={step.title}
                  style={{
                    opacity: reveal.interpolate({
                      inputRange: [index * 0.12, index * 0.12 + 0.3],
                      outputRange: [0, 1],
                      extrapolate: "clamp",
                    }),
                    transform: [
                      {
                        translateX: reveal.interpolate({
                          inputRange: [index * 0.12, index * 0.12 + 0.3],
                          outputRange: [10, 0],
                          extrapolate: "clamp",
                        }),
                      },
                    ],
                  }}
                >
                  <View style={styles.stepRow}>
                    <View style={[styles.dot, step.done && styles.dotDone]} />
                    <Text style={[styles.stepText, step.done && styles.stepTextDone]}>{step.title}</Text>
                  </View>
                </Animated.View>
              ))
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Rider</Text>
          <Text style={styles.sub}>Mphatso Banda � Bike � PB 2331</Text>
          <Pressable style={styles.callBtn}>
            <Phone size={14} color="#fff" />
            <Text style={styles.callBtnText}>Call rider</Text>
          </Pressable>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f4f7" },
  content: { padding: 16, gap: 12, paddingBottom: 118 },
  skeletonWrap: { padding: 16, gap: 10 },
  skeletonCard: { height: 100, borderRadius: 18, backgroundColor: "#dde6ff" },
  backBtn: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderColor: "#dfe5f4", backgroundColor: "#fff", paddingHorizontal: 11, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  backText: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  h1: { color: "#0e2756", fontWeight: "900", fontSize: 27 },
  sub: { color: "#6e7892", fontWeight: "600", fontSize: 13 },
  mapMock: { borderRadius: 20, borderWidth: 1, borderColor: "#e7ebf5", backgroundColor: "#fff", padding: 12, gap: 8 },
  mapLabel: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  routePoint: { flexDirection: "row", alignItems: "center", gap: 6 },
  routeText: { color: "#1f2c49", fontWeight: "700", fontSize: 12 },
  etaPill: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#0e2756", paddingHorizontal: 10, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 5 },
  etaText: { color: "#fff", fontWeight: "900", fontSize: 11 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: "#e7ebf5", backgroundColor: "#fff", padding: 12, gap: 8 },
  sectionTitle: { color: "#0e2756", fontWeight: "900", fontSize: 16 },
  emptyCard: { borderRadius: 14, borderWidth: 1, borderColor: "#e7ebf5", backgroundColor: "#f8f9fd", padding: 10, alignItems: "center", gap: 4 },
  emptyTitle: { color: "#0e2756", fontWeight: "900", fontSize: 13 },
  emptySub: { color: "#6e7892", fontWeight: "600", fontSize: 11, textAlign: "center" },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ced5e8" },
  dotDone: { backgroundColor: "#0d7a37" },
  stepText: { color: "#5f6b85", fontWeight: "700", fontSize: 12 },
  stepTextDone: { color: "#0e2756" },
  callBtn: { marginTop: 2, alignSelf: "flex-start", borderRadius: 12, backgroundColor: "#0e2756", paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 7 },
  callBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
});
