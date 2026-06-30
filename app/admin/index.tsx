import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  CreditCard,
  EllipsisVertical,
  Eye,
  Flag,
  Headphones,
  Home,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Tag,
  Ticket,
  Trash2,
  Truck,
  User,
  UserCheck,
  UserPlus,
  Users,
  UtensilsCrossed,
  Wallet,
  WalletCards,
  X,
  XCircle,
} from "lucide-react-native";
import {
  assignAdminDriver,
  broadcastAdminNotification,
  deleteAdminCatalogItem,
  inviteAdminStaff,
  listAdminCatalogItems,
  listAdminHousingListings,
  listAdminOrders,
  listAdminPayments,
  listAdminSupportTickets,
  listAdminUsers,
  listAdminVendors,
  respondAdminSupportTicket,
  updateAdminCatalogItem,
  updateAdminHousingListing,
  updateAdminOrderStatus,
  updateAdminUser,
  type AdminBroadcastAudience,
  type AdminCatalogItemSummary,
  type AdminHousingListingSummary,
  type AdminOrderStatus,
  type AdminOrderSummary,
  type AdminPaymentSummary,
  type AdminSupportTicket,
  type AdminUserSummary,
  type AdminVendorSummary,
} from "@/lib/adminControlApi";
import { listRoleApplicationsForAdmin, reviewRoleApplication, type RoleApplication } from "@/lib/roleApplications";
import {
  listTrustSafetyReportsForAdmin,
  updateTrustSafetyReportStatus,
  type TrustSafetyReportStatus,
} from "@/lib/trustSafety";
import { supabase } from "@/lib/supabase";
import { useNotificationInbox } from "@/providers/NotificationInboxProvider";
import { useAuth } from "@/providers/AuthProvider";

type IconComponent = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
type AdminTab = "dashboard" | "orders" | "users" | "tickets" | "more" | "moderation";
type OrderFilter = "All" | "Active" | "Issues" | "Completed";
type TicketFilter = "Open" | "Urgent" | "Resolved";
type ReviewFilter = "Rooms" | "Market" | "Food" | "Reports";
type UserFilter = "All" | "Users" | "Landlords" | "Restaurants" | "Sellers" | "Agents";
type UserStatusFilter = "All" | "Verified" | "Pending" | "Suspended";
type UserWorkflow = "Admissions" | "Directory" | "Staff";
type Tone = "blue" | "green" | "orange" | "purple" | "red" | "neutral";
type TrendDirection = "up" | "down";
type TrustReport = Awaited<ReturnType<typeof listTrustSafetyReportsForAdmin>>[number];
type AdminMetrics = {
  paidRevenue: number;
  weeklyRevenue: number;
  failedPayments: number;
  pendingPayments: number;
  activeOrders: number;
  activeDeliveries: number;
  delayedOrders: number;
  unassignedOrders: number;
  pendingApplications: number;
  openTickets: number;
  urgentTickets: number;
  pendingReviews: number;
  flaggedReviews: number;
  approvedReviewsToday: number;
  totalUsers: number;
  newUsers: number;
};

type AdminProfile = {
  fullName: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  avatarUrl: string | null;
};

type AdminProfileNotice = {
  type: "success" | "error";
  text: string;
};

type DetailSheetRow = {
  label: string;
  value: string | number | null | undefined;
};

type DetailSheetSection = {
  title: string;
  rows: DetailSheetRow[];
};

type DetailSheetData = {
  title: string;
  kicker: string;
  subtitle?: string | null;
  icon: IconComponent;
  tone: Tone;
  summary?: DetailSheetRow[];
  sections: DetailSheetSection[];
};

type DriverOption = {
  id: string;
  name: string;
};

type DemoOrder = {
  id: string;
  merchant: string;
  customer: string;
  location: string;
  type: "food" | "market" | "room";
  total: number;
  status: AdminOrderStatus | "awaiting_agent" | "issue";
  createdAt: string;
};

type DemoUser = {
  id: string;
  name: string;
  phone: string;
  role: AdminUserSummary["role"] | "restaurant" | "seller";
  status: "verified" | "pending" | "suspended";
  joined: string;
  avatar: string;
};

type DemoTicket = {
  id: string;
  title: string;
  description: string;
  reporter: string;
  reporterId: string;
  category: string;
  priority: "High" | "Medium";
  type: "payments" | "rooms" | "food" | "market";
  createdAt: string;
  status: "open" | "urgent" | "resolved";
  avatar: string;
};

type DemoReviewItem = {
  id: string;
  filter: ReviewFilter;
  title: string;
  subtitle: string;
  location: string;
  submittedBy: string;
  submittedAgo: string;
  image: string;
  status: "pending" | "flagged" | "approved" | "needs_details";
};

type CatalogListingDraft = {
  name: string;
  description: string;
  priceMwk: string;
  stockQty: string;
  imageUrl: string;
  isActive: boolean;
};

const COLORS = {
  navy: "#061f63",
  muted: "#7683a3",
  faint: "#eef0fb",
  border: "#dfe4f2",
  card: "#ffffff",
  purple: "#5a52f6",
  blue: "#3d79ee",
  green: "#0f9a4a",
  orange: "#ee8700",
  red: "#ef2828",
};

const REVIEW_FILTERS: ReviewFilter[] = ["Rooms", "Market", "Food", "Reports"];
const ORDER_FILTERS: OrderFilter[] = ["All", "Active", "Issues", "Completed"];
const TICKET_FILTERS: TicketFilter[] = ["Open", "Urgent", "Resolved"];
const STATUS_FILTERS: UserStatusFilter[] = ["All", "Verified", "Pending", "Suspended"];
const USER_WORKFLOWS: UserWorkflow[] = ["Admissions", "Directory", "Staff"];
const BROADCAST_AUDIENCES: { label: string; value: AdminBroadcastAudience; icon: IconComponent }[] = [
  { label: "All users", value: "all", icon: Users },
  { label: "Users", value: "student", icon: User },
  { label: "Landlords", value: "landlord", icon: Home },
  { label: "Restaurants", value: "vendor", icon: UtensilsCrossed },
  { label: "Agents", value: "agent", icon: UserCheck },
];
const USER_FILTERS: { label: UserFilter; icon?: IconComponent }[] = [
  { label: "All" },
  { label: "Users", icon: Users },
  { label: "Landlords", icon: Home },
  { label: "Restaurants", icon: UtensilsCrossed },
  { label: "Sellers", icon: Store },
  { label: "Agents", icon: UserCheck },
];

const SAMPLE_REVIEW_ITEMS: DemoReviewItem[] = [
  {
    id: "demo-review-1",
    filter: "Rooms",
    title: "Chitedze Hostel",
    subtitle: "Hostel  -  Private Room",
    location: "Chitedze, Lilongwe",
    submittedBy: "John Banda",
    submittedAgo: "Submitted 2h ago",
    image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=400&q=80",
    status: "pending",
  },
  {
    id: "demo-review-2",
    filter: "Food",
    title: "Kuli Kuli Kitchen",
    subtitle: "Restaurant  -  African Cuisine",
    location: "Area 10, Lilongwe",
    submittedBy: "Mercy Phiri",
    submittedAgo: "Submitted 4h ago",
    image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=400&q=80",
    status: "flagged",
  },
  {
    id: "demo-review-3",
    filter: "Market",
    title: "Sony WH-1000XM4",
    subtitle: "Electronics  -  Headphones",
    location: "Lilongwe",
    submittedBy: "Gift Kalima",
    submittedAgo: "Submitted 6h ago",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=80",
    status: "pending",
  },
  {
    id: "demo-review-4",
    filter: "Rooms",
    title: "Sunshine Student Lodge",
    subtitle: "Hostel  -  Shared Room",
    location: "Area 47, Lilongwe",
    submittedBy: "Blessings Moyo",
    submittedAgo: "Submitted 8h ago",
    image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=400&q=80",
    status: "approved",
  },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function money(value: number | null | undefined) {
  return `MWK ${Number(value ?? 0).toLocaleString()}`;
}

function compactMoney(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  if (amount >= 1000000) {
    const rounded = amount / 1000000;
    return `MWK ${rounded >= 10 ? rounded.toFixed(1) : rounded.toFixed(2).replace(/0$/, "")}M`;
  }
  return money(amount);
}

function titleCase(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "Just now";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const diff = Math.max(0, Date.now() - parsed.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function compactId(id: string) {
  if (!id) return "EYA";
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase();
}

function statusColor(status: string): Tone {
  const normalized = status.toLowerCase();
  if (["verified", "approved", "ready", "completed", "delivered", "resolved"].includes(normalized)) return "green";
  if (["pending", "preparing", "processing", "awaiting_agent", "on_hold"].includes(normalized)) return "orange";
  if (["failed", "issue", "flagged", "suspended", "urgent", "declined", "cancelled"].includes(normalized)) return "red";
  if (["on_the_way", "accepted", "assigned", "review"].includes(normalized)) return "blue";
  return "purple";
}

function toneColors(tone: Tone) {
  if (tone === "green") return { bg: "#e8f8ee", fg: COLORS.green, soft: "#dff5e8" };
  if (tone === "orange") return { bg: "#fff3df", fg: COLORS.orange, soft: "#ffefd7" };
  if (tone === "red") return { bg: "#ffe6ea", fg: COLORS.red, soft: "#ffe1e6" };
  if (tone === "purple") return { bg: "#efecff", fg: COLORS.purple, soft: "#e9e6ff" };
  if (tone === "blue") return { bg: "#e8f0ff", fg: COLORS.blue, soft: "#e6efff" };
  return { bg: "#f3f5fb", fg: COLORS.muted, soft: "#eef0f7" };
}

function orderIcon(type: DemoOrder["type"] | AdminOrderSummary["channel"]) {
  if (type === "food") return UtensilsCrossed;
  if (type === "market") return ShoppingBag;
  return Building2;
}

function orderTone(type: DemoOrder["type"] | AdminOrderSummary["channel"]): Tone {
  if (type === "food") return "green";
  if (type === "market") return "blue";
  return "purple";
}

function nextStatus(status: AdminOrderStatus): AdminOrderStatus {
  if (status === "pending") return "accepted";
  if (status === "accepted") return "preparing";
  if (status === "preparing") return "picked_up";
  if (status === "picked_up") return "on_the_way";
  if (status === "on_the_way") return "delivered";
  return status;
}

function firstNameFrom(value: string | null | undefined) {
  const first = String(value ?? "").trim().split(/\s+/)[0];
  return first || "Amen";
}

function splitProfileName(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text) return { firstName: "", lastName: "" };
  const parts = text.split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function fullName(row: AdminUserSummary) {
  return row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || "EYA user";
}

function roleLabel(role: DemoUser["role"] | AdminUserSummary["role"] | RoleApplication["target_role"]) {
  if (role === "student") return "User";
  if (role === "vendor") return "Restaurant";
  return titleCase(role);
}

function applicationLabel(application: Pick<RoleApplication, "application_kind" | "target_role">) {
  if (application.application_kind === "restaurant") return "Restaurant";
  if (application.application_kind === "seller") return "Seller";
  if (application.application_kind === "delivery") return "Delivery Agent";
  return roleLabel(application.target_role);
}

function roleTone(role: DemoUser["role"] | AdminUserSummary["role"] | RoleApplication["target_role"]): Tone {
  if (role === "landlord") return "green";
  if (role === "vendor" || role === "restaurant") return "orange";
  if (role === "agent") return "purple";
  if (role === "seller") return "blue";
  return "blue";
}

function roleIcon(role: DemoUser["role"] | AdminUserSummary["role"] | RoleApplication["target_role"]) {
  if (role === "landlord") return Home;
  if (role === "vendor" || role === "restaurant") return UtensilsCrossed;
  if (role === "agent") return UserCheck;
  if (role === "seller") return Store;
  if (role === "admin") return ShieldCheck;
  return User;
}

function applicationIcon(application: Pick<RoleApplication, "application_kind" | "target_role">) {
  if (application.application_kind === "seller") return Store;
  if (application.application_kind === "restaurant") return UtensilsCrossed;
  return roleIcon(application.target_role);
}

function applicationTone(application: Pick<RoleApplication, "application_kind" | "target_role">): Tone {
  if (application.application_kind === "seller") return "blue";
  if (application.application_kind === "restaurant") return "orange";
  return roleTone(application.target_role);
}

type ApplicationDetailGroup = {
  title: string;
  rows: { label: string; value: string }[];
};

function cleanApplicationDetailText(value: string) {
  return value.replace(/\s*:\s*/g, ": ").replace(/\s+/g, " ").trim();
}

function applicationDetailGroups(application: RoleApplication): ApplicationDetailGroup[] {
  const groups: ApplicationDetailGroup[] = [];
  const groupByTitle = new Map<string, ApplicationDetailGroup>();

  Object.entries(application.payload ?? {}).forEach(([rawKey, rawValue]) => {
    const value = String(rawValue ?? "").trim();
    if (!value) return;

    const key = cleanApplicationDetailText(String(rawKey ?? ""));
    const sectionMatch = key.match(/^(.+?)\s+-\s+(.+)$/);
    const title = sectionMatch ? cleanApplicationDetailText(sectionMatch[1]) : "Application Details";
    const label = cleanApplicationDetailText(sectionMatch ? sectionMatch[2] : key);

    let group = groupByTitle.get(title);
    if (!group) {
      group = { title, rows: [] };
      groupByTitle.set(title, group);
      groups.push(group);
    }
    group.rows.push({ label, value });
  });

  return groups;
}

function normalizeDetailRows(rows: DetailSheetRow[]) {
  return rows
    .map((row) => ({ label: row.label, value: String(row.value ?? "").trim() }))
    .filter((row) => row.value.length > 0);
}

function normalizeDetailSections(sections: DetailSheetSection[]) {
  return sections
    .map((section) => ({ title: section.title, rows: normalizeDetailRows(section.rows) }))
    .filter((section) => section.rows.length > 0);
}

function paymentSucceeded(payment: AdminPaymentSummary) {
  return ["paid", "success", "successful", "succeeded", "completed"].includes(String(payment.status).toLowerCase());
}

function paymentFailed(payment: AdminPaymentSummary) {
  return ["failed", "cancelled", "error"].includes(String(payment.status).toLowerCase());
}

function isToday(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function matchesQuery(query: string, ...values: unknown[]) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function catalogDraftFromItem(item: AdminCatalogItemSummary): CatalogListingDraft {
  return {
    name: item.name,
    description: item.description ?? "",
    priceMwk: String(item.price_mwk ?? 0),
    stockQty: item.stock_qty === null || item.stock_qty === undefined ? "" : String(item.stock_qty),
    imageUrl: item.image_urls?.[0] ?? item.image_url ?? "",
    isActive: item.is_active,
  };
}

function fallbackAdminProfile(user: SupabaseUser | null | undefined): AdminProfile {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = String(meta.full_name ?? "").trim() || String(user?.email ?? "").split("@")[0] || "Admin";
  const parts = splitProfileName(fullName);
  return {
    fullName,
    firstName: String(meta.first_name ?? parts.firstName).trim(),
    lastName: String(meta.last_name ?? meta.surname ?? parts.lastName).trim(),
    phone: String(meta.phone ?? "").trim(),
    email: String(user?.email ?? "").trim(),
    avatarUrl: String(meta.avatar_url ?? "").trim() || null,
  };
}

async function fetchAdminProfile(user: SupabaseUser): Promise<AdminProfile> {
  const fallback = fallbackAdminProfile(user);
  const selects = [
    "id,full_name,first_name,last_name,surname,email,phone,avatar_url",
    "id,full_name,first_name,last_name,email,phone,avatar_url",
    "id,full_name,email,phone,avatar_url",
  ];

  for (const selectClause of selects) {
    const { data, error } = await supabase.from("profiles").select(selectClause).eq("id", user.id).maybeSingle();
    if (error) continue;
    const row = (data ?? {}) as {
      full_name?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      surname?: string | null;
      email?: string | null;
      phone?: string | null;
      avatar_url?: string | null;
    };
    const fullName = String(row.full_name ?? "").trim() || [row.first_name, row.last_name ?? row.surname].filter(Boolean).join(" ").trim() || fallback.fullName;
    const parts = splitProfileName(fullName);
    return {
      fullName,
      firstName: String(row.first_name ?? parts.firstName).trim(),
      lastName: String(row.last_name ?? row.surname ?? parts.lastName).trim(),
      phone: String(row.phone ?? fallback.phone).trim(),
      email: String(row.email ?? fallback.email).trim(),
      avatarUrl: String(row.avatar_url ?? "").trim() || fallback.avatarUrl,
    };
  }

  return fallback;
}

function getAvatarFileMeta(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const safeExt = ext === "heic" || ext === "heif" ? "jpg" : ext;
  return {
    name: `admin-avatar-${Date.now()}.${safeExt}`,
    type: asset.mimeType || (safeExt === "png" ? "image/png" : safeExt === "webp" ? "image/webp" : "image/jpeg"),
  };
}

async function uploadAdminAvatar(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) throw new Error("Cloudinary upload is not configured.");

  const meta = getAvatarFileMeta(asset);
  const form = new FormData();
  form.append("file", { uri: asset.uri, name: meta.name, type: meta.type } as any);
  form.append("upload_preset", uploadPreset);
  form.append("folder", "eya/admin-avatars");

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Failed to upload profile picture.");
  return String(json.secure_url ?? "");
}

async function loadAdminSource<T>(promise: PromiseLike<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export default function AdminPortalPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, session, signOut } = useAuth();
  const { unreadCount } = useNotificationInbox();
  const accessToken = session?.access_token ?? null;
  const isWide = width >= 760;

  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("Active");
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>("Urgent");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("Rooms");
  const [userFilter, setUserFilter] = useState<UserFilter>("All");
  const [userStatusFilter, setUserStatusFilter] = useState<UserStatusFilter>("All");
  const [userQuery, setUserQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [detailSheet, setDetailSheet] = useState<DetailSheetData | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("EYA admin notice");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState<AdminBroadcastAudience>("all");
  const [broadcastImportant, setBroadcastImportant] = useState(true);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [adminProfile, setAdminProfile] = useState<AdminProfile>(() => fallbackAdminProfile(null));
  const [profileFullName, setProfileFullName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profileNotice, setProfileNotice] = useState<AdminProfileNotice | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [payments, setPayments] = useState<AdminPaymentSummary[]>([]);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [vendors, setVendors] = useState<AdminVendorSummary[]>([]);
  const [catalog, setCatalog] = useState<AdminCatalogItemSummary[]>([]);
  const [housing, setHousing] = useState<AdminHousingListingSummary[]>([]);
  const [supportTickets, setSupportTickets] = useState<AdminSupportTicket[]>([]);
  const [trustReports, setTrustReports] = useState<TrustReport[]>([]);
  const [roleApplications, setRoleApplications] = useState<RoleApplication[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setRefreshing(true);
    try {
      const [
        nextOrders,
        nextPayments,
        nextUsers,
        nextVendors,
        nextCatalog,
        nextHousing,
        nextSupportTickets,
        nextTrustReports,
        nextRoleApplications,
        nextAdminProfile,
        driverResult,
      ] = await Promise.all([
        loadAdminSource<AdminOrderSummary[]>(listAdminOrders({ userId: user.id, accessToken, limit: 200 }), []),
        loadAdminSource<AdminPaymentSummary[]>(listAdminPayments({ userId: user.id, accessToken, limit: 200 }), []),
        loadAdminSource<AdminUserSummary[]>(listAdminUsers({ userId: user.id, accessToken, limit: 240 }), []),
        loadAdminSource<AdminVendorSummary[]>(listAdminVendors({ userId: user.id, accessToken, limit: 240 }), []),
        loadAdminSource<AdminCatalogItemSummary[]>(listAdminCatalogItems({ userId: user.id, accessToken, limit: 260 }), []),
        loadAdminSource<AdminHousingListingSummary[]>(listAdminHousingListings({ userId: user.id, accessToken, limit: 260 }), []),
        loadAdminSource<AdminSupportTicket[]>(listAdminSupportTickets({ userId: user.id, accessToken, limit: 200 }), []),
        loadAdminSource<TrustReport[]>(listTrustSafetyReportsForAdmin(), []),
        loadAdminSource<RoleApplication[]>(listRoleApplicationsForAdmin(), []),
        loadAdminSource<AdminProfile>(fetchAdminProfile(user), fallbackAdminProfile(user)),
        loadAdminSource(
          supabase.from("profiles").select("id,full_name,first_name,last_name,email,role").in("role", ["agent", "admin"]).limit(120),
          { data: [], error: null, count: null, status: 200, statusText: "OK" },
        ),
      ]);

      setOrders(nextOrders);
      setPayments(nextPayments);
      setUsers(nextUsers);
      setVendors(nextVendors);
      setCatalog(nextCatalog);
      setHousing(nextHousing);
      setSupportTickets(nextSupportTickets);
      setTrustReports(nextTrustReports);
      setRoleApplications(nextRoleApplications);
      setAdminProfile(nextAdminProfile);
      setProfileFullName(nextAdminProfile.fullName);
      setProfilePhone(nextAdminProfile.phone);

      const driverRows =
        !driverResult.error ? driverResult.data ?? [] : [];
      setDrivers(
        driverRows.map((row: any) => ({
          id: String(row.id),
          name: String(row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || row.id),
        })),
      );

      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Admin data could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const profileName = useMemo(() => {
    const self = users.find((row) => row.id === user?.id);
    return adminProfile.fullName || (self ? fullName(self) : null) || user?.user_metadata?.full_name || user?.email || "Amen";
  }, [adminProfile.fullName, user?.email, user?.id, user?.user_metadata?.full_name, users]);

  const avatarUrl = String(adminProfile.avatarUrl || user?.user_metadata?.avatar_url || "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80");

  const metrics = useMemo(() => {
    const paidRevenue = payments.filter(paymentSucceeded).reduce((sum, payment) => sum + Number(payment.amount_mwk ?? 0), 0);
    const failedPayments = payments.filter(paymentFailed).length;
    const pendingPayments = payments.filter((payment) => !paymentSucceeded(payment) && !paymentFailed(payment)).length;
    const activeOrderRows = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
    const activeOrders = activeOrderRows.length;
    const delayedOrders = activeOrderRows.filter((order) => {
      const lastChanged = new Date(order.updated_at || order.created_at).getTime();
      return Number.isFinite(lastChanged) && Date.now() - lastChanged > 1000 * 60 * 45;
    }).length;
    const unassignedOrders = activeOrderRows.filter((order) => order.delivery_mode !== "pickup" && !order.delivery?.driver_id).length;
    const pendingApplications = roleApplications.filter((row) => row.status === "pending").length;
    const openTickets = supportTickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status.toLowerCase())).length;
    const urgentTickets =
      supportTickets.filter((ticket) => ticket.status.toLowerCase() === "open").length +
      trustReports.filter((row: any) => ["open", "in_review"].includes(String(row.status).toLowerCase())).length;
    const activeDeliveries = orders.filter((order) => ["assigned", "picked_up", "arriving"].includes(String(order.delivery?.status))).length;
    const inactiveHousing = housing.filter((row) => !row.is_active);
    const inactiveCatalog = catalog.filter((row) => !row.is_active);
    const activeTrustReports = trustReports.filter((row: any) => ["open", "in_review"].includes(String(row.status).toLowerCase()));
    const pendingReviews =
      inactiveHousing.length +
        inactiveCatalog.length +
        activeTrustReports.length;
    const flaggedReviews = activeTrustReports.length;
    const approvedReviewsToday =
      housing.filter((row) => row.is_active && isToday(row.updated_at || row.created_at)).length +
      catalog.filter((row) => row.is_active && isToday(row.updated_at || row.created_at)).length +
      trustReports.filter((row: any) => ["resolved", "dismissed"].includes(String(row.status).toLowerCase()) && isToday(row.updated_at || row.created_at)).length;
    const totalUsers = users.length;
    return {
      paidRevenue,
      weeklyRevenue: paidRevenue,
      failedPayments,
      pendingPayments,
      activeOrders,
      activeDeliveries,
      delayedOrders,
      unassignedOrders,
      pendingApplications,
      openTickets,
      urgentTickets,
      pendingReviews,
      flaggedReviews,
      approvedReviewsToday,
      totalUsers,
      newUsers: users.filter((row) => {
        if (!row.created_at) return false;
        return Date.now() - new Date(row.created_at).getTime() < 1000 * 60 * 60 * 24;
      }).length,
    };
  }, [catalog, housing, orders, payments, roleApplications, supportTickets, trustReports, users]);

  const liveOrders: DemoOrder[] = useMemo(
    () =>
      orders.map((order, index) => ({
        id: order.id,
        merchant: order.vendor?.name || (order.channel === "food" ? "Food order" : "Market order"),
        customer: compactId(order.customer_id),
        location: order.dropoff_notes || (order.delivery_mode === "pickup" ? "Pickup" : "Campus delivery"),
        type: order.channel,
        total: Number(order.total_mwk ?? 0),
        status: order.delivery?.driver_id ? order.status : order.status === "pending" ? "awaiting_agent" : order.status,
        createdAt: order.created_at ? `Today, ${new Date(order.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : `Order ${index + 1}`,
      })),
    [orders],
  );
  const displayedOrders = liveOrders;

  const reviewItems = useMemo<DemoReviewItem[]>(() => {
    const housingRows: DemoReviewItem[] = housing.map((row) => ({
      id: row.id,
      filter: "Rooms" as ReviewFilter,
      title: row.title,
      subtitle: `${titleCase(row.listing_type)}  -  ${row.is_active ? "Live Listing" : "Pending Review"}`,
      location: [row.area, row.city].filter(Boolean).join(", ") || row.campus || "Campus",
      submittedBy: row.landlord?.full_name || row.landlord?.email || compactId(row.landlord_id),
      submittedAgo: `Submitted ${relativeTime(row.created_at)}`,
      image: row.image_urls?.[0] || SAMPLE_REVIEW_ITEMS[0].image,
      status: row.is_active ? "approved" : "pending",
    }));
    const catalogRows: DemoReviewItem[] = catalog.map((row, index) => ({
      id: row.id,
      filter: row.channel === "food" ? ("Food" as ReviewFilter) : ("Market" as ReviewFilter),
      title: row.name,
      subtitle: `${titleCase(row.channel)}  -  ${money(row.price_mwk)}`,
      location: vendors.find((vendor) => vendor.id === row.vendor_id)?.area || "Lilongwe",
      submittedBy: vendors.find((vendor) => vendor.id === row.vendor_id)?.name || compactId(row.vendor_id),
      submittedAgo: `Submitted ${relativeTime(row.created_at)}`,
      image: row.image_urls?.[0] || row.image_url || SAMPLE_REVIEW_ITEMS[(index + 1) % SAMPLE_REVIEW_ITEMS.length].image,
      status: row.is_active ? "approved" : "flagged",
    }));
    const reportRows: DemoReviewItem[] = trustReports.map((row: any, index) => ({
      id: String(row.id),
      filter: "Reports" as ReviewFilter,
      title: titleCase(row.category) || "Trust report",
      subtitle: `${titleCase(row.subject_type)}  -  ${String(row.details || "").slice(0, 26)}`,
      location: row.subject_id || "Platform",
      submittedBy: compactId(row.reporter_id),
      submittedAgo: `Submitted ${relativeTime(row.created_at)}`,
      image: SAMPLE_REVIEW_ITEMS[index % SAMPLE_REVIEW_ITEMS.length].image,
      status: row.status === "resolved" ? "approved" : row.status === "dismissed" ? "needs_details" : "flagged",
    }));
    const rows = [...housingRows, ...catalogRows, ...reportRows];
    return rows;
  }, [catalog, housing, trustReports, vendors]);

  const displayedUsers = useMemo(() => {
    const userRows: DemoUser[] = users.map((row, index) => {
      const pendingApplication = roleApplications.find((application) => application.user_id === row.id && application.status === "pending");
      return {
        id: row.id,
        name: fullName(row),
        phone: row.phone || row.email || compactId(row.id),
        role: pendingApplication?.target_role ?? row.role,
        status: pendingApplication ? "pending" : row.onboarded ? "verified" : "pending",
        joined: `${row.onboarded ? "Joined" : "Joined"} ${relativeTime(row.created_at)}`,
        avatar: `https://i.pravatar.cc/160?u=${encodeURIComponent(row.id || String(index))}`,
      };
    });
    const applicationRows: DemoUser[] = roleApplications
      .filter((application) => !users.some((row) => row.id === application.user_id))
      .map((application) => ({
        id: application.id,
        name: application.applicant_name || "Workspace applicant",
        phone: application.applicant_phone || application.applicant_email || compactId(application.user_id),
        role: application.target_role,
        status: application.status === "declined" ? "suspended" : application.status === "approved" ? "verified" : "pending",
        joined: `Joined ${relativeTime(application.created_at)}`,
        avatar: `https://i.pravatar.cc/160?u=${encodeURIComponent(application.id)}`,
      }));
    return [...applicationRows, ...userRows];
  }, [roleApplications, users]);

  const displayedTickets = useMemo<DemoTicket[]>(() => {
    const supportRows = supportTickets.map((ticket, index) => ({
      id: ticket.id,
      title: ticket.subject || titleCase(ticket.type) || "Support ticket",
      description: ticket.message || "Customer needs admin help.",
      reporter: ticket.name || ticket.email || ticket.phone || "EYA user",
      reporterId: compactId(ticket.user_id),
      category: titleCase(ticket.type) || "Support",
      priority: ticket.status === "open" ? ("High" as const) : ("Medium" as const),
      type: String(ticket.type || "").includes("room")
        ? ("rooms" as const)
        : String(ticket.type || "").includes("food")
          ? ("food" as const)
          : String(ticket.type || "").includes("market")
            ? ("market" as const)
            : ("payments" as const),
      createdAt: relativeTime(ticket.created_at),
      status: ["resolved", "closed"].includes(ticket.status.toLowerCase()) ? ("resolved" as const) : ticket.status === "open" ? ("urgent" as const) : ("open" as const),
      avatar: `https://i.pravatar.cc/120?u=${encodeURIComponent(ticket.user_id || String(index))}`,
    }));
    const reportRows = trustReports.map((report: any, index) => ({
      id: String(report.id),
      title: titleCase(report.category) || "Trust report",
      description: report.details || "Trust and safety report.",
      reporter: compactId(report.reporter_id),
      reporterId: String(report.subject_id || "Safety"),
      category: "Trust & Safety",
      priority: "High" as const,
      type: "payments" as const,
      createdAt: relativeTime(report.created_at),
      status: report.status === "resolved" ? ("resolved" as const) : ("urgent" as const),
      avatar: `https://i.pravatar.cc/120?u=${encodeURIComponent(report.reporter_id || String(index))}`,
    }));
    return [...reportRows, ...supportRows];
  }, [supportTickets, trustReports]);

  const filteredOrders = useMemo(() => {
    if (orderFilter === "All") return displayedOrders;
    if (orderFilter === "Completed") return displayedOrders.filter((row) => row.status === "delivered");
    if (orderFilter === "Issues") return displayedOrders.filter((row) => ["issue", "cancelled"].includes(String(row.status)));
    return displayedOrders.filter((row) => !["delivered", "cancelled", "issue"].includes(String(row.status)));
  }, [displayedOrders, orderFilter]);

  const filteredTickets = useMemo(() => {
    if (ticketFilter === "Resolved") return displayedTickets.filter((row) => row.status === "resolved");
    if (ticketFilter === "Urgent") return displayedTickets.filter((row) => row.status === "urgent");
    return displayedTickets.filter((row) => row.status !== "resolved");
  }, [displayedTickets, ticketFilter]);

  const filteredUsers = useMemo(() => {
    return displayedUsers.filter((row) => {
      const roleMatch =
        userFilter === "All" ||
        (userFilter === "Users" && row.role === "student") ||
        (userFilter === "Landlords" && row.role === "landlord") ||
        (userFilter === "Restaurants" && (row.role === "restaurant" || row.role === "vendor")) ||
        (userFilter === "Sellers" && row.role === "seller") ||
        (userFilter === "Agents" && row.role === "agent");
      const statusMatch = userStatusFilter === "All" || titleCase(row.status) === userStatusFilter;
      return roleMatch && statusMatch && matchesQuery(userQuery, row.name, row.phone, row.role, row.status);
    });
  }, [displayedUsers, userFilter, userQuery, userStatusFilter]);
  const pendingRoleApplications = useMemo(
    () => roleApplications.filter((application) => application.status === "pending"),
    [roleApplications],
  );

  const runAdminAction = useCallback(
    async (key: string, action: (userId: string, token: string | null) => Promise<unknown>) => {
      if (!user?.id) return false;
      setWorkingKey(key);
      try {
        await action(user.id, accessToken);
        await load();
        return true;
      } catch (error) {
        Alert.alert("Admin action failed", error instanceof Error ? error.message : "The request could not be completed.");
        return false;
      } finally {
        setWorkingKey(null);
      }
    },
    [accessToken, load, user?.id],
  );

  const handleAdvanceOrder = useCallback(
    (row: DemoOrder) => {
      const live = orders.find((order) => order.id === row.id);
      if (!live) {
        Alert.alert("Order not found", "This order is not available from the backend list. Pull to refresh and try again.");
        return;
      }
      void runAdminAction(`order:${row.id}`, (userId, token) =>
        updateAdminOrderStatus({
          orderId: live.id,
          status: nextStatus(live.status),
          userId,
          accessToken: token,
        }),
      );
    },
    [orders, runAdminAction],
  );

  const handleAssignAgent = useCallback(
    (row: DemoOrder) => {
      const live = orders.find((order) => order.id === row.id);
      if (!live) {
        Alert.alert("Order not found", "This order is not available from the backend list. Pull to refresh and try again.");
        return;
      }
      const driver = drivers[0];
      if (!driver) {
        Alert.alert("No agents available", "Add an agent profile before assigning this order.");
        return;
      }
      void runAdminAction(`assign:${row.id}`, (userId, token) =>
        assignAdminDriver({ orderId: live.id, driverId: driver.id, etaMinutes: 25, userId, accessToken: token }),
      );
    },
    [drivers, orders, runAdminAction],
  );

  const handleReviewRoleApplication = useCallback(
    (application: RoleApplication, status: "approved" | "declined") => {
      const label = applicationLabel(application);
      void runAdminAction(`application:${application.id}:${status}`, (userId) =>
        reviewRoleApplication({
          applicationId: application.id,
          status,
          adminUserId: userId,
          adminNote:
            status === "approved"
              ? `Approved as ${label} from admin control center.`
              : `Declined as ${label}. Please update your application details and reapply.`,
        }),
      );
    },
    [runAdminAction],
  );

  const handleApproveUser = useCallback(
    (row: DemoUser) => {
      const application = roleApplications.find((entry) => entry.id === row.id || entry.user_id === row.id);
      if (application && application.status === "pending") {
        handleReviewRoleApplication(application, "approved");
        return;
      }

      const liveUser = users.find((entry) => entry.id === row.id);
      if (liveUser) {
        void runAdminAction(`user:${row.id}`, (userId, token) =>
          updateAdminUser({
            targetUserId: liveUser.id,
            patch: { onboarded: true },
            userId,
            accessToken: token,
          }),
        );
        return;
      }

      Alert.alert("User not found", "This account is not available from the backend user list yet. Pull to refresh and try again.");
    },
    [handleReviewRoleApplication, roleApplications, runAdminAction, users],
  );

  const handleInviteStaff = useCallback(
    (input: { email: string; fullName: string; role: AdminUserSummary["role"] }) => {
      const email = input.email.trim().toLowerCase();
      if (!email || !email.includes("@")) {
        Alert.alert("Invite needs an email", "Enter a valid staff email address.");
        return;
      }

      void runAdminAction("invite", async (userId, token) => {
        const result = await inviteAdminStaff({
          email,
          fullName: input.fullName.trim() || null,
          role: input.role,
          userId,
          accessToken: token,
        });
        Alert.alert("Invite sent", `${result.user.email || email} was invited as ${titleCase(result.user.role)}.`);
      });
    },
    [runAdminAction],
  );

  const handleViewUser = useCallback((row: DemoUser) => {
    const liveUser = users.find((entry) => entry.id === row.id);
    const application = roleApplications.find((entry) => entry.id === row.id || entry.user_id === row.id);
    setDetailSheet({
      title: row.name,
      kicker: "User profile",
      subtitle: row.joined,
      icon: roleIcon(row.role),
      tone: roleTone(row.role),
      summary: [
        { label: "Role", value: roleLabel(row.role) },
        { label: "Status", value: titleCase(row.status) },
        { label: "Application", value: application ? titleCase(application.status) : null },
      ],
      sections: [
        {
          title: "Contact",
          rows: [
            { label: "Phone or email", value: row.phone },
            { label: "Email", value: liveUser?.email },
            { label: "User ID", value: row.id },
          ],
        },
        {
          title: "Activity",
          rows: [
            { label: "Orders", value: liveUser?.order_count },
            { label: "Listings", value: liveUser?.listing_count },
            { label: "Vendors", value: liveUser?.vendor_count },
            { label: "Campus", value: liveUser?.campus },
            { label: "Area", value: liveUser?.area },
          ],
        },
      ],
    });
  }, [roleApplications, users]);

  const handleTicketStatus = useCallback(
    (row: DemoTicket, status: "open" | "resolved") => {
      const support = supportTickets.find((ticket) => ticket.id === row.id);
      if (support) {
        void runAdminAction(`ticket:${row.id}`, (userId, token) =>
          respondAdminSupportTicket({
            ticketId: support.id,
            status,
            adminNote: status === "resolved" ? "Resolved from admin control center." : "Reviewed from admin control center.",
            userId,
            accessToken: token,
          }),
        );
        return;
      }

      const report = trustReports.find((entry: any) => String(entry.id) === row.id);
      if (report) {
        const reportStatus: TrustSafetyReportStatus = status === "resolved" ? "resolved" : "in_review";
        void runAdminAction(`report:${row.id}`, () => updateTrustSafetyReportStatus(row.id, reportStatus, "Reviewed from admin control center."));
        return;
      }

      Alert.alert("Ticket not found", "This ticket is not available from the backend list. Pull to refresh and try again.");
    },
    [runAdminAction, supportTickets, trustReports],
  );

  const handleReviewAction = useCallback(
    (row: DemoReviewItem, action: "approve" | "reject" | "flag") => {
      const listing = housing.find((entry) => entry.id === row.id);
      if (listing) {
        void runAdminAction(`listing:${row.id}`, (userId, token) =>
          updateAdminHousingListing({
            listingId: listing.id,
            patch: { is_active: action === "approve" },
            userId,
            accessToken: token,
          }),
        );
        return;
      }

      const item = catalog.find((entry) => entry.id === row.id);
      if (item) {
        void runAdminAction(`catalog:${row.id}`, (userId, token) =>
          updateAdminCatalogItem({
            itemId: item.id,
            patch: { is_active: action === "approve" },
            userId,
            accessToken: token,
          }),
        );
        return;
      }

      const report = trustReports.find((entry: any) => String(entry.id) === row.id);
      if (report) {
        const status: TrustSafetyReportStatus = action === "approve" ? "resolved" : action === "reject" ? "dismissed" : "in_review";
        void runAdminAction(`report:${row.id}`, () =>
          updateTrustSafetyReportStatus(String(row.id), status, `Marked ${status.replace(/_/g, " ")} from admin control center.`),
        );
        return;
      }

      Alert.alert("Review item not found", "This item is not available from the backend review queue. Pull to refresh and try again.");
    },
    [catalog, housing, runAdminAction, trustReports],
  );

  const handleViewCatalogItem = useCallback(
    (item: AdminCatalogItemSummary) => {
      const vendor = vendors.find((entry) => entry.id === item.vendor_id);
      setDetailSheet({
        title: item.name,
        kicker: "Marketplace listing",
        subtitle: item.channel === "food" ? "Food item" : "Market product",
        icon: item.channel === "food" ? UtensilsCrossed : ShoppingBag,
        tone: item.is_active ? "green" : "neutral",
        summary: [
          { label: "Status", value: item.is_active ? "Live" : "Hidden" },
          { label: "Price", value: money(item.price_mwk) },
          { label: "Stock", value: item.stock_qty === null || item.stock_qty === undefined ? "Not tracked" : item.stock_qty },
        ],
        sections: [
          {
            title: "Vendor",
            rows: [
              { label: "Name", value: vendor?.name || compactId(item.vendor_id) },
              { label: "Location", value: [vendor?.area, vendor?.city, vendor?.campus].filter(Boolean).join(", ") || "Not set" },
              { label: "Vendor ID", value: item.vendor_id },
            ],
          },
          {
            title: "Listing Details",
            rows: [
              { label: "Description", value: item.description },
              { label: "Primary image", value: item.image_url },
              { label: "Images", value: item.image_urls?.join(", ") },
              { label: "Listing ID", value: item.id },
            ],
          },
        ],
      });
    },
    [vendors],
  );

  const handleSaveCatalogItem = useCallback(
    async (item: AdminCatalogItemSummary, draft: CatalogListingDraft) => {
      const name = draft.name.trim();
      const priceText = draft.priceMwk.trim().replace(/,/g, "");
      const price = Number(priceText);
      const stockText = draft.stockQty.trim();
      const stockQty = stockText ? Number(stockText.replace(/,/g, "")) : null;

      if (!name) {
        Alert.alert("Listing needs a name", "Enter the product name before saving.");
        return false;
      }
      if (!Number.isFinite(price) || price < 0) {
        Alert.alert("Invalid price", "Enter a valid MWK price for this listing.");
        return false;
      }
      if (stockText && (!Number.isFinite(stockQty) || Number(stockQty) < 0)) {
        Alert.alert("Invalid stock", "Stock must be a valid number or left empty.");
        return false;
      }

      return runAdminAction(`catalog:${item.id}:edit`, (userId, token) =>
        updateAdminCatalogItem({
          itemId: item.id,
          patch: {
            name,
            description: draft.description.trim() || null,
            price_mwk: Math.round(price),
            stock_qty: stockQty === null ? null : Math.floor(Number(stockQty)),
            image_url: draft.imageUrl.trim() || null,
            image_urls: draft.imageUrl.trim() ? [draft.imageUrl.trim()] : [],
            is_active: draft.isActive,
          },
          userId,
          accessToken: token,
        }),
      );
    },
    [runAdminAction],
  );

  const handleToggleCatalogLive = useCallback(
    (item: AdminCatalogItemSummary, isActive: boolean) => {
      void runAdminAction(`catalog:${item.id}:live`, (userId, token) =>
        updateAdminCatalogItem({
          itemId: item.id,
          patch: { is_active: isActive },
          userId,
          accessToken: token,
        }),
      );
    },
    [runAdminAction],
  );

  const handleDeleteCatalogItem = useCallback(
    (item: AdminCatalogItemSummary) => {
      Alert.alert("Delete market listing", `Delete "${item.name}" from the marketplace?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void runAdminAction(`catalog:${item.id}:delete`, (userId, token) =>
              deleteAdminCatalogItem({
                itemId: item.id,
                userId,
                accessToken: token,
              }),
            );
          },
        },
      ]);
    },
    [runAdminAction],
  );

  const handleBroadcast = useCallback(() => {
    setBroadcastOpen(true);
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert("Log out", "Log out of the admin portal?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
          } finally {
            router.replace("/(auth)/login");
          }
        },
      },
    ]);
  }, [router, signOut]);

  const handlePickAdminAvatar = useCallback(async () => {
    if (!user?.id) return;

    try {
      setProfileNotice(null);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Photo access needed", "Allow photo access to update the admin profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setUploadingAvatar(true);
      const nextAvatarUrl = await uploadAdminAvatar(asset);
      const { error } = await supabase.from("profiles").update({ avatar_url: nextAvatarUrl, updated_at: new Date().toISOString() }).eq("id", user.id);
      if (error) throw error;

      await supabase.auth.updateUser({
        data: {
          ...(user.user_metadata ?? {}),
          avatar_url: nextAvatarUrl,
        },
      });

      setAdminProfile((current) => ({ ...current, avatarUrl: nextAvatarUrl }));
      setProfileNotice({ type: "success", text: "Profile picture updated." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update profile picture.";
      setProfileNotice({
        type: "error",
        text: message.toLowerCase().includes("heic") ? "Please choose a JPG or PNG profile picture." : message,
      });
    } finally {
      setUploadingAvatar(false);
    }
  }, [user]);

  const handleSaveAdminProfile = useCallback(async () => {
    if (!user?.id) return;

    const fullName = profileFullName.trim();
    const phone = profilePhone.trim();
    if (!fullName) {
      setProfileNotice({ type: "error", text: "Admin name is required." });
      return;
    }

    try {
      setSavingProfile(true);
      setProfileNotice(null);

      const parts = splitProfileName(fullName);
      const updatedAt = new Date().toISOString();
      let profileSaved = false;
      let lastProfileError: unknown = null;

      try {
        await updateAdminUser({
          targetUserId: user.id,
          patch: { full_name: fullName, phone: phone || null },
          userId: user.id,
          accessToken,
        });
        profileSaved = true;
      } catch (error) {
        lastProfileError = error;
      }

      if (!profileSaved) {
        const profilePayloads = [
          {
            full_name: fullName,
            first_name: parts.firstName || null,
            last_name: parts.lastName || null,
            surname: parts.lastName || null,
            phone: phone || null,
            updated_at: updatedAt,
          },
          { full_name: fullName, phone: phone || null, updated_at: updatedAt },
          { full_name: fullName, updated_at: updatedAt },
          { full_name: fullName },
        ];

        for (const payload of profilePayloads) {
          const { data, error } = await supabase.from("profiles").update(payload as any).eq("id", user.id).select("id").maybeSingle();
          if (!error && data?.id) {
            profileSaved = true;
            break;
          }
          if (error) lastProfileError = error;
        }
      }

      if (!profileSaved) {
        const upsertPayloads = [
          { id: user.id, email: user.email ?? null, full_name: fullName, phone: phone || null, updated_at: updatedAt },
          { id: user.id, email: user.email ?? null, full_name: fullName, updated_at: updatedAt },
          { id: user.id, full_name: fullName },
        ];

        for (const payload of upsertPayloads) {
          const { data, error } = await supabase.from("profiles").upsert(payload as any, { onConflict: "id" }).select("id").maybeSingle();
          if (!error && data?.id) {
            profileSaved = true;
            break;
          }
          if (error) lastProfileError = error;
        }
      }

      await supabase.auth.updateUser({
        data: {
          ...(user.user_metadata ?? {}),
          full_name: fullName,
          first_name: parts.firstName,
          last_name: parts.lastName,
          phone,
        },
      });

      if (!profileSaved && lastProfileError) {
        console.warn("[admin-profile-save-profile-row]", lastProfileError instanceof Error ? lastProfileError.message : lastProfileError);
      }

      setAdminProfile((current) => ({
        ...current,
        fullName,
        firstName: parts.firstName,
        lastName: parts.lastName,
        phone,
      }));
      setProfileNotice({
        type: profileSaved ? "success" : "error",
        text: profileSaved ? "Admin profile updated." : "Profile saved locally, but the profile row could not be updated. Check profile table permissions.",
      });
    } catch (error) {
      setProfileNotice({ type: "error", text: error instanceof Error ? error.message : "Could not save admin profile." });
    } finally {
      setSavingProfile(false);
    }
  }, [accessToken, profileFullName, profilePhone, user]);

  const handleUpdateAdminPassword = useCallback(async () => {
    const email = user?.email || adminProfile.email;
    if (!email) {
      setProfileNotice({ type: "error", text: "Admin email is required before changing password." });
      return;
    }

    try {
      setSavingPassword(true);
      setProfileNotice(null);

      if (!oldPassword.trim()) throw new Error("Enter the current password.");
      if (newPassword.trim().length < 6) throw new Error("New password must be at least 6 characters.");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: oldPassword.trim(),
      });
      if (signInError) throw new Error("Current password is incorrect.");

      const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword.trim() });
      if (passwordError) throw passwordError;

      setOldPassword("");
      setNewPassword("");
      setProfileNotice({ type: "success", text: "Password updated successfully." });
    } catch (error) {
      setProfileNotice({ type: "error", text: error instanceof Error ? error.message : "Could not update password." });
    } finally {
      setSavingPassword(false);
    }
  }, [adminProfile.email, newPassword, oldPassword, user?.email]);

  const handleSendBroadcast = useCallback(() => {
    const title = broadcastTitle.trim();
    const body = broadcastMessage.trim();

    if (!title) {
      Alert.alert("Broadcast needs a title", "Add a short title for the notification.");
      return;
    }
    if (!body) {
      Alert.alert("Broadcast needs a message", "Write the notification message users should receive.");
      return;
    }

    void runAdminAction("broadcast", async (userId, token) => {
      const result = await broadcastAdminNotification({
        title,
        message: body,
        audienceRole: broadcastAudience,
        priority: broadcastImportant ? "important" : "normal",
        type: "admin_notice",
        userId,
        accessToken: token,
      });
      setBroadcastOpen(false);
      setBroadcastMessage("");
      Alert.alert("Notice sent", `Notification sent to ${result.sent_to} ${result.sent_to === 1 ? "account" : "accounts"}.`);
    });
  }, [broadcastAudience, broadcastImportant, broadcastMessage, broadcastTitle, runAdminAction]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f8ff" />
        <View style={styles.loadingBox}>
          <ActivityIndicator color={COLORS.navy} size="large" />
          <Text style={styles.loadingText}>Loading admin control center...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const bottomActive: Exclude<AdminTab, "moderation"> = activeTab === "moderation" ? "dashboard" : activeTab;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f8ff" />
      <View style={styles.backdrop}>
        <View style={styles.glowTopRight} />
        <View style={styles.glowLeft} />
        <View style={styles.glowBottomRight} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={COLORS.purple} />}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
      >
        {message ? (
          <Pressable style={styles.notice} onPress={() => setMessage(null)}>
            <Text style={styles.noticeText}>{message}</Text>
          </Pressable>
        ) : null}

        {broadcastOpen ? (
          <BroadcastComposer
            audience={broadcastAudience}
            important={broadcastImportant}
            message={broadcastMessage}
            title={broadcastTitle}
            working={workingKey === "broadcast"}
            onAudience={setBroadcastAudience}
            onCancel={() => setBroadcastOpen(false)}
            onImportant={setBroadcastImportant}
            onMessage={setBroadcastMessage}
            onSend={handleSendBroadcast}
            onTitle={setBroadcastTitle}
          />
        ) : null}

        {activeTab === "dashboard" ? (
          <DashboardScreen
            avatarUrl={avatarUrl}
            firstName={firstNameFrom(profileName)}
            metrics={metrics}
            profileName={profileName}
            unreadCount={unreadCount}
            onBell={() => router.push("/admin/notifications")}
            onGo={setActiveTab}
            onBroadcast={handleBroadcast}
            onLogout={handleLogout}
            onManageTickets={() => router.push("/admin/ticketing")}
            onScanTickets={() => router.push("/admin/ticket-scanner")}
            onProfileEdit={() => {
              setProfileEditorOpen((value) => !value);
              setProfileNotice(null);
            }}
            profileEditorOpen={profileEditorOpen}
            profilePanel={
              profileEditorOpen ? (
                <AdminProfilePanel
                  avatarUrl={avatarUrl}
                  fullName={profileFullName}
                  phone={profilePhone}
                  email={adminProfile.email || user?.email || ""}
                  oldPassword={oldPassword}
                  newPassword={newPassword}
                  notice={profileNotice}
                  savingProfile={savingProfile}
                  savingPassword={savingPassword}
                  uploadingAvatar={uploadingAvatar}
                  onFullName={setProfileFullName}
                  onPhone={setProfilePhone}
                  onOldPassword={setOldPassword}
                  onNewPassword={setNewPassword}
                  onPickAvatar={handlePickAdminAvatar}
                  onSaveProfile={handleSaveAdminProfile}
                  onUpdatePassword={handleUpdateAdminPassword}
                />
              ) : null
            }
          />
        ) : null}

        {activeTab === "more" ? (
          <ReportsScreen
            metrics={metrics}
            orders={orders}
            payments={payments}
            vendors={vendors}
            unreadCount={unreadCount}
            onBell={() => router.push("/admin/notifications")}
            onRefresh={() => void load()}
          />
        ) : null}

        {activeTab === "orders" ? (
          <OrdersScreen
            filter={orderFilter}
            metrics={metrics}
            orders={filteredOrders}
            workingKey={workingKey}
            onBell={() => router.push("/admin/notifications")}
            onFilter={setOrderFilter}
            onAdvance={handleAdvanceOrder}
            onAssign={handleAssignAgent}
          />
        ) : null}

        {activeTab === "users" ? (
          <UsersScreen
            applications={pendingRoleApplications}
            filter={userFilter}
            metrics={metrics}
            query={userQuery}
            users={filteredUsers}
            workingKey={workingKey}
            onApprove={handleApproveUser}
            onBell={() => router.push("/admin/notifications")}
            onFilter={setUserFilter}
            onInvite={handleInviteStaff}
            onQuery={setUserQuery}
            onReviewApplication={handleReviewRoleApplication}
            onStatusFilter={setUserStatusFilter}
            onView={handleViewUser}
            statusFilter={userStatusFilter}
          />
        ) : null}

        {activeTab === "tickets" ? (
          <TicketsScreen
            filter={ticketFilter}
            metrics={metrics}
            tickets={filteredTickets}
            workingKey={workingKey}
            onBell={() => router.push("/admin/notifications")}
            onFilter={setTicketFilter}
            onSetStatus={handleTicketStatus}
          />
        ) : null}

        {activeTab === "moderation" ? (
          <ModerationScreen
            catalogItems={catalog}
            filter={reviewFilter}
            items={reviewItems.filter((item) => item.filter === reviewFilter)}
            metrics={metrics}
            vendors={vendors}
            workingKey={workingKey}
            onAction={handleReviewAction}
            onBell={() => router.push("/admin/notifications")}
            onCatalogDelete={handleDeleteCatalogItem}
            onCatalogSave={handleSaveCatalogItem}
            onCatalogToggleLive={handleToggleCatalogLive}
            onCatalogView={handleViewCatalogItem}
            onFilter={setReviewFilter}
          />
        ) : null}
      </ScrollView>
      <BottomNav active={bottomActive} onChange={setActiveTab} />
      <DetailSheet data={detailSheet} visible={Boolean(detailSheet)} onClose={() => setDetailSheet(null)} />
    </SafeAreaView>
  );
}

function BroadcastComposer({
  audience,
  important,
  message,
  title,
  working,
  onAudience,
  onCancel,
  onImportant,
  onMessage,
  onSend,
  onTitle,
}: {
  audience: AdminBroadcastAudience;
  important: boolean;
  message: string;
  title: string;
  working: boolean;
  onAudience: (value: AdminBroadcastAudience) => void;
  onCancel: () => void;
  onImportant: (value: boolean) => void;
  onMessage: (value: string) => void;
  onSend: () => void;
  onTitle: (value: string) => void;
}) {
  const selectedAudience = BROADCAST_AUDIENCES.find((row) => row.value === audience) ?? BROADCAST_AUDIENCES[0];
  const SelectedIcon = selectedAudience.icon;

  return (
    <View style={styles.broadcastPanel}>
      <View style={styles.broadcastHeader}>
        <View style={styles.broadcastIcon}>
          <Megaphone color="#ffffff" size={21} />
        </View>
        <View style={styles.broadcastHeaderCopy}>
          <Text style={styles.broadcastKicker}>Admin Broadcast</Text>
          <Text style={styles.broadcastTitle}>Send notification to users</Text>
        </View>
        <Pressable style={styles.broadcastCloseButton} onPress={onCancel} disabled={working}>
          <XCircle color={COLORS.muted} size={22} />
        </Pressable>
      </View>

      <View style={styles.broadcastAudienceCard}>
        <SelectedIcon color={COLORS.purple} size={19} />
        <Text style={styles.broadcastAudienceText}>{selectedAudience.label}</Text>
        <StatusPill label={important ? "Important" : "Normal"} tone={important ? "orange" : "neutral"} />
      </View>

      <TextInput
        value={title}
        onChangeText={onTitle}
        placeholder="Notification title"
        placeholderTextColor={COLORS.muted}
        style={styles.broadcastInput}
      />
      <TextInput
        value={message}
        onChangeText={onMessage}
        multiline
        placeholder="Write the message every selected user should receive..."
        placeholderTextColor={COLORS.muted}
        style={[styles.broadcastInput, styles.broadcastMessageInput]}
      />

      <View style={styles.broadcastChipWrap}>
        {BROADCAST_AUDIENCES.map((row) => {
          const active = row.value === audience;
          const Icon = row.icon;
          return (
            <Pressable
              key={row.value}
              style={[styles.broadcastAudienceChip, active && styles.broadcastAudienceChipActive]}
              onPress={() => onAudience(row.value)}
              disabled={working}
            >
              <Icon color={active ? "#fff" : COLORS.muted} size={16} />
              <Text style={[styles.broadcastAudienceChipText, active && styles.broadcastAudienceChipTextActive]}>{row.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.broadcastActions}>
        <Pressable
          style={[styles.broadcastPriorityButton, important && styles.broadcastPriorityButtonActive]}
          onPress={() => onImportant(!important)}
          disabled={working}
        >
          <Bell color={important ? "#fff" : COLORS.purple} size={18} />
          <Text style={[styles.broadcastPriorityText, important && styles.broadcastPriorityTextActive]}>
            {important ? "Sound alert on" : "Normal priority"}
          </Text>
        </Pressable>
        <Pressable style={[styles.broadcastSendButton, working && styles.disabledButton]} onPress={onSend} disabled={working}>
          <Megaphone color="#fff" size={18} />
          <Text style={styles.broadcastSendText}>{working ? "Sending..." : "Send Notification"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AdminProfilePanel({
  avatarUrl,
  email,
  fullName,
  newPassword,
  notice,
  oldPassword,
  phone,
  savingPassword,
  savingProfile,
  uploadingAvatar,
  onFullName,
  onNewPassword,
  onOldPassword,
  onPhone,
  onPickAvatar,
  onSaveProfile,
  onUpdatePassword,
}: {
  avatarUrl: string;
  email: string;
  fullName: string;
  newPassword: string;
  notice: AdminProfileNotice | null;
  oldPassword: string;
  phone: string;
  savingPassword: boolean;
  savingProfile: boolean;
  uploadingAvatar: boolean;
  onFullName: (value: string) => void;
  onNewPassword: (value: string) => void;
  onOldPassword: (value: string) => void;
  onPhone: (value: string) => void;
  onPickAvatar: () => void;
  onSaveProfile: () => void;
  onUpdatePassword: () => void;
}) {
  return (
    <View style={styles.adminProfilePanel}>
      <View style={styles.adminProfileHeader}>
        <Pressable style={styles.adminAvatarPicker} onPress={onPickAvatar} disabled={uploadingAvatar}>
          <Image source={{ uri: avatarUrl }} style={styles.adminProfileAvatar} />
          <View style={styles.adminAvatarCamera}>
            {uploadingAvatar ? <ActivityIndicator color="#ffffff" size="small" /> : <Camera color="#ffffff" size={17} />}
          </View>
        </Pressable>
        <View style={styles.adminProfileHeaderCopy}>
          <Text style={styles.adminProfileKicker}>Admin Profile</Text>
          <Text style={styles.adminProfileTitle}>{fullName || "Admin"}</Text>
          <Text style={styles.adminProfileEmail}>{email || "No email attached"}</Text>
        </View>
      </View>

      {notice ? (
        <View style={[styles.adminProfileNotice, notice.type === "error" ? styles.adminProfileNoticeError : styles.adminProfileNoticeSuccess]}>
          <Text style={[styles.adminProfileNoticeText, notice.type === "error" ? styles.adminProfileNoticeTextError : styles.adminProfileNoticeTextSuccess]}>
            {notice.text}
          </Text>
        </View>
      ) : null}

      <View style={styles.adminProfileFields}>
        <TextInput
          value={fullName}
          onChangeText={onFullName}
          placeholder="Admin full name"
          placeholderTextColor={COLORS.muted}
          style={styles.adminProfileInput}
        />
        <TextInput
          value={phone}
          onChangeText={onPhone}
          keyboardType="phone-pad"
          placeholder="Admin phone"
          placeholderTextColor={COLORS.muted}
          style={styles.adminProfileInput}
        />
        <Pressable style={[styles.adminProfileSaveButton, savingProfile && styles.disabledButton]} onPress={onSaveProfile} disabled={savingProfile}>
          <Save color="#ffffff" size={18} />
          <Text style={styles.adminProfileSaveText}>{savingProfile ? "Saving..." : "Save profile"}</Text>
        </Pressable>
      </View>

      <View style={styles.adminPasswordBox}>
        <View style={styles.adminPasswordHeader}>
          <KeyRound color={COLORS.purple} size={20} />
          <Text style={styles.adminPasswordTitle}>Change password</Text>
        </View>
        <TextInput
          value={oldPassword}
          onChangeText={onOldPassword}
          secureTextEntry
          placeholder="Current password"
          placeholderTextColor={COLORS.muted}
          style={styles.adminProfileInput}
        />
        <TextInput
          value={newPassword}
          onChangeText={onNewPassword}
          secureTextEntry
          placeholder="New password"
          placeholderTextColor={COLORS.muted}
          style={styles.adminProfileInput}
        />
        <Pressable style={[styles.adminPasswordButton, savingPassword && styles.disabledButton]} onPress={onUpdatePassword} disabled={savingPassword}>
          <KeyRound color={COLORS.purple} size={18} />
          <Text style={styles.adminPasswordButtonText}>{savingPassword ? "Updating..." : "Update password"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DashboardScreen({
  avatarUrl,
  firstName,
  metrics,
  profileName,
  unreadCount,
  onBell,
  onBroadcast,
  onGo,
  onLogout,
  onManageTickets,
  onScanTickets,
  onProfileEdit,
  profileEditorOpen,
  profilePanel,
}: {
  avatarUrl: string;
  firstName: string;
  metrics: AdminMetrics;
  profileName: string;
  unreadCount: number;
  onBell: () => void;
  onBroadcast: () => void;
  onGo: (tab: AdminTab) => void;
  onLogout: () => void;
  onManageTickets: () => void;
  onScanTickets: () => void;
  onProfileEdit: () => void;
  profileEditorOpen: boolean;
  profilePanel?: React.ReactNode;
}) {
  const focusCount = metrics.pendingApplications + metrics.openTickets + metrics.pendingReviews;
  const firstTask =
    metrics.pendingApplications > 0
      ? ("users" as AdminTab)
      : metrics.openTickets > 0
        ? ("tickets" as AdminTab)
        : metrics.pendingReviews > 0
          ? ("moderation" as AdminTab)
          : ("orders" as AdminTab);
  const workflowRows = [
    {
      title: "Approve admissions",
      subtitle: metrics.pendingApplications ? "Role requests waiting for a decision" : "No role requests waiting",
      count: metrics.pendingApplications,
      icon: ShieldCheck,
      tone: "purple" as Tone,
      target: "users" as AdminTab,
    },
    {
      title: "Handle support",
      subtitle: metrics.openTickets ? "Open tickets and safety issues need replies" : "Support queue is clear",
      count: metrics.openTickets,
      icon: Headphones,
      tone: "orange" as Tone,
      target: "tickets" as AdminTab,
    },
    {
      title: "Review content",
      subtitle: metrics.pendingReviews ? "Listings, catalog items, and reports to check" : "Content review is clear",
      count: metrics.pendingReviews,
      icon: Flag,
      tone: "red" as Tone,
      target: "moderation" as AdminTab,
    },
    {
      title: "Track orders",
      subtitle: metrics.activeOrders ? "Active orders and deliveries moving now" : "No active orders",
      count: metrics.activeOrders,
      icon: Truck,
      tone: "green" as Tone,
      target: "orders" as AdminTab,
    },
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Admin" subtitle="Daily workflow" unreadCount={unreadCount} onBell={onBell} />

      <View style={styles.profileCard}>
        <Image source={{ uri: avatarUrl }} style={styles.avatarLarge} />
        <View style={styles.profileCopy}>
          <Text style={styles.greetingText}>{greeting()}, {firstName}</Text>
          <Text style={styles.profileSubtitle}>Start with approvals, then support, then operations.</Text>
          <View style={styles.profileActionRow}>
            <View style={styles.superAdminBadge}>
              <ShieldCheck color={COLORS.purple} size={17} strokeWidth={2.4} />
              <Text style={styles.superAdminText}>Super Admin</Text>
            </View>
            <Pressable style={styles.adminProfileButton} onPress={onProfileEdit}>
              <User color={COLORS.purple} size={16} />
              <Text style={styles.adminProfileButtonText}>{profileEditorOpen ? "Close profile" : "Edit profile"}</Text>
            </Pressable>
            <Pressable style={styles.adminLogoutButton} onPress={onLogout}>
              <LogOut color={COLORS.red} size={16} />
              <Text style={styles.adminLogoutText}>Log out</Text>
            </Pressable>
          </View>
        </View>
      </View>
      {profilePanel}

      <Pressable style={styles.startWorkflowCard} onPress={() => onGo(firstTask)}>
        <View style={styles.startWorkflowCopy}>
          <Text style={styles.startWorkflowKicker}>Start here</Text>
          <Text style={styles.startWorkflowTitle}>{focusCount ? `${focusCount} things need action` : "Everything important is clear"}</Text>
          <Text style={styles.startWorkflowSub}>
            {focusCount ? "Tap to jump into the first priority queue." : "Check live orders or send a notice when needed."}
          </Text>
        </View>
        <View style={styles.startWorkflowBadge}>
          <Text style={styles.startWorkflowBadgeText}>{focusCount}</Text>
        </View>
        <ChevronRight color="#ffffff" size={25} />
      </Pressable>

      <SectionHeading title="Workflow" subtitle="Do these in order" trailing={<PeriodPill label="Today" />} />
      <View style={styles.workflowStack}>
        {workflowRows.map((row) => (
          <WorkflowActionCard
            key={row.title}
            count={row.count}
            icon={row.icon}
            subtitle={row.subtitle}
            title={row.title}
            tone={row.tone}
            onPress={() => onGo(row.target)}
          />
        ))}
      </View>

      <Pressable style={styles.broadcastShortcut} onPress={onBroadcast}>
        <View style={styles.broadcastShortcutIcon}>
          <Megaphone color="#ffffff" size={22} />
        </View>
        <View style={styles.broadcastShortcutCopy}>
          <Text style={styles.broadcastShortcutTitle}>Broadcast a notice</Text>
          <Text style={styles.broadcastShortcutSub}>Send one notification to everyone or a selected role.</Text>
        </View>
        <ChevronRight color={COLORS.navy} size={24} />
      </Pressable>

      <Pressable style={styles.broadcastShortcut} onPress={onManageTickets}>
        <View style={[styles.broadcastShortcutIcon, { backgroundColor: COLORS.purple }]}>
          <Ticket color="#ffffff" size={22} />
        </View>
        <View style={styles.broadcastShortcutCopy}>
          <Text style={styles.broadcastShortcutTitle}>Manage ticket listings</Text>
          <Text style={styles.broadcastShortcutSub}>Create events, set ticket prices, capacities, and publish sales.</Text>
        </View>
        <ChevronRight color={COLORS.navy} size={24} />
      </Pressable>

      <Pressable style={styles.broadcastShortcut} onPress={onScanTickets}>
        <View style={[styles.broadcastShortcutIcon, { backgroundColor: COLORS.green }]}>
          <Ticket color="#ffffff" size={22} />
        </View>
        <View style={styles.broadcastShortcutCopy}>
          <Text style={styles.broadcastShortcutTitle}>Scan event tickets</Text>
          <Text style={styles.broadcastShortcutSub}>Use this phone to admit guests and block reused QR codes.</Text>
        </View>
        <ChevronRight color={COLORS.navy} size={24} />
      </Pressable>

      <SectionHeading title="Quick pulse" subtitle="Only the numbers admins need first" />
      <View style={styles.snapshotGrid}>
        <SnapshotCard icon={WalletCards} tone="green" label="Revenue" value={compactMoney(metrics.paidRevenue)} trend="Today" direction="up" />
        <SnapshotCard icon={Users} tone="blue" label="New Users" value={String(metrics.newUsers)} trend="Today" direction="up" />
        <SnapshotCard icon={CreditCard} tone="orange" label="Failed Payments" value={String(metrics.failedPayments)} trend="Today" direction="down" />
      </View>
    </View>
  );
}

function ReportsScreen({
  metrics,
  orders,
  payments,
  vendors,
  unreadCount,
  onBell,
  onRefresh,
}: {
  metrics: AdminMetrics;
  orders: AdminOrderSummary[];
  payments: AdminPaymentSummary[];
  vendors: AdminVendorSummary[];
  unreadCount: number;
  onBell: () => void;
  onRefresh: () => void;
}) {
  const [showAllPayouts, setShowAllPayouts] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [detailSheet, setDetailSheet] = useState<DetailSheetData | null>(null);
  const payoutRows = useMemo(() => {
    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
    const grouped = new Map<
      string,
      {
        id: string;
        name: string;
        subtitle: string;
        role: string;
        amount: number;
        status: string;
        icon: IconComponent;
        tone: Tone;
        pendingCount: number;
      }
    >();

    orders
      .filter((order) => String(order.payment_status || "").toLowerCase() === "paid")
      .forEach((order) => {
        const vendor = vendorById.get(order.vendor_id);
        const key = order.vendor_id || order.vendor?.id || order.id;
        const foodVendor = Boolean(vendor?.supports_food || order.channel === "food");
        const current =
          grouped.get(key) ?? {
            id: key,
            name: vendor?.name || order.vendor?.name || compactId(key),
            subtitle: foodVendor ? "Restaurant" : "Vendor",
            role: foodVendor ? "Restaurant" : "Seller",
            amount: 0,
            status: "Ready",
            icon: foodVendor ? UtensilsCrossed : Briefcase,
            tone: foodVendor ? ("orange" as Tone) : ("purple" as Tone),
            pendingCount: 0,
          };
        current.amount += Number(order.total_mwk ?? 0);
        if (order.status !== "delivered") current.pendingCount += 1;
        current.status = current.pendingCount ? "Processing" : "Ready";
        grouped.set(key, current);
      });

    return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);
  }, [orders, vendors]);

  const transactions = payments.map((payment) => ({
    id: payment.id,
    title: payment.title || payment.reference || "Payment",
    subtitle: paymentSucceeded(payment) ? "Payment received" : paymentFailed(payment) ? "Payment failed" : "Payment processing",
    amount: Number(payment.amount_mwk ?? 0),
    status: paymentSucceeded(payment) ? "Completed" : paymentFailed(payment) ? "Failed" : "Processing",
    time: relativeTime(payment.created_at),
    reference: payment.reference,
    provider: payment.provider,
    method: payment.method,
    customerEmail: payment.customer_email,
    relatedOrderId: payment.related_order_id,
    paidAt: payment.paid_at,
    createdAt: payment.created_at,
  }));
  const revenueBars = useMemo(() => {
    const totals = Array.from({ length: 7 }, () => 0);
    payments.filter(paymentSucceeded).forEach((payment) => {
      const paidAt = new Date(payment.paid_at || payment.verified_at || payment.created_at);
      if (Number.isNaN(paidAt.getTime())) return;
      const dayIndex = (paidAt.getDay() + 6) % 7;
      totals[dayIndex] += Number(payment.amount_mwk ?? 0);
    });
    return totals.map((value) => value / 1000000);
  }, [payments]);
  const maxRevenueBar = Math.max(1, ...revenueBars);
  const revenueAxisLabels = [maxRevenueBar, maxRevenueBar * 0.67, maxRevenueBar * 0.33, 0];
  const formatRevenueAxis = (value: number) => (value === 0 ? "0" : `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}M`);
  const visiblePayoutRows = showAllPayouts ? payoutRows : payoutRows.slice(0, 4);
  const visibleTransactions = showAllTransactions ? transactions : transactions.slice(0, 3);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Reports" subtitle="Finance & Insights" unreadCount={unreadCount} onBell={onBell} />
      <PeriodPill label="This Week" icon={CalendarDays} onPress={onRefresh} />

      <View style={styles.reportMetricGrid}>
        <ReportMetric icon={WalletCards} tone="green" label="Revenue" value={compactMoney(metrics.weeklyRevenue)} />
        <ReportMetric icon={Clock3} tone="orange" label="Payouts Pending" value={String(metrics.pendingPayments)} />
        <ReportMetric icon={ShieldAlert} tone="red" label="Failed Payments" value={String(metrics.failedPayments)} />
      </View>

      <View style={styles.chartCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitleLarge}>Revenue Trend</Text>
          <PeriodPill label="By Day" compact />
        </View>
        <View style={styles.chartArea}>
          {revenueAxisLabels.map((label) => (
            <View key={label} style={styles.chartGridLine}>
              <Text style={styles.chartAxis}>{formatRevenueAxis(label)}</Text>
              <View style={styles.chartDashed} />
            </View>
          ))}
          <View style={styles.barsRow}>
            {revenueBars.map((value, index) => (
              <View key={DAYS[index]} style={styles.barColumn}>
                <View style={[styles.chartBar, { height: 28 + (value / maxRevenueBar) * 126 }]} />
                <Text style={styles.barLabel}>{DAYS[index]}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendDot} />
          <Text style={styles.legendText}>Revenue (MWK)</Text>
        </View>
      </View>

      <SectionHeading
        title="Payout Queue"
        trailing={payoutRows.length > 4 ? <TextButton label={showAllPayouts ? "Collapse" : "View all"} onPress={() => setShowAllPayouts((value) => !value)} /> : undefined}
      />
      {visiblePayoutRows.length ? (
        <View style={styles.listCard}>
          {visiblePayoutRows.map((row, index) => (
            <PayoutRow
              key={row.id}
              row={row}
              divider={index < visiblePayoutRows.length - 1}
              onPress={() =>
                setDetailSheet({
                  title: row.name,
                  kicker: "Payout queue",
                  subtitle: row.subtitle,
                  icon: row.icon,
                  tone: row.tone,
                  summary: [
                    { label: "Amount", value: compactMoney(row.amount) },
                    { label: "Status", value: row.status },
                    { label: "Role", value: row.role },
                  ],
                  sections: [
                    {
                      title: "Payout Details",
                      rows: [
                        { label: "Recipient", value: row.name },
                        { label: "Business type", value: row.subtitle },
                        { label: "Pending orders", value: row.pendingCount },
                        { label: "Account ID", value: row.id },
                      ],
                    },
                  ],
                })
              }
            />
          ))}
        </View>
      ) : (
        <EmptyQueueCard icon={WalletCards} title="No payout queue yet" text="Paid vendor orders will create payout rows here." />
      )}

      <SectionHeading
        title="Recent Transactions"
        trailing={transactions.length > 3 ? <TextButton label={showAllTransactions ? "Collapse" : "View all"} onPress={() => setShowAllTransactions((value) => !value)} /> : undefined}
      />
      {visibleTransactions.length ? (
        <View style={styles.listCard}>
          {visibleTransactions.map((row, index) => (
            <TransactionRow
              key={row.id}
              row={row}
              divider={index < visibleTransactions.length - 1}
              onPress={() =>
                setDetailSheet({
                  title: row.title,
                  kicker: "Transaction",
                  subtitle: row.subtitle,
                  icon: row.status === "Completed" ? ArrowUp : row.status === "Failed" ? CircleAlert : ArrowDown,
                  tone: statusColor(row.status),
                  summary: [
                    { label: "Amount", value: money(row.amount) },
                    { label: "Status", value: row.status },
                    { label: "Time", value: row.time },
                  ],
                  sections: [
                    {
                      title: "Payment Details",
                      rows: [
                        { label: "Reference", value: row.reference },
                        { label: "Provider", value: row.provider },
                        { label: "Method", value: row.method },
                        { label: "Customer email", value: row.customerEmail },
                        { label: "Related order", value: row.relatedOrderId },
                        { label: "Paid at", value: row.paidAt ? new Date(row.paidAt).toLocaleString() : null },
                        { label: "Created at", value: row.createdAt ? new Date(row.createdAt).toLocaleString() : null },
                        { label: "Payment ID", value: row.id },
                      ],
                    },
                  ],
                })
              }
            />
          ))}
        </View>
      ) : (
        <EmptyQueueCard icon={CreditCard} title="No transactions yet" text="Payment activity from the backend will appear here." />
      )}
      <DetailSheet data={detailSheet} visible={Boolean(detailSheet)} onClose={() => setDetailSheet(null)} />
    </View>
  );
}

function OrdersScreen({
  filter,
  metrics,
  orders,
  workingKey,
  onAdvance,
  onAssign,
  onBell,
  onFilter,
}: {
  filter: OrderFilter;
  metrics: AdminMetrics;
  orders: DemoOrder[];
  workingKey: string | null;
  onAdvance: (row: DemoOrder) => void;
  onAssign: (row: DemoOrder) => void;
  onBell: () => void;
  onFilter: (value: OrderFilter) => void;
}) {
  return (
    <View style={styles.screen}>
      <ScreenHeader title="Orders" subtitle="Operations" onBell={onBell} />
      <Segmented labels={ORDER_FILTERS} active={filter} onChange={onFilter} />

      <View style={styles.orderMetricGrid}>
        <SnapshotCard icon={Briefcase} tone="green" label="Active Orders" value={String(metrics.activeOrders)} trend="Live now" direction="up" />
        <SnapshotCard icon={Clock3} tone="orange" label="Delayed" value={String(metrics.delayedOrders)} trend="Needs check" direction="down" />
        <SnapshotCard icon={User} tone="purple" label="Unassigned" value={String(metrics.unassignedOrders)} trend="Assign agent" direction="down" />
      </View>

      <View style={styles.stackGap}>
        {orders.length ? (
          orders.map((row) => (
            <OrderCard
              key={row.id}
              order={row}
              working={workingKey === `order:${row.id}` || workingKey === `assign:${row.id}`}
              onAdvance={() => onAdvance(row)}
              onAssign={() => onAssign(row)}
            />
          ))
        ) : (
          <EmptyQueueCard
            icon={ClipboardList}
            title="No orders in this view"
            text="Live orders from the backend will appear here after customers place them."
          />
        )}
      </View>
    </View>
  );
}

function UsersScreen({
  applications,
  filter,
  metrics,
  query,
  statusFilter,
  users,
  workingKey,
  onApprove,
  onBell,
  onFilter,
  onInvite,
  onQuery,
  onReviewApplication,
  onStatusFilter,
  onView,
}: {
  applications: RoleApplication[];
  filter: UserFilter;
  metrics: AdminMetrics;
  query: string;
  statusFilter: UserStatusFilter;
  users: DemoUser[];
  workingKey: string | null;
  onApprove: (row: DemoUser) => void;
  onBell: () => void;
  onFilter: (value: UserFilter) => void;
  onInvite: (input: { email: string; fullName: string; role: AdminUserSummary["role"] }) => void;
  onQuery: (value: string) => void;
  onReviewApplication: (application: RoleApplication, status: "approved" | "declined") => void;
  onStatusFilter: (value: UserStatusFilter) => void;
  onView: (row: DemoUser) => void;
}) {
  const [workflow, setWorkflow] = useState<UserWorkflow>("Admissions");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminUserSummary["role"]>("admin");
  const [selectedApplication, setSelectedApplication] = useState<RoleApplication | null>(null);
  const selectedApplicationWorking = selectedApplication ? Boolean(workingKey?.startsWith(`application:${selectedApplication.id}:`)) : false;

  const openStatusFilter = () => {
    const currentIndex = STATUS_FILTERS.indexOf(statusFilter);
    onStatusFilter(STATUS_FILTERS[(currentIndex + 1) % STATUS_FILTERS.length]);
  };

  const sendInvite = () => {
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      Alert.alert("Invite needs an email", "Enter a valid staff email address.");
      return;
    }
    onInvite({ email: inviteEmail, fullName: inviteName, role: inviteRole });
    setInviteEmail("");
    setInviteName("");
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="People" subtitle="Access workflow" onBell={onBell} />
      <Segmented labels={USER_WORKFLOWS} active={workflow} badgeLabel="Admissions" badge={applications.length ? String(applications.length) : undefined} onChange={setWorkflow} />

      {workflow === "Admissions" ? (
        <View style={styles.admissionPanel}>
          <View style={styles.admissionPanelHeader}>
            <View style={styles.admissionTitleBlock}>
              <Text style={styles.admissionKicker}>Step 1</Text>
              <Text style={styles.admissionTitle}>{applications.length ? `${applications.length} admission request${applications.length === 1 ? "" : "s"}` : "Admission queue is clear"}</Text>
            </View>
            <View style={styles.admissionCountBadge}>
              <Text style={styles.admissionCountText}>{applications.length}</Text>
            </View>
          </View>
          <Text style={styles.admissionSub}>Approve or decline role access from here. Approved users are notified and can switch roles immediately.</Text>
          {applications.length ? (
            <View style={styles.stackGap}>
              {applications.map((application) => (
                <RoleApplicationReviewCard
                  key={application.id}
                  application={application}
                  working={Boolean(workingKey?.startsWith(`application:${application.id}:`))}
                  onDetails={() => setSelectedApplication(application)}
                  onApprove={() => onReviewApplication(application, "approved")}
                  onDecline={() => onReviewApplication(application, "declined")}
                />
              ))}
            </View>
          ) : (
            <View style={styles.admissionEmpty}>
              <ClipboardCheck color={COLORS.green} size={20} />
              <Text style={styles.admissionEmptyText}>No one is waiting for role approval.</Text>
            </View>
          )}
          <Pressable style={styles.workflowNextButton} onPress={() => setWorkflow("Directory")}>
            <Users color={COLORS.purple} size={19} />
            <Text style={styles.workflowNextText}>Open user directory</Text>
            <ChevronRight color={COLORS.purple} size={20} />
          </Pressable>
        </View>
      ) : null}

      <ApplicationDetailsModal
        application={selectedApplication}
        visible={Boolean(selectedApplication)}
        working={selectedApplicationWorking}
        onClose={() => setSelectedApplication(null)}
        onApprove={() => {
          if (!selectedApplication) return;
          const current = selectedApplication;
          setSelectedApplication(null);
          onReviewApplication(current, "approved");
        }}
        onDecline={() => {
          if (!selectedApplication) return;
          const current = selectedApplication;
          setSelectedApplication(null);
          onReviewApplication(current, "declined");
        }}
      />

      {workflow === "Directory" ? (
        <>
          <View style={styles.peopleSummaryRow}>
            <WideMetric icon={Users} tone="blue" label="Total Users" value={String(metrics.totalUsers)} trend="Directory" />
            <WideMetric icon={UserPlus} tone="green" label="New Signups" value={String(metrics.newUsers)} trend="Today" />
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Search color={COLORS.muted} size={25} />
              <TextInput
                value={query}
                onChangeText={onQuery}
                placeholder="Search name, phone or email"
                placeholderTextColor={COLORS.muted}
                style={styles.searchInput}
              />
            </View>
            <Pressable style={styles.filterButton} onPress={openStatusFilter}>
              <SlidersHorizontal color={COLORS.navy} size={27} />
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.userChipScroller}>
            {USER_FILTERS.map((row) => (
              <RoleFilterChip key={row.label} label={row.label} icon={row.icon} active={filter === row.label} onPress={() => onFilter(row.label)} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.userChipScroller}>
            {STATUS_FILTERS.map((status) => (
              <StatusFilterChip key={status} label={status} active={statusFilter === status} onPress={() => onStatusFilter(status)} />
            ))}
          </ScrollView>
          <View style={styles.activeFilterRow}>
            <StatusPill label={`Status: ${statusFilter}`} tone={statusFilter === "All" ? "neutral" : statusColor(statusFilter)} />
            {query ? <StatusPill label={`Search: ${query}`} tone="blue" /> : null}
          </View>

          <SectionHeading title={`Directory (${users.length})`} subtitle="Search, view, and verify accounts" trailing={<PeriodPill label="Newest" compact />} />
          {users.length ? (
            <View style={styles.stackGap}>
              {users.map((row) => {
                const matchingApplication = applications.find((application) => application.id === row.id || application.user_id === row.id);
                return (
                  <UserRowCard
                    key={row.id}
                    row={row}
                    working={
                      workingKey === `user:${row.id}` ||
                      Boolean(matchingApplication && workingKey?.startsWith(`application:${matchingApplication.id}:`))
                    }
                    onApprove={() => onApprove(row)}
                    onView={() => onView(row)}
                  />
                );
              })}
            </View>
          ) : (
            <View style={styles.peopleEmptyCard}>
              <Users color={COLORS.muted} size={24} />
              <View style={styles.peopleEmptyCopy}>
                <Text style={styles.peopleEmptyTitle}>No backend users found</Text>
                <Text style={styles.peopleEmptyText}>Pull to refresh after users sign up or after the admin user endpoint is connected.</Text>
              </View>
            </View>
          )}
        </>
      ) : null}

      {workflow === "Staff" ? (
        <View style={styles.invitePanel}>
          <Text style={styles.invitePanelTitle}>Invite staff member</Text>
          <Text style={styles.invitePanelSub}>Add admins, delivery agents, vendors, or landlords without leaving this page.</Text>
          <TextInput
            value={inviteName}
            onChangeText={setInviteName}
            placeholder="Full name"
            placeholderTextColor={COLORS.muted}
            style={styles.inviteInput}
          />
          <TextInput
            value={inviteEmail}
            onChangeText={setInviteEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email address"
            placeholderTextColor={COLORS.muted}
            style={styles.inviteInput}
          />
          <View style={styles.inviteRoleRow}>
            {(["admin", "agent", "vendor", "landlord"] as AdminUserSummary["role"][]).map((role) => (
              <Pressable
                key={role}
                style={[styles.inviteRoleChip, inviteRole === role && styles.inviteRoleChipActive]}
                onPress={() => setInviteRole(role)}
              >
                <Text style={[styles.inviteRoleText, inviteRole === role && styles.inviteRoleTextActive]}>{roleLabel(role)}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.inviteSubmitButton, workingKey === "invite" && styles.disabledButton]} onPress={sendInvite} disabled={workingKey === "invite"}>
            <Plus color="#ffffff" size={18} />
            <Text style={styles.inviteSubmitText}>{workingKey === "invite" ? "Sending..." : "Send invite"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function TicketsScreen({
  filter,
  metrics,
  tickets,
  workingKey,
  onBell,
  onFilter,
  onSetStatus,
}: {
  filter: TicketFilter;
  metrics: AdminMetrics;
  tickets: DemoTicket[];
  workingKey: string | null;
  onBell: () => void;
  onFilter: (value: TicketFilter) => void;
  onSetStatus: (row: DemoTicket, status: "open" | "resolved") => void;
}) {
  return (
    <View style={styles.screen}>
      <ScreenHeader title="Tickets" subtitle="Support & Safety" onBell={onBell} />
      <Segmented labels={TICKET_FILTERS} active={filter} badgeLabel="Urgent" badge={metrics.urgentTickets ? String(metrics.urgentTickets) : undefined} onChange={onFilter} />
      <View style={styles.twoMetricGrid}>
        <WideMetric icon={Ticket} tone="orange" label="Open Tickets" value={String(metrics.openTickets)} trend="Live now" direction="up" />
        <WideMetric icon={ShieldAlert} tone="red" label="Urgent Reports" value={String(metrics.urgentTickets)} trend="Needs action" direction="down" />
      </View>
      <View style={styles.stackGap}>
        {tickets.length ? (
          tickets.map((row) => (
            <TicketCard
              key={row.id}
              ticket={row}
              working={workingKey === `ticket:${row.id}` || workingKey === `report:${row.id}`}
              onReply={() => onSetStatus(row, "open")}
              onResolve={() => onSetStatus(row, "resolved")}
            />
          ))
        ) : (
          <EmptyQueueCard
            icon={Ticket}
            title="No tickets in this view"
            text="Support and trust reports will show here when users submit them."
          />
        )}
      </View>
    </View>
  );
}

function ModerationScreen({
  catalogItems,
  filter,
  items,
  metrics,
  vendors,
  workingKey,
  onAction,
  onBell,
  onCatalogDelete,
  onCatalogSave,
  onCatalogToggleLive,
  onCatalogView,
  onFilter,
}: {
  catalogItems: AdminCatalogItemSummary[];
  filter: ReviewFilter;
  items: DemoReviewItem[];
  metrics: AdminMetrics;
  vendors: AdminVendorSummary[];
  workingKey: string | null;
  onAction: (row: DemoReviewItem, action: "approve" | "reject" | "flag") => void;
  onBell: () => void;
  onCatalogDelete: (item: AdminCatalogItemSummary) => void;
  onCatalogSave: (item: AdminCatalogItemSummary, draft: CatalogListingDraft) => Promise<boolean>;
  onCatalogToggleLive: (item: AdminCatalogItemSummary, isActive: boolean) => void;
  onCatalogView: (item: AdminCatalogItemSummary) => void;
  onFilter: (value: ReviewFilter) => void;
}) {
  const marketItems = useMemo(() => catalogItems.filter((item) => item.channel === "market"), [catalogItems]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Content Review" subtitle="Moderation" onBell={onBell} />
      <Segmented labels={REVIEW_FILTERS} active={filter} icons={{ Rooms: Building2, Market: Briefcase, Food: UtensilsCrossed, Reports: Flag }} onChange={onFilter} />

      <View style={styles.reviewMetricGrid}>
        <ReportMetric icon={Clock3} tone="orange" label="Pending" value={String(metrics.pendingReviews)} />
        <ReportMetric icon={Flag} tone="red" label="Flagged" value={String(metrics.flaggedReviews)} />
        <ReportMetric icon={CheckCircle2} tone="green" label="Approved today" value={String(metrics.approvedReviewsToday)} />
      </View>

      {filter === "Market" ? (
        <MarketListingsManager
          items={marketItems}
          vendors={vendors}
          workingKey={workingKey}
          onDelete={onCatalogDelete}
          onSave={onCatalogSave}
          onToggleLive={onCatalogToggleLive}
          onView={onCatalogView}
        />
      ) : (
        <View style={styles.stackGap}>
          {items.length ? (
            items.map((row) => (
              <ReviewCard
                key={row.id}
                item={row}
                working={workingKey === `listing:${row.id}` || workingKey === `catalog:${row.id}` || workingKey === `report:${row.id}`}
                onApprove={() => onAction(row, "approve")}
                onFlag={() => onAction(row, "flag")}
                onReject={() => onAction(row, "reject")}
              />
            ))
          ) : (
            <EmptyQueueCard
              icon={CheckCircle2}
              title="Review queue is clear"
              text="Pending listings, food items, room listings, and reports will appear here."
            />
          )}
        </View>
      )}
    </View>
  );
}

function MarketListingsManager({
  items,
  vendors,
  workingKey,
  onDelete,
  onSave,
  onToggleLive,
  onView,
}: {
  items: AdminCatalogItemSummary[];
  vendors: AdminVendorSummary[];
  workingKey: string | null;
  onDelete: (item: AdminCatalogItemSummary) => void;
  onSave: (item: AdminCatalogItemSummary, draft: CatalogListingDraft) => Promise<boolean>;
  onToggleLive: (item: AdminCatalogItemSummary, isActive: boolean) => void;
  onView: (item: AdminCatalogItemSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CatalogListingDraft | null>(null);
  const vendorById = useMemo(() => new Map(vendors.map((vendor) => [vendor.id, vendor])), [vendors]);
  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        const vendor = vendorById.get(item.vendor_id);
        return matchesQuery(query, item.name, item.description, vendor?.name, vendor?.area, vendor?.campus, item.is_active ? "live" : "hidden");
      }),
    [items, query, vendorById],
  );
  const liveCount = items.filter((item) => item.is_active).length;

  const startEdit = (item: AdminCatalogItemSummary) => {
    setEditingId(item.id);
    setDraft(catalogDraftFromItem(item));
  };

  const updateDraft = (patch: Partial<CatalogListingDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const saveEdit = async (item: AdminCatalogItemSummary) => {
    if (!draft) return;
    const saved = await onSave(item, draft);
    if (saved) {
      setEditingId(null);
      setDraft(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  return (
    <View style={styles.marketAdminSection}>
      <SectionHeading
        title={`Market listings (${items.length})`}
        subtitle="View, edit, publish, hide, or delete marketplace products"
        trailing={<StatusPill label={`${liveCount} live`} tone={liveCount ? "green" : "neutral"} />}
      />

      <View style={styles.marketSearchBox}>
        <Search color={COLORS.muted} size={22} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search market listings"
          placeholderTextColor={COLORS.muted}
          style={styles.marketSearchInput}
        />
      </View>

      <View style={styles.stackGap}>
        {visibleItems.length ? (
          visibleItems.map((item) => {
            const vendor = vendorById.get(item.vendor_id);
            const editing = editingId === item.id;
            const working =
              workingKey === `catalog:${item.id}` ||
              workingKey === `catalog:${item.id}:edit` ||
              workingKey === `catalog:${item.id}:live` ||
              workingKey === `catalog:${item.id}:delete`;
            return (
              <View key={item.id} style={styles.marketAdminCard}>
                <View style={styles.marketAdminTop}>
                  <Image source={{ uri: item.image_urls?.[0] || item.image_url || SAMPLE_REVIEW_ITEMS[1].image }} style={styles.marketAdminImage} />
                  <View style={styles.marketAdminCopy}>
                    <View style={styles.marketAdminTitleRow}>
                      <Text style={styles.marketAdminTitle} numberOfLines={2}>{item.name}</Text>
                      <StatusPill label={item.is_active ? "Live" : "Hidden"} tone={item.is_active ? "green" : "orange"} />
                    </View>
                    <Text style={styles.marketAdminPrice}>{money(item.price_mwk)}</Text>
                    <Text style={styles.marketAdminMeta} numberOfLines={1}>{vendor?.name || compactId(item.vendor_id)}</Text>
                    <Text style={styles.marketAdminMeta} numberOfLines={1}>
                      {[vendor?.area, vendor?.city, vendor?.campus].filter(Boolean).join(", ") || "No location set"}
                    </Text>
                    <Text style={styles.marketAdminMeta}>
                      Stock: {item.stock_qty === null || item.stock_qty === undefined ? "Not tracked" : item.stock_qty}
                    </Text>
                  </View>
                </View>

                {editing && draft ? (
                  <View style={styles.marketEditPanel}>
                    <TextInput
                      value={draft.name}
                      onChangeText={(value) => updateDraft({ name: value })}
                      placeholder="Listing name"
                      placeholderTextColor={COLORS.muted}
                      style={styles.marketEditInput}
                    />
                    <View style={styles.marketEditRow}>
                      <TextInput
                        value={draft.priceMwk}
                        onChangeText={(value) => updateDraft({ priceMwk: value })}
                        keyboardType="numeric"
                        placeholder="Price MWK"
                        placeholderTextColor={COLORS.muted}
                        style={[styles.marketEditInput, styles.marketEditHalfInput]}
                      />
                      <TextInput
                        value={draft.stockQty}
                        onChangeText={(value) => updateDraft({ stockQty: value })}
                        keyboardType="numeric"
                        placeholder="Stock"
                        placeholderTextColor={COLORS.muted}
                        style={[styles.marketEditInput, styles.marketEditHalfInput]}
                      />
                    </View>
                    <TextInput
                      value={draft.description}
                      onChangeText={(value) => updateDraft({ description: value })}
                      multiline
                      placeholder="Description"
                      placeholderTextColor={COLORS.muted}
                      style={[styles.marketEditInput, styles.marketEditDescription]}
                    />
                    <TextInput
                      value={draft.imageUrl}
                      onChangeText={(value) => updateDraft({ imageUrl: value })}
                      autoCapitalize="none"
                      placeholder="Image URL"
                      placeholderTextColor={COLORS.muted}
                      style={styles.marketEditInput}
                    />
                    <Pressable
                      style={[styles.marketLiveToggle, draft.isActive && styles.marketLiveToggleActive]}
                      onPress={() => updateDraft({ isActive: !draft.isActive })}
                      disabled={working}
                    >
                      <CheckCircle2 color={draft.isActive ? "#ffffff" : COLORS.green} size={18} />
                      <Text style={[styles.marketLiveToggleText, draft.isActive && styles.marketLiveToggleTextActive]}>
                        {draft.isActive ? "Listing is live" : "Make listing live"}
                      </Text>
                    </Pressable>
                    <View style={styles.marketEditActions}>
                      <Pressable style={[styles.marketSmallAction, styles.marketNeutralAction]} onPress={cancelEdit} disabled={working}>
                        <XCircle color={COLORS.muted} size={17} />
                        <Text style={styles.marketNeutralActionText}>Cancel</Text>
                      </Pressable>
                      <Pressable style={[styles.marketSmallAction, styles.marketPrimaryAction, working && styles.disabledButton]} onPress={() => void saveEdit(item)} disabled={working}>
                        <Save color="#ffffff" size={17} />
                        <Text style={styles.marketPrimaryActionText}>{working ? "Saving..." : "Save"}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {!editing ? (
                  <View style={styles.marketAdminActions}>
                    <Pressable style={[styles.marketSmallAction, styles.marketNeutralAction]} onPress={() => onView(item)} disabled={working}>
                      <Eye color={COLORS.purple} size={17} />
                      <Text style={styles.marketNeutralActionText}>View</Text>
                    </Pressable>
                    <Pressable style={[styles.marketSmallAction, styles.marketNeutralAction]} onPress={() => startEdit(item)} disabled={working}>
                      <Pencil color={COLORS.blue} size={17} />
                      <Text style={styles.marketNeutralActionText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.marketSmallAction, item.is_active ? styles.marketHideAction : styles.marketLiveAction, working && styles.disabledButton]}
                      onPress={() => onToggleLive(item, !item.is_active)}
                      disabled={working}
                    >
                      <CheckCircle2 color={item.is_active ? COLORS.orange : COLORS.green} size={17} />
                      <Text style={item.is_active ? styles.marketHideActionText : styles.marketLiveActionText}>{item.is_active ? "Hide" : "Live"}</Text>
                    </Pressable>
                    <Pressable style={[styles.marketSmallAction, styles.marketDeleteAction, working && styles.disabledButton]} onPress={() => onDelete(item)} disabled={working}>
                      <Trash2 color={COLORS.red} size={17} />
                      <Text style={styles.marketDeleteActionText}>Delete</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        ) : (
          <EmptyQueueCard
            icon={ShoppingBag}
            title={items.length ? "No matching market listings" : "No market listings yet"}
            text={items.length ? "Clear the search to show all marketplace products." : "Products added by sellers will appear here for admin review."}
          />
        )}
      </View>
    </View>
  );
}

function ScreenHeader({
  title,
  subtitle,
  unreadCount,
  rightAction,
  onBell,
}: {
  title: string;
  subtitle: string;
  unreadCount?: number;
  rightAction?: React.ReactNode;
  onBell: () => void;
}) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerTextBlock}>
        <Text style={styles.screenTitle}>{title}</Text>
        <Text style={styles.screenSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.headerActions}>
        {rightAction}
        <Pressable style={styles.bellButton} onPress={onBell}>
          <Bell color={COLORS.navy} size={29} strokeWidth={2.2} />
          {unreadCount ? <View style={styles.bellDot} /> : null}
        </Pressable>
      </View>
    </View>
  );
}

function EmptyQueueCard({ icon: Icon, title, text }: { icon: IconComponent; title: string; text: string }) {
  return (
    <View style={styles.emptyQueueCard}>
      <IconBubble icon={Icon} tone="neutral" size={58} />
      <View style={styles.emptyQueueCopy}>
        <Text style={styles.emptyQueueTitle}>{title}</Text>
        <Text style={styles.emptyQueueText}>{text}</Text>
      </View>
    </View>
  );
}

function IconBubble({ icon: Icon, tone, size = 58 }: { icon: IconComponent; tone: Tone; size?: number }) {
  const colors = toneColors(tone);
  return (
    <View style={[styles.iconBubble, { width: size, height: size, borderRadius: Math.round(size / 3), backgroundColor: colors.bg }]}>
      <Icon color={colors.fg} size={Math.round(size * 0.48)} strokeWidth={2.2} />
    </View>
  );
}

function Trend({ direction = "up", label, compact = false }: { direction?: TrendDirection | "upBad"; label: string; compact?: boolean }) {
  const isDown = direction === "down";
  const isBadUp = direction === "upBad";
  const good = !isDown && !isBadUp;
  const color = good ? COLORS.green : isBadUp ? COLORS.red : COLORS.red;
  const Icon = isDown ? ArrowDown : ArrowUp;
  return (
    <View style={[styles.trendWrap, compact && styles.trendWrapCompact, { backgroundColor: compact ? (good ? "#e0f6e9" : "#ffe1e6") : "transparent" }]}>
      <Icon color={color} size={compact ? 15 : 16} strokeWidth={2.4} />
      <Text style={[styles.trendText, compact && styles.trendTextCompact, { color: compact ? color : COLORS.muted }]}>
        <Text style={{ color }}>{label.split(" ")[0]}</Text> {label.split(" ").slice(1).join(" ")}
      </Text>
    </View>
  );
}

function SnapshotCard({
  icon,
  tone,
  label,
  value,
  trend,
  direction = "up",
}: {
  icon: IconComponent;
  tone: Tone;
  label: string;
  value: string;
  trend: string;
  direction?: TrendDirection;
}) {
  return (
    <View style={styles.snapshotCard}>
      <IconBubble icon={icon} tone={tone} size={55} />
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text style={styles.snapshotValue} numberOfLines={1}>{value}</Text>
      <Trend label={trend} direction={direction} compact />
    </View>
  );
}

function ReportMetric({
  icon,
  label,
  value,
  tone,
  trend,
  direction = "up",
}: {
  icon: IconComponent;
  label: string;
  value: string;
  tone: Tone;
  trend?: string;
  direction?: TrendDirection | "upBad";
}) {
  return (
    <View style={styles.reportMetricCard}>
      <View style={styles.reportMetricTop}>
        <IconBubble icon={icon} tone={tone} size={56} />
        <Text style={styles.reportMetricLabel}>{label}</Text>
      </View>
      <Text style={styles.reportMetricValue} numberOfLines={1}>{value}</Text>
      {trend ? <Trend label={trend} direction={direction} /> : null}
    </View>
  );
}

function WideMetric({
  icon,
  label,
  value,
  trend,
  tone,
  direction = "up",
}: {
  icon: IconComponent;
  label: string;
  value: string;
  trend: string;
  tone: Tone;
  direction?: TrendDirection;
}) {
  return (
    <View style={styles.wideMetricCard}>
      <IconBubble icon={icon} tone={tone} size={68} />
      <View style={styles.wideMetricCopy}>
        <Text style={styles.snapshotLabel}>{label}</Text>
        <Text style={styles.wideMetricValue}>{value}</Text>
        <Trend label={trend} direction={direction} compact />
      </View>
    </View>
  );
}

function SectionHeading({
  title,
  subtitle,
  badge,
  trailing,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleBlock}>
        <View style={styles.titleWithBadge}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {badge ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.textButton} onPress={onPress}>
      <Text style={styles.textButtonLabel}>{label}</Text>
      <ChevronRight color={COLORS.purple} size={22} />
    </Pressable>
  );
}

function PeriodPill({
  label,
  icon: Icon,
  compact,
  onPress,
}: {
  label: string;
  icon?: IconComponent;
  compact?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      {Icon ? <Icon color={COLORS.purple} size={21} /> : null}
      <Text style={styles.periodText}>{label}</Text>
      <ChevronDown color={COLORS.navy} size={19} />
    </>
  );
  if (!onPress) {
    return <View style={[styles.periodPill, compact && styles.periodPillCompact]}>{content}</View>;
  }
  return (
    <Pressable style={[styles.periodPill, compact && styles.periodPillCompact]} onPress={onPress}>
      {content}
    </Pressable>
  );
}

function WorkflowActionCard({
  count,
  icon,
  subtitle,
  title,
  tone,
  onPress,
}: {
  count: number;
  icon: IconComponent;
  subtitle: string;
  title: string;
  tone: Tone;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.workflowCard} onPress={onPress}>
      <IconBubble icon={icon} tone={tone} size={54} />
      <View style={styles.workflowCardCopy}>
        <Text style={styles.workflowCardTitle}>{title}</Text>
        <Text style={styles.workflowCardSub}>{subtitle}</Text>
      </View>
      <View style={[styles.workflowCountBadge, count === 0 && styles.workflowCountBadgeClear]}>
        <Text style={[styles.workflowCountText, count === 0 && styles.workflowCountTextClear]}>{count}</Text>
      </View>
      <ChevronRight color={COLORS.muted} size={22} />
    </Pressable>
  );
}

function Segmented<T extends string>({
  labels,
  active,
  badgeLabel,
  badge,
  icons,
  onChange,
}: {
  labels: readonly T[];
  active: T;
  badgeLabel?: T;
  badge?: string;
  icons?: Partial<Record<T, IconComponent>>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {labels.map((label) => {
        const selected = label === active;
        const Icon = icons?.[label] as IconComponent | undefined;
        return (
          <Pressable key={label} style={[styles.segmentButton, selected && styles.segmentButtonActive]} onPress={() => onChange(label)}>
            {Icon ? <Icon color={selected ? COLORS.navy : COLORS.muted} size={25} strokeWidth={2.2} /> : null}
            <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{label}</Text>
            {badgeLabel === label && badge ? (
              <View style={[styles.segmentBadge, selected && styles.segmentBadgeActive]}>
                <Text style={[styles.segmentBadgeText, selected && styles.segmentBadgeTextActive]}>{badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function RoleFilterChip({
  active,
  icon: Icon,
  label,
  onPress,
}: {
  active: boolean;
  icon?: IconComponent;
  label: UserFilter;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.roleFilterChip, active && styles.roleFilterChipActive]} onPress={onPress}>
      {Icon ? <Icon color={active ? "#fff" : COLORS.muted} size={20} /> : null}
      <Text style={[styles.roleFilterText, active && styles.roleFilterTextActive]}>{label}</Text>
    </Pressable>
  );
}

function StatusFilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: UserStatusFilter;
  onPress: () => void;
}) {
  const tone = label === "All" ? "neutral" : statusColor(label);
  const colors = toneColors(tone);
  return (
    <Pressable
      style={[
        styles.statusFilterChip,
        active && {
          backgroundColor: colors.bg,
          borderColor: colors.fg,
        },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.statusFilterText, active && { color: colors.fg }]}>{label}</Text>
    </Pressable>
  );
}

function OrderCard({
  order,
  working,
  onAdvance,
  onAssign,
}: {
  order: DemoOrder;
  working: boolean;
  onAdvance: () => void;
  onAssign: () => void;
}) {
  const Icon = orderIcon(order.type);
  const tone = orderTone(order.type);
  const status = String(order.status);
  const statusLabel = status === "awaiting_agent" ? "Awaiting agent" : status === "issue" ? "Issue" : titleCase(status);
  const action =
    status === "awaiting_agent"
      ? { label: "Assign Agent", icon: UserPlus, onPress: onAssign }
      : status === "on_the_way"
        ? { label: "Track", icon: MapPin, onPress: onAdvance }
        : null;
  const ActionIcon = action?.icon;
  const primaryPress = action?.onPress ?? onAdvance;

  return (
    <Pressable style={styles.orderCard} onPress={primaryPress} disabled={working}>
      <View style={styles.orderTopRow}>
        <View style={styles.orderLeftRail}>
          <IconBubble icon={Icon} tone={tone} size={64} />
          <View style={[styles.categoryPill, { backgroundColor: toneColors(tone).bg }]}>
            <Text style={[styles.categoryPillText, { color: toneColors(tone).fg }]}>{order.type === "room" ? "Room Booking" : titleCase(order.type)}</Text>
          </View>
        </View>
        <View style={styles.orderMain}>
          <Text style={styles.orderTitle}>{order.merchant}</Text>
          <Text style={styles.orderCustomer}>{order.customer}</Text>
          <View style={styles.iconTextRow}>
            <MapPin color={COLORS.muted} size={18} />
            <Text style={styles.orderMeta}>{order.location}</Text>
          </View>
          <Text style={styles.orderId}>Order ID:  {order.id}</Text>
        </View>
        <ChevronRight color={COLORS.muted} size={25} />
      </View>
      <View style={styles.orderBottomRow}>
        <Text style={styles.orderTime}>{order.createdAt}</Text>
        <Text style={styles.orderAmount}>{money(order.total)}</Text>
        <StatusPill label={statusLabel} tone={statusColor(status)} />
        {action ? (
          <Pressable style={styles.outlineAction} onPress={action.onPress} disabled={working}>
            {ActionIcon ? <ActionIcon color={COLORS.purple} size={18} /> : null}
            <Text style={styles.outlineActionText}>{working ? "Working..." : action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

function RoleApplicationReviewCard({
  application,
  working,
  onDetails,
  onApprove,
  onDecline,
}: {
  application: RoleApplication;
  working: boolean;
  onDetails: () => void;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const label = applicationLabel(application);
  const Icon = applicationIcon(application);
  const tone = applicationTone(application);
  const colors = toneColors(tone);
  const details = Object.entries(application.payload ?? {}).filter(([, value]) => String(value ?? "").trim());
  const previewDetails = details.slice(0, 3);
  const applicant = application.applicant_name || application.applicant_email || compactId(application.user_id);

  return (
    <View style={[styles.applicationReviewCard, { borderColor: colors.soft }]}>
      <View style={styles.applicationReviewTop}>
        <View style={[styles.applicationIconWrap, { backgroundColor: colors.bg }]}>
          <Icon color={colors.fg} size={22} />
        </View>
        <View style={styles.applicationReviewCopy}>
          <Text style={styles.applicationReviewTitle}>{label} admission</Text>
          <Text style={styles.applicationReviewSub}>{applicant}</Text>
        </View>
        <StatusPill label="Pending" tone="orange" icon={Clock3} />
      </View>

      <View style={styles.applicationMetaRow}>
        <View style={styles.applicationMetaPill}>
          <CalendarDays color={COLORS.muted} size={16} />
          <Text style={styles.applicationMetaText}>{relativeTime(application.created_at)}</Text>
        </View>
        <View style={styles.applicationMetaPill}>
          <ClipboardList color={COLORS.muted} size={16} />
          <Text style={styles.applicationMetaText}>{details.length} detail{details.length === 1 ? "" : "s"}</Text>
        </View>
      </View>

      {previewDetails.length ? (
        <View style={styles.applicationDetailGrid}>
          {previewDetails.map(([key, value]) => (
            <View key={key} style={styles.applicationDetailChip}>
              <Text numberOfLines={1} style={styles.applicationDetailKey}>{key.replace(/^.* - /, "")}</Text>
              <Text numberOfLines={1} style={styles.applicationDetailValue}>{value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.applicationActions}>
        <Pressable style={styles.applicationGhostButton} onPress={onDetails} disabled={working}>
          <Eye color={COLORS.purple} size={17} />
          <Text style={styles.applicationGhostText}>Review</Text>
        </Pressable>
        <Pressable style={[styles.applicationDecisionButton, styles.applicationDeclineButton]} onPress={onDecline} disabled={working}>
          <XCircle color={COLORS.red} size={18} />
          <Text style={styles.applicationDeclineText}>{working ? "Working..." : "Decline"}</Text>
        </Pressable>
        <Pressable style={[styles.applicationDecisionButton, styles.applicationApproveButton]} onPress={onApprove} disabled={working}>
          <CheckCircle2 color="#ffffff" size={18} />
          <Text style={styles.applicationApproveText}>{working ? "Working..." : "Approve"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DetailSheet({
  data,
  visible,
  onClose,
}: {
  data: DetailSheetData | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!data) {
    return <Modal visible={false} transparent animationType="fade" />;
  }

  const Icon = data.icon;
  const colors = toneColors(data.tone);
  const summary = normalizeDetailRows(data.summary ?? []);
  const sections = normalizeDetailSections(data.sections);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.applicationModalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.applicationModalSheet}>
          <View style={styles.applicationModalHandle} />
          <View style={styles.applicationModalHeader}>
            <View style={[styles.applicationModalIcon, { backgroundColor: colors.bg }]}>
              <Icon color={colors.fg} size={25} />
            </View>
            <View style={styles.applicationModalTitleBlock}>
              <Text style={styles.applicationModalKicker}>{data.kicker}</Text>
              <Text style={styles.applicationModalTitle}>{data.title}</Text>
              {data.subtitle ? <Text style={styles.applicationModalSub}>{data.subtitle}</Text> : null}
            </View>
            <Pressable style={styles.applicationModalClose} onPress={onClose}>
              <X color={COLORS.navy} size={22} />
            </Pressable>
          </View>

          {summary.length ? (
            <View style={styles.detailSheetSummaryGrid}>
              {summary.slice(0, 4).map((row) => (
                <View key={row.label} style={styles.detailSheetSummaryItem}>
                  <Text style={styles.applicationModalStatValue} numberOfLines={1}>{row.value}</Text>
                  <Text style={styles.applicationModalStatLabel}>{row.label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <ScrollView style={styles.applicationModalScroll} contentContainerStyle={styles.applicationModalScrollContent} showsVerticalScrollIndicator>
            {sections.length ? (
              sections.map((section) => (
                <View key={section.title} style={styles.applicationModalSection}>
                  <Text style={styles.applicationModalSectionTitle}>{section.title}</Text>
                  <View style={styles.applicationModalRows}>
                    {section.rows.map((row, index) => (
                      <View key={`${section.title}-${row.label}-${index}`} style={styles.applicationModalDetailRow}>
                        <Text style={styles.applicationModalDetailLabel}>{row.label}</Text>
                        <Text style={styles.applicationModalDetailValue} selectable>{row.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.applicationModalEmpty}>
                <ClipboardList color={COLORS.muted} size={24} />
                <Text style={styles.applicationModalEmptyTitle}>No details available</Text>
                <Text style={styles.applicationModalEmptyText}>Refresh the admin data and open this item again.</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.detailSheetFooter}>
            <Pressable style={styles.detailSheetDoneButton} onPress={onClose}>
              <Text style={styles.detailSheetDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ApplicationDetailsModal({
  application,
  visible,
  working,
  onClose,
  onApprove,
  onDecline,
}: {
  application: RoleApplication | null;
  visible: boolean;
  working: boolean;
  onClose: () => void;
  onApprove: () => void;
  onDecline: () => void;
}) {
  if (!application) {
    return <Modal visible={false} transparent animationType="fade" />;
  }

  const label = applicationLabel(application);
  const Icon = applicationIcon(application);
  const colors = toneColors(applicationTone(application));
  const applicant = application.applicant_name || application.applicant_email || compactId(application.user_id);
  const groups = applicationDetailGroups(application);
  const detailCount = groups.reduce((count, group) => count + group.rows.length, 0);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.applicationModalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.applicationModalSheet}>
          <View style={styles.applicationModalHandle} />

          <View style={styles.applicationModalHeader}>
            <View style={[styles.applicationModalIcon, { backgroundColor: colors.bg }]}>
              <Icon color={colors.fg} size={25} />
            </View>
            <View style={styles.applicationModalTitleBlock}>
              <Text style={styles.applicationModalKicker}>Admission request</Text>
              <Text style={styles.applicationModalTitle}>{label}</Text>
              <Text style={styles.applicationModalSub}>{relativeTime(application.created_at)}</Text>
            </View>
            <Pressable style={styles.applicationModalClose} onPress={onClose} disabled={working}>
              <X color={COLORS.navy} size={22} />
            </Pressable>
          </View>

          <View style={styles.applicationApplicantPanel}>
            <Text style={styles.applicationApplicantName}>{applicant}</Text>
            <View style={styles.applicationIdentityGrid}>
              <View style={styles.applicationIdentityRow}>
                <User color={COLORS.muted} size={17} />
                <Text style={styles.applicationIdentityText} numberOfLines={1}>{compactId(application.user_id)}</Text>
              </View>
              {application.applicant_email ? (
                <View style={styles.applicationIdentityRow}>
                  <Mail color={COLORS.muted} size={17} />
                  <Text style={styles.applicationIdentityText} numberOfLines={1}>{application.applicant_email}</Text>
                </View>
              ) : null}
              {application.applicant_phone ? (
                <View style={styles.applicationIdentityRow}>
                  <Phone color={COLORS.muted} size={17} />
                  <Text style={styles.applicationIdentityText} numberOfLines={1}>{application.applicant_phone}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.applicationModalStats}>
              <View style={styles.applicationModalStat}>
                <Text style={styles.applicationModalStatValue}>{detailCount}</Text>
                <Text style={styles.applicationModalStatLabel}>Details</Text>
              </View>
              <View style={styles.applicationModalStat}>
                <Text style={styles.applicationModalStatValue}>{groups.length}</Text>
                <Text style={styles.applicationModalStatLabel}>Sections</Text>
              </View>
              <View style={styles.applicationModalStat}>
                <Text style={styles.applicationModalStatValue}>{roleLabel(application.target_role)}</Text>
                <Text style={styles.applicationModalStatLabel}>Role</Text>
              </View>
            </View>
          </View>

          <ScrollView style={styles.applicationModalScroll} contentContainerStyle={styles.applicationModalScrollContent} showsVerticalScrollIndicator>
            {groups.length ? (
              groups.map((group) => (
                <View key={group.title} style={styles.applicationModalSection}>
                  <Text style={styles.applicationModalSectionTitle}>{group.title}</Text>
                  <View style={styles.applicationModalRows}>
                    {group.rows.map((row, index) => (
                      <View key={`${group.title}-${row.label}-${index}`} style={styles.applicationModalDetailRow}>
                        <Text style={styles.applicationModalDetailLabel}>{row.label}</Text>
                        <Text style={styles.applicationModalDetailValue} selectable>{row.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.applicationModalEmpty}>
                <ClipboardList color={COLORS.muted} size={24} />
                <Text style={styles.applicationModalEmptyTitle}>No attached details</Text>
                <Text style={styles.applicationModalEmptyText}>This request only includes the applicant account information.</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.applicationModalFooter}>
            <Pressable style={[styles.applicationModalDecision, styles.applicationModalDecline, working && styles.disabledButton]} onPress={onDecline} disabled={working}>
              <XCircle color={COLORS.red} size={19} />
              <Text style={styles.applicationModalDeclineText}>{working ? "Working..." : "Decline"}</Text>
            </Pressable>
            <Pressable style={[styles.applicationModalDecision, styles.applicationModalApprove, working && styles.disabledButton]} onPress={onApprove} disabled={working}>
              <CheckCircle2 color="#ffffff" size={19} />
              <Text style={styles.applicationModalApproveText}>{working ? "Working..." : "Approve"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function UserRowCard({
  row,
  working,
  onApprove,
  onView,
}: {
  row: DemoUser;
  working: boolean;
  onApprove: () => void;
  onView: () => void;
}) {
  const tone = roleTone(row.role);
  const Icon = roleIcon(row.role);
  const statusTone = statusColor(row.status);
  return (
    <View style={styles.userCard}>
      <Image source={{ uri: row.avatar }} style={styles.userAvatar} />
      <View style={styles.userMain}>
        <Text style={styles.userName}>{row.name}</Text>
        <Text style={styles.userPhone}>{row.phone}</Text>
        <View style={[styles.roleBadge, { backgroundColor: toneColors(tone).bg }]}>
          <Icon color={toneColors(tone).fg} size={17} />
          <Text style={[styles.roleBadgeText, { color: toneColors(tone).fg }]}>{roleLabel(row.role)}</Text>
        </View>
      </View>
      <View style={styles.userRightColumn}>
        <StatusPill label={titleCase(row.status)} tone={statusTone} icon={row.status === "verified" ? CheckCircle2 : row.status === "suspended" ? CircleAlert : Clock3} />
        <Text style={styles.userJoined}>{row.joined}</Text>
        <View style={styles.userButtonRow}>
          <Pressable style={styles.userActionButton} onPress={row.status === "pending" ? onApprove : onView} disabled={working}>
            <Text style={styles.userActionText}>{working ? "..." : row.status === "pending" ? "Approve" : "View"}</Text>
          </Pressable>
          <Pressable style={styles.userIconButton} onPress={onView}>
            <EllipsisVertical color={COLORS.muted} size={22} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TicketCard({
  ticket,
  working,
  onReply,
  onResolve,
}: {
  ticket: DemoTicket;
  working: boolean;
  onReply: () => void;
  onResolve: () => void;
}) {
  const icon = ticket.category === "Trust & Safety" ? ShieldPlus : ticket.type === "rooms" ? BedDouble : ticket.type === "food" ? UtensilsCrossed : ticket.type === "market" ? ShoppingBag : Wallet;
  const tone = ticket.category === "Trust & Safety" || ticket.priority === "High" ? "red" : ticket.type === "rooms" ? "orange" : ticket.type === "food" ? "green" : "purple";
  return (
    <View style={styles.ticketCard}>
      <IconBubble icon={icon} tone={tone as Tone} size={72} />
      <View style={styles.ticketMain}>
        <StatusPill label={ticket.category} tone={ticket.category === "Trust & Safety" ? "red" : "purple"} />
        <Text style={styles.ticketTitle}>{ticket.title}</Text>
        <Text style={styles.ticketDescription}>{ticket.description}</Text>
        <View style={styles.reporterRow}>
          <Image source={{ uri: ticket.avatar }} style={styles.reporterAvatar} />
          <View>
            <Text style={styles.reporterName}>{ticket.category === "Trust & Safety" ? "Reported" : "Requested"} by {ticket.reporter}</Text>
            <Text style={styles.reporterId}>User ID: {ticket.reporterId}</Text>
          </View>
        </View>
      </View>
      <View style={styles.ticketSide}>
        <StatusPill label={ticket.priority} tone={ticket.priority === "High" ? "red" : "orange"} icon={ticket.priority === "High" ? ArrowUp : undefined} />
        <View style={styles.iconTextRow}>
          <WalletCards color={COLORS.purple} size={19} />
          <Text style={styles.ticketSideText}>{titleCase(ticket.type)}</Text>
        </View>
        <View style={styles.iconTextRow}>
          <Clock3 color={COLORS.muted} size={19} />
          <Text style={styles.ticketTime}>{ticket.createdAt}</Text>
        </View>
      </View>
      <View style={styles.ticketActions}>
        <Pressable style={styles.ticketOutlineButton} onPress={onReply} disabled={working}>
          <MessageCircle color={COLORS.purple} size={19} />
          <Text style={styles.ticketOutlineText}>{ticket.category === "Trust & Safety" ? "Escalate" : "Reply"}</Text>
        </Pressable>
        <Pressable style={styles.ticketPrimaryButton} onPress={onResolve} disabled={working}>
          <CheckCircle2 color="#fff" size={19} />
          <Text style={styles.ticketPrimaryText}>{working ? "Working..." : "Resolve"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReviewCard({
  item,
  working,
  onApprove,
  onFlag,
  onReject,
}: {
  item: DemoReviewItem;
  working: boolean;
  onApprove: () => void;
  onFlag: () => void;
  onReject: () => void;
}) {
  const tone = item.filter === "Rooms" ? "purple" : item.filter === "Food" ? "orange" : item.filter === "Market" ? "green" : "red";
  const Icon = item.filter === "Rooms" ? Building2 : item.filter === "Food" ? UtensilsCrossed : item.filter === "Market" ? Briefcase : Flag;
  const disabled = item.status === "approved" || working;
  return (
    <View style={styles.reviewCard}>
      <Image source={{ uri: item.image }} style={styles.reviewImage} />
      <View style={styles.reviewMain}>
        <View style={styles.reviewTitleLine}>
          <IconBubble icon={Icon} tone={tone} size={49} />
          <View style={styles.reviewTitleBlock}>
            <Text style={styles.reviewTitle}>{item.title}</Text>
            <Text style={styles.reviewSubtitle}>{item.subtitle}</Text>
          </View>
          <StatusPill label={item.status === "needs_details" ? "Needs details" : titleCase(item.status)} tone={statusColor(item.status)} icon={item.status === "approved" ? CheckCircle2 : item.status === "flagged" ? Flag : Clock3} />
        </View>
        <ReviewMeta icon={MapPin} text={item.location} />
        <ReviewMeta icon={User} text={`Submitted by ${item.submittedBy}`} />
        <ReviewMeta icon={Clock3} text={item.submittedAgo} />
      </View>
      <View style={styles.reviewActions}>
        <Pressable style={[styles.reviewActionButton, styles.reviewApprove, disabled && styles.disabledButton]} onPress={onApprove} disabled={disabled}>
          <Check color={disabled ? "#a7cdb8" : COLORS.green} size={24} />
          <Text style={[styles.reviewApproveText, disabled && styles.disabledText]}>{item.status === "approved" ? "Approved" : "Approve"}</Text>
        </Pressable>
        <Pressable style={[styles.reviewActionButton, styles.reviewReject, working && styles.disabledButton]} onPress={onReject} disabled={working}>
          <XCircle color={COLORS.red} size={22} />
          <Text style={styles.reviewRejectText}>Reject</Text>
        </Pressable>
        <Pressable style={[styles.reviewActionButton, styles.reviewFlag, working && styles.disabledButton]} onPress={onFlag} disabled={working}>
          <Flag color={COLORS.purple} size={23} />
          <Text style={styles.reviewFlagText}>Flag</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReviewMeta({ icon: Icon, text }: { icon: IconComponent; text: string }) {
  return (
    <View style={styles.reviewMetaRow}>
      <Icon color={COLORS.purple} size={18} />
      <Text style={styles.reviewMetaText}>{text}</Text>
    </View>
  );
}

function PayoutRow({
  row,
  divider,
  onPress,
}: {
  row: { id: string; name: string; subtitle: string; role: string; amount: number; status: string; icon: IconComponent; tone: Tone };
  divider: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.payoutRow, divider && styles.rowDivider]} onPress={onPress}>
      <IconBubble icon={row.icon} tone={row.tone} size={51} />
      <View style={styles.payoutNameBlock}>
        <Text style={styles.rowTitle}>{row.name}</Text>
        <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
      </View>
      <StatusPill label={row.role} tone={row.tone} />
      <View style={styles.payoutAmountBlock}>
        <Text style={styles.payoutAmount}>{compactMoney(row.amount)}</Text>
        <Text style={[styles.payoutStatus, { color: toneColors(statusColor(row.status)).fg }]}>-  {row.status}</Text>
      </View>
      <ChevronRight color={COLORS.muted} size={23} />
    </Pressable>
  );
}

function TransactionRow({
  row,
  divider,
  onPress,
}: {
  row: { id: string; title: string; subtitle: string; amount: number; status: string; time: string };
  divider: boolean;
  onPress: () => void;
}) {
  const tone = statusColor(row.status);
  const Icon = row.status === "Completed" ? ArrowUp : row.status === "Failed" ? CircleAlert : ArrowDown;
  return (
    <Pressable style={[styles.transactionRow, divider && styles.rowDivider]} onPress={onPress}>
      <IconBubble icon={Icon} tone={tone} size={50} />
      <View style={styles.transactionCopy}>
        <Text style={styles.rowTitle}>{row.title}</Text>
        <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
      </View>
      <Text style={styles.transactionAmount}>{money(row.amount)}</Text>
      <View style={styles.transactionStatus}>
        <StatusPill label={row.status} tone={tone} />
        <Text style={styles.rowTime}>{row.time}</Text>
      </View>
      <ChevronRight color={COLORS.muted} size={22} />
    </Pressable>
  );
}

function StatusPill({ label, tone, icon: Icon }: { label: string; tone: Tone; icon?: IconComponent }) {
  const colors = toneColors(tone);
  return (
    <View style={[styles.statusPill, { backgroundColor: colors.bg }]}>
      {Icon ? <Icon color={colors.fg} size={15} /> : null}
      <Text style={[styles.statusPillText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

function BottomNav({ active, onChange }: { active: Exclude<AdminTab, "moderation">; onChange: (tab: AdminTab) => void }) {
  const items: { id: Exclude<AdminTab, "moderation">; label: string; icon: IconComponent }[] = [
    { id: "dashboard", label: "Home", icon: Home },
    { id: "orders", label: "Orders", icon: ClipboardList },
    { id: "users", label: "People", icon: Users },
    { id: "tickets", label: "Support", icon: Tag },
    { id: "more", label: "Reports", icon: MoreHorizontal },
  ];

  return (
    <View pointerEvents="box-none" style={styles.bottomNavWrap}>
      <View style={styles.bottomNav}>
        {items.map((item) => {
          const selected = active === item.id;
          const Icon = item.icon;
          return (
            <Pressable key={item.id} style={[styles.bottomNavItem, selected && styles.bottomNavItemActive]} onPress={() => onChange(item.id)}>
              <Icon color={selected ? COLORS.navy : COLORS.muted} size={29} strokeWidth={2.4} />
              <Text style={[styles.bottomNavText, selected && styles.bottomNavTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8f8ff",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  glowTopRight: {
    position: "absolute",
    top: -92,
    right: -78,
    width: 295,
    height: 295,
    borderRadius: 148,
    backgroundColor: "#e9ecff",
  },
  glowLeft: {
    position: "absolute",
    top: 280,
    left: -122,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: "#f0f2ff",
    opacity: 0.85,
  },
  glowBottomRight: {
    position: "absolute",
    bottom: 98,
    right: -60,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "#fff3ef",
    opacity: 0.75,
  },
  scrollContent: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 126,
  },
  scrollContentWide: {
    maxWidth: 460,
  },
  screen: {
    gap: 14,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: COLORS.muted,
    fontWeight: "800",
  },
  notice: {
    borderWidth: 1,
    borderColor: "#ffd99a",
    backgroundColor: "#fff7e8",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  noticeText: {
    color: "#965b00",
    fontWeight: "800",
  },
  broadcastPanel: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#dfe4f2",
    backgroundColor: "rgba(255,255,255,0.96)",
    padding: 14,
    marginBottom: 14,
    gap: 12,
    shadowColor: "#cdd4e8",
    shadowOpacity: 0.38,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  broadcastHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  broadcastIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  broadcastHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  broadcastKicker: {
    color: COLORS.purple,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  broadcastTitle: {
    color: COLORS.navy,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  broadcastCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f3f5fb",
    alignItems: "center",
    justifyContent: "center",
  },
  broadcastAudienceCard: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e4e8f5",
    backgroundColor: "#f8f9ff",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  broadcastAudienceText: {
    flex: 1,
    color: COLORS.navy,
    fontSize: 14,
    fontWeight: "900",
  },
  broadcastInput: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dfe4f2",
    backgroundColor: "#ffffff",
    paddingHorizontal: 13,
    color: COLORS.navy,
    fontSize: 15,
    fontWeight: "800",
  },
  broadcastMessageInput: {
    minHeight: 118,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: "top",
    lineHeight: 21,
  },
  broadcastChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  broadcastAudienceChip: {
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#dfe4f2",
    backgroundColor: "#ffffff",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  broadcastAudienceChipActive: {
    backgroundColor: COLORS.purple,
    borderColor: COLORS.purple,
  },
  broadcastAudienceChipText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  broadcastAudienceChipTextActive: {
    color: "#ffffff",
  },
  broadcastActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  broadcastPriorityButton: {
    flexGrow: 1,
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#c9cef8",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  broadcastPriorityButtonActive: {
    backgroundColor: COLORS.purple,
    borderColor: COLORS.purple,
  },
  broadcastPriorityText: {
    color: COLORS.purple,
    fontSize: 14,
    fontWeight: "900",
  },
  broadcastPriorityTextActive: {
    color: "#ffffff",
  },
  broadcastSendButton: {
    flexGrow: 1,
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  broadcastSendText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  headerRow: {
    minHeight: 105,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTextBlock: {
    flex: 1,
    paddingTop: 20,
  },
  screenTitle: {
    color: COLORS.navy,
    fontSize: 35,
    lineHeight: 39,
    fontWeight: "900",
    letterSpacing: 0,
  },
  screenSubtitle: {
    color: COLORS.muted,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "800",
    letterSpacing: 0,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 20,
  },
  bellButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#c6ccdf",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  bellDot: {
    position: "absolute",
    top: 18,
    right: 16,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#6763ff",
  },
  profileCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.9)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#cfd4e9",
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  avatarLarge: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: COLORS.faint,
  },
  profileCopy: {
    flex: 1,
    gap: 5,
  },
  greetingText: {
    color: COLORS.navy,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "900",
  },
  profileSubtitle: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
  },
  profileActionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  superAdminBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#e9e6ff",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  superAdminText: {
    color: COLORS.purple,
    fontWeight: "900",
    fontSize: 14,
  },
  adminProfileButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d8dcfb",
    backgroundColor: "#f7f6ff",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  adminProfileButtonText: {
    color: COLORS.purple,
    fontSize: 13,
    fontWeight: "900",
  },
  adminLogoutButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ffd4d7",
    backgroundColor: "#fff1f2",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  adminLogoutText: {
    color: COLORS.red,
    fontSize: 13,
    fontWeight: "900",
  },
  adminProfilePanel: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 14,
    gap: 13,
    shadowColor: "#d1d7eb",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  adminProfileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  adminAvatarPicker: {
    width: 82,
    height: 82,
    borderRadius: 41,
  },
  adminProfileAvatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: COLORS.faint,
  },
  adminAvatarCamera: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 31,
    height: 31,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#ffffff",
    backgroundColor: COLORS.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  adminProfileHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  adminProfileKicker: {
    color: COLORS.purple,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  adminProfileTitle: {
    color: COLORS.navy,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  adminProfileEmail: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  adminProfileNotice: {
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  adminProfileNoticeSuccess: {
    borderColor: "#cdebd8",
    backgroundColor: "#f0fbf5",
  },
  adminProfileNoticeError: {
    borderColor: "#ffd4d7",
    backgroundColor: "#fff1f2",
  },
  adminProfileNoticeText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  adminProfileNoticeTextSuccess: {
    color: COLORS.green,
  },
  adminProfileNoticeTextError: {
    color: COLORS.red,
  },
  adminProfileFields: {
    gap: 10,
  },
  adminProfileInput: {
    minHeight: 50,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fbfcff",
    paddingHorizontal: 13,
    color: COLORS.navy,
    fontSize: 15,
    fontWeight: "800",
  },
  adminProfileSaveButton: {
    minHeight: 48,
    borderRadius: 15,
    backgroundColor: COLORS.purple,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  adminProfileSaveText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  adminPasswordBox: {
    borderTopWidth: 1,
    borderTopColor: "#edf0f7",
    paddingTop: 12,
    gap: 10,
  },
  adminPasswordHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adminPasswordTitle: {
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "900",
  },
  adminPasswordButton: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#d8dcfb",
    backgroundColor: "#f7f6ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  adminPasswordButtonText: {
    color: COLORS.purple,
    fontSize: 14,
    fontWeight: "900",
  },
  startWorkflowCard: {
    minHeight: 126,
    borderRadius: 24,
    backgroundColor: COLORS.navy,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#061f63",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 5,
  },
  startWorkflowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  startWorkflowKicker: {
    color: "#bfc7ff",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  startWorkflowTitle: {
    color: "#ffffff",
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "900",
  },
  startWorkflowSub: {
    color: "#d9def7",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  startWorkflowBadge: {
    minWidth: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.purple,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  startWorkflowBadgeText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  workflowStack: {
    gap: 9,
  },
  workflowCard: {
    minHeight: 82,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  workflowCardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  workflowCardTitle: {
    color: COLORS.navy,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  workflowCardSub: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  workflowCountBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.purple,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  workflowCountBadgeClear: {
    backgroundColor: "#edf7f1",
  },
  workflowCountText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  workflowCountTextClear: {
    color: COLORS.green,
  },
  broadcastShortcut: {
    minHeight: 78,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#dfe4f2",
    backgroundColor: "#fff9ed",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  broadcastShortcutIcon: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: COLORS.orange,
    alignItems: "center",
    justifyContent: "center",
  },
  broadcastShortcutCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  broadcastShortcutTitle: {
    color: COLORS.navy,
    fontSize: 17,
    fontWeight: "900",
  },
  broadcastShortcutSub: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  miniStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  miniMetricCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 156,
    minHeight: 142,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 13,
    paddingVertical: 14,
    gap: 6,
    shadowColor: "#d8ddec",
    shadowOpacity: 0.26,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  iconBubble: {
    alignItems: "center",
    justifyContent: "center",
  },
  miniMetricValue: {
    color: COLORS.navy,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
  },
  miniMetricLabel: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    minHeight: 20,
  },
  trendWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  trendWrapCompact: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  trendText: {
    fontSize: 11,
    fontWeight: "800",
  },
  trendTextCompact: {
    fontSize: 12,
    fontWeight: "900",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
  },
  sectionTitleBlock: {
    flex: 1,
  },
  titleWithBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    color: COLORS.navy,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff0d6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  countBadgeText: {
    color: COLORS.orange,
    fontSize: 14,
    fontWeight: "900",
  },
  textButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  textButtonLabel: {
    color: COLORS.purple,
    fontSize: 17,
    fontWeight: "900",
  },
  periodPill: {
    alignSelf: "flex-start",
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.72)",
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  periodPillCompact: {
    minHeight: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
  },
  periodText: {
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "900",
  },
  snapshotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  snapshotCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 156,
    minHeight: 150,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.92)",
    padding: 12,
    gap: 6,
    shadowColor: "#d7dcea",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  snapshotLabel: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "800",
  },
  snapshotValue: {
    color: COLORS.navy,
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "900",
  },
  listCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 12,
    shadowColor: "#d5dae9",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  attentionRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#e7eaf3",
  },
  attentionCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowTitle: {
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "900",
  },
  tinyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  rowSubtitle: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  rowTime: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "800",
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickActionCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 156,
    minHeight: 106,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  quickLabel: {
    color: COLORS.navy,
    fontSize: 14,
    textAlign: "center",
    fontWeight: "900",
  },
  reportMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  reportMetricCard: {
    flexGrow: 1,
    flexBasis: "31%",
    minWidth: 142,
    minHeight: 140,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.92)",
    padding: 13,
    gap: 10,
  },
  reportMetricTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reportMetricLabel: {
    flex: 1,
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  reportMetricValue: {
    color: COLORS.navy,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "900",
  },
  chartCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.92)",
    padding: 14,
    gap: 14,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitleLarge: {
    color: COLORS.navy,
    fontSize: 20,
    fontWeight: "900",
  },
  chartArea: {
    height: 220,
    position: "relative",
    paddingLeft: 28,
    paddingTop: 8,
  },
  chartGridLine: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chartAxis: {
    position: "absolute",
    left: -2,
    color: "#53658d",
    fontWeight: "800",
    fontSize: 13,
  },
  chartDashed: {
    flex: 1,
    marginLeft: 28,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderTopColor: "#cfd6e8",
  },
  barsRow: {
    position: "absolute",
    left: 58,
    right: 10,
    bottom: 0,
    height: 180,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  barColumn: {
    alignItems: "center",
    gap: 8,
  },
  chartBar: {
    width: 17,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    backgroundColor: "#827bff",
    shadowColor: "#827bff",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  barLabel: {
    color: "#43577f",
    fontSize: 12,
    fontWeight: "800",
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.purple,
  },
  legendText: {
    color: "#53658d",
    fontWeight: "800",
  },
  payoutRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  payoutNameBlock: {
    flex: 1,
  },
  payoutAmountBlock: {
    alignItems: "flex-end",
    minWidth: 90,
  },
  payoutAmount: {
    color: COLORS.navy,
    fontSize: 17,
    fontWeight: "900",
  },
  payoutStatus: {
    fontSize: 13,
    fontWeight: "900",
  },
  transactionRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
  },
  transactionCopy: {
    flex: 1,
    minWidth: 0,
  },
  transactionAmount: {
    color: COLORS.navy,
    fontWeight: "900",
    fontSize: 14,
  },
  transactionStatus: {
    alignItems: "flex-end",
    gap: 3,
  },
  segmented: {
    minHeight: 64,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(235,237,248,0.78)",
    flexDirection: "row",
    padding: 5,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  segmentButtonActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#cbd2e4",
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  segmentText: {
    color: COLORS.muted,
    fontSize: 15,
    fontWeight: "900",
  },
  segmentTextActive: {
    color: COLORS.navy,
  },
  segmentBadge: {
    minWidth: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: COLORS.purple,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  segmentBadgeActive: {
    backgroundColor: COLORS.navy,
  },
  segmentBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  segmentBadgeTextActive: {
    color: "#ffffff",
  },
  orderMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  stackGap: {
    gap: 10,
  },
  orderCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 13,
    gap: 12,
  },
  orderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  orderBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: "#edf0f7",
    paddingTop: 10,
  },
  orderLeftRail: {
    alignItems: "center",
    gap: 0,
    width: 74,
  },
  categoryPill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: "900",
  },
  orderMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  orderTitle: {
    color: COLORS.navy,
    fontSize: 19,
    fontWeight: "900",
  },
  orderCustomer: {
    color: COLORS.muted,
    fontSize: 15,
    fontWeight: "800",
  },
  iconTextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  orderMeta: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  orderId: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 6,
  },
  orderTime: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  orderAmount: {
    color: COLORS.navy,
    fontSize: 21,
    fontWeight: "900",
  },
  outlineAction: {
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1.4,
    borderColor: COLORS.purple,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  outlineActionText: {
    color: COLORS.purple,
    fontWeight: "900",
    fontSize: 14,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchBox: {
    flex: 1,
    minHeight: 58,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.88)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 15,
  },
  searchInput: {
    flex: 1,
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "700",
    paddingVertical: 0,
  },
  filterButton: {
    width: 58,
    height: 58,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.88)",
    alignItems: "center",
    justifyContent: "center",
  },
  userChipScroller: {
    gap: 8,
    paddingRight: 20,
  },
  roleFilterChip: {
    minHeight: 45,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.86)",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roleFilterChipActive: {
    backgroundColor: COLORS.purple,
    borderColor: COLORS.purple,
  },
  roleFilterText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "900",
  },
  roleFilterTextActive: {
    color: "#fff",
  },
  statusFilterChip: {
    minHeight: 40,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.86)",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  statusFilterText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  inviteButton: {
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.78)",
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inviteButtonText: {
    color: COLORS.purple,
    fontSize: 15,
    fontWeight: "900",
  },
  invitePanel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 14,
    gap: 10,
  },
  invitePanelTitle: {
    color: COLORS.navy,
    fontSize: 18,
    fontWeight: "900",
  },
  invitePanelSub: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  inviteInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fbfcff",
    paddingHorizontal: 13,
    color: COLORS.navy,
    fontSize: 15,
    fontWeight: "800",
  },
  inviteRoleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  inviteRoleChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inviteRoleChipActive: {
    backgroundColor: COLORS.purple,
    borderColor: COLORS.purple,
  },
  inviteRoleText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "900",
  },
  inviteRoleTextActive: {
    color: "#fff",
  },
  inviteSubmitButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.purple,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  inviteSubmitText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  admissionPanel: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#dfe4f2",
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 14,
    gap: 12,
    shadowColor: "#d5dae9",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  admissionPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  admissionTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  admissionKicker: {
    color: COLORS.purple,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  admissionTitle: {
    color: COLORS.navy,
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 25,
  },
  admissionSub: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  admissionCountBadge: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.purple,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  admissionCountText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  admissionEmpty: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbeee4",
    backgroundColor: "#f0fbf5",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  admissionEmptyText: {
    flex: 1,
    color: "#168653",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  workflowNextButton: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#d8dcfb",
    backgroundColor: "#f7f6ff",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  workflowNextText: {
    color: COLORS.purple,
    fontSize: 14,
    fontWeight: "900",
  },
  activeFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  peopleSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  peopleEmptyCard: {
    minHeight: 86,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.9)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  peopleEmptyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  peopleEmptyTitle: {
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "900",
  },
  peopleEmptyText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  emptyQueueCard: {
    minHeight: 126,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.92)",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    shadowColor: "#d5dae9",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  emptyQueueCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  emptyQueueTitle: {
    color: COLORS.navy,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  emptyQueueText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  twoMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  wideMetricCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minWidth: 160,
    minHeight: 128,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.92)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  wideMetricCopy: {
    flex: 1,
    gap: 4,
  },
  wideMetricValue: {
    color: COLORS.navy,
    fontSize: 25,
    fontWeight: "900",
  },
  applicationReviewCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: "#fbfcff",
    padding: 12,
    gap: 11,
  },
  applicationReviewTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  applicationIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  applicationReviewCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  applicationReviewTitle: {
    color: COLORS.navy,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  applicationReviewSub: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "800",
  },
  applicationMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  applicationMetaPill: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#e7eaf3",
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  applicationMetaText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  applicationDetailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  applicationDetailChip: {
    flexGrow: 1,
    flexBasis: "31%",
    minWidth: 116,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e7eaf3",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  applicationDetailKey: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  applicationDetailValue: {
    color: COLORS.navy,
    fontSize: 13,
    fontWeight: "900",
  },
  applicationActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  applicationGhostButton: {
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#c9cef8",
    backgroundColor: "#ffffff",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  applicationGhostText: {
    color: COLORS.purple,
    fontSize: 14,
    fontWeight: "900",
  },
  applicationDecisionButton: {
    flexGrow: 1,
    minHeight: 44,
    borderRadius: 13,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  applicationDeclineButton: {
    backgroundColor: "#ffe7e8",
  },
  applicationApproveButton: {
    backgroundColor: COLORS.green,
  },
  applicationDeclineText: {
    color: COLORS.red,
    fontSize: 14,
    fontWeight: "900",
  },
  applicationApproveText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  applicationModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(6, 14, 38, 0.58)",
    paddingHorizontal: 14,
    paddingVertical: 24,
    justifyContent: "center",
  },
  applicationModalSheet: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "88%",
    alignSelf: "center",
    borderRadius: 26,
    backgroundColor: "#ffffff",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    shadowColor: "#07112d",
    shadowOpacity: 0.26,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  applicationModalHandle: {
    width: 46,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#dfe4f2",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 2,
  },
  applicationModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  applicationModalIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  applicationModalTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  applicationModalKicker: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  applicationModalTitle: {
    color: COLORS.navy,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  applicationModalSub: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  applicationModalClose: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#e2e7f4",
    backgroundColor: "#f8f9fe",
    alignItems: "center",
    justifyContent: "center",
  },
  applicationApplicantPanel: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e6eaf6",
    backgroundColor: "#f7f9ff",
    padding: 14,
    gap: 12,
  },
  applicationApplicantName: {
    color: COLORS.navy,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  applicationIdentityGrid: {
    gap: 8,
  },
  applicationIdentityRow: {
    minHeight: 32,
    borderRadius: 11,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  applicationIdentityText: {
    flex: 1,
    minWidth: 0,
    color: "#445075",
    fontSize: 13,
    fontWeight: "800",
  },
  applicationModalStats: {
    flexDirection: "row",
    gap: 8,
  },
  detailSheetSummaryGrid: {
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  detailSheetSummaryItem: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: "#f7f9ff",
    borderWidth: 1,
    borderColor: "#e6eaf6",
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
    gap: 2,
  },
  applicationModalStat: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e6eaf6",
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
    gap: 2,
  },
  applicationModalStatValue: {
    color: COLORS.navy,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
  },
  applicationModalStatLabel: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  applicationModalScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  applicationModalScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 12,
  },
  applicationModalSection: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e6eaf6",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  applicationModalSectionTitle: {
    color: COLORS.navy,
    fontSize: 15,
    fontWeight: "900",
    backgroundColor: "#f7f9ff",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  applicationModalRows: {
    paddingHorizontal: 13,
  },
  applicationModalDetailRow: {
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: "#edf0f7",
    gap: 4,
  },
  applicationModalDetailLabel: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  applicationModalDetailValue: {
    color: COLORS.navy,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
  },
  applicationModalEmpty: {
    minHeight: 132,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e6eaf6",
    backgroundColor: "#f7f9ff",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    gap: 6,
  },
  applicationModalEmptyTitle: {
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "900",
  },
  applicationModalEmptyText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  applicationModalFooter: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#edf0f7",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    gap: 10,
  },
  detailSheetFooter: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#edf0f7",
    backgroundColor: "#ffffff",
  },
  detailSheetDoneButton: {
    minHeight: 50,
    borderRadius: 15,
    backgroundColor: COLORS.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  detailSheetDoneText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  applicationModalDecision: {
    flex: 1,
    minHeight: 50,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  applicationModalDecline: {
    backgroundColor: "#ffe7e8",
  },
  applicationModalApprove: {
    backgroundColor: COLORS.green,
  },
  applicationModalDeclineText: {
    color: COLORS.red,
    fontSize: 15,
    fontWeight: "900",
  },
  applicationModalApproveText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  userCard: {
    minHeight: 104,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  userAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: COLORS.faint,
  },
  userMain: {
    flex: 1,
    minWidth: 132,
    gap: 4,
  },
  userName: {
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "900",
  },
  userPhone: {
    color: COLORS.muted,
    fontSize: 15,
    fontWeight: "700",
  },
  roleBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: "900",
  },
  userRightColumn: {
    alignItems: "flex-end",
    gap: 7,
    width: 118,
  },
  userJoined: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  userButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  userActionButton: {
    minWidth: 78,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  userActionText: {
    color: COLORS.purple,
    fontSize: 16,
    fontWeight: "900",
  },
  userIconButton: {
    width: 34,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  marketAdminSection: {
    gap: 12,
  },
  marketSearchBox: {
    minHeight: 52,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  marketSearchInput: {
    flex: 1,
    minWidth: 0,
    color: COLORS.navy,
    fontSize: 15,
    fontWeight: "800",
  },
  marketAdminCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 12,
    gap: 12,
  },
  marketAdminTop: {
    flexDirection: "row",
    gap: 12,
  },
  marketAdminImage: {
    width: 92,
    height: 104,
    borderRadius: 13,
    backgroundColor: COLORS.faint,
  },
  marketAdminCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  marketAdminTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  marketAdminTitle: {
    flex: 1,
    minWidth: 0,
    color: COLORS.navy,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  marketAdminPrice: {
    color: COLORS.green,
    fontSize: 17,
    fontWeight: "900",
  },
  marketAdminMeta: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  marketAdminActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  marketSmallAction: {
    flexGrow: 1,
    minWidth: 76,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  marketNeutralAction: {
    borderColor: COLORS.border,
    backgroundColor: "#fbfcff",
  },
  marketNeutralActionText: {
    color: COLORS.navy,
    fontSize: 13,
    fontWeight: "900",
  },
  marketLiveAction: {
    borderColor: "#ccebd8",
    backgroundColor: "#edf9f2",
  },
  marketLiveActionText: {
    color: COLORS.green,
    fontSize: 13,
    fontWeight: "900",
  },
  marketHideAction: {
    borderColor: "#ffe0a8",
    backgroundColor: "#fff7e8",
  },
  marketHideActionText: {
    color: COLORS.orange,
    fontSize: 13,
    fontWeight: "900",
  },
  marketDeleteAction: {
    borderColor: "#ffd4d7",
    backgroundColor: "#fff1f2",
  },
  marketDeleteActionText: {
    color: COLORS.red,
    fontSize: 13,
    fontWeight: "900",
  },
  marketEditPanel: {
    borderTopWidth: 1,
    borderTopColor: "#edf0f7",
    paddingTop: 12,
    gap: 10,
  },
  marketEditInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#fbfcff",
    paddingHorizontal: 12,
    color: COLORS.navy,
    fontSize: 14,
    fontWeight: "800",
  },
  marketEditRow: {
    flexDirection: "row",
    gap: 8,
  },
  marketEditHalfInput: {
    flex: 1,
    minWidth: 0,
  },
  marketEditDescription: {
    minHeight: 92,
    paddingTop: 11,
    paddingBottom: 11,
    textAlignVertical: "top",
    lineHeight: 20,
  },
  marketLiveToggle: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ccebd8",
    backgroundColor: "#f4fbf7",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  marketLiveToggleActive: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  marketLiveToggleText: {
    color: COLORS.green,
    fontSize: 14,
    fontWeight: "900",
  },
  marketLiveToggleTextActive: {
    color: "#ffffff",
  },
  marketEditActions: {
    flexDirection: "row",
    gap: 8,
  },
  marketPrimaryAction: {
    borderColor: COLORS.purple,
    backgroundColor: COLORS.purple,
  },
  marketPrimaryActionText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  reviewMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  reviewCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 10,
    gap: 10,
  },
  reviewImage: {
    position: "absolute",
    left: 10,
    top: 20,
    width: 88,
    height: 88,
    borderRadius: 13,
    backgroundColor: COLORS.faint,
  },
  reviewMain: {
    minHeight: 126,
    paddingLeft: 108,
    gap: 5,
  },
  reviewTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reviewTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  reviewTitle: {
    color: COLORS.navy,
    fontSize: 18,
    fontWeight: "900",
  },
  reviewSubtitle: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "800",
  },
  reviewMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  reviewMetaText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  reviewActions: {
    flexDirection: "row",
    gap: 8,
  },
  reviewActionButton: {
    flex: 1,
    height: 50,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  reviewApprove: {
    backgroundColor: "#e8f7ef",
  },
  reviewReject: {
    backgroundColor: "#ffe7e8",
  },
  reviewFlag: {
    backgroundColor: "#efedff",
  },
  reviewApproveText: {
    color: COLORS.green,
    fontSize: 16,
    fontWeight: "900",
  },
  reviewRejectText: {
    color: COLORS.red,
    fontSize: 16,
    fontWeight: "900",
  },
  reviewFlagText: {
    color: COLORS.purple,
    fontSize: 16,
    fontWeight: "900",
  },
  ticketCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.94)",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
  },
  ticketMain: {
    flex: 1,
    minWidth: 185,
    gap: 5,
  },
  ticketTitle: {
    color: COLORS.navy,
    fontSize: 18,
    fontWeight: "900",
  },
  ticketDescription: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  reporterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  reporterAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  reporterName: {
    color: COLORS.navy,
    fontSize: 13,
    fontWeight: "900",
  },
  reporterId: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  ticketSide: {
    width: 92,
    gap: 12,
    borderLeftWidth: 1,
    borderLeftColor: "#e7eaf3",
    paddingLeft: 12,
  },
  ticketSideText: {
    color: COLORS.navy,
    fontSize: 14,
    fontWeight: "900",
  },
  ticketTime: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  ticketActions: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  ticketOutlineButton: {
    flex: 1,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#b9b4ff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ticketOutlineText: {
    color: COLORS.purple,
    fontSize: 15,
    fontWeight: "900",
  },
  ticketPrimaryButton: {
    flex: 1,
    height: 44,
    borderRadius: 13,
    backgroundColor: COLORS.purple,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ticketPrimaryText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  statusPill: {
    alignSelf: "flex-start",
    minHeight: 28,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: "900",
  },
  disabledButton: {
    opacity: 0.55,
  },
  disabledText: {
    color: "#a7cdb8",
  },
  bottomNavWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: 11,
    paddingBottom: 8,
  },
  bottomNav: {
    width: "100%",
    maxWidth: 430,
    minHeight: 82,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.94)",
    flexDirection: "row",
    padding: 6,
    shadowColor: "#cbd1e3",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -2 },
    elevation: 10,
  },
  bottomNavItem: {
    flex: 1,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  bottomNavItemActive: {
    backgroundColor: "#e6e8f1",
  },
  bottomNavText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  bottomNavTextActive: {
    color: COLORS.navy,
  },
});
