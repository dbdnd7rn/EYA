import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  type ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, BellRing, BriefcaseBusiness, Building2, Camera, Check, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, CreditCard, FileUp, House, MapPin, Send, ShieldCheck, Smartphone, Store, UserRound, UtensilsCrossed, WalletCards } from "lucide-react-native";
import MapPicker from "@/components/MapPicker";
import PaymentBrandLogo from "@/components/payment/PaymentBrandLogo";
import SoftPageGlow from "@/components/SoftPageGlow";
import { normalizeAppRole } from "@/lib/roleRouting";
import { listMyRoleApplications, submitRoleApplication, syncLocalRoleApplications, type RoleApplication, type RoleApplicationStatus } from "@/lib/roleApplications";
import { getFallbackWorkspaceRole, getWorkspaceLabel, getWorkspaceStatuses, type WorkspaceRole, type WorkspaceStatus } from "@/lib/workspaceAccess";
import { useAuth } from "@/providers/AuthProvider";

type FlowKey = "landlord" | "restaurant" | "delivery";

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

type LatLng = { lat: number; lng: number };
type UploadRecord = { uri: string; name: string; type: "document" | "photo" };
type PayoutDraft = {
  mobileMethods: string[];
  airtelNumber: string;
  mpambaNumber: string;
  banks: string[];
  bankNames: Record<string, string>;
  bankNumbers: Record<string, string>;
};

const ROLE_ORDER: WorkspaceRole[] = ["student", "vendor", "landlord", "agent"];

const PROPERTY_TYPES = ["Single room", "Double room", "Multiple rooms"];
const FOOD_PROVIDER_TYPES = ["Restaurant", "Home Kitchen", "Food Stall", "Catering & Bakery"];
const OPENING_TIMES = ["06:00", "07:00", "08:00", "09:00", "10:00", "11:00", "12:00"];
const CLOSING_TIMES = ["17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"];
const MOBILE_MONEY_OPTIONS = [
  { id: "airtel_money", label: "Airtel Money", subtitle: "Add an Airtel wallet number" },
  { id: "mpamba", label: "TNM Mpamba", subtitle: "Add a TNM Mpamba number" },
] as const;
const BANK_OPTIONS = [
  { id: "national_bank", name: "National Bank of Malawi", short: "NB", color: "#3346a3", logo: require("../../assets/payment/national-bank.png") },
  { id: "standard_bank", name: "Standard Bank Malawi", short: "SB", color: "#1f5fbf", logo: require("../../assets/payment/standard-bank.png") },
  { id: "fdh_bank", name: "FDH Bank", short: "FDH", color: "#0f66a8", logo: require("../../assets/payment/fdh-bank.png") },
  { id: "nbs_bank", name: "NBS Bank", short: "NBS", color: "#d31f3c", logo: require("../../assets/payment/nbs-bank.png") },
  { id: "first_capital", name: "First Capital Bank", short: "FCB", color: "#234c9f", logo: require("../../assets/payment/first-capital-bank.png") },
  { id: "centenary_bank", name: "Centenary Bank", short: "CB", color: "#f0b323", logo: require("../../assets/payment/centenary-bank.png") },
  { id: "ecobank", name: "Ecobank Malawi", short: "ECO", color: "#0a9a61", logo: require("../../assets/payment/ecobank.png") },
  { id: "other_bank", name: "Other Bank", short: "OB", color: "#7b85a4", logo: undefined },
] as const;

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
    fields: ["Type of properties", "Number of Properties", "Operating Location"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 4,
    title: "Verification",
    subtitle: "Add your ID or passport number and upload ownership proof if available.",
    fields: ["ID Number or Passport Number", "Proof of Ownership Document (Optional)"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 5,
    title: "Payout Details",
    subtitle: "Tell us how you would like to receive payments.",
    fields: ["Payout Accounts"],
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
    title: "Register as a Food Provider",
    subtitle: "Join EYA and start selling your meals to students.",
    bullets: ["Increase your orders", "Manage your menu", "Track earnings", "Fast payouts"],
    cta: "Get Started",
    accent: "#ef7b2d",
  },
  {
    id: 2,
    title: "Food Provider Information",
    subtitle: "Add your food provider details and how students will find you.",
    fields: ["Food Provider Name", "Food Provider Type", "Opening Hours"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 3,
    title: "Business Details",
    subtitle: "Tell us about your experience, location and business contacts.",
    fields: ["Business License (Optional)", "Food Provider Location", "Phone Number"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 4,
    title: "Verification",
    subtitle: "Upload the following documents for review.",
    fields: ["National ID"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 5,
    title: "Payout Details",
    subtitle: "Tell us how you would like to receive payments.",
    fields: ["Payout Accounts"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 6,
    title: "Submitted!",
    subtitle: "Your food provider application has been submitted. We'll review your information and notify you once approved.",
    fields: ["Role Applied: Food Provider", "Status: Pending Review"],
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
    fields: ["National ID", "Profile Photo"],
    cta: "Continue",
    accent: "#5e73dd",
  },
  {
    id: 5,
    title: "Payout Details",
    subtitle: "Tell us how you would like to receive payments.",
    fields: ["Payout Accounts"],
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
  if (raw === "seller" || raw === "merchant" || raw === "market") return null;
  if (raw === "restaurant" || raw === "food_provider" || raw === "food provider" || raw === "food-provider" || raw === "foodprovider") return "restaurant";
  const normalized = normalizeAppRole(raw);
  if (normalized === "landlord") return "landlord";
  if (normalized === "agent") return "delivery";
  if (normalized === "vendor") return "restaurant";
  return null;
}

function roleActions(role: WorkspaceRole) {
  if (role === "landlord") return ["List rooms and hostels", "Receive enquiries from students", "Manage your property listings", "Track tenant demand"];
  if (role === "vendor") return ["Manage your food provider workspace", "Publish menu items", "Track orders and earnings", "Handle customer chats"];
  if (role === "agent") return ["Accept active deliveries", "Track delivery route progress", "View payout and earnings status", "Manage rider profile details"];
  return ["Browse rooms and hostels", "Shop in the market", "Order food and track delivery", "Chat with providers"];
}

function roleIcon(role: WorkspaceRole) {
  if (role === "landlord") return House;
  if (role === "vendor") return Store;
  if (role === "agent") return BriefcaseBusiness;
  return UserRound;
}

function getPreviewCards(flowKey: FlowKey | null): FlowPreviewCard[] | null {
  if (flowKey === "landlord") return LANDLORD_PREVIEW_CARDS;
  if (flowKey === "restaurant") return RESTAURANT_PREVIEW_CARDS;
  if (flowKey === "delivery") return DELIVERY_PREVIEW_CARDS;
  return null;
}

function getFlowTone(flowKey: FlowKey | null) {
  if (flowKey === "restaurant") return { background: "#fff5ec", border: "#ffdcbf" };
  if (flowKey === "delivery") return { background: "#effaf2", border: "#d1f0da" };
  return { background: "#fff1f2", border: "#ffd7dd" };
}

function getApprovedFlowTitle(flow: RoleFlow) {
  return `Change role to ${getWorkspaceLabel(flow.role)}`;
}

function csvToList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToCsv(value: string[]) {
  return Array.from(new Set(value)).join(",");
}

function formatLocation(value: LatLng) {
  return `Google location selected (${value.lat.toFixed(6)}, ${value.lng.toFixed(6)})`;
}

function isUploadField(field: string) {
  return /national id|business license|proof of ownership|profile photo/i.test(field);
}

function uploadKind(field: string): UploadRecord["type"] {
  return /photo|photos/i.test(field) ? "photo" : "document";
}

function buildPayoutSummary(input: PayoutDraft) {
  const mobile = input.mobileMethods.map((method) => {
    if (method === "airtel_money") return `Airtel Money${input.airtelNumber ? ` (${input.airtelNumber})` : ""}`;
    return `TNM Mpamba${input.mpambaNumber ? ` (${input.mpambaNumber})` : ""}`;
  });
  const banks = input.banks.map((bankId) => {
    const bank = BANK_OPTIONS.find((item) => item.id === bankId);
    const details = [input.bankNames[bankId], input.bankNumbers[bankId]].filter(Boolean).join(" / ");
    return `${bank?.name ?? bankId}${details ? ` (${details})` : ""}`;
  });
  const parts = [];
  if (mobile.length) parts.push(`Mobile money: ${mobile.join("; ")}`);
  if (banks.length) parts.push(`Banks: ${banks.join("; ")}`);
  return parts.join(" | ");
}

export default function OnboardingPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ role?: string }>();
  const { user, role, activeRole, loading: authLoading, setActiveRole } = useAuth();
  const theme = EYA_THEME;
  const { height: windowHeight } = useWindowDimensions();
  const contentMinHeight = windowHeight;
  const pageBodyMinHeight = Math.max(0, windowHeight - 126);
  const previewCardMinHeight = Math.max(430, windowHeight - 190);
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
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, UploadRecord>>({});
  const [pickedLocations, setPickedLocations] = useState<Record<string, LatLng>>({});
  const [submittingApplication, setSubmittingApplication] = useState(false);
  const roleGlow = useRef(new Animated.Value(0)).current;

  const currentRole = (activeRole ?? getFallbackWorkspaceRole(role, user?.email ?? null)) as WorkspaceRole;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    const nextFocus = getFlowFocusFromParam(params.role);
    setFocusedFlow(nextFocus);
    if (nextFocus) setShowRolePicker(true);
  }, [params.role]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(roleGlow, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(roleGlow, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [roleGlow]);

  const loadStatuses = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      await syncLocalRoleApplications(user.id).catch(() => null);
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
        await syncLocalRoleApplications(user.id).catch(() => null);
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
        title: "Register as a Food Provider",
        subtitle: "Sell food to students and manage your food provider workspace.",
        accent: "#ef7b2d",
        icon: UtensilsCrossed,
        routeWhenPending: "/(market)/setup",
        routeWhenReady: "/(market)/(tabs)/dashboard",
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
  const getFlowStatus = useCallback(
    (flow: RoleFlow | null): RoleApplicationStatus | "none" => {
      if (!flow) return "none";
      const directStatus = getFlowApplicationStatus(flow.key);
      if (directStatus !== "none") return directStatus;
      return flow.status?.applicationStatus ?? "none";
    },
    [getFlowApplicationStatus],
  );
  const activeApplicationStatus = activePreviewFlow ? getFlowStatus(activePreviewFlow) : getFlowApplicationStatus(previewFlow);

  const draftKey = (field: string, stepId = activePreviewCard?.id ?? 0) => `${previewFlow ?? "flow"}:${stepId}:${field}`;
  const fieldValue = (field: string, stepId = activePreviewCard?.id ?? 0) => applicationDraft[draftKey(field, stepId)] ?? "";
  const setFieldValue = (field: string, value: string, stepId = activePreviewCard?.id ?? 0) => {
    setApplicationDraft((current) => ({ ...current, [draftKey(field, stepId)]: value }));
  };
  const isOptionalField = (field: string) => /optional|if available/i.test(field);

  const pickUploadForField = async (field: string, stepId = activePreviewCard?.id ?? 0) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access needed", "Allow photo access to upload this file.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: field.toLowerCase().includes("profile") ? 0.85 : 0.75,
      allowsEditing: field.toLowerCase().includes("profile"),
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const record: UploadRecord = {
      uri: asset.uri,
      name: asset.fileName ?? `${field.replace(/\W+/g, "-").toLowerCase()}-${Date.now()}`,
      type: uploadKind(field),
    };
    const key = draftKey(field, stepId);
    setUploadedFiles((current) => ({ ...current, [key]: record }));
    setFieldValue(field, `${record.type === "photo" ? "Photo" : "Document"} uploaded: ${record.name}`, stepId);
  };

  const setPayoutSummary = (stepId = activePreviewCard?.id ?? 0, overrides: Partial<PayoutDraft> = {}) => {
    const current = getPayoutDraft(stepId);
    const next = { ...current, ...overrides };
    setFieldValue("Payout Accounts", buildPayoutSummary(next), stepId);
  };

  const getPayoutDraft = (stepId = activePreviewCard?.id ?? 0) => {
    const banks = csvToList(applicationDraft[draftKey("Payout Banks", stepId)] ?? "");
    const bankNames = Object.fromEntries(banks.map((bankId) => [bankId, applicationDraft[draftKey(`Bank ${bankId} account name`, stepId)] ?? ""]));
    const bankNumbers = Object.fromEntries(banks.map((bankId) => [bankId, applicationDraft[draftKey(`Bank ${bankId} account number`, stepId)] ?? ""]));
    return {
      mobileMethods: csvToList(applicationDraft[draftKey("Payout Mobile Methods", stepId)] ?? ""),
      airtelNumber: applicationDraft[draftKey("Airtel Money Number", stepId)] ?? "",
      mpambaNumber: applicationDraft[draftKey("TNM Mpamba Number", stepId)] ?? "",
      banks,
      bankNames,
      bankNumbers,
    };
  };

  const togglePayoutMobile = (method: string, stepId = activePreviewCard?.id ?? 0) => {
    const current = getPayoutDraft(stepId);
    const nextMethods = current.mobileMethods.includes(method) ? current.mobileMethods.filter((item) => item !== method) : [...current.mobileMethods, method];
    setFieldValue("Payout Mobile Methods", listToCsv(nextMethods), stepId);
    setPayoutSummary(stepId, { mobileMethods: nextMethods });
  };

  const togglePayoutBank = (bankId: string, stepId = activePreviewCard?.id ?? 0) => {
    const current = getPayoutDraft(stepId);
    const nextBanks = current.banks.includes(bankId) ? current.banks.filter((item) => item !== bankId) : [...current.banks, bankId];
    setFieldValue("Payout Banks", listToCsv(nextBanks), stepId);
    setPayoutSummary(stepId, { banks: nextBanks });
  };

  const setPayoutTextValue = (field: string, value: string, stepId = activePreviewCard?.id ?? 0) => {
    setFieldValue(field, value, stepId);
    const nextDraft = getPayoutDraft(stepId);
    if (field === "Airtel Money Number") nextDraft.airtelNumber = value;
    if (field === "TNM Mpamba Number") nextDraft.mpambaNumber = value;
    const bankNameMatch = field.match(/^Bank (.+) account name$/);
    const bankNumberMatch = field.match(/^Bank (.+) account number$/);
    if (bankNameMatch) nextDraft.bankNames[bankNameMatch[1]] = value;
    if (bankNumberMatch) nextDraft.bankNumbers[bankNumberMatch[1]] = value;
    setFieldValue("Payout Accounts", buildPayoutSummary(nextDraft), stepId);
  };

  const payoutMissingParts = (stepId: number) => {
    const payout = getPayoutDraft(stepId);
    const missing: string[] = [];
    if (!payout.mobileMethods.length && !payout.banks.length) {
      missing.push("Payout Accounts");
      return missing;
    }
    if (payout.mobileMethods.includes("airtel_money") && !payout.airtelNumber.trim()) missing.push("Airtel Money Number");
    if (payout.mobileMethods.includes("mpamba") && !payout.mpambaNumber.trim()) missing.push("TNM Mpamba Number");
    payout.banks.forEach((bankId) => {
      const bank = BANK_OPTIONS.find((item) => item.id === bankId);
      const label = bank?.name ?? bankId;
      if (!payout.bankNames[bankId]?.trim()) missing.push(`${label} account name`);
      if (!payout.bankNumbers[bankId]?.trim()) missing.push(`${label} account number`);
    });
    return missing;
  };

  const fieldMissingReason = (field: string, stepId: number) => {
    if (isOptionalField(field)) return null;
    const key = draftKey(field, stepId);
    if (field === "Opening Hours") {
      return /^\d{2}:\d{2}\s-\s\d{2}:\d{2}$/.test(fieldValue(field, stepId).trim()) ? null : field;
    }
    if (field === "Payout Accounts") {
      const missing = payoutMissingParts(stepId);
      return missing.length ? missing.join(", ") : null;
    }
    if (/location/i.test(field)) {
      return pickedLocations[key] ? null : field;
    }
    if (isUploadField(field)) {
      return uploadedFiles[key] ? null : field;
    }
    const value = fieldValue(field, stepId).trim();
    return value && value !== "Custom" ? null : field;
  };

  const missingRequiredFieldsForCard = (card: FlowPreviewCard) => {
    if (!card.fields || card.id === activeStepCount) return [];
    return card.fields.map((field) => fieldMissingReason(field, card.id)).filter(Boolean) as string[];
  };

  const validateActiveStep = () => {
    return true;
  };

  const validateAllApplicationSteps = () => {
    const cards = activePreviewCards ?? [];
    for (const card of cards) {
      const missing = missingRequiredFieldsForCard(card);
      if (missing.length) {
        setPreviewStepIndex(Math.max(0, card.id - 1));
        Alert.alert("Complete required fields", `Please fill in: ${missing.join(", ")}.`);
        return false;
      }
    }
    return true;
  };

  const fieldPayloadValue = (field: string, cardId: number) => {
    const key = draftKey(field, cardId);
    if (isUploadField(field)) {
      const file = uploadedFiles[key];
      return file ? `${file.type}: ${file.name} (${file.uri})` : "";
    }
    if (/location/i.test(field)) {
      const location = pickedLocations[key];
      return location ? formatLocation(location) : "";
    }
    if (field === "Payout Accounts") {
      return buildPayoutSummary(getPayoutDraft(cardId));
    }
    return applicationDraft[key]?.trim() ?? "";
  };
  const collectApplicationPayload = () => {
    const payload: Record<string, string> = {};
    activePreviewCards?.forEach((card) => {
      card.fields?.forEach((field) => {
        const value = fieldPayloadValue(field, card.id).trim();
        if (value && value !== "Custom") payload[`${card.title} - ${field}`] = value;
      });
    });
    return payload;
  };

  const renderFieldControl = (field: string) => {
    const stepId = activePreviewCard?.id ?? 0;
    const key = draftKey(field, stepId);
    const optional = isOptionalField(field);

    if (field === "Type of properties") {
      return (
        <OptionPicker
          key={field}
          title={field}
          value={fieldValue(field, stepId)}
          options={PROPERTY_TYPES}
          onChange={(value) => setFieldValue(field, value, stepId)}
          allowCustom
          customPlaceholder="Write property type"
        />
      );
    }

    if (field === "Food Provider Type") {
      return (
        <OptionPicker
          key={field}
          title={field}
          value={fieldValue(field, stepId)}
          options={FOOD_PROVIDER_TYPES}
          onChange={(value) => setFieldValue(field, value, stepId)}
        />
      );
    }

    if (field === "Opening Hours") {
      return (
        <OpeningHoursPicker
          key={field}
          value={fieldValue(field, stepId)}
          onChange={(value) => setFieldValue(field, value, stepId)}
        />
      );
    }

    if (/location/i.test(field)) {
      return (
        <View key={field} style={styles.locationFieldWrap}>
          <View style={styles.fieldHeaderRow}>
            <MapPin size={16} color={theme.accent} />
            <Text style={[styles.fieldControlTitle, { color: theme.text }]}>{field}</Text>
          </View>
          <MapPicker
            value={pickedLocations[key] ?? null}
            onChange={(value) => {
              setPickedLocations((current) => ({ ...current, [key]: value }));
              setFieldValue(field, formatLocation(value), stepId);
            }}
            label={field}
            initializeWithDefault={false}
          />
        </View>
      );
    }

    if (field === "Payout Accounts") {
      const payout = getPayoutDraft(stepId);
      return (
        <PayoutAccountsEditor
          key={field}
          payout={payout}
          onToggleMobile={(method) => togglePayoutMobile(method, stepId)}
          onToggleBank={(bankId) => togglePayoutBank(bankId, stepId)}
          onTextChange={(targetField, value) => setPayoutTextValue(targetField, value, stepId)}
        />
      );
    }

    if (isUploadField(field)) {
      return (
        <UploadField
          key={field}
          label={field}
          optional={optional}
          file={uploadedFiles[key]}
          onPress={() => void pickUploadForField(field, stepId)}
        />
      );
    }

    return (
      <TextInput
        key={field}
        value={fieldValue(field, stepId)}
        onChangeText={(value) => setFieldValue(field, value, stepId)}
        placeholder={field}
        placeholderTextColor={theme.textSoft}
        returnKeyType="next"
        style={[styles.previewField, styles.previewFieldInput, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.text }]}
      />
    );
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

  const pickerHeroScale = roleGlow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] });
  const pickerHeroLift = roleGlow.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const useLargeHeader = !previewFlow;

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
          <View style={[styles.topBar, useLargeHeader && styles.rolePickerTopBar]}>
            <Pressable style={[styles.backBtn, useLargeHeader && styles.rolePickerBackBtn, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]} onPress={handleBack}>
              <ArrowLeft size={useLargeHeader ? 28 : 20} color={theme.text} />
            </Pressable>
            <Text style={[styles.topBarTitle, useLargeHeader && styles.rolePickerTopBarTitle, { color: theme.heading }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              {previewFlow ? activePreviewFlow?.title ?? "Workspace Setup" : showRolePicker ? "Roles & Workspaces" : "Current Workspace"}
            </Text>
            <View style={useLargeHeader ? styles.rolePickerTopSpacer : styles.topBarSpacer} />
          </View>

          <View style={[styles.pageBody, { minHeight: pageBodyMinHeight }]}>
        {!showRolePicker ? (
          <View style={styles.myRoleWrap}>
            <View style={[styles.myRoleCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
              <View style={[styles.myRoleIcon, { backgroundColor: theme.accent }]}>
                <CurrentRoleIcon size={46} color="#ffffff" />
              </View>
              <Text style={[styles.myRoleName, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                {currentRoleLabel}
              </Text>
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
                    <Check size={22} color="#2ead66" />
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
                    {activePreviewCard.fields.map((field) => renderFieldControl(field))}
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
              <Animated.View style={[styles.pickerHero, { transform: [{ translateY: pickerHeroLift }, { scale: pickerHeroScale }] }]}>
                <View style={styles.pickerHeroCopy}>
                  <Text style={[styles.pickerEyebrow, { color: theme.textSoft }]}>Roles & Workspaces</Text>
                  <Text style={[styles.pickerPrompt, { color: theme.text }]}>Choose the workspace you want to run.</Text>
                  <Text style={[styles.pickerNote, { color: theme.textMuted }]}>Apply once. Approved sections open from here without changing accounts.</Text>
                </View>
                <View style={styles.pickerHeroDecor}>
                  <View style={[styles.pickerDecorBubble, { borderColor: "#ffd7dd", backgroundColor: "#fff1f2" }]}>
                    <House size={24} color="#de4c5d" />
                  </View>
                  <View style={[styles.pickerDecorBubble, { borderColor: "#ffdcbf", backgroundColor: "#fff5ec" }]}>
                    <UtensilsCrossed size={24} color="#ef7b2d" />
                  </View>
                  <View style={[styles.pickerDecorBubble, { borderColor: "#d1f0da", backgroundColor: "#effaf2" }]}>
                    <BriefcaseBusiness size={24} color="#2e9b62" />
                  </View>
                </View>
              </Animated.View>

              <View style={styles.pickerRows}>
                {flows.map((flow) => {
                  const Icon = flow.icon;
                  const busy = busyFlow === flow.key;
                  const tone = getFlowTone(flow.key);
                  const flowApplicationStatus = getFlowStatus(flow);
                  const flowTitle = flowApplicationStatus === "approved" ? getApprovedFlowTitle(flow) : flow.title;
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
                        if (flowApplicationStatus === "approved") {
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
                          <Icon size={31} color={flow.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pickerRowTitle, { color: theme.text }]}>{flowTitle}</Text>
                          <Text style={[styles.pickerRowSub, { color: theme.textMuted }]}>{flow.subtitle}</Text>
                          {flowApplicationStatus !== "none" ? (
                            <Text style={[styles.pickerStatusText, { color: flowApplicationStatus === "approved" ? "#168653" : flowApplicationStatus === "pending" ? "#9a6a00" : "#b03c66" }]}>
                              {flowApplicationStatus === "approved" ? "Approved - tap to switch role" : flowApplicationStatus === "pending" ? "Pending admin review" : "Declined - you can reapply"}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <ChevronRight size={26} color={theme.textSoft} />
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
                      <UserRound size={31} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerRowTitle, { color: theme.text }]}>User Section</Text>
                      <Text style={[styles.pickerRowSub, { color: theme.textMuted }]}>Go back to your main account workspace.</Text>
                    </View>
                  </View>
                  <ChevronRight size={26} color={theme.textSoft} />
                </Pressable>
              ) : null}

              <Pressable
                style={[styles.cancelBtn, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
                onPress={() => setShowRolePicker(false)}
              >
                <Text style={[styles.cancelBtnText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function OptionPicker({
  title,
  value,
  options,
  onChange,
  allowCustom = false,
  customPlaceholder = "Write custom option",
}: {
  title: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  allowCustom?: boolean;
  customPlaceholder?: string;
}) {
  const customSelected = allowCustom && (value === "Custom" || (!!value && !options.includes(value)));
  const customValue = value === "Custom" ? "" : value;

  return (
    <View style={styles.optionCard}>
      <Text style={styles.fieldControlTitle}>{title}</Text>
      <View style={styles.optionGrid}>
        {options.map((option) => {
          const active = value === option;
          return (
            <Pressable key={option} style={[styles.optionPill, active && styles.optionPillActive]} onPress={() => onChange(option)}>
              <Text style={[styles.optionPillText, active && styles.optionPillTextActive]}>{option}</Text>
            </Pressable>
          );
        })}
        {allowCustom ? (
          <Pressable style={[styles.optionPill, customSelected && styles.optionPillActive]} onPress={() => onChange("Custom")}>
            <Text style={[styles.optionPillText, customSelected && styles.optionPillTextActive]}>Custom</Text>
          </Pressable>
        ) : null}
      </View>
      {customSelected ? (
        <TextInput
          value={customValue}
          onChangeText={(nextValue) => onChange(nextValue || "Custom")}
          placeholder={customPlaceholder}
          placeholderTextColor="#8a94af"
          returnKeyType="next"
          style={styles.compactInput}
        />
      ) : null}
    </View>
  );
}

function OpeningHoursPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [openValue = "", closeValue = ""] = value.includes(" - ") ? value.split(" - ") : ["", ""];
  const setOpen = (next: string) => onChange(`${next} - ${closeValue}`);
  const setClose = (next: string) => onChange(`${openValue} - ${next}`);

  return (
    <View style={styles.timeCard}>
      <View style={styles.fieldHeaderRow}>
        <Clock3 size={16} color="#5e73dd" />
        <Text style={styles.fieldControlTitle}>Opening Hours</Text>
      </View>
      <Text style={styles.fieldControlSub}>Choose times instead of typing them.</Text>
      <TimePickerRow title="Opens" value={openValue || "08:00"} options={OPENING_TIMES} onChange={setOpen} />
      <TimePickerRow title="Closes" value={closeValue || "20:00"} options={CLOSING_TIMES} onChange={setClose} />
      <View style={styles.timeSummary}>
        <Text style={styles.timeSummaryLabel}>Selected</Text>
        <Text style={styles.timeSummaryValue}>{value && openValue && closeValue ? value : "Select opening and closing time"}</Text>
      </View>
    </View>
  );
}

function TimePickerRow({ title, value, options, onChange }: { title: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <View style={styles.timePickerRow}>
      <Text style={styles.timePickerTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeOptions}>
        {options.map((option) => {
          const active = value === option;
          return (
            <Pressable key={option} style={[styles.timeOption, active && styles.timeOptionActive]} onPress={() => onChange(option)}>
              <Text style={[styles.timeOptionText, active && styles.timeOptionTextActive]}>{option}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function UploadField({ label, optional, file, onPress }: { label: string; optional: boolean; file?: UploadRecord; onPress: () => void }) {
  const isPhoto = uploadKind(label) === "photo";
  return (
    <View style={styles.uploadCard}>
      <View style={styles.uploadTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldControlTitle}>{label}</Text>
          <Text style={styles.fieldControlSub}>{optional ? "Optional: upload a document if you have one." : "Required for review before you can continue."}</Text>
        </View>
        {file ? (
          <View style={styles.uploadStatusPill}>
            <CheckCircle2 size={13} color="#168653" />
            <Text style={styles.uploadStatusText}>{isPhoto ? "Photo uploaded" : "Document uploaded"}</Text>
          </View>
        ) : null}
      </View>

      {file?.type === "photo" ? <Image source={{ uri: file.uri }} style={styles.profilePreviewImage} /> : null}

      <Pressable style={[styles.uploadButton, file && styles.uploadButtonDone]} onPress={onPress}>
        {isPhoto ? <Camera size={18} color={file ? "#168653" : "#5e73dd"} /> : <FileUp size={18} color={file ? "#168653" : "#5e73dd"} />}
        <Text style={[styles.uploadButtonText, file && styles.uploadButtonTextDone]}>{file ? file.name : isPhoto ? "Upload profile photo" : "Upload document"}</Text>
      </Pressable>
    </View>
  );
}

function PayoutAccountsEditor({
  payout,
  onToggleMobile,
  onToggleBank,
  onTextChange,
}: {
  payout: PayoutDraft;
  onToggleMobile: (method: string) => void;
  onToggleBank: (bankId: string) => void;
  onTextChange: (field: string, value: string) => void;
}) {
  return (
    <View style={styles.payoutCard}>
      <View style={styles.fieldHeaderRow}>
        <WalletCards size={17} color="#5e73dd" />
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldControlTitle}>Payout Accounts</Text>
          <Text style={styles.fieldControlSub}>Choose one or many options. You can add Airtel, Mpamba, and multiple banks.</Text>
        </View>
      </View>

      <Text style={styles.payoutSectionTitle}>Mobile money accounts</Text>
      <View style={styles.payoutGrid}>
        {MOBILE_MONEY_OPTIONS.map((method) => {
          const active = payout.mobileMethods.includes(method.id);
          return (
            <Pressable key={method.id} style={[styles.payoutMethodCard, active && styles.payoutMethodCardActive]} onPress={() => onToggleMobile(method.id)}>
              <PaymentBrandLogo brand={method.id} size={42} active={active} />
              <View style={styles.payoutMethodCopy}>
                <Text style={[styles.payoutMethodTitle, active && styles.payoutMethodTitleActive]}>{method.label}</Text>
                <Text style={styles.payoutMethodSub}>{method.subtitle}</Text>
              </View>
              <View style={[styles.checkDot, active && styles.checkDotActive]}>{active ? <Check size={12} color="#ffffff" /> : null}</View>
            </Pressable>
          );
        })}
      </View>

      {payout.mobileMethods.includes("airtel_money") ? (
        <TextInput
          value={payout.airtelNumber}
          onChangeText={(value) => onTextChange("Airtel Money Number", value)}
          placeholder="Airtel Money number"
          placeholderTextColor="#8a94af"
          keyboardType="phone-pad"
          style={styles.compactInput}
        />
      ) : null}
      {payout.mobileMethods.includes("mpamba") ? (
        <TextInput
          value={payout.mpambaNumber}
          onChangeText={(value) => onTextChange("TNM Mpamba Number", value)}
          placeholder="TNM Mpamba number"
          placeholderTextColor="#8a94af"
          keyboardType="phone-pad"
          style={styles.compactInput}
        />
      ) : null}

      <Text style={styles.payoutSectionTitle}>Bank accounts</Text>
      <View style={styles.bankGrid}>
        {BANK_OPTIONS.map((bank) => {
          const active = payout.banks.includes(bank.id);
          return (
            <Pressable key={bank.id} style={[styles.bankCard, active && styles.bankCardActive]} onPress={() => onToggleBank(bank.id)}>
              <BankLogoMark logo={bank.logo} short={bank.short} color={bank.color} active={active} />
              <Text style={[styles.bankCardText, active && styles.bankCardTextActive]} numberOfLines={2}>
                {bank.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {payout.banks.map((bankId) => {
        const bank = BANK_OPTIONS.find((item) => item.id === bankId);
        if (!bank) return null;
        return (
          <View key={bankId} style={styles.bankDetailsCard}>
            <View style={styles.bankDetailsHeader}>
              <BankLogoMark logo={bank.logo} short={bank.short} color={bank.color} active />
              <Text style={styles.bankDetailsTitle}>{bank.name}</Text>
            </View>
            <TextInput
              value={payout.bankNames[bankId] ?? ""}
              onChangeText={(value) => onTextChange(`Bank ${bankId} account name`, value)}
              placeholder="Account name"
              placeholderTextColor="#8a94af"
              style={styles.compactInput}
            />
            <TextInput
              value={payout.bankNumbers[bankId] ?? ""}
              onChangeText={(value) => onTextChange(`Bank ${bankId} account number`, value)}
              placeholder="Account number"
              placeholderTextColor="#8a94af"
              keyboardType="number-pad"
              style={styles.compactInput}
            />
          </View>
        );
      })}
    </View>
  );
}

function BankLogoMark({ logo, short, color, active }: { logo?: ImageSourcePropType; short: string; color: string; active?: boolean }) {
  return (
    <View style={[styles.bankLogo, { borderColor: active ? "#5e73dd" : "#dfe6f5" }, active && styles.bankLogoActive]}>
      {logo ? (
        <Image source={logo} style={styles.bankLogoImage} resizeMode="contain" />
      ) : (
        <View style={[styles.bankLogoFallback, { borderColor: color }]}>
          <Building2 size={17} color={color} />
          <Text style={[styles.bankLogoFallbackText, { color }]}>{short}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f7fd" },
  safeArea: { flex: 1 },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 10,
  },
  pageBody: { flexGrow: 1 },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  loaderText: { color: "#6f7ea3", fontSize: 12, fontWeight: "700" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rolePickerTopBar: { minHeight: 76, paddingTop: 4 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef1fb",
  },
  rolePickerBackBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  topBarTitle: { flex: 1, color: "#13285f", fontSize: 23, fontWeight: "900", textAlign: "center", marginHorizontal: 8 },
  rolePickerTopBarTitle: { fontSize: 30, lineHeight: 36 },
  topBarSpacer: { width: 44 },
  rolePickerTopSpacer: { width: 58 },

  myRoleWrap: {
    flexGrow: 1,
    gap: 24,
    justifyContent: "flex-start",
    paddingTop: 12,
    paddingBottom: 24,
  },
  myRoleCard: {
    minHeight: 292,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#ffffff",
    paddingHorizontal: 24,
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    shadowColor: "#8492c2",
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  myRoleIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#5e73dd",
    alignItems: "center",
    justifyContent: "center",
  },
  myRoleName: { color: "#0e2756", fontSize: 42, fontWeight: "900", lineHeight: 48 },
  activeBadge: {
    borderRadius: 999,
    backgroundColor: "#dff5ea",
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  activeBadgeText: { color: "#0f7b3f", fontSize: 18, fontWeight: "900" },
  myRoleCopy: { color: "#6e7892", fontSize: 20, fontWeight: "600", lineHeight: 31, textAlign: "center", maxWidth: 620 },
  whatWrap: { gap: 20, paddingHorizontal: 16 },
  whatTitle: { color: "#0e2756", fontSize: 27, fontWeight: "900", lineHeight: 34 },
  actionList: { gap: 21 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 20 },
  actionText: { color: "#6e7892", fontSize: 21, fontWeight: "500", flex: 1, lineHeight: 29 },
  addRolePrimaryBtn: {
    minHeight: 78,
    borderRadius: 18,
    backgroundColor: "#5e73dd",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    shadowColor: "#5e73dd",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  addRolePrimaryText: { color: "#ffffff", fontSize: 22, fontWeight: "900", textAlign: "center" },
  secondaryWorkspaceBtn: {
    minHeight: 50,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryWorkspaceText: { color: "#0e2756", fontSize: 16, fontWeight: "800" },
  workspaceFoot: { gap: 22, paddingTop: 6 },
  workspaceInsight: {
    minHeight: 132,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 23,
    gap: 12,
    shadowColor: "#8492c2",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  workspaceInsightKicker: { fontSize: 17, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.1 },
  workspaceInsightTitle: { fontSize: 23, fontWeight: "900", lineHeight: 32 },
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
  fieldHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  fieldControlTitle: { color: "#0e2756", fontSize: 13, fontWeight: "900" },
  fieldControlSub: { color: "#6e7892", fontSize: 11, fontWeight: "700", lineHeight: 16, marginTop: 3 },
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
  optionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#f7f8fe",
    padding: 12,
    gap: 10,
  },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionPill: {
    flexGrow: 1,
    minWidth: "46%",
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dfe6f5",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  optionPillActive: { backgroundColor: "#5e73dd", borderColor: "#5e73dd" },
  optionPillText: { color: "#0e2756", fontSize: 12, fontWeight: "900", textAlign: "center" },
  optionPillTextActive: { color: "#ffffff" },
  timeCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#f7f8fe",
    padding: 12,
    gap: 10,
  },
  timePickerRow: { gap: 7 },
  timePickerTitle: { color: "#0e2756", fontSize: 12, fontWeight: "900" },
  timeOptions: { gap: 7, paddingRight: 4 },
  timeOption: {
    minWidth: 66,
    minHeight: 38,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#dfe6f5",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  timeOptionActive: { backgroundColor: "#5e73dd", borderColor: "#5e73dd" },
  timeOptionText: { color: "#0e2756", fontSize: 12, fontWeight: "900" },
  timeOptionTextActive: { color: "#ffffff" },
  timeSummary: {
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e8edf7",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  timeSummaryLabel: { color: "#8a94af", fontSize: 11, fontWeight: "900" },
  timeSummaryValue: { color: "#0e2756", fontSize: 12, fontWeight: "900" },
  uploadCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#f7f8fe",
    padding: 12,
    gap: 10,
  },
  uploadTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  uploadStatusPill: {
    borderRadius: 999,
    backgroundColor: "#e8f8ef",
    borderWidth: 1,
    borderColor: "#ccefd9",
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  uploadStatusText: { color: "#168653", fontSize: 10, fontWeight: "900" },
  uploadButton: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#dfe6f5",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  uploadButtonDone: { borderColor: "#ccefd9", backgroundColor: "#ffffff" },
  uploadButtonText: { color: "#0e2756", fontSize: 13, fontWeight: "900", flexShrink: 1 },
  uploadButtonTextDone: { color: "#168653" },
  profilePreviewImage: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignSelf: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  locationFieldWrap: { gap: 9 },
  payoutCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#f7f8fe",
    padding: 12,
    gap: 11,
  },
  payoutSectionTitle: { color: "#8a94af", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  payoutGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  payoutMethodCard: {
    flex: 1,
    minWidth: 220,
    minHeight: 74,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#dfe6f5",
    backgroundColor: "#ffffff",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  payoutMethodCardActive: { borderColor: "#5e73dd", backgroundColor: "#eef2ff" },
  payoutMethodCopy: { flex: 1, minWidth: 0 },
  payoutMethodTitle: { color: "#0e2756", fontSize: 13, fontWeight: "900" },
  payoutMethodTitleActive: { color: "#203bad" },
  payoutMethodSub: { color: "#6e7892", fontSize: 10, fontWeight: "700", lineHeight: 14, marginTop: 2 },
  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#dfe6f5",
    alignItems: "center",
    justifyContent: "center",
  },
  checkDotActive: { backgroundColor: "#5e73dd", borderColor: "#5e73dd" },
  compactInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dfe6f5",
    backgroundColor: "#ffffff",
    color: "#0e2756",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "800",
  },
  bankGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bankCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dfe6f5",
    backgroundColor: "#ffffff",
    paddingHorizontal: 9,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bankCardActive: { backgroundColor: "#eef2ff", borderColor: "#5e73dd" },
  bankCardText: { color: "#0e2756", fontSize: 11, fontWeight: "900", flex: 1, lineHeight: 15 },
  bankCardTextActive: { color: "#203bad" },
  bankLogo: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    padding: 4,
  },
  bankLogoActive: {
    shadowColor: "#5e73dd",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  bankLogoImage: { width: "100%", height: "100%" },
  bankLogoFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 11,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  bankLogoFallbackText: { fontSize: 7, fontWeight: "900" },
  bankDetailsCard: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#ffffff",
    padding: 10,
    gap: 8,
  },
  bankDetailsHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  bankDetailsTitle: { color: "#0e2756", fontSize: 13, fontWeight: "900", flex: 1 },
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
  pickerSection: { flexGrow: 1, gap: 14, justifyContent: "flex-start", paddingTop: 18 },
  pickerCard: {
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#eef1fb",
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 16,
    justifyContent: "flex-start",
    shadowColor: "#8492c2",
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  pickerHero: {
    minHeight: 192,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#e7ecfa",
    backgroundColor: "#ffffff",
    paddingHorizontal: 22,
    paddingVertical: 20,
    gap: 16,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  pickerHeroCopy: { flex: 1, gap: 12 },
  pickerHeroDecor: { width: 82, alignItems: "center", gap: 12 },
  pickerDecorBubble: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerEyebrow: { fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.3 },
  pickerPrompt: { color: "#0e2756", fontSize: 28, fontWeight: "900", lineHeight: 36 },
  pickerNote: { color: "#6e7892", fontSize: 17, fontWeight: "700", lineHeight: 26 },
  pickerRows: { gap: 14 },
  pickerRow: {
    minHeight: 112,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#f7f8fe",
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  pickerRowLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  pickerIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e8edf7",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  pickerRowTitle: { color: "#0e2756", fontSize: 22, lineHeight: 27, fontWeight: "900" },
  pickerRowSub: { color: "#6e7892", fontSize: 16, fontWeight: "700", lineHeight: 24 },
  pickerStatusText: { fontSize: 14, fontWeight: "900", marginTop: 8 },
  cancelBtn: {
    minHeight: 70,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e8edf7",
    backgroundColor: "#f7f8fe",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: { color: "#0e2756", fontSize: 22, fontWeight: "900" },
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
