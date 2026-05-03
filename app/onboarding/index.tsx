import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, BellRing, BriefcaseBusiness, Check, ChevronRight, ClipboardCheck, Clock3, House, Send, ShieldCheck, ShoppingBag, Store, UserRound, UtensilsCrossed } from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { normalizeAppRole } from "@/lib/roleRouting";
import { listMyRoleApplications, submitRoleApplication, type RoleApplication, type RoleApplicationStatus } from "@/lib/roleApplications";
import { getFallbackWorkspaceRole, getWorkspaceLabel, getWorkspaceStatuses, type WorkspaceRole, type WorkspaceStatus } from "@/lib/workspaceAccess";
import { useAuth } from "@/providers/AuthProvider";

type FlowKey = "landlord" | "restaurant" | "seller" | "delivery";

type RoleFlow = {
  key: FlowKey;
  role: WorkspaceRole;
  title: string;
  subtitle: string;
  accent: string;
  icon: typeof House;
  routeWhenPending: string;
  routeWhenReady: string;
  status: WorkspaceStatus | null;
};

type FlowPreviewCard = {
  id: number;
  title: string;
  subtitle: string;
  bullets?: string[];
  fields?: string[];
  cta: string;
  accent: string;
};

const ROLE_ORDER: WorkspaceRole[] = ["student", "vendor", "landlord", "agent"];

const EYA_THEME = {
  background: "#f4f2fb",
  surface: "#ffffff",
  surfaceAlt: "#f7f8fe",
  surfaceMuted: "#eef1fb",
  border: "#e8edf7",
  borderSoft: "#eef1fb",
  text: "#0e2756",
  textMuted: "#6e7892",
  textSoft: "#8a94af",
  heading: "#13285f",
  accent: "#5e73dd",
  glowTop: "rgba(169, 190, 255, 0.18)",
  glowMiddle: "rgba(206, 196, 255, 0.14)",
  glowBottom: "rgba(255, 214, 196, 0.14)",
} as const;

const LANDLORD_PREVIEW_CARDS: FlowPreviewCard[] = [
  {
    id: 1,
    title: "Become a Landlord",
    subtitle: "List your rooms, hostels and manage your properties with ease on EYA.",
    bullets: ["List unlimited properties", "Reach students near you", "Secure payments", "24/7 support"],
    cta: "Get Started",
    accent: "#de4c5d",
  },
  {
    id: 2,
    title: "Basic Information",
    subtitle: "Add your contact details and business name.",
    fields: ["Full Name", "Phone Number", "Email Address", "Business / Property Name"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 3,
    title: "Property Details",
    subtitle: "Describe what you manage and where it is located.",
    fields: ["Type of properties", "Number of Properties", "Years of Experience", "Operating Location"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 4,
    title: "Verification",
    subtitle: "Upload the following documents for review.",
    fields: ["National ID", "Proof of Ownership / Tenancy", "Business License (Optional)"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 5,
    title: "Payout Details",
    subtitle: "Tell us how you would like to receive payments.",
    fields: ["Payout Method", "Mobile Money Provider", "Mobile Number"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 6,
    title: "Submitted!",
    subtitle: "Your landlord application has been submitted. We'll review your information and notify you once approved.",
    fields: ["Role Applied: Landlord", "Status: Pending Review"],
    cta: "Submit Application",
    accent: "#35b77f",
  },
];

const RESTAURANT_PREVIEW_CARDS: FlowPreviewCard[] = [
  {
    id: 1,
    title: "Register as a Restaurant",
    subtitle: "Join EYA and start selling your delicious meals to students.",
    bullets: ["Increase your orders", "Manage your menu", "Track earnings", "Fast payouts"],
    cta: "Get Started",
    accent: "#ef7b2d",
  },
  {
    id: 2,
    title: "Restaurant Information",
    subtitle: "Add your restaurant details and how students will find you.",
    fields: ["Restaurant Name", "Cuisine Type", "Restaurant Type", "Opening Hours"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 3,
    title: "Business Details",
    subtitle: "Tell us about your experience, location and business contacts.",
    fields: ["Years in Business", "Business License", "Restaurant Location", "Phone Number"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 4,
    title: "Verification",
    subtitle: "Upload the following documents for review.",
    fields: ["National ID", "Business License", "Food Handling Certificate (If available)"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 5,
    title: "Payout Details",
    subtitle: "Tell us how you would like to receive payments.",
    fields: ["Payout Method", "Mobile Money Provider", "Mobile Number"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 6,
    title: "Submitted!",
    subtitle: "Your restaurant application has been submitted. We'll review your information and notify you once approved.",
    fields: ["Role Applied: Restaurant", "Status: Pending Review"],
    cta: "Submit Application",
    accent: "#35b77f",
  },
];

const SELLER_PREVIEW_CARDS: FlowPreviewCard[] = [
  {
    id: 1,
    title: "Become a Seller",
    subtitle: "Sell products to students across the campus marketplace.",
    bullets: ["Reach more students", "Easy product management", "Secure payments", "Grow your business"],
    cta: "Get Started",
    accent: "#2f6fed",
  },
  {
    id: 2,
    title: "Store Information",
    subtitle: "Add the store details students will see.",
    fields: ["Store Name", "Store Category", "Phone Number", "Email Address", "Store Location"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 3,
    title: "Business Details",
    subtitle: "Tell us what you sell and your customer policies.",
    fields: ["Years in Business", "What do you sell?", "Return Policy", "About your store"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 4,
    title: "Verification",
    subtitle: "Upload the following documents for review.",
    fields: ["National ID", "Business License (If available)", "Store / Product Photos"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 5,
    title: "Payout Details",
    subtitle: "Tell us how you would like to receive payments.",
    fields: ["Payout Method", "Mobile Money Provider", "Mobile Number"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 6,
    title: "Submitted!",
    subtitle: "Your seller application has been submitted. We'll review your information and notify you once approved.",
    fields: ["Role Applied: Seller", "Status: Pending Review"],
    cta: "Submit Application",
    accent: "#35b77f",
  },
];

const DELIVERY_PREVIEW_CARDS: FlowPreviewCard[] = [
  {
    id: 1,
    title: "Become a Delivery Agent",
    subtitle: "Deliver orders, earn more and help students on campus.",
    bullets: ["Flexible schedule", "Earn per delivery", "Weekly payouts", "Performance bonuses"],
    cta: "Get Started",
    accent: "#2e9b62",
  },
  {
    id: 2,
    title: "Personal Information",
    subtitle: "Add your identity and contact details.",
    fields: ["Full Name", "Phone Number", "Email Address", "City / Area"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 3,
    title: "Vehicle Information",
    subtitle: "Tell us what you drive and your riding experience.",
    fields: ["Vehicle Type", "Make & Model", "License Plate Number", "Years of Riding Experience"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 4,
    title: "Verification",
    subtitle: "Upload the following documents for review.",
    fields: ["National ID", "Riding License", "Vehicle Registration / Logbook", "Profile Photo"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 5,
    title: "Payout Details",
    subtitle: "Tell us how you would like to receive payments.",
    fields: ["Payout Method", "Mobile Money Provider", "Mobile Number"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 6,
    title: "Submitted",
    subtitle: "Your delivery agent application has been submitted. We'll review your information and notify you once approved.",
    fields: ["Role Applied: Delivery Agent", "Status: Pending Review"],
    cta: "Submit Application",
    accent: "#35b77f",
  },
];

function getFlowFocusFromParam(value?: string | string[] | null): FlowKey | null {
  const raw = String(Array.isArray(value) ? value[0] : (value ?? ""))
    .trim()
    .toLowerCase();
  if (raw === "seller" || raw === "merchant" || raw === "market") return "seller";
  if (raw === "restaurant" || raw === "food_provider" || raw === "food provider") return "restaurant";
  const normalized = normalizeAppRole(raw);
  if (normalized === "landlord") return "landlord";
  if (normalized === "agent") return "delivery";
  if (normalized === "vendor") return "restaurant";
  return null;
}

function roleActions(role: WorkspaceRole) {
  if (role === "landlord") return ["List rooms and hostels", "Receive enquiries from students", "Manage your property listings", "Track tenant demand"];
  if (role === "vendor") return ["Manage your store or restaurant", "Publish products or menu items", "Track orders and earnings", "Handle customer chats"];
  if (role === "agent") return ["Accept active deliveries", "Track delivery route progress", "View payout and earnings status", "Manage rider profile details"];
  return ["Browse rooms and hostels", "Shop in the market", "Order food and track delivery", "Chat with sellers and providers"];
}

function roleIcon(role: WorkspaceRole) {
  if (role === "landlord") return House;
  if (role === "vendor") return Store;
  if (role === "agent") return BriefcaseBusiness;
  return UserRound;
}

function getPreviewCards(flowKey: FlowKey | null) {
  if (flowKey === "landlord") return LANDLORD_PREVIEW_CARDS;
  if (flowKey === "restaurant") return RESTAURANT_PREVIEW_CARDS;
  if (flowKey === "seller") return SELLER_PREVIEW_CARDS;
  if (flowKey === "delivery") return DELIVERY_PREVIEW_CARDS;
  return null;
}

function getFlowTone(flowKey: FlowKey | null) {
  if (flowKey === "restaurant") return { background: "#fff5ec", border: "#ffdcbf" };
  if (flowKey === "seller") return { background: "#eef4ff", border: "#cfddff" };
  if (flowKey === "delivery") return { background: "#effaf2", border: "#d1f0da" };
  return { background: "#fff1f2", border: "#ffd7dd" };
}

export default function OnboardingPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const { user, role, activeRole, loading: authLoading, setActiveRole } = useAuth();
  const theme = EYA_THEME;
  const { height: windowHeight } = useWindowDimensions();
  const contentMinHeight = Math.max(620, windowHeight);
  const pageBodyMinHeight = Math.max(510, windowHeight - 126);
  const previewCardMinHeight = Math.max(430, pageBodyMinHeight - 108);
  const focusFromParam = getFlowFocusFromParam(params.role);
  const [statuses, setStatuses] = useState<WorkspaceStatus[]>([]);
  const [roleApplications, setRoleApplications] = useState<RoleApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyFlow, setBusyFlow] = useState<FlowKey | null>(null);
  const [focusedFlow, setFocusedFlow] = useState<FlowKey | null>(focusFromParam);
  const [showRolePicker, setShowRolePicker] = useState<boolean>(Boolean(focusFromParam));
  const [previewFlow, setPreviewFlow] = useState<FlowKey | null>(null);
  const [previewStepIndex, setPreviewStepIndex] = useState(0);
  const [applicationDraft, setApplicationDraft] = useState<Record<string, string>>({});
  const [submittingApplication, setSubmittingApplication] = useState(false);

  const currentRole = (activeRole ?? getFallbackWorkspaceRole(role, user?.email ?? null)) as WorkspaceRole;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    const nextFocus = getFlowFocusFromParam(params.role);
    setFocusedFlow(nextFocus);
    if (nextFocus) setShowRolePicker(true);
  }, [params.role]);

  const loadStatuses = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const [next, nextApplications] = await Promise.all([getWorkspaceStatuses(user.id, user.email), listMyRoleApplications(user.id).catch(() => [])]);
      setStatuses(next);
      setRoleApplications(nextApplications);
    } finally {
      setLoading(false);
    }
  }, [user?.email, user?.id]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!user?.id) return;
      try {
        setLoading(true);
        const [next, nextApplications] = await Promise.all([getWorkspaceStatuses(user.id, user.email), listMyRoleApplications(user.id).catch(() => [])]);
        if (active) {
          setStatuses(next);
          setRoleApplications(nextApplications);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [user?.email, user?.id]);

  const visibleStatuses = useMemo(
    () => ROLE_ORDER.map((roleKey) => statuses.find((row) => row.role === roleKey)).filter(Boolean) as WorkspaceStatus[],
    [statuses],
  );

  const byRole = useMemo(() => {
    const map = new Map<WorkspaceRole, WorkspaceStatus>();
    visibleStatuses.forEach((row) => map.set(row.role, row));
    return map;
  }, [visibleStatuses]);

  const flows = useMemo<RoleFlow[]>(() => {
    const vendorStatus = byRole.get("vendor") ?? null;
    const landlordStatus = byRole.get("landlord") ?? null;
    const agentStatus = byRole.get("agent") ?? null;

    return [
      {
        key: "landlord",
        role: "landlord",
        title: "Become a Landlord",
        subtitle: "List and manage your rooms and hostels.",
        accent: "#de4c5d",
        icon: House,
        routeWhenPending: landlordStatus?.setupRoute ?? "/(landlord)/(tabs)/create",
        routeWhenReady: landlordStatus?.homeRoute ?? "/(landlord)/(tabs)/dashboard",
        status: landlordStatus,
      },
      {
        key: "restaurant",
        role: "vendor",
        title: "Register as a Restaurant",
        subtitle: "Sell food to students and manage your restaurant.",
        accent: "#ef7b2d",
        icon: UtensilsCrossed,
        routeWhenPending: "/(market)/setup",
        routeWhenReady: "/(market)/(tabs)/dashboard",
        status: vendorStatus,
      },
      {
        key: "seller",
        role: "vendor",
        title: "Become a Seller",
        subtitle: "Sell products in the campus marketplace.",
        accent: "#2f6fed",
        icon: ShoppingBag,
        routeWhenPending: "/sell/setup",
        routeWhenReady: "/sell/products",
        status: vendorStatus,
      },
      {
        key: "delivery",
        role: "agent",
        title: "Become a Delivery Agent",
        subtitle: "Deliver orders and earn on your schedule.",
        accent: "#2e9b62",
        icon: BriefcaseBusiness,
        routeWhenPending: agentStatus?.setupRoute ?? "/(agent)/(tabs)/dashboard",
        routeWhenReady: agentStatus?.homeRoute ?? "/(agent)/(tabs)/dashboard",
        status: agentStatus,
      },
    ];
  }, [byRole]);

  const currentRoleLabel = getWorkspaceLabel(currentRole);
  const currentRoleActions = useMemo(() => roleActions(currentRole), [currentRole]);
  const CurrentRoleIcon = roleIcon(currentRole);
  const activePreviewFlow = useMemo(() => flows.find((flow) => flow.key === previewFlow) ?? null, [flows, previewFlow]);
  const activePreviewCards = useMemo(() => getPreviewCards(previewFlow), [previewFlow]);
  const activePreviewCard = activePreviewCards?.[previewStepIndex] ?? null;
  const activeFlowTone = getFlowTone(activePreviewFlow?.key ?? null);
  const activeStepCount = activePreviewCards?.length ?? 0;
  const getFlowApplicationStatus = useCallback(
    (flowKey: FlowKey | null): RoleApplicationStatus | "none" => {
      if (!flowKey) return "none";
      const approved = roleApplications.find((entry) => entry.application_kind === flowKey && entry.status === "approved");
      if (approved) return "approved";
      const pending = roleApplications.find((entry) => entry.application_kind === flowKey && entry.status === "pending");
      if (pending) return "pending";
      const declined = roleApplications.find((entry) => entry.application_kind === flowKey && entry.status === "declined");
      return declined ? "declined" : "none";
    },
    [roleApplications],
  );
  const activeApplicationStatus = getFlowApplicationStatus(previewFlow);

  const draftKey = (field: string, stepId = activePreviewCard?.id ?? 0) => `${previewFlow ?? "flow"}:${stepId}:${field}`;
  const fieldValue = (field: string, stepId = activePreviewCard?.id ?? 0) => applicationDraft[draftKey(field, stepId)] ?? "";
  const setFieldValue = (field: string, value: string, stepId = activePreviewCard?.id ?? 0) => {
    setApplicationDraft((current) => ({ ...current, [draftKey(field, stepId)]: value }));
  };
  const isOptionalField = (field: string) => /optional|if available/i.test(field);
  const validateActiveStep = () => {
    if (!activePreviewCard?.fields || activePreviewCard.id === activeStepCount) return true;
    const missing = activePreviewCard.fields.filter((field) => !isOptionalField(field) && !fieldValue(field).trim());
    if (missing.length) {
      Alert.alert("Finish this step", `Please complete: ${missing.join(", ")}.`);
      return false;
    }
    return true;
  };
  const collectApplicationPayload = () => {
    const payload: Record<string, string> = {};
    activePreviewCards?.forEach((card) => {
      card.fields?.forEach((field) => {
        const value = applicationDraft[draftKey(field, card.id)]?.trim();
        if (value) payload[`${card.title} - ${field}`] = value;
      });
    });
    return payload;
  };

  const submitActiveApplication = async () => {
    if (!user?.id || !activePreviewFlow || !previewFlow) return;
    const payload = collectApplicationPayload();
    try {
      setSubmittingApplication(true);
      await submitRoleApplication({
        userId: user.id,
        targetRole: activePreviewFlow.role === "student" || activePreviewFlow.role === "admin" ? "vendor" : activePreviewFlow.role,
        applicationKind: previewFlow,
        payload,
        applicantName: payload["Personal Information - Full Name"] ?? payload["Basic Information - Full Name"] ?? user.user_metadata?.full_name ?? null,
        applicantEmail: payload["Personal Information - Email Address"] ?? payload["Basic Information - Email Address"] ?? user.email ?? null,
        applicantPhone:
          payload["Personal Information - Phone Number"] ??
          payload["Basic Information - Phone Number"] ??
          payload["Business Details - Phone Number"] ??
          null,
      });
      await loadStatuses();
      Alert.alert("Application sent to admin", "Your admission is now in the admin review queue. You will get a notification when it is approved or declined.");
      setPreviewFlow(null);
      setPreviewStepIndex(0);
      setShowRolePicker(true);
    } catch (err: any) {
      Alert.alert("Could not submit application", err?.message ?? "Please try again.");
    } finally {
      setSubmittingApplication(false);
    }
  };

  const handleBack = () => {
    if (previewFlow) {
      if (previewStepIndex > 0) {
        setPreviewStepIndex((current) => Math.max(0, current - 1));
        return;
      }
      setPreviewFlow(null);
      setPreviewStepIndex(0);
      return;
    }
    if (showRolePicker) {
      setShowRolePicker(false);
      return;
    }
    router.back();
  };

  const openFlow = async (flow: RoleFlow) => {
    const applicationStatus = getFlowApplicationStatus(flow.key);
    if (applicationStatus !== "approved") {
      Alert.alert(
        applicationStatus === "pending" ? "Waiting for admin review" : "Apply first",
        applicationStatus === "pending"
          ? "This application has been submitted. Admin must approve it before the workspace opens."
          : "Complete the application steps and submit your details for admin approval.",
      );
      return;
    }
    try {
      setBusyFlow(flow.key);
      setFocusedFlow(flow.key);
      await setActiveRole(flow.role);
      const targetRoute = flow.status?.ready ? flow.routeWhenReady : flow.routeWhenPending;
      router.push(targetRoute as any);
    } catch (err: any) {
      Alert.alert("Unable to continue", err?.message ?? "Could not open this registration flow.");
    } finally {
      setBusyFlow(null);
    }
  };

  if (authLoading || loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loaderText, { color: theme.textMuted }]}>Loading role registration flows...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
        <ScrollView
          contentContainerStyle={[styles.content, { backgroundColor: theme.background, minHeight: contentMinHeight }]}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable style={[styles.backBtn, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]} onPress={handleBack}>
              <ArrowLeft size={20} color={theme.text} />
            </Pressable>
            <Text style={[styles.topBarTitle, { color: theme.heading }]}>
              {previewFlow ? activePreviewFlow?.title ?? "Workspace Setup" : showRolePicker ? "Roles & Workspaces" : "Current Workspace"}
            </Text>
            <View style={{ width: 44 }} />
          </View>

          <View style={[styles.pageBody, { minHeight: pageBodyMinHeight }]}>
        {!showRolePicker ? (
          <View style={[styles.myRoleWrap, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
            <View style={[styles.myRoleCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
              <View style={[styles.myRoleIcon, { backgroundColor: theme.accent }]}>
                <CurrentRoleIcon size={22} color="#ffffff" />
              </View>
              <Text style={[styles.myRoleName, { color: theme.text }]}>{currentRoleLabel}</Text>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
              <Text style={[styles.myRoleCopy, { color: theme.textMuted }]}>
                {currentRole === "student"
                  ? "Your account always starts in the user section. Add other workspaces when you need them."
                  : "This workspace is active right now. You can switch back to the user section anytime."}
              </Text>
            </View>

            <View style={styles.whatWrap}>
              <Text style={[styles.whatTitle, { color: theme.text }]}>What you can do in {currentRoleLabel}</Text>
              <View style={styles.actionList}>
                {currentRoleActions.map((item) => (
                  <View key={item} style={styles.actionRow}>
                    <Check size={14} color="#18a16b" />
                    <Text style={[styles.actionText, { color: theme.textMuted }]}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.workspaceFoot}>
              <View style={[styles.workspaceInsight, { backgroundColor: "#f9fbff", borderColor: theme.border }]}>
                <Text style={[styles.workspaceInsightKicker, { color: theme.textSoft }]}>Workspace mode</Text>
                <Text style={[styles.workspaceInsightTitle, { color: theme.text }]}>Stay in User, then open approved roles without another login.</Text>
              </View>

              <Pressable
                style={[styles.addRolePrimaryBtn, { backgroundColor: theme.accent }]}
                onPress={() => {
                  const firstNonCurrent = flows.find((flow) => flow.role !== currentRole) ?? flows[0] ?? null;
                  setFocusedFlow(firstNonCurrent?.key ?? null);
                  setShowRolePicker(true);
                }}
              >
                <Text style={styles.addRolePrimaryText}>Open Roles & Workspaces</Text>
              </Pressable>

              {currentRole !== "student" ? (
                <Pressable
                  style={[styles.secondaryWorkspaceBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
                  onPress={async () => {
                    await setActiveRole("student");
                    router.replace("/(student)/(tabs)/account");
                  }}
                >
                  <Text style={[styles.secondaryWorkspaceText, { color: theme.text }]}>Go to User Section</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : previewFlow && activePreviewFlow && activePreviewCards && activePreviewCard ? (
          <View style={styles.previewSection}>
            <View style={[styles.previewHeader, { borderColor: activeFlowTone.border }]}>
              <View
                style={[
                  styles.previewHeaderBadge,
                  {
                    backgroundColor: activeFlowTone.background,
                    borderColor: activeFlowTone.border,
                  },
                ]}
              >
                {React.createElement(activePreviewFlow.icon, {
                  size: 20,
                  color: activePreviewFlow.accent,
                })}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.previewHeaderTitle, { color: theme.text }]}>{activePreviewFlow.title}</Text>
                <Text style={[styles.previewHeaderSub, { color: theme.textMuted }]}>{activePreviewFlow.subtitle}</Text>
              </View>
            </View>

            <View style={[styles.previewPhoneCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft, minHeight: previewCardMinHeight }]}>
              {activeApplicationStatus === "pending" ? (
                <View style={styles.pendingBanner}>
                  <Clock3 size={15} color="#9a6a00" />
                  <Text style={[styles.pendingBannerText, { color: "#8a5d00" }]}>This admission is already waiting for admin review.</Text>
                </View>
              ) : null}
              {activeApplicationStatus === "approved" ? (
                <View style={[styles.pendingBanner, styles.approvedBanner]}>
                  <ShieldCheck size={15} color="#168653" />
                  <Text style={[styles.pendingBannerText, { color: "#168653" }]}>Approved. Return to Roles & Workspaces to switch into this role.</Text>
                </View>
              ) : null}
              {activeApplicationStatus === "declined" ? (
                <View style={[styles.pendingBanner, styles.declinedBanner]}>
                  <Text style={[styles.pendingBannerText, { color: "#b03c66" }]}>Declined. Update the details below and submit a fresh admission request.</Text>
                </View>
              ) : null}
              <View style={styles.previewPhoneBar}>
                <Text style={[styles.previewPhoneTime, { color: theme.text }]}>Admin Review</Text>
              </View>

              <View style={styles.stepTrack}>
                {activePreviewCards.map((card, index) => {
                  const active = index === previewStepIndex;
                  const complete = index < previewStepIndex;
                  return (
                    <View key={card.id} style={styles.stepTrackItem}>
                      <View style={[styles.stepDot, { backgroundColor: active || complete ? theme.accent : theme.border, borderColor: active ? theme.accent : theme.border }]}>
                        <Text style={[styles.stepDotText, { color: active || complete ? "#ffffff" : theme.textSoft }]}>{card.id}</Text>
                      </View>
                      {index < activePreviewCards.length - 1 ? <View style={[styles.stepLine, { backgroundColor: complete ? theme.accent : theme.border }]} /> : null}
                    </View>
                  );
                })}
              </View>

              <View style={styles.previewStepBody}>
                <View style={[styles.previewHeroIcon, { backgroundColor: `${activePreviewCard.accent}18` }]}>
                  {React.createElement(activePreviewFlow.icon, {
                    size: 42,
                    color: activePreviewCard.accent,
                  })}
                </View>

                <View style={styles.previewCopyBlock}>
                  <Text style={[styles.previewCardHeader, { color: theme.text }]}>{activePreviewCard.title}</Text>
                  <Text style={[styles.previewCardSub, { color: theme.textMuted }]}>{activePreviewCard.subtitle}</Text>
                </View>

                {activePreviewCard.bullets ? (
                  <View style={styles.previewList}>
                    {activePreviewCard.bullets.map((item) => (
                      <View key={item} style={styles.previewListRow}>
                        <Check size={14} color={activePreviewCard.accent} />
                        <Text style={[styles.previewListText, { color: theme.textMuted }]}>{item}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {activePreviewCard.fields && activePreviewCard.id !== activeStepCount ? (
                  <View style={styles.previewFields}>
                    {activePreviewCard.fields.map((field) => (
                      <TextInput
                        key={field}
                        value={fieldValue(field)}
                        onChangeText={(value) => setFieldValue(field, value)}
                        placeholder={field}
                        placeholderTextColor={theme.textSoft}
                        returnKeyType="next"
                        style={[styles.previewField, styles.previewFieldInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
                      />
                    ))}
                  </View>
                ) : null}

                {activePreviewCard.id === activeStepCount ? (
                  <View style={styles.reviewBox}>
                    <Text style={[styles.reviewTitle, { color: theme.text }]}>Ready for admin review</Text>
                    <Text style={[styles.reviewCopy, { color: theme.textMuted }]}>
                      Your application will stay pending until an admin approves or declines it. Approved roles unlock their workspace.
                    </Text>
                    <View style={styles.reviewFlowList}>
                      <View style={styles.reviewFlowRow}>
                        <Send size={15} color={theme.accent} />
                        <Text style={[styles.reviewFlowText, { color: theme.textMuted }]}>Submit directly to the admin admission queue</Text>
                      </View>
                      <View style={styles.reviewFlowRow}>
                        <ClipboardCheck size={15} color={theme.accent} />
                        <Text style={[styles.reviewFlowText, { color: theme.textMuted }]}>Admin approves or declines the request</Text>
                      </View>
                      <View style={styles.reviewFlowRow}>
                        <BellRing size={15} color={theme.accent} />
                        <Text style={[styles.reviewFlowText, { color: theme.textMuted }]}>You receive a notification when the decision is made</Text>
                      </View>
                    </View>
                    <Text style={[styles.reviewMeta, { color: theme.textSoft }]}>{Object.keys(collectApplicationPayload()).length} details attached</Text>
                  </View>
                ) : null}
              </View>

              <Pressable
                style={[styles.previewCta, { backgroundColor: activePreviewCard.id === activeStepCount ? "#5e73dd" : theme.accent, opacity: submittingApplication || activeApplicationStatus === "pending" || activeApplicationStatus === "approved" ? 0.7 : 1 }]}
                disabled={submittingApplication || activeApplicationStatus === "pending" || activeApplicationStatus === "approved"}
                onPress={() => {
                  if (previewStepIndex < activeStepCount - 1) {
                    if (!validateActiveStep()) return;
                    setPreviewStepIndex((current) => current + 1);
                    return;
                  }
                  void submitActiveApplication();
                }}
              >
                {activePreviewCard.id === activeStepCount && activeApplicationStatus === "none" ? <Send size={16} color="#ffffff" /> : null}
                <Text style={styles.previewCtaText}>
                  {activeApplicationStatus === "approved"
                    ? "Admission Approved"
                    : activeApplicationStatus === "pending"
                      ? "Pending Admin Review"
                      : submittingApplication
                        ? "Submitting..."
                        : activePreviewCard.id === activeStepCount
                          ? "Submit to Admin"
                          : activePreviewCard.cta}
                </Text>
              </Pressable>
            </View>

            <View style={styles.stepCaptionRow}>
              <Text style={[styles.previewStepLabel, { color: theme.textMuted }]}>
                {activePreviewCard.id}. {activePreviewCard.title}
              </Text>
              <Text style={[styles.previewStepLabel, { color: theme.textMuted }]}>
                Step {previewStepIndex + 1} of {activeStepCount}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.pickerSection}>
            <View style={[styles.pickerCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
              <View style={styles.pickerHero}>
                <Text style={[styles.pickerEyebrow, { color: theme.textSoft }]}>Roles & Workspaces</Text>
                <Text style={[styles.pickerPrompt, { color: theme.text }]}>Choose the workspace you want to run.</Text>
                <Text style={[styles.pickerNote, { color: theme.textMuted }]}>Apply once. Approved sections open from here without changing accounts.</Text>
              </View>

              <View style={styles.pickerRows}>
                {flows.map((flow) => {
                  const Icon = flow.icon;
                  const busy = busyFlow === flow.key;
                  const tone = getFlowTone(flow.key);
                  return (
                    <Pressable
                      key={flow.key}
                      style={[
                        styles.pickerRow,
                        {
                          backgroundColor: focusedFlow === flow.key ? tone.background : theme.surfaceAlt,
                          borderColor: focusedFlow === flow.key ? tone.border : theme.border,
                          opacity: busy ? 0.75 : 1,
                        },
                      ]}
                      onPress={() => {
                        setFocusedFlow(flow.key);
                        if (getFlowApplicationStatus(flow.key) === "approved") {
                          void openFlow(flow);
                          return;
                        }
                        setPreviewStepIndex(0);
                        setPreviewFlow(flow.key);
                      }}
                      disabled={busy}
                    >
                      <View style={styles.pickerRowLeft}>
                        <View style={[styles.pickerIconWrap, { backgroundColor: theme.surface, borderColor: tone.border }]}>
                          <Icon size={19} color={flow.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pickerRowTitle, { color: theme.text }]}>{flow.title}</Text>
                          <Text style={[styles.pickerRowSub, { color: theme.textMuted }]}>{flow.subtitle}</Text>
                          {getFlowApplicationStatus(flow.key) !== "none" ? (
                            <Text style={[styles.pickerStatusText, { color: getFlowApplicationStatus(flow.key) === "approved" ? "#168653" : getFlowApplicationStatus(flow.key) === "pending" ? "#9a6a00" : "#b03c66" }]}>
                              {getFlowApplicationStatus(flow.key) === "approved" ? "Approved - tap to switch role" : getFlowApplicationStatus(flow.key) === "pending" ? "Pending admin review" : "Declined - you can reapply"}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <ChevronRight size={18} color={theme.textSoft} />
                    </Pressable>
                  );
                })}
              </View>

              {currentRole !== "student" ? (
                <Pressable
                  style={[
                    styles.pickerRow,
                    {
                      backgroundColor: theme.surfaceAlt,
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={async () => {
                    await setActiveRole("student");
                    router.replace("/(student)/(tabs)/account");
                  }}
                >
                  <View style={styles.pickerRowLeft}>
                    <View style={[styles.pickerIconWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <UserRound size={19} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerRowTitle, { color: theme.text }]}>User Section</Text>
                      <Text style={[styles.pickerRowSub, { color: theme.textMuted }]}>Go back to your main account workspace.</Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color={theme.textSoft} />
                </Pressable>
              ) : null}

              <Pressable
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
                onPress={() => setShowRolePicker(false)}
              >
                <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
            </View>

            <View style={[styles.mockTabs, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
              {["Home", "Orders", "Chats", "Account"].map((tab) => (
                <View
                  key={tab}
                  style={styles.mockTabItem}
                >
                  <Text style={[styles.mockTabText, { color: tab === "Account" ? theme.accent : theme.textMuted }]}>{tab}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f7fd" },
  safeArea: { flex: 1 },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 540,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 12,
  },
  pageBody: { flex: 1 },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  loaderText: { color: "#6f7ea3", fontSize: 12, fontWeight: "700" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef1fb",
  },
  topBarTitle: { flex: 1, color: "#13285f", fontSize: 23, fontWeight: "900", textAlign: "center", marginHorizontal: 8 },

  myRoleWrap: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#eef1fb",
    backgroundColor: "#ffffff",
    padding: 16,
    gap: 14,
    justifyContent: "flex-start",
    shadowColor: "#8492c2",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  myRoleCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#f7f8fe",
    paddingHorizontal: 14,
    paddingVertical: 18,
    alignItems: "center",
    gap: 9,
  },
  myRoleIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#5e73dd",
    alignItems: "center",
    justifyContent: "center",
  },
  myRoleName: { color: "#0e2756", fontSize: 28, fontWeight: "900" },
  activeBadge: {
    borderRadius: 999,
    backgroundColor: "#dff5ea",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  activeBadgeText: { color: "#0f7b3f", fontSize: 12, fontWeight: "900" },
  myRoleCopy: { color: "#6e7892", fontSize: 14, fontWeight: "700", lineHeight: 20, textAlign: "center" },
  whatWrap: { gap: 11 },
  whatTitle: { color: "#0e2756", fontSize: 19, fontWeight: "900" },
  actionList: { gap: 9 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  actionText: { color: "#6e7892", fontSize: 15, fontWeight: "700", flex: 1, lineHeight: 20 },
  addRolePrimaryBtn: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "#5e73dd",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  addRolePrimaryText: { color: "#ffffff", fontSize: 17, fontWeight: "900" },
  secondaryWorkspaceBtn: {
    minHeight: 50,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryWorkspaceText: { color: "#0e2756", fontSize: 16, fontWeight: "800" },
  workspaceFoot: { gap: 12 },
  workspaceInsight: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 16,
    gap: 6,
  },
  workspaceInsightKicker: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  workspaceInsightTitle: { fontSize: 18, fontWeight: "900", lineHeight: 24 },
  previewSection: { flex: 1, gap: 12 },
  previewHeader: {
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#eef1fb",
    backgroundColor: "#ffffff",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#8492c2",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  previewHeaderBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff1f2",
  },
  previewHeaderTitle: { color: "#0e2756", fontSize: 20, fontWeight: "900" },
  previewHeaderSub: { color: "#6e7892", fontSize: 13, fontWeight: "600", lineHeight: 18 },
  previewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  previewCard: {
    width: "48%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#eef1fb",
    backgroundColor: "#ffffff",
    padding: 10,
    gap: 8,
  },
  previewPhoneBar: { minHeight: 16, justifyContent: "center" },
  previewPhoneTime: { color: "#8a94af", fontSize: 10, fontWeight: "700" },
  previewStepBody: {
    gap: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  previewCopyBlock: { gap: 8 },
  previewCardHeader: { color: "#0e2756", fontSize: 19, fontWeight: "900", lineHeight: 25 },
  previewCardSub: { color: "#6e7892", fontSize: 13, fontWeight: "700", lineHeight: 20 },
  previewList: { gap: 8, marginTop: 4 },
  previewListRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewListText: { color: "#8a94af", fontSize: 13, fontWeight: "700", flex: 1, lineHeight: 18 },
  previewFields: { gap: 9, marginTop: 2 },
  previewField: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#f7f8fe",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  previewFieldInput: {
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "800",
  },
  previewFieldText: { color: "#8a94af", fontSize: 10, fontWeight: "600" },
  previewCta: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#5e73dd",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    marginTop: "auto",
  },
  previewCtaText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  previewStepLabel: { color: "#6e7892", fontSize: 11, fontWeight: "800", textAlign: "center" },
  pickerSection: { flex: 1, gap: 14 },
  pickerCard: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#eef1fb",
    backgroundColor: "#ffffff",
    padding: 16,
    gap: 12,
    justifyContent: "flex-start",
    shadowColor: "#8492c2",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  pickerHero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e7ecfa",
    backgroundColor: "#f9fbff",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  pickerEyebrow: { fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  pickerPrompt: { color: "#0e2756", fontSize: 20, fontWeight: "900", lineHeight: 26 },
  pickerNote: { color: "#6e7892", fontSize: 13, fontWeight: "700", lineHeight: 19 },
  pickerRows: { gap: 8 },
  pickerRow: {
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#f7f8fe",
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pickerRowLeft: { flexDirection: "row", alignItems: "center", gap: 9, flex: 1 },
  pickerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#e8edf7",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  pickerRowTitle: { color: "#0e2756", fontSize: 18, fontWeight: "900" },
  pickerRowSub: { color: "#6e7892", fontSize: 13, fontWeight: "700", lineHeight: 18 },
  pickerStatusText: { fontSize: 11, fontWeight: "900", marginTop: 4 },
  cancelBtn: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#f7f8fe",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { color: "#0e2756", fontSize: 16, fontWeight: "900" },
  mockTabs: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#eef1fb",
    backgroundColor: "#fff",
    minHeight: 72,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mockTabItem: { flex: 1, alignItems: "center" },
  mockTabText: { color: "#6e7892", fontSize: 12, fontWeight: "700" },
  previewPhoneCard: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#eef1fb",
    backgroundColor: "#ffffff",
    padding: 16,
    gap: 12,
    justifyContent: "flex-start",
    shadowColor: "#8492c2",
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  pendingBanner: {
    borderRadius: 12,
    backgroundColor: "#fff8e8",
    borderWidth: 1,
    borderColor: "#f3dfad",
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  approvedBanner: {
    backgroundColor: "#ecfbf2",
    borderColor: "#ccefd9",
  },
  declinedBanner: {
    backgroundColor: "#fff0f6",
    borderColor: "#ffd4e3",
  },
  pendingBannerText: { fontSize: 11, fontWeight: "900" },
  reviewBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#f7f8fe",
    padding: 14,
    gap: 7,
  },
  reviewTitle: { fontSize: 16, fontWeight: "900" },
  reviewCopy: { fontSize: 13, fontWeight: "700", lineHeight: 19 },
  reviewFlowList: { gap: 8, marginTop: 2 },
  reviewFlowRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  reviewFlowText: { flex: 1, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  reviewMeta: { fontSize: 11, fontWeight: "900" },
  stepTrack: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  stepTrackItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotText: { fontSize: 10, fontWeight: "900" },
  stepLine: {
    height: 2,
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 999,
  },
  previewHeroIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCaptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 4,
  },

  header: { textAlign: "center", color: "#102968", fontSize: 24, fontWeight: "900", letterSpacing: 0.3 },
  subHeader: { textAlign: "center", color: "#4e5f85", fontSize: 15, fontWeight: "700", marginBottom: 2 },
});
