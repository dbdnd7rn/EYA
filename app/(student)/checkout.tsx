import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  ChevronRight,
  CircleCheckBig,
  CreditCard,
  Landmark,
  MapPin,
  Phone,
  ShieldCheck,
  Ticket,
  Truck,
  WalletCards,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MarketPaymentsComingSoonScreen from "@/components/market/MarketPaymentsComingSoonScreen";
import PaymentBrandLogo from "@/components/payment/PaymentBrandLogo";
import { formatCacheTime } from "@/lib/offlineCache";
import { goBackOrFallback } from "@/lib/navigation";
import { clearCheckoutDraft, getCheckoutDraft, saveCheckoutDraft } from "@/lib/paymentOffline";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { initializePayChanguCheckout, type DirectChargeSession, type SupportedPaymentMethod, verifyPayChanguTxRef } from "@/lib/payments";
import { checkoutWithCash } from "@/lib/cashCheckout";
import { checkoutWithWallet } from "@/lib/walletCheckout";

type CheckoutMode = "stay" | "market" | "food";
type CheckoutPaymentMethod = SupportedPaymentMethod | "wallet" | "cash";
type PendingPayment = DirectChargeSession & { method: SupportedPaymentMethod; uiMethod: CheckoutPaymentMethod; amountMwk: number };

const formatMwk = (value: number) => `MWK ${Number(value || 0).toLocaleString("en-MW")}`;
const isUuid = (value: string | null) =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const prettifyKey = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

function paymentInstruction(payment: PendingPayment | null) {
  if (!payment) return "";
  if (payment.method === "bank_transfer") {
    return "Send the exact amount to the bank account shown below, then come back here to confirm.";
  }
  return "Approve the charge on your phone, then return here and check payment status.";
}

function findDetailValue(details: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!details) return null;
  for (const candidate of keys) {
    const match = Object.entries(details).find(([key, value]) => key.toLowerCase() === candidate && value != null && String(value).trim());
    if (match) return String(match[1]).trim();
  }
  return null;
}

function getBankPaymentCode(payment: PendingPayment | null) {
  const details = payment?.paymentAccountDetails;
  if (!details) return null;

  return findDetailValue(details, ["payment_code", "code"]);
}

function getBankTransferDetails(payment: PendingPayment | null) {
  const details = payment?.paymentAccountDetails;
  return {
    bankName: findDetailValue(details, ["bank_name", "bank", "institution_name"]),
    accountName: findDetailValue(details, ["account_name", "account_holder_name", "merchant_name", "name"]),
    accountNumber: findDetailValue(details, ["account_number", "account_no", "account"]),
    expiresAt: findDetailValue(details, ["account_expiration_timestamp", "expires_at", "expiry_time", "expiration_time", "expires"]),
    paymentCode: getBankPaymentCode(payment),
  };
}

function pendingPaymentLabel(payment: PendingPayment | null) {
  if (!payment) return "Payment";
  if (payment.uiMethod === "airtel_money") return "Airtel Money";
  if (payment.uiMethod === "mpamba") return "TNM Mpamba";
  if (payment.uiMethod === "wallet") return "Wallet";
  if (payment.method === "bank_transfer") return "Bank Transfer";
  return "Payment";
}

function parseSelectionMap(raw: string | string[] | undefined) {
  const source = Array.isArray(raw) ? raw[0] : raw;
  if (!source) return null;
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []]),
    ) as Record<string, string[]>;
  } catch {
    return null;
  }
}

export default function CheckoutScreen() {
  const router = useRouter();
  const { user, session } = useAuth();
  const { isOnline } = useNetwork();
  const params = useLocalSearchParams<{
    mode?: string;
    title?: string;
    base?: string;
    delivery?: string;
    escrow?: string;
    item_id?: string;
    vendor_id?: string;
    channel?: string;
    delivery_mode?: string;
    quantity?: string;
    food_selection?: string;
    food_summary?: string;
    food_base_title?: string;
  }>();
  const [payMethod, setPayMethod] = useState<CheckoutPaymentMethod>("mpamba");
  const [mobileNumber, setMobileNumber] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [showMobileMoneyModal, setShowMobileMoneyModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const reveal = useRef(new Animated.Value(0)).current;
  const payPressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 280);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
    return () => clearTimeout(t);
  }, [reveal]);

  const mode = (params.mode === "stay" || params.mode === "market" || params.mode === "food" ? params.mode : "market") as CheckoutMode;
  const title = (params.title ?? "Order").toString();
  const unitBase = Number(params.base ?? 0) || 0;
  const delivery = Number(params.delivery ?? 0) || 0;
  const initialQuantity = Math.max(1, Math.min(99, Number(params.quantity ?? 1) || 1));
  const escrowEnabled = params.escrow === "1" || mode === "stay";
  const base = useMemo(() => unitBase * quantity, [quantity, unitBase]);
  const serviceFee = useMemo(() => Math.round(base * 0.03), [base]);
  const total = useMemo(() => base + delivery + serviceFee, [base, delivery, serviceFee]);
  const isMarketMode = mode === "market";
  const isMobileMoneyMethod = payMethod === "airtel_money" || payMethod === "mpamba";
  const isBankMethod = payMethod === "bank_transfer";
  const requiresPhone = isMobileMoneyMethod;
  const itemId = typeof params.item_id === "string" ? params.item_id : null;
  const vendorId = typeof params.vendor_id === "string" ? params.vendor_id : null;
  const foodSelection = useMemo(() => parseSelectionMap(params.food_selection), [params.food_selection]);
  const foodSummary = typeof params.food_summary === "string" ? params.food_summary.trim() : "";
  const foodBaseTitle = typeof params.food_base_title === "string" ? params.food_base_title.trim() : "";
  const channel = params.channel === "market" || params.channel === "food" ? params.channel : mode === "food" ? "food" : "market";
  const deliveryMode = params.delivery_mode === "pickup" || params.delivery_mode === "doorstep"
    ? params.delivery_mode
    : delivery > 0
      ? "doorstep"
      : "pickup";
  const draftScope = `${mode}:${itemId || "none"}:${vendorId || "none"}:${title}`;
  const bankTransferDetails = getBankTransferDetails(pendingPayment);
  const hasBankTransferDetails = Boolean(
    bankTransferDetails.bankName ||
      bankTransferDetails.accountName ||
      bankTransferDetails.accountNumber ||
      bankTransferDetails.paymentCode ||
      (pendingPayment?.paymentAccountDetails && Object.keys(pendingPayment.paymentAccountDetails).length),
  );
  const showBankFallbackState = pendingPayment?.method === "bank_transfer" && !hasBankTransferDetails;
  const orderLine =
    mode === "food" && itemId
      ? {
          item_id: itemId,
          quantity,
          ...(foodSelection || foodSummary
            ? {
                food_customization: {
                  ...(foodSelection ? { selection_map: foodSelection } : {}),
                  ...(foodSummary ? { summary: foodSummary } : {}),
                },
              }
            : {}),
        }
      : null;

  useEffect(() => {
    let active = true;

    const loadDraft = async () => {
      if (mode === "market") {
        setQuantity(initialQuantity);
        setDraftLoaded(true);
        return;
      }
      const cached = await getCheckoutDraft(user?.id);
      if (!active) return;
      if (cached?.data?.scope === draftScope) {
        setPayMethod(cached.data.payMethod);
        setMobileNumber(cached.data.mobileNumber);
        setCouponCode(cached.data.couponCode);
        setQuantity(Math.max(1, Math.min(99, Number(cached.data.quantity ?? initialQuantity) || initialQuantity)));
        setDraftSavedAt(cached.ts);
      } else {
        setQuantity(initialQuantity);
      }
      setDraftLoaded(true);
    };

    void loadDraft();
    return () => {
      active = false;
    };
  }, [draftScope, initialQuantity, mode, user?.id]);

  useEffect(() => {
    if (mode === "market" || !draftLoaded) return;
    void saveCheckoutDraft(user?.id, {
      scope: draftScope,
      payMethod,
      mobileNumber,
      couponCode,
      quantity,
      savedAt: Date.now(),
    }).then(() => {
      setDraftSavedAt(Date.now());
    });
  }, [couponCode, draftLoaded, draftScope, mobileNumber, mode, payMethod, quantity, user?.id]);

  if (isMarketMode) {
    return (
      <MarketPaymentsComingSoonScreen
        audience="buyer"
        primaryAction={{
          label: "Back to market",
          onPress: () => goBackOrFallback(router, "/(student)/(tabs)/marketplace"),
        }}
        secondaryAction={{
          label: "Browse listings",
          onPress: () => router.replace("/(student)/(tabs)/marketplace"),
        }}
      />
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.skeletonWrap}>
          <View style={[styles.skeletonCard, { height: 126 }]} />
          <View style={[styles.skeletonCard, { height: 260 }]} />
          <View style={[styles.skeletonCard, { height: 170 }]} />
          <View style={[styles.skeletonCard, { height: 210 }]} />
        </View>
      </SafeAreaView>
    );
  }

  const onPayPressIn = () =>
    Animated.spring(payPressScale, { toValue: 0.98, useNativeDriver: true, speed: 24, bounciness: 0 }).start();
  const onPayPressOut = () =>
    Animated.spring(payPressScale, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 8 }).start();

  const closeCheckout = () => {
    setPendingPayment(null);
  };

  const openMobileMoney = () => {
    setShowMobileMoneyModal(true);
  };

  const closeMobileMoney = () => {
    if (submitting) return;
    setShowMobileMoneyModal(false);
  };

  const handlePaymentSuccess = async () => {
    if (!pendingPayment || verifyingPayment) return;

    setVerifyingPayment(true);
    try {
      const verification = await verifyPayChanguTxRef(pendingPayment.txRef);
      if (!verification.paid) {
        Alert.alert("Verification pending", "Payment is still processing. Wait a moment and try again.");
        return;
      }

      setPendingPayment(null);
      await clearCheckoutDraft(user?.id);
      router.replace({
        pathname: "/pay/success",
        params: {
          tx_ref: pendingPayment.txRef,
          order_id: verification.orderId ?? undefined,
          mode,
          title,
          total: String(total),
          delivery: String(delivery),
        },
      });
    } catch (e: any) {
      Alert.alert("Verification failed", e?.message ?? "Could not verify payment.");
    } finally {
      setVerifyingPayment(false);
    }
  };

  const payNow = async (options?: { fromMobileMoneyModal?: boolean }) => {
    const requiresCatalogOrder = mode === "food";
    if (requiresCatalogOrder && (!isUuid(itemId) || !isUuid(vendorId))) {
      Alert.alert("Item unavailable", "This item is using old preview data. Refresh the catalog and choose a live product.");
      return;
    }

    if (payMethod === "cash") {
      if (!isOnline) {
        await saveCheckoutDraft(user?.id, {
          scope: draftScope,
          payMethod,
          mobileNumber,
          couponCode,
          quantity,
          savedAt: Date.now(),
        });
        Alert.alert("Offline", "Cash checkout still needs internet so we can create the food order and notify the restaurant.");
        return;
      }
      if (!session?.access_token) {
        Alert.alert("Login required", "Please log in again to place a cash order.");
        return;
      }
      if (mode !== "food" || !itemId || !vendorId || !orderLine) {
        Alert.alert("Cash unavailable", "Cash on delivery is currently supported for food orders only.");
        return;
      }

      try {
        setSubmitting(true);
        const result = await checkoutWithCash(session.access_token, {
          title: `EYA ${mode.toUpperCase()} checkout`,
          description: `${mode} cash checkout - ${title}`,
          purpose: "campus_market_order",
          order: {
            vendor_id: vendorId,
            channel,
            delivery_mode: deliveryMode,
            delivery_fee_mwk: delivery,
            service_fee_mwk: serviceFee,
            lines: [orderLine],
          },
        });
        await clearCheckoutDraft(user?.id);
        router.replace({
          pathname: "/pay/success",
          params: {
            tx_ref: result.reference,
            order_id: result.order_id,
            mode,
            title,
            total: String(total),
            delivery: String(delivery),
            method: "cash",
          },
        });
      } catch (e: any) {
        Alert.alert("Cash checkout failed", e?.message ?? "Could not place your cash order.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (payMethod === "wallet") {
      if (!isOnline) {
        await saveCheckoutDraft(user?.id, {
          scope: draftScope,
          payMethod,
          mobileNumber,
          couponCode,
          quantity,
          savedAt: Date.now(),
        });
        Alert.alert("Offline", "Wallet checkout needs internet. Your checkout draft was saved for later.");
        return;
      }
      if (!session?.access_token) {
        Alert.alert("Login required", "Please log in again to use wallet balance.");
        return;
      }
      if (mode !== "food" || !itemId || !vendorId || !orderLine) {
        Alert.alert("Wallet unavailable", "Wallet payments are currently supported for food orders only.");
        return;
      }

      try {
        setSubmitting(true);
        const result = await checkoutWithWallet(session.access_token, {
          title: `EYA ${mode.toUpperCase()} checkout`,
          description: `${mode} checkout - ${title}`,
          purpose: "campus_market_order",
          order: {
            vendor_id: vendorId,
            channel,
            delivery_mode: deliveryMode,
            delivery_fee_mwk: delivery,
            service_fee_mwk: serviceFee,
            lines: [orderLine],
          },
        });
        await clearCheckoutDraft(user?.id);

        router.replace({
          pathname: "/pay/success",
          params: {
            tx_ref: `wallet_${result.order_id}`,
            order_id: result.order_id,
            mode,
            title,
            total: String(total),
            delivery: String(delivery),
            method: "wallet",
          },
        });
      } catch (e: any) {
        Alert.alert("Wallet payment failed", e?.message ?? "Could not complete wallet payment.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const cleanPhone = mobileNumber.trim().replace(/\s+/g, "");
    if (requiresPhone && cleanPhone.length < 8) {
      Alert.alert("Phone required", "Enter a valid mobile money number for this payment method.");
      return;
    }

    if (!user?.email) {
      Alert.alert("Missing email", "Please log in again to continue payment.");
      return;
    }

    if (!isOnline) {
      await saveCheckoutDraft(user?.id, {
          scope: draftScope,
          payMethod,
          mobileNumber,
          couponCode,
          quantity,
          savedAt: Date.now(),
        });
      Alert.alert("Offline", "Payment needs internet. Your checkout draft was saved so you can resume quickly.");
      return;
    }

    if (isMobileMoneyMethod && !options?.fromMobileMoneyModal) {
      openMobileMoney();
      return;
    }

    try {
      setSubmitting(true);
      const txRef = `pp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const providerMethod: SupportedPaymentMethod = isBankMethod ? "bank_transfer" : payMethod;
      const session = await initializePayChanguCheckout({
        amountMwk: total,
        email: user.email,
        phone: requiresPhone ? cleanPhone : undefined,
        txRef,
        title: `EYA ${mode.toUpperCase()} checkout`,
        description: `${mode} checkout - ${title}`,
        method: providerMethod,
        metadata: {
          mode,
          title,
          user_id: user.id,
          purpose: mode === "food" ? "campus_market_order" : "stay_reservation",
          order:
            mode === "food" && itemId && vendorId
              ? {
                  vendor_id: vendorId,
                  channel,
                  delivery_mode: deliveryMode,
                  delivery_fee_mwk: delivery,
                  service_fee_mwk: serviceFee,
                  lines: [orderLine],
                }
              : undefined,
        },
      });

      if (options?.fromMobileMoneyModal) {
        setShowMobileMoneyModal(false);
      }
      setPendingPayment({
        ...session,
        method: providerMethod,
        uiMethod: payMethod,
        amountMwk: total,
      });
    } catch (e: any) {
      Alert.alert("Payment failed", e?.message ?? "Could not initialize payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.bgOrbOne} />
      <View style={styles.bgOrbTwo} />

      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={{
          opacity: reveal,
          transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        }}
      >
        <Pressable style={styles.backBtn} onPress={() => goBackOrFallback(router, "/(student)/(tabs)/home")}>
          <ArrowLeft size={28} color="#13285f" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.h1}>{isMarketMode ? "Shopping Cart" : "Checkout"}</Text>
            <Text style={styles.sub}>
              {isMarketMode ? "Review pricing, delivery and payment before you place this order." : "Confirm your order and choose how you want to pay."}
            </Text>
          </View>

          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Total Amount</Text>
            <Text style={styles.amountValue}>{formatMwk(total)}</Text>
            <View style={styles.amountPill}>
              <Text style={styles.amountPillText}>Includes delivery and fees</Text>
            </View>
          </View>
        </View>

        <View style={styles.cartCard}>
          <View style={styles.cartTop}>
            <View style={styles.productArt}>
              <View style={styles.productGlow} />
              <Truck size={56} color="#6f8db9" />
            </View>

            <View style={styles.productMeta}>
              <Text style={styles.itemTitle}>{title}</Text>
              <View style={styles.verifiedRow}>
                <Text style={styles.marketMeta}>{mode === "food" ? "1 meal - Restaurant verified" : "1 item - Seller verified"}</Text>
                <BadgeCheck size={18} color="#177b84" />
              </View>
              {foodBaseTitle ? <Text style={styles.customMealBase}>Base listing: {foodBaseTitle}</Text> : null}
              {foodSummary ? <Text style={styles.customMealSummary}>{foodSummary}</Text> : null}

              <View style={styles.breakdownTable}>
                <View style={styles.breakdownLeft}>
                  <Text style={styles.breakdownLabel}>Unit price</Text>
                  <Text style={styles.breakdownLabel}>Quantity</Text>
                  <Text style={styles.breakdownLabel}>Base price</Text>
                  <Text style={styles.breakdownLabel}>Delivery fee</Text>
                  <Text style={styles.breakdownLabel}>Platform fee (3%)</Text>
                </View>
                <View style={styles.breakdownRight}>
                  <Text style={styles.breakdownValue}>{formatMwk(unitBase)}</Text>
                  <Text style={styles.breakdownValue}>{quantity}</Text>
                  <Text style={styles.breakdownValue}>{formatMwk(base)}</Text>
                  <Text style={styles.breakdownValue}>{formatMwk(delivery)}</Text>
                  <Text style={styles.breakdownValue}>{formatMwk(serviceFee)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.cartAside}>
              <Text style={styles.itemPrice}>{formatMwk(base)}</Text>
              <View style={styles.qtyPill}>
                <Pressable
                  style={[styles.qtyStepBtn, quantity <= 1 && styles.qtyStepBtnDisabled]}
                  onPress={() => setQuantity((current) => Math.max(1, current - 1))}
                  disabled={quantity <= 1}
                >
                  <Text style={[styles.qtyStepText, quantity <= 1 && styles.qtyStepTextDisabled]}>-</Text>
                </Pressable>
                <Text style={styles.qtyText}>Qty {quantity}</Text>
                <Pressable
                  style={[styles.qtyStepBtn, quantity >= 99 && styles.qtyStepBtnDisabled]}
                  onPress={() => setQuantity((current) => Math.min(99, current + 1))}
                  disabled={quantity >= 99}
                >
                  <Text style={[styles.qtyStepText, quantity >= 99 && styles.qtyStepTextDisabled]}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatMwk(total)}</Text>
          </View>
        </View>

        {isMarketMode ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeading}>
              <View style={styles.sectionIconWrap}>
                <Ticket size={20} color="#f8fbff" />
              </View>
              <View style={styles.sectionTextBlock}>
                <Text style={styles.sectionTitle}>Order extras</Text>
                <Text style={styles.sectionSub}>Apply a coupon or add delivery notes</Text>
              </View>
            </View>

            <View style={styles.couponRow}>
              <TextInput
                value={couponCode}
                onChangeText={setCouponCode}
                placeholder="Enter coupon code"
                placeholderTextColor="#7f89a6"
                style={styles.couponInput}
              />
              <Pressable style={styles.applyBtn}>
                <Text style={styles.applyBtnText}>Apply</Text>
              </Pressable>
            </View>

            <View style={styles.deliveryRow}>
              <View style={styles.deliveryCopy}>
                <MapPin size={20} color="#0c6174" />
                <Text style={styles.deliveryText}>
                  Delivery to: <Text style={styles.deliveryStrong}>Campus residence</Text>
                </Text>
              </View>
              <Pressable style={styles.changeBtn}>
                <Text style={styles.changeBtnText}>Change</Text>
                <ChevronRight size={18} color="#0c6174" />
              </Pressable>
            </View>
          </View>
        ) : null}

        {escrowEnabled ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeading}>
              <View style={[styles.sectionIconWrap, styles.escrowIconWrap]}>
                <ShieldCheck size={20} color="#f8fbff" />
              </View>
              <View style={styles.sectionTextBlock}>
                <Text style={styles.sectionTitle}>Escrow protection</Text>
                <Text style={styles.sectionSub}>Payment is released only as milestones are confirmed.</Text>
              </View>
            </View>

            <View style={styles.escrowList}>
              <Milestone label="Booking hold" desc="20% is reserved to confirm the booking." />
              <Milestone label="Check-in confirmation" desc="60% is released after access is confirmed." />
              <Milestone label="Completion release" desc="20% is released after completion." />
            </View>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <Text style={styles.paymentTitle}>Payment method</Text>

          <View style={styles.methodGrid}>
            <MethodTile
              label="Mobile Money"
              subtitle={payMethod === "airtel_money" ? "Airtel Money selected" : payMethod === "mpamba" ? "TNM Mpamba selected" : "Pay using Airtel Money or TNM Mpamba"}
              active={isMobileMoneyMethod}
              icon={<Phone size={20} color={isMobileMoneyMethod ? "#f5f8ff" : "#2170d9"} />}
              trailing={
                <View style={styles.methodBrandPair}>
                  <PaymentBrandLogo brand="airtel_money" size={28} active={false} />
                  <PaymentBrandLogo brand="mpamba" size={28} active={false} />
                </View>
              }
              onPress={openMobileMoney}
            />
            <MethodTile
              label="Bank Transfer"
              subtitle="Pay using bank transfer details"
              active={payMethod === "bank_transfer"}
              icon={<Landmark size={22} color={payMethod === "bank_transfer" ? "#f5f8ff" : "#2170d9"} />}
              onPress={() => setPayMethod("bank_transfer")}
            />
            <MethodTile
              label="Wallet"
              subtitle="Pay from your wallet balance"
              active={payMethod === "wallet"}
              icon={<WalletCards size={22} color={payMethod === "wallet" ? "#f5f8ff" : "#155bdf"} />}
              onPress={() => setPayMethod("wallet")}
            />
            <MethodTile
              label="Cash on Delivery"
              subtitle="Place the food order now and pay at handoff"
              active={payMethod === "cash"}
              icon={<Banknote size={22} color={payMethod === "cash" ? "#f5f8ff" : "#3a7a96"} />}
              onPress={() => setPayMethod("cash")}
            />
          </View>

          <View style={styles.note}>
            <BadgeCheck size={16} color="#13285f" />
            <Text style={styles.noteText}>
              {isMobileMoneyMethod
                ? "Mobile money opens a simple payment step inside the app before we start the charge."
                : payMethod === "cash"
                  ? "Cash on delivery creates the food order immediately and keeps tracking active for restaurant handoff."
                  : "Online methods stay in-app. Start the charge here, then confirm the payment status after approval."}
            </Text>
          </View>
          {!isOnline ? (
            <View style={styles.offlineHint}>
              <Text style={styles.offlineHintText}>Offline mode: payment is paused, but this checkout draft is saved locally.</Text>
            </View>
          ) : null}
          {draftSavedAt ? <Text style={styles.cacheMeta}>Draft saved: {formatCacheTime(draftSavedAt)}</Text> : null}
        </View>
      </Animated.ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerTotal}>{formatMwk(total)}</Text>
        <Animated.View style={{ transform: [{ scale: payPressScale }] }}>
          <Pressable
            style={[styles.payBtn, (submitting || verifyingPayment) && styles.payBtnDisabled]}
            disabled={submitting || verifyingPayment}
            onPressIn={onPayPressIn}
            onPressOut={onPayPressOut}
            onPress={() => void payNow()}
          >
            <Text style={styles.payBtnText}>
              {submitting ? "Starting payment..." : verifyingPayment ? "Verifying payment..." : "Proceed to Checkout"}
            </Text>
            <ChevronRight size={24} color="#ffffff" />
          </Pressable>
        </Animated.View>
      </View>
      <Modal visible={!!pendingPayment} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeCheckout}>
        <SafeAreaView style={styles.checkoutRoot}>
          <View style={styles.checkoutHeader}>
            <View>
              <Text style={styles.checkoutTitle}>
                {pendingPayment?.method === "bank_transfer" ? "Bank Transfer" : "Complete Payment"}
              </Text>
              <Text style={styles.checkoutSub}>
                {pendingPayment?.method === "bank_transfer" ? "Pay directly from your bank account" : "Approve the charge on your phone."}
              </Text>
            </View>

            <Pressable style={styles.checkoutCloseBtn} onPress={closeCheckout} disabled={verifyingPayment}>
              <Text style={styles.checkoutCloseText}>Close</Text>
            </Pressable>
          </View>

          <Animated.ScrollView contentContainerStyle={styles.paymentSheetBody} showsVerticalScrollIndicator={false}>
            <View style={styles.paymentSheetHero}>
              <Text style={styles.paymentSheetAmount}>{formatMwk(pendingPayment?.amountMwk ?? total)}</Text>
              <Text style={styles.paymentSheetMethod}>{pendingPaymentLabel(pendingPayment)}</Text>
              <View style={styles.paymentSheetBadge}>
                <ShieldCheck size={16} color="#6b5cd4" />
                <Text style={styles.paymentSheetBadgeText}>
                  {verifyingPayment ? "Checking payment..." : "Waiting for approval"}
                </Text>
              </View>
              <Text style={styles.paymentSheetInstruction}>{paymentInstruction(pendingPayment)}</Text>
            </View>

            <View style={styles.paymentGlassCard}>
              <Text style={styles.paymentGlassTitle}>Payment details</Text>
              <View style={styles.paymentMetaRow}>
                <Text style={styles.paymentMetaLabel}>Method</Text>
                <Text style={styles.paymentMetaValue}>{pendingPaymentLabel(pendingPayment)}</Text>
              </View>
              <View style={styles.paymentMetaRow}>
                <Text style={styles.paymentMetaLabel}>PayChangu charge ID</Text>
                <Text style={styles.paymentMetaValue}>{pendingPayment?.txRef}</Text>
              </View>
              {pendingPayment?.providerReference ? (
                <View style={styles.paymentMetaRow}>
                  <Text style={styles.paymentMetaLabel}>Bank reference</Text>
                  <Text style={styles.paymentMetaValue}>{pendingPayment.providerReference}</Text>
                </View>
              ) : null}
              <View style={[styles.paymentMetaRow, styles.paymentMetaRowLast]}>
                <Text style={styles.paymentMetaLabel}>Status</Text>
                <Text style={styles.paymentMetaValue}>{verifyingPayment ? "Verifying" : "Pending approval"}</Text>
              </View>
            </View>

            {pendingPayment?.method === "bank_transfer" ? (
              <>
                <View style={styles.paymentGlassCard}>
                  <Text style={styles.paymentGlassTitle}>Bank transfer</Text>
                  <Text style={styles.paymentSheetHint}>
                    Use Instant Transfer from any bank and send the exact amount shown for this transaction.
                  </Text>
                  <View style={styles.paymentMetaRow}>
                    <Text style={styles.paymentMetaLabel}>Amount</Text>
                    <Text style={styles.paymentMetaValue}>{formatMwk(pendingPayment?.amountMwk ?? total)}</Text>
                  </View>
                  <View style={styles.paymentMetaRow}>
                    <Text style={styles.paymentMetaLabel}>PayChangu charge ID</Text>
                    <Text style={styles.paymentMetaValue}>{pendingPayment?.txRef}</Text>
                  </View>
                  {pendingPayment?.providerReference ? (
                    <View style={styles.paymentMetaRow}>
                      <Text style={styles.paymentMetaLabel}>Bank reference</Text>
                      <Text style={styles.paymentMetaValue}>{pendingPayment.providerReference}</Text>
                    </View>
                  ) : null}
                  <View style={styles.paymentMetaRow}>
                    <Text style={styles.paymentMetaLabel}>Bank name</Text>
                    <Text style={styles.paymentMetaValue}>{bankTransferDetails.bankName || "Waiting for provider details"}</Text>
                  </View>
                  <View style={styles.paymentMetaRow}>
                    <Text style={styles.paymentMetaLabel}>Account name</Text>
                    <Text style={styles.paymentMetaValue}>{bankTransferDetails.accountName || "Waiting for provider details"}</Text>
                  </View>
                  <View style={[styles.paymentMetaRow, styles.paymentMetaRowLast]}>
                    <Text style={styles.paymentMetaLabel}>Account number</Text>
                    <Text style={styles.paymentMetaValue}>{bankTransferDetails.accountNumber || "Waiting for provider details"}</Text>
                  </View>
                </View>
                <View style={styles.paymentInfoNote}>
                  <Text style={styles.paymentInfoText}>
                    {bankTransferDetails.expiresAt
                      ? `These details expire at ${bankTransferDetails.expiresAt}.`
                      : "These details apply only to this transaction."}
                  </Text>
                </View>
              </>
            ) : null}

            {pendingPayment?.paymentAccountDetails && pendingPayment?.method !== "bank_transfer" ? (
              <View style={styles.paymentGlassCard}>
                <Text style={styles.paymentGlassTitle}>Provider details</Text>
                {Object.entries(pendingPayment.paymentAccountDetails).map(([key, value], index, array) => (
                  <View key={key} style={[styles.paymentMetaRow, index === array.length - 1 && styles.paymentMetaRowLast]}>
                    <Text style={styles.paymentMetaLabel}>{prettifyKey(key)}</Text>
                    <Text style={styles.paymentMetaValue}>{String(value ?? "")}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {pendingPayment?.authorization ? (
              <View style={styles.paymentGlassCard}>
                <Text style={styles.paymentGlassTitle}>Authorization</Text>
                {Object.entries(pendingPayment.authorization).map(([key, value], index, array) => (
                  <View key={key} style={[styles.paymentMetaRow, index === array.length - 1 && styles.paymentMetaRowLast]}>
                    <Text style={styles.paymentMetaLabel}>{prettifyKey(key)}</Text>
                    <Text style={styles.paymentMetaValue}>{String(value ?? "")}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {showBankFallbackState ? (
              <View style={styles.paymentInfoNote}>
                <Text style={styles.paymentInfoText}>Waiting for provider transfer details. Check again in a moment.</Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.directChargeBtn, styles.paymentPrimaryBtn, verifyingPayment && styles.payBtnDisabled]}
              onPress={() => void handlePaymentSuccess()}
              disabled={verifyingPayment}
            >
              {verifyingPayment ? <ActivityIndicator size="small" color="#ffffff" /> : null}
              <Text style={styles.directChargeBtnText}>
                {verifyingPayment
                  ? "Checking..."
                  : "Check payment status"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.directChargeSecondaryBtn, styles.paymentSecondaryBtn]}
              onPress={() => {
                const txRef = pendingPayment?.txRef;
                closeCheckout();
                router.replace({
                  pathname: "/pay/cancel",
                  params: {
                    tx_ref: txRef,
                    source: "checkout",
                    mode,
                    title,
                    base: String(unitBase),
                    delivery: String(delivery),
                    escrow: escrowEnabled ? "1" : "0",
                    item_id: itemId ?? undefined,
                    vendor_id: vendorId ?? undefined,
                    channel,
                    delivery_mode: deliveryMode,
                    quantity: String(quantity),
                  },
                });
              }}
              disabled={verifyingPayment}
            >
              <Text style={styles.directChargeSecondaryText}>Cancel payment</Text>
            </Pressable>
          </Animated.ScrollView>

          {verifyingPayment ? (
            <View style={styles.verifyBar}>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={styles.verifyBarText}>Verifying payment before confirming your order...</Text>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal visible={showMobileMoneyModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeMobileMoney}>
        <SafeAreaView style={styles.mobileMoneyRoot}>
          <View style={styles.mobileMoneyHeader}>
            <Pressable style={styles.mobileMoneyBackBtn} onPress={closeMobileMoney} disabled={submitting}>
              <ArrowLeft size={20} color="#13285f" />
            </Pressable>
            <View style={styles.mobileMoneyHeaderCopy}>
              <Text style={styles.mobileMoneyTitle}>Mobile Money</Text>
              <Text style={styles.mobileMoneySub}>Pay using mobile money services</Text>
            </View>
          </View>

          <View style={styles.mobileMoneyHero}>
            <Text style={styles.mobileMoneyAmount}>{formatMwk(total)}</Text>
            <Text style={styles.mobileMoneyAmountCaption}>Total amount to pay</Text>
          </View>

          <View style={styles.mobileMoneyBody}>
            <Text style={styles.mobileMoneySectionLabel}>Mobile Money Provider</Text>
            <View style={styles.providerGrid}>
              <Pressable
                style={[styles.providerCard, payMethod === "airtel_money" && styles.providerCardActive]}
                onPress={() => setPayMethod("airtel_money")}
              >
                <PaymentBrandLogo brand="airtel_money" size={42} active={false} />
                <Text style={[styles.providerName, payMethod === "airtel_money" && styles.providerNameActive]}>Airtel Money</Text>
              </Pressable>
              <Pressable
                style={[styles.providerCard, payMethod === "mpamba" && styles.providerCardActive]}
                onPress={() => setPayMethod("mpamba")}
              >
                <PaymentBrandLogo brand="mpamba" size={42} active={false} />
                <Text style={[styles.providerName, payMethod === "mpamba" && styles.providerNameActive]}>TNM Mpamba</Text>
              </Pressable>
            </View>

            <View style={styles.phoneWrap}>
              <Text style={styles.phoneLabel}>Phone Number</Text>
              <View style={styles.mobileMoneyPhoneShell}>
                <Phone size={18} color="#6a7392" />
                <TextInput
                  value={mobileNumber}
                  onChangeText={setMobileNumber}
                  placeholder={payMethod === "airtel_money" ? "Enter Airtel number (e.g. 0991234567)" : "Enter Mpamba number (e.g. 0881234567)"}
                  placeholderTextColor="#8e98b4"
                  keyboardType="phone-pad"
                  style={styles.mobileMoneyPhoneInput}
                />
              </View>
              <Text style={styles.phoneHelpText}>Format: 09XXXXXXXX or 08XXXXXXXX</Text>
            </View>

            <Pressable
              style={[styles.mobileMoneyPayBtn, submitting && styles.payBtnDisabled]}
              disabled={submitting}
              onPress={() => void payNow({ fromMobileMoneyModal: true })}
            >
              <Text style={styles.mobileMoneyPayBtnText}>{submitting ? "Starting payment..." : `Pay ${formatMwk(total)}`}</Text>
              <View style={styles.mobileMoneyPayIcon}>
                <ChevronRight size={18} color="#ffffff" />
              </View>
            </Pressable>

            <View style={styles.mobileMoneySecureRow}>
              <ShieldCheck size={15} color="#0d7285" />
              <Text style={styles.mobileMoneySecureText}>Your payment is secure</Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function MethodTile({
  active,
  icon,
  label,
  subtitle,
  trailing,
  onPress,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.methodTile, active && styles.methodTileActive]} onPress={onPress}>
      <View style={styles.methodTileLeft}>
        <View style={[styles.methodIconWrap, active && styles.methodIconWrapActive]}>{icon}</View>
        <View style={styles.methodCopy}>
          <Text style={[styles.methodText, active && styles.methodTextActive]}>{label}</Text>
          {subtitle ? <Text style={[styles.methodSubtext, active && styles.methodSubtextActive]}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.methodTrailing}>
        {trailing}
        {active ? <CircleCheckBig size={24} color="#a7ebff" /> : <ChevronRight size={20} color="#7f89a6" />}
      </View>
    </Pressable>
  );
}

function Milestone({ label, desc }: { label: string; desc: string }) {
  return (
    <View style={styles.milestone}>
      <Text style={styles.mileTitle}>{label}</Text>
      <Text style={styles.mileDesc}>{desc}</Text>
    </View>
  );
}

function BankDetailLine({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.bankDetailLine, last && styles.bankDetailLineLast]}>
      <Text style={styles.bankDetailLabel}>{label}</Text>
      <Text style={styles.bankDetailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f1fb" },
  bgOrbOne: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "#e7ebff",
    opacity: 0.6,
  },
  bgOrbTwo: {
    position: "absolute",
    left: -80,
    top: 280,
    width: 190,
    height: 190,
    borderRadius: 999,
    backgroundColor: "#eef5ff",
    opacity: 0.7,
  },
  content: { padding: 22, paddingBottom: 210, gap: 20 },
  skeletonWrap: { padding: 22, gap: 16 },
  skeletonCard: {
    borderRadius: 30,
    backgroundColor: "#e7ebfb",
    shadowColor: "#99a7d0",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  backBtn: {
    alignSelf: "flex-start",
    minHeight: 74,
    borderRadius: 999,
    paddingHorizontal: 28,
    backgroundColor: "#fbfbff",
    borderWidth: 1,
    borderColor: "#e0e4f3",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#96a2c9",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  backText: { color: "#13285f", fontWeight: "900", fontSize: 26 },
  heroRow: { gap: 18 },
  heroCopy: { gap: 8, maxWidth: 420 },
  h1: { color: "#13285f", fontWeight: "900", fontSize: 33, letterSpacing: -1.2 },
  sub: { color: "#68718f", fontWeight: "600", fontSize: 14, lineHeight: 21, maxWidth: 420 },
  amountCard: {
    alignSelf: "flex-end",
    width: "100%",
    maxWidth: 350,
    borderRadius: 30,
    paddingHorizontal: 28,
    paddingVertical: 26,
    backgroundColor: "#14285d",
    shadowColor: "#14285d",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  amountLabel: { color: "#eef4ff", fontWeight: "500", fontSize: 16 },
  amountValue: { color: "#ffffff", fontWeight: "900", fontSize: 34, marginTop: 10, letterSpacing: -0.8 },
  amountPill: {
    marginTop: 18,
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: "#2f467d",
    borderWidth: 1,
    borderColor: "#516796",
  },
  amountPillText: { color: "#f3f7ff", fontWeight: "700", fontSize: 14 },
  cartCard: {
    borderRadius: 30,
    padding: 18,
    backgroundColor: "#fbfbff",
    borderWidth: 1,
    borderColor: "#e3e6f2",
    shadowColor: "#97a4ca",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  cartTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 16 },
  productArt: {
    width: 132,
    height: 144,
    borderRadius: 24,
    backgroundColor: "#edf4ff",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  productGlow: {
    position: "absolute",
    bottom: 14,
    width: 74,
    height: 74,
    borderRadius: 999,
    backgroundColor: "#dce9ff",
  },
  productMeta: { flex: 1, minWidth: 220, gap: 10 },
  itemTitle: { color: "#13285f", fontWeight: "900", fontSize: 28, letterSpacing: -0.7 },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  marketMeta: { color: "#45527b", fontWeight: "600", fontSize: 15 },
  customMealBase: { color: "#6a7592", fontWeight: "700", fontSize: 13 },
  customMealSummary: { color: "#0e6a74", fontWeight: "800", fontSize: 13, lineHeight: 19 },
  cartAside: { gap: 14, alignItems: "flex-start" },
  itemPrice: { color: "#13285f", fontWeight: "900", fontSize: 26, letterSpacing: -0.7 },
  qtyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#c7d2e9",
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: "#fcfdff",
  },
  qtyText: { color: "#0e6a74", fontWeight: "900", fontSize: 16 },
  qtyStepBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#edf4ff",
  },
  qtyStepBtnDisabled: { backgroundColor: "#f4f6fb" },
  qtyStepText: { color: "#0e6a74", fontWeight: "900", fontSize: 18, lineHeight: 20 },
  qtyStepTextDisabled: { color: "#9aa6c2" },
  breakdownTable: { flexDirection: "row", justifyContent: "space-between", gap: 24, marginTop: 6 },
  breakdownLeft: { gap: 8, flex: 1 },
  breakdownRight: { gap: 8, alignItems: "flex-end" },
  breakdownLabel: { color: "#4f5a7e", fontWeight: "500", fontSize: 15 },
  breakdownValue: { color: "#13285f", fontWeight: "900", fontSize: 16 },
  cardDivider: { height: 1, backgroundColor: "#e5e8f4", marginTop: 20, marginBottom: 16 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { color: "#13285f", fontWeight: "900", fontSize: 26 },
  totalValue: { color: "#13285f", fontWeight: "900", fontSize: 28, letterSpacing: -0.8 },
  sectionCard: {
    borderRadius: 30,
    padding: 20,
    backgroundColor: "#fbfbff",
    borderWidth: 1,
    borderColor: "#e3e6f2",
    shadowColor: "#97a4ca",
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
    gap: 16,
  },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 14 },
  sectionIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#1b7183",
    alignItems: "center",
    justifyContent: "center",
  },
  escrowIconWrap: { backgroundColor: "#243f7c" },
  sectionTextBlock: { flex: 1 },
  sectionTitle: { color: "#13285f", fontWeight: "900", fontSize: 18 },
  sectionSub: { color: "#5f6784", fontWeight: "500", fontSize: 14, marginTop: 2 },
  couponRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d9deee",
    backgroundColor: "#ffffff",
    paddingLeft: 18,
    paddingRight: 6,
    minHeight: 58,
  },
  couponInput: { flex: 1, color: "#13285f", fontWeight: "600", fontSize: 16, paddingVertical: 14 },
  applyBtn: {
    borderRadius: 999,
    backgroundColor: "#f0f2fb",
    borderWidth: 1,
    borderColor: "#d9deee",
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  applyBtnText: { color: "#13285f", fontWeight: "900", fontSize: 16 },
  deliveryRow: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: "#f4f6fc",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  deliveryCopy: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  deliveryText: { color: "#31406b", fontWeight: "600", fontSize: 15, flexShrink: 1 },
  deliveryStrong: { color: "#13285f", fontWeight: "900" },
  changeBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  changeBtnText: { color: "#0c6174", fontWeight: "900", fontSize: 16 },
  escrowList: { gap: 10 },
  milestone: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "#f6f8ff",
    borderWidth: 1,
    borderColor: "#e1e6f4",
    gap: 4,
  },
  mileTitle: { color: "#13285f", fontWeight: "800", fontSize: 14 },
  mileDesc: { color: "#616b89", fontWeight: "600", fontSize: 13, lineHeight: 18 },
  paymentTitle: { color: "#13285f", fontWeight: "900", fontSize: 20 },
  methodGrid: { gap: 12 },
  methodTile: {
    minHeight: 82,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#d9deee",
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  methodTileActive: {
    backgroundColor: "#14285d",
    borderColor: "#14285d",
    shadowColor: "#14285d",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  methodTileLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  methodCopy: { flex: 1, gap: 3 },
  methodIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#edf4ff",
    alignItems: "center",
    justifyContent: "center",
  },
  methodIconWrapActive: { backgroundColor: "#2b4a92" },
  brandMark: { color: "#155bdf", fontWeight: "900", fontSize: 20 },
  methodText: { color: "#13285f", fontWeight: "800", fontSize: 17, flexShrink: 1 },
  methodTextActive: { color: "#ffffff" },
  methodSubtext: { color: "#6c7592", fontWeight: "600", fontSize: 13, lineHeight: 18 },
  methodSubtextActive: { color: "#dce7ff" },
  methodTrailing: { flexDirection: "row", alignItems: "center", gap: 10 },
  methodBrandPair: { flexDirection: "row", alignItems: "center", gap: 6 },
  note: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dde2f0",
    backgroundColor: "#f5f7fd",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  noteText: { color: "#5f6784", fontWeight: "600", fontSize: 13, flex: 1 },
  offlineHint: {
    borderRadius: 16,
    backgroundColor: "#fff4dd",
    borderWidth: 1,
    borderColor: "#f0ddb1",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  offlineHintText: { color: "#7a5a08", fontWeight: "700", fontSize: 13 },
  cacheMeta: { color: "#7a84a0", fontWeight: "700", fontSize: 12 },
  phoneWrap: { gap: 10 },
  phoneLabel: { color: "#13285f", fontWeight: "900", fontSize: 16 },
  phoneHelpText: { color: "#6c7592", fontWeight: "600", fontSize: 12, lineHeight: 18 },
  phoneInputShell: {
    minHeight: 68,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#d9deee",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 18,
    paddingRight: 10,
    gap: 10,
  },
  phoneInput: { flex: 1, color: "#13285f", fontWeight: "900", fontSize: 18, paddingVertical: 14 },
  phoneInputIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cdd4e8",
    backgroundColor: "#f7f8fd",
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 98,
    minHeight: 88,
    borderRadius: 30,
    backgroundColor: "#fbfbff",
    borderWidth: 1,
    borderColor: "#e3e6f2",
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    shadowColor: "#97a4ca",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  footerTotal: { color: "#13285f", fontWeight: "900", fontSize: 22, letterSpacing: -0.7, flexShrink: 1 },
  payBtn: {
    minHeight: 60,
    borderRadius: 999,
    backgroundColor: "#0d7285",
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#0d7285",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  payBtnDisabled: { opacity: 0.68 },
  payBtnText: { color: "#ffffff", fontWeight: "900", fontSize: 18 },
  checkoutRoot: { flex: 1, backgroundColor: "#eef6f8" },
  checkoutHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#dbe6eb",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  checkoutTitle: { color: "#16315f", fontWeight: "900", fontSize: 18 },
  checkoutSub: { color: "#5b7380", fontWeight: "700", fontSize: 12, marginTop: 2 },
  checkoutCloseBtn: { borderRadius: 999, backgroundColor: "#eef6f8", paddingHorizontal: 14, paddingVertical: 8 },
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
  paymentSheetHint: { color: "#5b7380", fontWeight: "600", fontSize: 13, lineHeight: 19 },
  paymentCodeValue: { color: "#16315f", fontWeight: "900", fontSize: 40, textAlign: "center", letterSpacing: 1.2 },
  paymentStepList: { gap: 8 },
  paymentStepText: { color: "#16315f", fontWeight: "700", fontSize: 14, lineHeight: 21 },
  paymentInfoNote: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: "#f5fafb",
    borderWidth: 1,
    borderColor: "#dbe6eb",
  },
  paymentInfoText: { color: "#5b7380", fontWeight: "700", fontSize: 13, lineHeight: 19 },
  paymentPrimaryBtn: { backgroundColor: "#0f6d80", borderRadius: 999, minHeight: 58 },
  paymentSecondaryBtn: { borderRadius: 999, backgroundColor: "#eef6f8", borderWidth: 1, borderColor: "#dbe6eb" },
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
  bankNoticeCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#f3e3af",
    backgroundColor: "#fff9e8",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  bankNoticeText: { color: "#8c6c12", fontWeight: "700", fontSize: 14, lineHeight: 20 },
  bankWaitingCard: {
    borderRadius: 20,
    backgroundColor: "#f5f9ff",
    borderWidth: 1,
    borderColor: "#d9e6fb",
    padding: 16,
    gap: 10,
  },
  bankWaitingBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#e9f7f9",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bankWaitingBadgeText: { color: "#0d7285", fontWeight: "900", fontSize: 12, letterSpacing: 0.3 },
  bankWaitingTitle: { color: "#13285f", fontWeight: "900", fontSize: 22 },
  bankWaitingText: { color: "#53627f", fontWeight: "600", fontSize: 14, lineHeight: 21 },
  bankAmountCard: {
    borderRadius: 20,
    backgroundColor: "#eefcfc",
    borderWidth: 1,
    borderColor: "#caeef0",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  bankAmountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  bankAmountLabel: { color: "#4a6c76", fontWeight: "700", fontSize: 15 },
  bankAmountValue: { color: "#13285f", fontWeight: "900", fontSize: 30, letterSpacing: -0.8, textAlign: "right" },
  bankDetailsCard: {
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e3e8f3",
    overflow: "hidden",
  },
  bankDetailLine: {
    minHeight: 72,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f7",
  },
  bankDetailLineLast: { borderBottomWidth: 0 },
  bankDetailLabel: { color: "#62708f", fontWeight: "700", fontSize: 15, flex: 1 },
  bankDetailValue: { color: "#13285f", fontWeight: "900", fontSize: 19, textAlign: "right", flex: 1 },
  bankMetaCard: {
    borderRadius: 16,
    backgroundColor: "#eef4ff",
    borderWidth: 1,
    borderColor: "#dae6fb",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  bankMetaText: { color: "#556a9a", fontWeight: "700", fontSize: 13, lineHeight: 19, flex: 1 },
  bankMetaStatus: { color: "#1f9a63", fontWeight: "900", fontSize: 13 },
  bankCodeHint: {
    color: "#5d6886",
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 6,
  },
  stepsWrap: { gap: 10, marginTop: 4 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  stepIndex: { width: 18, color: "#0d7285", fontWeight: "900", fontSize: 14, lineHeight: 21 },
  stepText: { flex: 1, color: "#13285f", fontWeight: "700", fontSize: 14, lineHeight: 21 },
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
  directChargeBtnText: { color: "#ffffff", fontWeight: "900", fontSize: 16 },
  directChargeSecondaryBtn: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#eef2fa",
    alignItems: "center",
    justifyContent: "center",
  },
  directChargeSecondaryText: { color: "#0e2756", fontWeight: "800", fontSize: 15 },
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
  verifyBarText: { color: "#ffffff", fontWeight: "800", fontSize: 12, flex: 1 },
  mobileMoneyRoot: { flex: 1, backgroundColor: "#ffffff" },
  mobileMoneyHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f7",
  },
  mobileMoneyBackBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f3f6fb",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileMoneyHeaderCopy: { flex: 1 },
  mobileMoneyTitle: { color: "#13285f", fontWeight: "900", fontSize: 18 },
  mobileMoneySub: { color: "#6c7592", fontWeight: "600", fontSize: 13, marginTop: 2 },
  mobileMoneyHero: {
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 22,
    backgroundColor: "#f4fbfd",
    borderBottomWidth: 1,
    borderBottomColor: "#ebf4f8",
  },
  mobileMoneyAmount: { color: "#13285f", fontWeight: "900", fontSize: 34, letterSpacing: -1.1 },
  mobileMoneyAmountCaption: { color: "#6c7592", fontWeight: "600", fontSize: 16, marginTop: 6 },
  mobileMoneyBody: { padding: 20, gap: 18 },
  mobileMoneySectionLabel: { color: "#13285f", fontWeight: "900", fontSize: 17 },
  providerGrid: { flexDirection: "row", gap: 14 },
  providerCard: {
    flex: 1,
    minHeight: 126,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#d9deee",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 12,
  },
  providerCardActive: {
    borderColor: "#6be0e7",
    backgroundColor: "#f1fcfd",
  },
  providerName: { color: "#13285f", fontWeight: "800", fontSize: 18, textAlign: "center" },
  providerNameActive: { color: "#0d7285" },
  mobileMoneyPhoneShell: {
    minHeight: 62,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d9deee",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 10,
  },
  mobileMoneyPhoneInput: { flex: 1, color: "#13285f", fontWeight: "700", fontSize: 17, paddingVertical: 14 },
  mobileMoneyPayBtn: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: "#74dde4",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 6,
  },
  mobileMoneyPayBtnText: { color: "#ffffff", fontWeight: "900", fontSize: 18 },
  mobileMoneyPayIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileMoneySecureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 2,
  },
  mobileMoneySecureText: { color: "#6c7592", fontWeight: "700", fontSize: 13 },
});


