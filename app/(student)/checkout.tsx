import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  ChevronRight,
  CircleCheckBig,
  Landmark,
  MapPin,
  Phone,
  ShieldCheck,
  Ticket,
  Truck,
} from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import PaymentBrandLogo from "@/components/payment/PaymentBrandLogo";
import { formatCacheTime } from "@/lib/offlineCache";
import { goBackOrFallback } from "@/lib/navigation";
import { clearCheckoutDraft, getCheckoutDraft, saveCheckoutDraft } from "@/lib/paymentOffline";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { initializePayChanguCheckout, type DirectChargeSession, type SupportedPaymentMethod, verifyPayChanguTxRef } from "@/lib/payments";
import { checkoutWithCash } from "@/lib/cashCheckout";

export default function NonTicketCheckoutDisabledScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const checkoutFooterBottom = Math.max(insets.bottom, 8);
  const checkoutContentBottomPadding = 84 + insets.bottom + 24;
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
  const channel: "market" | "food" = params.channel === "market" || params.channel === "food" ? params.channel : mode === "food" ? "food" : "market";
  const deliveryMode: "pickup" | "doorstep" = params.delivery_mode === "pickup" || params.delivery_mode === "doorstep"
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
    (mode === "food" || mode === "market") && itemId
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
  const campusMarketOrderDraft =
    (mode === "food" || mode === "market") && vendorId && orderLine
      ? {
          vendor_id: vendorId,
          channel,
          delivery_mode: deliveryMode,
          delivery_fee_mwk: delivery,
          service_fee_mwk: serviceFee,
          lines: [orderLine],
        }
      : null;

  useEffect(() => {
    let active = true;

    const loadDraft = async () => {
      const cached = await getCheckoutDraft(user?.id);
      if (!active) return;
      if (cached?.data?.scope === draftScope) {
        setPayMethod(cached.data.payMethod === "wallet" ? "mpamba" : cached.data.payMethod);
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
    if (!draftLoaded) return;
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

  if (loading) {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={styles.root}>
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
    const requiresCatalogOrder = mode === "food" || mode === "market";
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
      if (!campusMarketOrderDraft) {
        Alert.alert("Cash unavailable", "Cash on delivery needs a live market or food item.");
        return;
      }

      try {
        setSubmitting(true);
        const result = await checkoutWithCash(session.access_token, {
          title: `EYA ${mode.toUpperCase()} checkout`,
          description: `${mode} cash checkout - ${title}`,
          purpose: "campus_market_order",
          order: campusMarketOrderDraft,
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

    if (isMobileMoneyMethod && !options?.fromMobileMoneyModal) {
      openMobileMoney();
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
          purpose: campusMarketOrderDraft ? "campus_market_order" : "stay_reservation",
          order: campusMarketOrderDraft ?? undefined,
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
    <SafeAreaView edges={["top", "left", "right"]} style={styles.root}>
      <View style={styles.bgOrbOne} />
      <View style={styles.bgOrbTwo} />

      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: checkoutContentBottomPadding }]}
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

          <Text style={[styles.title, { color: theme.heading }]}>Checkout is for Tickets only</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>
            EYA does not process checkout or payments for Rooms, Marketplace, or other non-ticket listings.
          </Text>

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
              <Pressable
                style={styles.applyBtn}
                onPress={() => {
                  Alert.alert("Coupon saved", couponCode.trim() ? "The coupon code is saved with this checkout draft." : "Enter a coupon code first.");
                }}
              >
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
              <Pressable style={styles.changeBtn} onPress={() => router.push("/(student)/address")}>
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
              label="Cash on Delivery"
              subtitle="Place the order now and pay at handoff"
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
                  ? "Cash on delivery creates the order immediately and keeps tracking active for handoff."
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

      <View style={[styles.footer, { bottom: checkoutFooterBottom }]}>
        <View style={styles.footerAmountWrap}>
          <Text style={styles.footerLabel}>Total</Text>
          <Text style={styles.footerTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
            {formatMwk(total)}
          </Text>
        </View>
        <Animated.View style={[styles.payBtnWrap, { transform: [{ scale: payPressScale }] }]}>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.accent }]}
            onPress={() => router.replace("/(student)/(tabs)/tickets" as any)}
          >
            <Text style={styles.payBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              {submitting ? "Starting payment..." : verifyingPayment ? "Verifying payment..." : "Proceed to Checkout"}
            </Text>
            <ChevronRight size={20} color="#ffffff" />
          </Pressable>

          <Pressable
            style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
            onPress={() => router.replace("/(student)/(tabs)/home" as any)}
          >
            <ArrowLeft size={17} color={theme.text} />
            <Text style={[styles.secondaryText, { color: theme.text }]}>Back to Home</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
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
  content: { padding: 22, gap: 20 },
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
    maxWidth: 520,
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
    left: 12,
    right: 12,
    borderRadius: 20,
    backgroundColor: "#fbfbff",
    borderWidth: 1,
    borderColor: "#e3e6f2",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#97a4ca",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  footerAmountWrap: {
    minWidth: 108,
    maxWidth: "40%",
    flexShrink: 0,
    gap: 2,
  },
  footerLabel: { color: "#7a84a0", fontWeight: "800", fontSize: 10, textTransform: "uppercase" },
  footerTotal: {
    color: "#13285f",
    fontWeight: "900",
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.5,
    textAlign: "left",
    flexShrink: 0,
  },
  payBtnWrap: { flex: 1, minWidth: 0 },
  payBtn: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: "#0d7285",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#0d7285",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  payBtnDisabled: { opacity: 0.68 },
  payBtnText: { color: "#ffffff", fontWeight: "900", fontSize: 15, flexShrink: 1, textAlign: "center" },
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
    alignItems: "center",
    gap: 14,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "900", textAlign: "center" },
  body: { fontSize: 14, lineHeight: 21, fontWeight: "600", textAlign: "center", maxWidth: 410 },
  primaryButton: {
    width: "100%",
    minHeight: 54,
    marginTop: 4,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 18,
  },
  primaryText: { fontSize: 15, fontWeight: "900" },
  secondaryButton: {
    width: "100%",
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 18,
  },
  secondaryText: { fontSize: 14, fontWeight: "800" },
});
