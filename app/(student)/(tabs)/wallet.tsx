import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ArrowRight, Eye, EyeOff, HandCoins, Landmark, Send, ShieldCheck, ShoppingBag, Smartphone } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MalawiFlagBadge from "@/components/MalawiFlagBadge";
import PaymentBrandLogo from "@/components/payment/PaymentBrandLogo";
import SoftPageGlow from "@/components/SoftPageGlow";
import { ENV } from "@/lib/env";
import { formatCacheTime } from "@/lib/offlineCache";
import { getWalletSnapshot, saveWalletSnapshot, type WalletSnapshot } from "@/lib/paymentOffline";
import { initializePayChanguCheckout, type DirectChargeSession, type SupportedPaymentMethod, verifyPayChanguTxRef } from "@/lib/payments";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

type ActivityType = "topup" | "payment" | "reward";

type ActivityRow = {
  id: string;
  label: string;
  mode: string | null;
  time: string;
  amount: number;
  type: ActivityType;
};

type WalletState = {
  balance: number;
  points: number;
  activity: ActivityRow[];
};

type WalletAccountDb = {
  balance_mwk: number;
  points: number;
};

type WalletActivityDb = {
  id: string;
  label: string;
  amount_mwk: number;
  type: ActivityType;
  meta?: {
    payment_method?: string | null;
    payment_method_label?: string | null;
    payment_source?: string | null;
  } | null;
  created_at: string;
};

type PendingTopup = DirectChargeSession & { amount: number; method: SupportedPaymentMethod };

const QUICK_AMOUNTS = [10000, 20000, 30000, 50000];

const DEFAULT_STATE: WalletState = {
  balance: 0,
  points: 0,
  activity: [],
};

function nowLabel() {
  return new Date().toLocaleString();
}

function formatCurrency(amount: number) {
  return `MWK ${Math.abs(amount).toLocaleString("en-MW")}`;
}

function sanitizeAmountInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function signedCurrency(amount: number) {
  return `${amount >= 0 ? "+ " : "- "}${formatCurrency(amount)}`;
}

function mapRemoteActivity(rows: WalletActivityDb[]): ActivityRow[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    mode: row.meta?.payment_method_label || row.meta?.payment_source || null,
    time: new Date(row.created_at).toLocaleString(),
    amount: Number(row.amount_mwk),
    type: row.type,
  }));
}

function historyIcon(type: ActivityType, label: string) {
  if (type === "topup") return <Smartphone size={20} color="#e84040" />;
  if (label.toLowerCase().includes("delivery")) return <ShoppingBag size={20} color="#2d5d7b" />;
  return <HandCoins size={20} color="#198278" />;
}

function historyTint(type: ActivityType, label: string) {
  if (type === "topup") return "#fff0f1";
  if (label.toLowerCase().includes("delivery")) return "#eef8fb";
  return "#eef7f3";
}

function paymentMethodLabel(method: SupportedPaymentMethod) {
  if (method === "airtel_money") return "Airtel Money";
  if (method === "bank_transfer") return "Bank Transfer";
  return "Mpamba";
}

function prettifyKey(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function topupInstruction(topup: PendingTopup | null) {
  if (!topup) return "";
  if (topup.method === "bank_transfer") {
    return "Use the transfer details below, then return here and check the wallet payment status.";
  }
  return "Approve the charge on your phone, then return here and check the wallet payment status.";
}

export default function WalletScreen() {
  const { user, session } = useAuth();
  const { theme } = useStudentTheme();
  const { isOnline } = useNetwork();

  const [showBalance, setShowBalance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [state, setState] = useState<WalletState>(DEFAULT_STATE);
  const [cacheTime, setCacheTime] = useState<number | null>(null);
  const [topupAmount, setTopupAmount] = useState("10000");
  const [topupMethod, setTopupMethod] = useState<SupportedPaymentMethod>("airtel_money");
  const [mobileNumber, setMobileNumber] = useState("");
  const [startingPayment, setStartingPayment] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [reconcilingPayment, setReconcilingPayment] = useState(false);
  const [pendingTopup, setPendingTopup] = useState<PendingTopup | null>(null);
  const [lastTopupReference, setLastTopupReference] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const noticeAnim = React.useRef(new Animated.Value(0)).current;

  const saveLocal = async (next: WalletState) => {
    setState(next);
    await saveWalletSnapshot(user?.id, next as WalletSnapshot);
    setCacheTime(Date.now());
  };

  const loadLocal = async () => {
    const cached = await getWalletSnapshot(user?.id);
    if (cached?.data) {
      const parsed = cached.data as WalletState;
      setState(parsed);
      setCacheTime(cached.ts);
      return parsed;
    }
    return DEFAULT_STATE;
  };

  const loadRemote = async () => {
    if (!ENV.PAYCHANGU_BACKEND) {
      throw new Error("PayChangu backend URL is not configured.");
    }
    if (!session?.access_token) {
      throw new Error("You need to log in again.");
    }

    const url = `${ENV.PAYCHANGU_BACKEND.replace(/\/+$/, "")}/api/wallet/me`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.message || `Wallet sync failed (${res.status}).`);
    }

    const account = payload?.account as WalletAccountDb | null;
    const activities = Array.isArray(payload?.activities) ? (payload.activities as WalletActivityDb[]) : [];

    const mapped: WalletState = {
      balance: Number(account?.balance_mwk || 0),
      points: Number(account?.points || 0),
      activity: mapRemoteActivity(activities),
    };

    await saveLocal(mapped);
    return mapped;
  };

  const refreshWallet = async (silent = false) => {
    if (!silent) setLoading(true);
    setMsg(null);

    try {
      if (!isOnline) {
        await loadLocal();
        setMsg("Offline mode: showing your cached wallet snapshot.");
        return;
      }

      if (user?.id) {
        setSyncing(true);
        await loadRemote();
      } else {
        await loadLocal();
      }
    } catch {
      await loadLocal();
      setMsg("Using local wallet data. Could not sync right now.");
    } finally {
      setSyncing(false);
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const bootstrapWallet = async () => {
      const cached = await getWalletSnapshot(user?.id);
      if (!active) return;

      const parsed = (cached?.data as WalletState | undefined) ?? DEFAULT_STATE;
      const hasCachedData = parsed.activity.length > 0 || parsed.balance > 0 || parsed.points > 0;

      if (cached?.data) {
        setState(parsed);
        setCacheTime(cached.ts);
      }

      if (hasCachedData || !isOnline || !user?.id) {
        setLoading(false);
      }

      if (!isOnline) {
        setMsg("Offline mode: showing your cached wallet snapshot.");
        return;
      }

      if (!user?.id) {
        if (!cached?.data) setLoading(false);
        return;
      }

      setSyncing(true);
      setMsg(null);

      try {
        await loadRemote();
      } catch {
        if (!hasCachedData) {
          setMsg("Using local wallet data. Could not sync right now.");
        }
      } finally {
        if (active) {
          setSyncing(false);
          setLoading(false);
        }
      }
    };

    void bootstrapWallet();

    return () => {
      active = false;
    };
  }, [isOnline, user?.id]);

  useEffect(() => {
    if (!msg) {
      noticeAnim.setValue(0);
      return;
    }

    noticeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(noticeAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(noticeAnim, {
        toValue: 0.92,
        duration: 140,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(noticeAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [msg, noticeAnim]);

  const startWalletTopup = async (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) {
      setMsg("Enter a valid amount.");
      return;
    }

    if (!user?.id) {
      setMsg("Log in before topping up your wallet.");
      return;
    }

    const cleanPhone = mobileNumber.trim().replace(/\s+/g, "");
    const requiresPhone = topupMethod === "airtel_money" || topupMethod === "mpamba";
    if (requiresPhone && cleanPhone.length < 8) {
      setMsg("Enter a valid mobile money number.");
      return;
    }

    setMsg(null);
    setStartingPayment(true);

    try {
      const txRef = `wallet_${user.id.slice(0, 8)}_${Date.now()}`;
      const session = await initializePayChanguCheckout({
        amountMwk: amount,
        email: user.email ?? null,
        phone: requiresPhone ? cleanPhone : undefined,
        txRef,
        title: "EYA wallet top-up",
        description: `Wallet top-up of MWK ${amount.toLocaleString("en-MW")}`,
        method: topupMethod,
        metadata: {
          purpose: "wallet_topup",
          user_id: user.id,
          amount_mwk: amount,
        },
      });

      setPendingTopup({
        ...session,
        amount,
        method: topupMethod,
      });
      setLastTopupReference(session.txRef);
    } catch (e: any) {
      setMsg(e?.message ?? "Could not start wallet top-up.");
    } finally {
      setStartingPayment(false);
    }
  };

  const closeCheckout = () => {
    setPendingTopup(null);
  };

  const handleTopupSuccess = async () => {
    if (!pendingTopup || verifyingPayment) return;

    setVerifyingPayment(true);
    try {
      const verification = await verifyPayChanguTxRef(pendingTopup.txRef);
      if (!verification.paid) {
        setMsg("Payment verification is still pending. Check again in a moment.");
        return;
      }

      setPendingTopup(null);
      setMobileNumber("");
      setLastTopupReference(null);
      await refreshWallet(true);
      setMsg(`Wallet top-up of ${formatCurrency(pendingTopup.amount)} confirmed.`);
    } catch (e: any) {
      setMsg(e?.message ?? "Payment verification failed.");
    } finally {
      setVerifyingPayment(false);
    }
  };

  const retryWalletSync = async () => {
    const reference = pendingTopup?.txRef || lastTopupReference;
    if (!reference) {
      setMsg("No recent top-up reference is available to retry.");
      return;
    }
    if (!ENV.PAYCHANGU_BACKEND) {
      setMsg("PayChangu backend URL is not configured.");
      return;
    }
    if (!session?.access_token) {
      setMsg("Please log in again to retry wallet sync.");
      return;
    }

    setReconcilingPayment(true);
    try {
      const url = `${ENV.PAYCHANGU_BACKEND.replace(/\/+$/, "")}/api/paychangu/reconcile`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          reference,
          purpose: "wallet_topup",
          method: pendingTopup?.method,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || `Wallet sync failed (${res.status}).`);
      }

      setPendingTopup(null);
      await refreshWallet(true);
      const nextBalance = Number(data?.wallet_balance_mwk ?? NaN);
      if (Number.isFinite(nextBalance)) {
        setMsg(`Wallet synced. New balance: ${formatCurrency(nextBalance)}.`);
      } else {
        setMsg("Wallet sync completed.");
      }
    } catch (e: any) {
      setMsg(e?.message ?? "Could not retry wallet sync.");
    } finally {
      setReconcilingPayment(false);
    }
  };

  const selectedAmount = Number(topupAmount || "0");

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={styles.skeletonWrap}>
          <View style={[styles.skeletonCard, { height: 174, backgroundColor: theme.surfaceMuted }]} />
          <View style={[styles.skeletonCard, { height: 76, backgroundColor: theme.surfaceMuted }]} />
          <View style={[styles.skeletonCard, { height: 260, backgroundColor: theme.surfaceMuted }]} />
          <View style={[styles.skeletonCard, { height: 220, backgroundColor: theme.surfaceMuted }]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.balanceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.balanceGlowBlue} />
          <View style={styles.balanceGlowPeach} />
          <View style={styles.balanceWave} />

          <View style={styles.balanceTop}>
            <View>
              <Text style={[styles.balanceLabel, { color: theme.textMuted }]}>Wallet Balance</Text>
              <View style={styles.balanceRow}>
                <Text style={[styles.balanceAmount, { color: theme.text }]}>
                  {showBalance ? formatCurrency(state.balance) : "MWK ******"}
                </Text>
                <Pressable onPress={() => setShowBalance((v) => !v)} style={[styles.balanceEye, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                  {showBalance ? <EyeOff size={16} color={theme.textMuted} /> : <Eye size={16} color={theme.textMuted} />}
                </Pressable>
              </View>
            </View>

            <View style={styles.flagBadge}>
              <MalawiFlagBadge size={66} />
            </View>
          </View>

          <View style={styles.heroActions}>
            <Pressable
              style={[styles.topUpBtn, { backgroundColor: theme.accent }, (startingPayment || verifyingPayment) && styles.actionDisabled]}
              onPress={() => void startWalletTopup(selectedAmount)}
              disabled={startingPayment || verifyingPayment}
            >
              <HandCoins size={20} color="#8be0a8" />
              <Text style={styles.topUpBtnText}>{startingPayment ? "Starting..." : "Top Up"}</Text>
              <ArrowRight size={18} color="#ffffff" />
            </Pressable>
          </View>
        </View>

        <View style={[styles.quickTopUpCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Top Up</Text>

          <View style={[styles.phoneRow, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSoft }]}>
            <View style={styles.phoneLeft}>
              <Send size={19} color={theme.textSoft} />
              <TextInput
                value={mobileNumber}
                onChangeText={setMobileNumber}
                placeholder="+265 99 123 4567"
                placeholderTextColor={theme.textSoft}
                keyboardType="phone-pad"
                style={[styles.phoneInput, { color: theme.text }]}
              />
            </View>
            <View style={styles.phoneRight}>
              {topupMethod === "bank_transfer" ? <Landmark size={20} color={theme.textSoft} /> : <Smartphone size={20} color={theme.textSoft} />}
            </View>
          </View>

          <View style={styles.amountGrid}>
            {QUICK_AMOUNTS.map((amount) => {
              const active = amount === selectedAmount;
              return (
                <Pressable key={amount} style={[styles.amountChip, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSoft }, active && styles.amountChipActive, active && { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={() => setTopupAmount(String(amount))}>
                  <Text style={[styles.amountChipText, { color: theme.text }, active && styles.amountChipTextActive]}>{formatCurrency(amount)}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.customAmountCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSoft }]}>
            <Text style={[styles.customAmountLabel, { color: theme.textMuted }]}>Custom amount</Text>
            <View style={[styles.customAmountInputShell, { borderColor: theme.border }]}>
              <Text style={[styles.customAmountPrefix, { color: theme.textSoft }]}>MWK</Text>
              <TextInput
                value={topupAmount}
                onChangeText={(value) => setTopupAmount(sanitizeAmountInput(value))}
                placeholder="Enter amount"
                placeholderTextColor={theme.textSoft}
                keyboardType="number-pad"
                style={[styles.customAmountInput, { color: theme.text }]}
              />
            </View>
            <Text style={[styles.customAmountHint, { color: theme.textSoft }]}>Preset buttons are shortcuts. You can enter any amount you want.</Text>
          </View>

          <View style={styles.methodSwitch}>
            <MethodPill
              label="Airtel"
              active={topupMethod === "airtel_money"}
              icon={<PaymentBrandLogo brand="airtel_money" size={30} active={topupMethod === "airtel_money"} />}
              onPress={() => setTopupMethod("airtel_money")}
            />
            <MethodPill
              label="Mpamba"
              active={topupMethod === "mpamba"}
              icon={<PaymentBrandLogo brand="mpamba" size={30} active={topupMethod === "mpamba"} />}
              onPress={() => setTopupMethod("mpamba")}
            />
            <MethodPill label="Bank" active={topupMethod === "bank_transfer"} onPress={() => setTopupMethod("bank_transfer")} />
          </View>

          <Pressable
            style={[styles.fullTopUpBtn, { backgroundColor: theme.accent }, (startingPayment || verifyingPayment) && styles.actionDisabled]}
            onPress={() => void startWalletTopup(selectedAmount)}
            disabled={startingPayment || verifyingPayment}
          >
            <Text style={styles.fullTopUpBtnText}>
              {startingPayment ? "Starting payment..." : `Top Up ${formatCurrency(selectedAmount || 0)}`}
            </Text>
            <ArrowRight size={20} color="#ffffff" />
          </Pressable>
        </View>

        {msg ? (
          <Animated.View
            style={[
              styles.noticeCard,
              { backgroundColor: theme.isDark ? "#21314c" : "#eef5ff", borderColor: theme.border },
              {
                opacity: noticeAnim,
                transform: [
                  {
                    translateY: noticeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                  {
                    scale: noticeAnim.interpolate({
                      inputRange: [0, 0.92, 1],
                      outputRange: [0.98, 1.01, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={[styles.noticeText, { color: theme.text }]}>{msg}</Text>
            {(pendingTopup?.txRef || lastTopupReference) ? (
              <Pressable
                style={[styles.retrySyncBtn, { backgroundColor: theme.accent }, reconcilingPayment && styles.actionDisabled]}
                onPress={() => void retryWalletSync()}
                disabled={reconcilingPayment}
              >
                {reconcilingPayment ? <ActivityIndicator size="small" color="#ffffff" /> : null}
                <Text style={styles.retrySyncBtnText}>{reconcilingPayment ? "Syncing..." : "Retry wallet sync"}</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        ) : null}

        <View style={styles.historySection}>
          <Text style={[styles.historyTitle, { color: theme.text }]}>Transaction History</Text>

          <View style={[styles.historyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {state.activity.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No wallet activity yet</Text>
                <Text style={[styles.emptySub, { color: theme.textMuted }]}>Your top-ups and wallet purchases will appear here.</Text>
              </View>
            ) : (
              state.activity.map((row, index) => (
                <HistoryRow
                  key={row.id}
                  amount={row.amount}
                  icon={historyIcon(row.type, row.label)}
                  index={index}
                  label={row.label}
                  mode={row.mode}
                  tint={historyTint(row.type, row.label)}
                  time={row.time}
                  total={state.activity.length}
                />
              ))
            )}
          </View>
        </View>

        <Text style={[styles.syncText, { color: theme.textMuted }]}>{user?.id ? (syncing ? "Syncing wallet..." : "Wallet synced across devices") : "Local wallet mode"}</Text>
        {cacheTime ? <Text style={[styles.cacheMeta, { color: theme.textSoft }]}>Wallet cache: {formatCacheTime(cacheTime)}</Text> : null}
      </ScrollView>

      <Modal visible={!!pendingTopup} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeCheckout}>
        <SafeAreaView style={[styles.checkoutRoot, { backgroundColor: theme.backgroundAlt }]}>
          <View style={[styles.checkoutHeader, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View>
              <Text style={[styles.checkoutTitle, { color: theme.text }]}>Complete wallet top-up</Text>
              <Text style={[styles.checkoutSub, { color: theme.textMuted }]}>
                {pendingTopup ? formatCurrency(pendingTopup.amount) : "Processing payment"}
              </Text>
            </View>
            <Pressable style={[styles.checkoutCloseBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} onPress={closeCheckout}>
              <Text style={[styles.checkoutCloseText, { color: theme.text }]}>Close</Text>
            </Pressable>
          </View>

          <Animated.ScrollView contentContainerStyle={styles.paymentSheetBody} showsVerticalScrollIndicator={false}>
            <View style={styles.paymentSheetHero}>
              <Text style={styles.paymentSheetAmount}>{pendingTopup ? formatCurrency(pendingTopup.amount) : "Processing payment"}</Text>
              <Text style={styles.paymentSheetMethod}>{pendingTopup ? paymentMethodLabel(pendingTopup.method) : "Wallet top-up"}</Text>
              <View style={styles.paymentSheetBadge}>
                <ShieldCheck size={16} color="#e7fbff" />
                <Text style={styles.paymentSheetBadgeText}>
                  {verifyingPayment ? "Checking payment..." : "Waiting for approval"}
                </Text>
              </View>
              <Text style={styles.paymentSheetInstruction}>{topupInstruction(pendingTopup)}</Text>
            </View>

            <View style={styles.paymentGlassCard}>
              <Text style={styles.paymentGlassTitle}>Top-up details</Text>
              <View style={styles.paymentMetaRow}>
                <Text style={styles.paymentMetaLabel}>Method</Text>
                <Text style={styles.paymentMetaValue}>{pendingTopup ? paymentMethodLabel(pendingTopup.method) : "Wallet top-up"}</Text>
              </View>
              <View style={styles.paymentMetaRow}>
                <Text style={styles.paymentMetaLabel}>Reference</Text>
                <Text style={styles.paymentMetaValue}>{pendingTopup?.txRef}</Text>
              </View>
              <View style={[styles.paymentMetaRow, styles.paymentMetaRowLast]}>
                <Text style={styles.paymentMetaLabel}>Status</Text>
                <Text style={styles.paymentMetaValue}>{verifyingPayment ? "Verifying" : "Pending approval"}</Text>
              </View>
            </View>

            {pendingTopup?.paymentAccountDetails ? (
              <View style={styles.paymentGlassCard}>
                <Text style={styles.paymentGlassTitle}>Payment details</Text>
                {Object.entries(pendingTopup.paymentAccountDetails).map(([key, value], index, array) => (
                  <View key={key} style={[styles.paymentMetaRow, index === array.length - 1 && styles.paymentMetaRowLast]}>
                    <Text style={styles.paymentMetaLabel}>{prettifyKey(key)}</Text>
                    <Text style={styles.paymentMetaValue}>{String(value ?? "")}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {pendingTopup?.authorization ? (
              <View style={styles.paymentGlassCard}>
                <Text style={styles.paymentGlassTitle}>Authorization</Text>
                {Object.entries(pendingTopup.authorization).map(([key, value], index, array) => (
                  <View key={key} style={[styles.paymentMetaRow, index === array.length - 1 && styles.paymentMetaRowLast]}>
                    <Text style={styles.paymentMetaLabel}>{prettifyKey(key)}</Text>
                    <Text style={styles.paymentMetaValue}>{String(value ?? "")}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable
              style={[styles.directChargeBtn, styles.paymentPrimaryBtn, verifyingPayment && styles.actionDisabled]}
              onPress={() => void handleTopupSuccess()}
              disabled={verifyingPayment}
            >
              {verifyingPayment ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text style={styles.directChargeBtnText}>{verifyingPayment ? "Checking..." : "Check payment status"}</Text>
            </Pressable>

            <Pressable
              style={[styles.directChargeSecondaryBtn, styles.paymentSecondaryBtn]}
              onPress={() => {
                closeCheckout();
                setMsg("Wallet top-up was cancelled.");
              }}
              disabled={verifyingPayment}
            >
              <Text style={styles.directChargeSecondaryText}>Cancel payment</Text>
            </Pressable>
          </Animated.ScrollView>

          {verifyingPayment ? (
            <View style={styles.verifyBar}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.verifyBarText}>Verifying payment and updating wallet...</Text>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

function MethodPill({
  label,
  active,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  const { theme } = useStudentTheme();
  return (
    <Pressable
      style={[
        styles.methodPill,
        { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSoft },
        active && styles.methodPillActive,
        active && { backgroundColor: theme.accent, borderColor: theme.accent },
      ]}
      onPress={onPress}
    >
      {icon ? <View style={styles.methodPillIcon}>{icon}</View> : null}
      <Text style={[styles.methodPillText, { color: theme.text }, active && styles.methodPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function HistoryRow({
  amount,
  icon,
  index,
  label,
  mode,
  tint,
  time,
  total,
}: {
  amount: number;
  icon: React.ReactNode;
  index: number;
  label: string;
  mode: string | null;
  tint: string;
  time: string;
  total: number;
}) {
  const { theme } = useStudentTheme();
  const positive = amount >= 0;
  const neutral = label.toLowerCase().startsWith("request sent");
  return (
    <View style={[styles.historyRow, index < total - 1 && styles.historyRowBorder, index < total - 1 && { borderBottomColor: theme.borderSoft }]}>
      <View style={[styles.historyIconWrap, { backgroundColor: tint }]}>{icon}</View>
      <View style={styles.historyCopy}>
        <Text numberOfLines={1} style={[styles.historyLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.historyMeta, { color: theme.textMuted }]}>{mode ? `${mode} • ${time}` : time}</Text>
      </View>
      <Text
        style={[
          styles.historyAmount,
          neutral ? styles.historyAmountNeutral : positive ? styles.historyAmountPositive : styles.historyAmountNegative,
        ]}
      >
        {neutral ? `${formatCurrency(amount)} requested` : signedCurrency(amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f5ff" },
  content: { padding: 16, paddingBottom: 118, gap: 14 },
  skeletonWrap: { padding: 16, gap: 12 },
  skeletonCard: { borderRadius: 28, backgroundColor: "#dfe7fb" },

  balanceCard: {
    borderRadius: 32,
    backgroundColor: "#eef4ff",
    padding: 20,
    overflow: "hidden",
    gap: 20,
    shadowColor: "#93a5d6",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  balanceGlowBlue: {
    position: "absolute",
    top: -30,
    left: -10,
    width: 260,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(165,207,255,0.55)",
  },
  balanceGlowPeach: {
    position: "absolute",
    right: -18,
    bottom: -28,
    width: 230,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(255,219,198,0.75)",
  },
  balanceWave: {
    position: "absolute",
    right: 90,
    top: 44,
    width: 240,
    height: 160,
    borderTopLeftRadius: 120,
    borderBottomLeftRadius: 80,
    borderTopRightRadius: 80,
    borderBottomRightRadius: 120,
    backgroundColor: "rgba(255,255,255,0.28)",
    transform: [{ rotate: "-10deg" }],
  },
  balanceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  balanceLabel: { color: "#66708c", fontSize: 17, fontWeight: "500" },
  balanceRow: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  balanceAmount: { color: "#13285f", fontSize: 32, fontWeight: "900" },
  balanceEye: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#dfe5f4",
  },
  flagBadge: {
    width: 66,
    height: 66,
    borderRadius: 33,
    overflow: "hidden",
    shadowColor: "#92a0c8",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  topUpBtn: {
    flex: 1,
    minHeight: 74,
    borderRadius: 999,
    backgroundColor: "#15347d",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#15347d",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  topUpBtnText: { color: "#fff", fontSize: 18, fontWeight: "900" },

  quickTopUpCard: {
    borderRadius: 28,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e7eaf5",
    padding: 16,
    gap: 14,
    shadowColor: "#a7b1cc",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  sectionTitle: { color: "#15295f", fontSize: 18, fontWeight: "900" },
  phoneRow: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e4e7f2",
    backgroundColor: "#fbfbfe",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  phoneLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 14 },
  phoneInput: { flex: 1, color: "#68738f", fontSize: 16, fontWeight: "600" },
  phoneRight: {
    width: 58,
    alignSelf: "stretch",
    borderLeftWidth: 1,
    borderLeftColor: "#e4e7f2",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  amountGrid: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  amountChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dfe5f3",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  amountChipActive: { borderColor: "#0e7283", backgroundColor: "#e6f7f8" },
  amountChipText: { color: "#596480", fontSize: 14, fontWeight: "700" },
  amountChipTextActive: { color: "#0e7283" },
  customAmountCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e4e7f2",
    backgroundColor: "#fbfbfe",
    padding: 14,
    gap: 10,
  },
  customAmountLabel: { color: "#15295f", fontSize: 14, fontWeight: "900" },
  customAmountInputShell: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dde2ef",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 54,
  },
  customAmountPrefix: { color: "#6d7895", fontSize: 14, fontWeight: "900" },
  customAmountInput: { flex: 1, color: "#15295f", fontSize: 18, fontWeight: "800", paddingVertical: 12 },
  customAmountHint: { color: "#7d87a2", fontSize: 12, fontWeight: "600", lineHeight: 18 },
  methodSwitch: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  methodPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#dfe4f0",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  methodPillActive: { backgroundColor: "#13285f", borderColor: "#13285f" },
  methodPillIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  methodPillText: { color: "#5e6985", fontSize: 13, fontWeight: "800" },
  methodPillTextActive: { color: "#fff" },
  fullTopUpBtn: {
    minHeight: 76,
    borderRadius: 999,
    backgroundColor: "#0e7283",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: "#0e7283",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  fullTopUpBtnText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  actionDisabled: { opacity: 0.72 },

  noticeCard: {
    borderRadius: 18,
    backgroundColor: "#eff8fb",
    borderWidth: 1,
    borderColor: "#d9edf2",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  noticeText: { color: "#1f5f72", fontSize: 13, fontWeight: "700" },
  retrySyncBtn: {
    minHeight: 44,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#0f6d80",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  retrySyncBtnText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },

  historySection: { gap: 10 },
  historyTitle: { color: "#15295f", fontSize: 22, fontWeight: "900" },
  historyCard: {
    borderRadius: 28,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e7eaf5",
    overflow: "hidden",
    shadowColor: "#a7b1cc",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  historyRowBorder: { borderBottomWidth: 1, borderBottomColor: "#eef1f7" },
  historyIconWrap: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  historyCopy: { flex: 1 },
  historyLabel: { color: "#15295f", fontSize: 16, fontWeight: "900" },
  historyMeta: { marginTop: 3, color: "#65708b", fontSize: 13, fontWeight: "600" },
  historyAmount: { fontSize: 16, fontWeight: "900" },
  historyAmountPositive: { color: "#166d61" },
  historyAmountNegative: { color: "#b22a58" },
  historyAmountNeutral: { color: "#51607f" },

  emptyCard: { padding: 20, alignItems: "center", gap: 5 },
  emptyTitle: { color: "#15295f", fontSize: 16, fontWeight: "900" },
  emptySub: { color: "#66708d", fontSize: 13, fontWeight: "600", textAlign: "center" },
  syncText: { color: "#7a86a5", fontSize: 12, fontWeight: "700", textAlign: "center" },
  cacheMeta: { color: "#8b94ad", fontSize: 11, fontWeight: "700", textAlign: "center", marginTop: -6 },

  checkoutRoot: { flex: 1, backgroundColor: "#eef6f8" },
  checkoutHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#dbe6eb",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  checkoutTitle: { color: "#16315f", fontWeight: "900", fontSize: 18 },
  checkoutSub: { color: "#5b7380", fontWeight: "700", fontSize: 12, marginTop: 2 },
  checkoutCloseBtn: { borderRadius: 999, backgroundColor: "#eef6f8", paddingHorizontal: 12, paddingVertical: 8 },
  checkoutCloseText: { color: "#16315f", fontWeight: "800", fontSize: 12 },
  directChargeBody: { flex: 1, padding: 16, gap: 14 },
  paymentSheetBody: { padding: 16, paddingBottom: 110, gap: 14 },
  paymentSheetHero: {
    borderRadius: 34,
    padding: 22,
    gap: 12,
    backgroundColor: "#16315f",
    borderWidth: 1,
    borderColor: "#274a72",
    shadowColor: "#16315f",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  paymentSheetAmount: { color: "#ffffff", fontWeight: "900", fontSize: 34, textAlign: "center" },
  paymentSheetMethod: { color: "#9fd8e0", fontWeight: "800", fontSize: 16, textAlign: "center" },
  paymentSheetBadge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "rgba(15,109,128,0.18)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  paymentSheetBadgeText: { color: "#e7fbff", fontWeight: "800", fontSize: 13 },
  paymentSheetInstruction: { color: "#d3e6f3", fontWeight: "600", fontSize: 15, lineHeight: 22, textAlign: "center" },
  paymentGlassCard: {
    borderRadius: 28,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe6eb",
    padding: 18,
    gap: 12,
  },
  paymentGlassTitle: { color: "#16315f", fontWeight: "900", fontSize: 18 },
  paymentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e7eef2",
  },
  paymentMetaRowLast: { paddingBottom: 0, borderBottomWidth: 0 },
  paymentMetaLabel: { color: "#62808f", fontWeight: "700", fontSize: 13, flex: 1 },
  paymentMetaValue: { color: "#16315f", fontWeight: "800", fontSize: 13, textAlign: "right", flex: 1 },
  directChargeCard: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e3e8f3",
    padding: 16,
    gap: 10,
  },
  directChargeHeading: { color: "#13285f", fontWeight: "900", fontSize: 28, letterSpacing: -0.8 },
  directChargeText: { color: "#5d6886", fontWeight: "600", fontSize: 14, lineHeight: 21 },
  directChargeLabel: { color: "#62708f", fontWeight: "800", fontSize: 12, textTransform: "uppercase" },
  directChargeValue: { color: "#13285f", fontWeight: "900", fontSize: 16 },
  detailRow: { gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#edf1f7" },
  detailKey: { color: "#62708f", fontWeight: "700", fontSize: 12 },
  detailValue: { color: "#13285f", fontWeight: "800", fontSize: 15 },
  directChargeBtn: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#0d7285",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  directChargeBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  directChargeSecondaryBtn: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#eef2fa",
    alignItems: "center",
    justifyContent: "center",
  },
  directChargeSecondaryText: { color: "#0e2756", fontWeight: "800", fontSize: 15 },
  paymentPrimaryBtn: { backgroundColor: "#0f6d80", borderRadius: 999, minHeight: 58 },
  paymentSecondaryBtn: { borderRadius: 999, backgroundColor: "#eef6f8", borderWidth: 1, borderColor: "#dbe6eb" },
  verifyBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 20,
    borderRadius: 14,
    backgroundColor: "#0e2756",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  verifyBarText: { color: "#fff", fontWeight: "800", fontSize: 12, flex: 1 },
});


