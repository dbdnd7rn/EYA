import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, Linking } from "react-native";
import { useRouter } from "expo-router";
import TopNav from "@/components/TopNav";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type Tier = "basic" | "silver" | "gold" | "platinum";

type SubscriptionRow = {
  tier: Tier;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
  price_mwk: number | null;
  created_at: string | null;
};

const PLANS: Array<{
  tier: Tier;
  price: number;
  headline: string;
  bullets: string[];
  highlight?: boolean;
}> = [
  { tier: "basic", price: 0, headline: "Start free", bullets: ["1 listing", "Basic visibility", "Enquiries inbox"] },
  { tier: "silver", price: 10000, headline: "Small landlords", bullets: ["Up to 5 listings", "More photos", "Better visibility"] },
  { tier: "gold", price: 15000, headline: "Most popular", bullets: ["Up to 10 listings", "Priority visibility", "Growth-focused"], highlight: true },
  { tier: "platinum", price: 25000, headline: "Scale faster", bullets: ["Up to 25 listings", "Top visibility", "Best exposure"] },
];

function money(mwk: number) {
  if (mwk === 0) return "Free";
  return `MWK ${mwk.toLocaleString("en-MW")}`;
}

function formatDate(date?: string | null) {
  if (!date) return "-";
  try {
    return new Date(date).toLocaleDateString();
  } catch {
    return date;
  }
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<Tier>("basic");
  const [subInfo, setSubInfo] = useState<SubscriptionRow | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [busyTier, setBusyTier] = useState<Tier | null>(null);
  const [payerFirstName, setPayerFirstName] = useState("Landlord");
  const [payerLastName, setPayerLastName] = useState("");

  const paychanguBackend = process.env.EXPO_PUBLIC_PAYCHANGU_BACKEND;

  useEffect(() => {
    const load = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg(null);
      setInfoMsg(null);
      setTableMissing(false);

      const { data: prof1 } = await supabase
        .from("profiles")
        .select("first_name,last_name")
        .eq("id", user.id)
        .maybeSingle();

      if (prof1?.first_name || prof1?.last_name) {
        setPayerFirstName(String(prof1?.first_name ?? "Landlord"));
        setPayerLastName(String(prof1?.last_name ?? ""));
      } else {
        const { data: prof2 } = await supabase
          .from("profiles")
          .select("first_name,surname")
          .eq("id", user.id)
          .maybeSingle();

        if (prof2?.first_name || prof2?.surname) {
          setPayerFirstName(String(prof2?.first_name ?? "Landlord"));
          setPayerLastName(String(prof2?.surname ?? ""));
        } else {
          const { data: prof3 } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .maybeSingle();

          const full = String(prof3?.full_name ?? "").trim();
          if (full) {
            const parts = full.split(/\s+/);
            setPayerFirstName(parts[0] || "Landlord");
            setPayerLastName(parts.slice(1).join(" "));
          }
        }
      }

      const { data, error } = await supabase
        .from("subscriptions")
        .select("tier,start_date,end_date,is_active,price_mwk,created_at")
        .eq("landlord_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        const msg = error.message || "Failed to load subscription.";
        const missing = /relation .*subscriptions.* does not exist|Could not find the table/i.test(msg);
        setTableMissing(missing);
        if (!missing) setErrorMsg(msg);
        setSubInfo(null);
        setTier("basic");
      } else {
        const row = (data as SubscriptionRow | null) ?? null;
        setSubInfo(row);
        setTier((row?.tier as Tier | undefined) ?? "basic");
      }

      setLoading(false);
    };

    load();
  }, [user?.id]);

  const initiateSubscriptionPayment = async (selectedTier: Tier) => {
    if (loading || busyTier) return;
    setErrorMsg(null);
    setInfoMsg(null);

    if (selectedTier === tier) {
      setInfoMsg("This is already your current plan.");
      return;
    }

    if (selectedTier === "basic") {
      setInfoMsg("Basic plan is free. You can continue using the platform.");
      return;
    }

    if (!user?.id) {
      setErrorMsg("Please log in again.");
      return;
    }

    if (!paychanguBackend) {
      setErrorMsg("Payment backend not configured (EXPO_PUBLIC_PAYCHANGU_BACKEND).");
      return;
    }

    const plan = PLANS.find((p) => p.tier === selectedTier);
    if (!plan) {
      setErrorMsg("Invalid plan selected.");
      return;
    }

    setBusyTier(selectedTier);
    try {
      const res = await fetch(`${paychanguBackend}/api/paychangu/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: "pa-level",
          amount: plan.price,
          currency: "MWK",
          email: user.email || "no-email@palevel.local",
          first_name: payerFirstName || "Landlord",
          last_name: payerLastName || "",
          title: `Pa-Level ${selectedTier.toUpperCase()} Subscription`,
          description: `Landlord subscription (${selectedTier})`,
          meta: {
            purpose: "subscription",
            landlord_id: user.id,
            tier: selectedTier,
            duration_days: 180,
          },
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.checkout_url) {
        throw new Error(json?.message || json?.error || "Failed to initiate payment.");
      }

      await Linking.openURL(String(json.checkout_url));
    } catch (e: any) {
      setErrorMsg(e?.message || "Failed to start payment.");
    } finally {
      setBusyTier(null);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <TopNav title="Subscription" />
      <ScrollView contentContainerStyle={styles.content}>
        {errorMsg ? (
          <View style={styles.errBox}>
            <Text style={styles.errText}>{errorMsg}</Text>
          </View>
        ) : null}

        {infoMsg ? (
          <View style={styles.okBox}>
            <Text style={styles.okText}>{infoMsg}</Text>
          </View>
        ) : null}

        {tableMissing ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              Subscription table not found yet. Showing default plans (Basic active).
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.title}>Current plan</Text>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#ff0f64" />
              <Text style={styles.meta}>Loading subscription...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.price}>{tier.toUpperCase()}</Text>
              <Text style={styles.sub}>
                {PLANS.find((p) => p.tier === tier)?.headline ?? "Landlord subscription"}
              </Text>
              <View style={styles.metaWrap}>
                <Text style={styles.meta}>Start: {formatDate(subInfo?.start_date)}</Text>
                <Text style={styles.meta}>End: {formatDate(subInfo?.end_date)}</Text>
                <Text style={styles.meta}>
                  Price: {subInfo?.price_mwk != null ? money(subInfo.price_mwk) : money(PLANS.find((p) => p.tier === tier)?.price ?? 0)}
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.plansWrap}>
          {PLANS.map((plan) => {
            const current = plan.tier === tier;
            return (
              <View key={plan.tier} style={[styles.planCard, plan.highlight && styles.planCardHighlight]}>
                <View style={styles.planTop}>
                  <Text style={styles.planTier}>{plan.tier.toUpperCase()}</Text>
                  {current ? <Text style={styles.badge}>Current</Text> : null}
                </View>
                <Text style={styles.planPrice}>{money(plan.price)}</Text>
                <Text style={styles.planHeadline}>{plan.headline}</Text>
                {plan.bullets.map((b) => (
                  <Text key={b} style={styles.bullet}>• {b}</Text>
                ))}

                {current ? (
                  <Pressable style={[styles.planBtn, styles.planBtnMuted]} disabled>
                    <Text style={styles.planBtnMutedText}>Current plan</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.planBtn, busyTier === plan.tier && { opacity: 0.7 }]}
                    onPress={() => initiateSubscriptionPayment(plan.tier)}
                    disabled={busyTier !== null}
                  >
                    <Text style={styles.planBtnText}>
                      {busyTier === plan.tier ? "Redirecting..." : "Subscribe"}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.actionsRow}>
          <Pressable style={styles.softBtn} onPress={() => router.push("/pricing")}>
            <Text style={styles.softBtnText}>Pricing details</Text>
          </Pressable>
          <Pressable style={styles.btn} onPress={() => router.push("/(landlord)/(tabs)/create")}>
            <Text style={styles.btnText}>Create listing</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  errBox: { borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", borderRadius: 16, padding: 12 },
  errText: { color: "#b0003a", fontWeight: "800" },
  okBox: { borderWidth: 1, borderColor: "#d7f3e3", backgroundColor: "#f1fff7", borderRadius: 16, padding: 12 },
  okText: { color: "#0a6b3d", fontWeight: "800" },
  noteBox: { borderWidth: 1, borderColor: "#e1e4ef", backgroundColor: "#fff", borderRadius: 16, padding: 12 },
  noteText: { color: "#5f6b85", fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 16, gap: 10 },
  title: { color: "#0e2756", fontWeight: "900", fontSize: 20 },
  price: { color: "#ff0f64", fontWeight: "900", fontSize: 24, letterSpacing: 0.5 },
  sub: { color: "#5f6b85", fontWeight: "700" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  metaWrap: { gap: 4, marginTop: 4 },
  meta: { color: "#5f6b85", fontWeight: "700" },
  plansWrap: { gap: 12 },
  planCard: { backgroundColor: "#fff", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "#e7eaf6" },
  planCardHighlight: { borderColor: "#ffbfd4" },
  planTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  planTier: { color: "#0e2756", fontWeight: "900", fontSize: 12 },
  badge: { color: "#fff", backgroundColor: "#0e2756", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 11, fontWeight: "900" },
  planPrice: { color: "#0e2756", fontWeight: "900", fontSize: 22 },
  planHeadline: { color: "#5f6b85", fontWeight: "700", marginTop: 2, marginBottom: 8 },
  bullet: { color: "#0e2756", fontWeight: "700", marginBottom: 4 },
  planBtn: { marginTop: 10, backgroundColor: "#ff0f64", borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  planBtnText: { color: "#fff", fontWeight: "900" },
  planBtnMuted: { backgroundColor: "#eef1fb" },
  planBtnMutedText: { color: "#0e2756", fontWeight: "900" },
  actionsRow: { gap: 10 },
  softBtn: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#e1e4ef" },
  softBtnText: { color: "#0e2756", fontWeight: "900" },
  btn: { marginTop: 6, backgroundColor: "#0e2756", borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "900" },
});
