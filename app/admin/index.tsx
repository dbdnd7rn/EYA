import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
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
  Flag,
  Headphones,
  Home,
  MapPin,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldPlus,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Tag,
  Ticket,
  Truck,
  User,
  UserCheck,
  UserPlus,
  Users,
  UtensilsCrossed,
  Wallet,
  WalletCards,
  XCircle,
} from "lucide-react-native";
import {
  assignAdminDriver,
  broadcastAdminNotification,
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
type Tone = "blue" | "green" | "orange" | "purple" | "red" | "neutral";
type TrendDirection = "up" | "down";
type TrustReport = Awaited<ReturnType<typeof listTrustSafetyReportsForAdmin>>[number];
type AdminMetrics = {
  paidRevenue: number;
  weeklyRevenue: number;
  failedPayments: number;
  activeOrders: number;
  activeDeliveries: number;
  pendingApplications: number;
  openTickets: number;
  pendingReviews: number;
  totalUsers: number;
  newUsers: number;
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

const SAMPLE_ORDERS: DemoOrder[] = [
  {
    id: "EYA-ORD-7842",
    merchant: "Chitenje Grill",
    customer: "John Banda",
    location: "Chitenje Campus",
    type: "food",
    total: 6500,
    status: "preparing",
    createdAt: "Today, 4:35 PM",
  },
  {
    id: "EYA-ORD-7841",
    merchant: "Campus Mart",
    customer: "Grace Phiri",
    location: "Polytechnic Campus",
    type: "market",
    total: 12800,
    status: "on_the_way",
    createdAt: "Today, 4:10 PM",
  },
  {
    id: "EYA-ORD-7840",
    merchant: "Lecture Room B205",
    customer: "Mike Kalenga",
    location: "Main Campus",
    type: "room",
    total: 3000,
    status: "awaiting_agent",
    createdAt: "Today, 3:45 PM",
  },
  {
    id: "EYA-ORD-7839",
    merchant: "Stationery Hub",
    customer: "Patricia Msewa",
    location: "Chancellor College",
    type: "market",
    total: 4200,
    status: "issue",
    createdAt: "Today, 3:20 PM",
  },
  {
    id: "EYA-ORD-7838",
    merchant: "Cafe 247",
    customer: "Blessing Nyirenda",
    location: "Science Campus",
    type: "food",
    total: 5750,
    status: "preparing",
    createdAt: "Today, 2:55 PM",
  },
];

const SAMPLE_USERS: DemoUser[] = [
  {
    id: "demo-user-1",
    name: "Chikondi Banda",
    phone: "0888 123 456",
    role: "landlord",
    status: "verified",
    joined: "Joined 2h ago",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: "demo-user-2",
    name: "Thandiwe Kamanga",
    phone: "0999 987 654",
    role: "restaurant",
    status: "pending",
    joined: "Joined 4h ago",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: "demo-user-3",
    name: "Emmanuel Phiri",
    phone: "0881 555 321",
    role: "student",
    status: "verified",
    joined: "Joined 6h ago",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: "demo-user-4",
    name: "Lindiwe Mvula",
    phone: "0994 222 111",
    role: "agent",
    status: "suspended",
    joined: "Suspended 1d ago",
    avatar: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: "demo-user-5",
    name: "Blessings Zulu",
    phone: "0884 444 777",
    role: "seller",
    status: "pending",
    joined: "Joined 1d ago",
    avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80",
  },
  {
    id: "demo-user-6",
    name: "Patrick Mwale",
    phone: "0991 333 888",
    role: "landlord",
    status: "verified",
    joined: "Joined 2d ago",
    avatar: "https://images.unsplash.com/photo-1507591064344-4c6ce005b128?auto=format&fit=crop&w=200&q=80",
  },
];

const SAMPLE_TICKETS: DemoTicket[] = [
  {
    id: "demo-ticket-1",
    title: "Fraud report",
    description: "User reported suspicious activity and possible fraud.",
    reporter: "Daniel Mwangi",
    reporterId: "EYA-78451",
    category: "Trust & Safety",
    priority: "High",
    type: "payments",
    createdAt: "10m ago",
    status: "urgent",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "demo-ticket-2",
    title: "Payment not received",
    description: "Customer was charged but payment not reflected in wallet.",
    reporter: "Amina Yusuf",
    reporterId: "EYA-23109",
    category: "Support",
    priority: "High",
    type: "payments",
    createdAt: "25m ago",
    status: "urgent",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "demo-ticket-3",
    title: "Room not as described",
    description: "Guest reported that the room condition was different.",
    reporter: "Mercy Achieng",
    reporterId: "RM-99823",
    category: "Support",
    priority: "Medium",
    type: "rooms",
    createdAt: "1h ago",
    status: "open",
    avatar: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "demo-ticket-4",
    title: "Order delivered late",
    description: "Customer received order 2 hours later than expected.",
    reporter: "Brian Otieno",
    reporterId: "FD-44211",
    category: "Support",
    priority: "Medium",
    type: "food",
    createdAt: "2h ago",
    status: "open",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80",
  },
  {
    id: "demo-ticket-5",
    title: "Item not received",
    description: "User has not received the item since order was completed.",
    reporter: "Gifty Banda",
    reporterId: "MK-88731",
    category: "Support",
    priority: "Medium",
    type: "market",
    createdAt: "3h ago",
    status: "open",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80",
  },
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

const REVENUE_BARS = [0.9, 1.65, 2.0, 2.2, 1.6, 0.9, 1.3];
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

function paymentSucceeded(payment: AdminPaymentSummary) {
  return ["paid", "success", "successful", "succeeded", "completed"].includes(String(payment.status).toLowerCase());
}

function paymentFailed(payment: AdminPaymentSummary) {
  return ["failed", "cancelled", "error"].includes(String(payment.status).toLowerCase());
}

function matchesQuery(query: string, ...values: unknown[]) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T) {
  return result.status === "fulfilled" ? result.value : fallback;
}

export default function AdminPortalPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user, session } = useAuth();
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
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("EYA admin notice");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState<AdminBroadcastAudience>("all");
  const [broadcastImportant, setBroadcastImportant] = useState(true);

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

  const [demoOrders, setDemoOrders] = useState(SAMPLE_ORDERS);
  const [demoUsers, setDemoUsers] = useState(SAMPLE_USERS);
  const [demoTickets, setDemoTickets] = useState(SAMPLE_TICKETS);
  const [demoReviews, setDemoReviews] = useState(SAMPLE_REVIEW_ITEMS);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setRefreshing(true);
    try {
      const [
        orderResult,
        paymentResult,
        userResult,
        vendorResult,
        catalogResult,
        housingResult,
        supportResult,
        reportResult,
        applicationResult,
        driverResult,
      ] = await Promise.allSettled([
        listAdminOrders({ userId: user.id, accessToken, limit: 200 }),
        listAdminPayments({ userId: user.id, accessToken, limit: 200 }),
        listAdminUsers({ userId: user.id, accessToken, limit: 240 }),
        listAdminVendors({ userId: user.id, accessToken, limit: 240 }),
        listAdminCatalogItems({ userId: user.id, accessToken, limit: 260 }),
        listAdminHousingListings({ userId: user.id, accessToken, limit: 260 }),
        listAdminSupportTickets({ userId: user.id, accessToken, limit: 200 }),
        listTrustSafetyReportsForAdmin(),
        listRoleApplicationsForAdmin(),
        supabase.from("profiles").select("id,full_name,first_name,last_name,email,role").in("role", ["agent", "admin"]).limit(120),
      ]);

      setOrders(settledValue(orderResult, []));
      setPayments(settledValue(paymentResult, []));
      setUsers(settledValue(userResult, []));
      setVendors(settledValue(vendorResult, []));
      setCatalog(settledValue(catalogResult, []));
      setHousing(settledValue(housingResult, []));
      setSupportTickets(settledValue(supportResult, []));
      setTrustReports(settledValue(reportResult, []));
      setRoleApplications(settledValue(applicationResult, []));

      const driverRows =
        driverResult.status === "fulfilled" && !driverResult.value.error ? driverResult.value.data ?? [] : [];
      setDrivers(
        driverRows.map((row: any) => ({
          id: String(row.id),
          name: String(row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || row.id),
        })),
      );

      const failed = [
        orderResult,
        paymentResult,
        userResult,
        vendorResult,
        catalogResult,
        housingResult,
        supportResult,
        reportResult,
        applicationResult,
      ].filter((result) => result.status === "rejected").length;
      setMessage(failed ? `${failed} admin source${failed === 1 ? "" : "s"} could not load.` : null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Admin data could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const profileName = useMemo(() => {
    const self = users.find((row) => row.id === user?.id);
    return (self ? fullName(self) : null) || user?.user_metadata?.full_name || user?.email || "Amen";
  }, [user?.email, user?.id, user?.user_metadata?.full_name, users]);

  const avatarUrl = String(user?.user_metadata?.avatar_url || "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80");

  const metrics = useMemo(() => {
    const paidRevenue = payments.filter(paymentSucceeded).reduce((sum, payment) => sum + Number(payment.amount_mwk ?? 0), 0);
    const failedPayments = payments.filter(paymentFailed).length;
    const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.status)).length || demoOrders.filter((order) => !["delivered", "cancelled"].includes(String(order.status))).length;
    const pendingApplications = roleApplications.filter((row) => row.status === "pending").length || demoUsers.filter((row) => row.status === "pending").length;
    const openTickets = supportTickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status.toLowerCase())).length || demoTickets.filter((ticket) => ticket.status !== "resolved").length;
    const activeDeliveries = orders.filter((order) => ["assigned", "picked_up", "arriving"].includes(String(order.delivery?.status))).length || 86;
    const pendingReviews =
      housing.filter((row) => !row.is_active).length +
        catalog.filter((row) => !row.is_active).length +
        trustReports.filter((row: any) => ["open", "in_review"].includes(String(row.status).toLowerCase())).length || demoReviews.filter((row) => row.status !== "approved").length;
    const totalUsers = users.length || 126;
    return {
      paidRevenue: paidRevenue || 2450000,
      weeklyRevenue: paidRevenue || 8400000,
      failedPayments: failedPayments || 9,
      activeOrders,
      activeDeliveries,
      pendingApplications,
      openTickets,
      pendingReviews,
      totalUsers,
      newUsers: users.filter((row) => {
        if (!row.created_at) return false;
        return Date.now() - new Date(row.created_at).getTime() < 1000 * 60 * 60 * 24;
      }).length || 32,
    };
  }, [catalog, demoOrders, demoReviews, demoTickets, demoUsers, housing, orders, payments, roleApplications, supportTickets, trustReports, users]);

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
  const displayedOrders = liveOrders.length ? liveOrders : demoOrders;

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
      image: row.image_url || SAMPLE_REVIEW_ITEMS[(index + 1) % SAMPLE_REVIEW_ITEMS.length].image,
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
    return rows.length ? rows : demoReviews;
  }, [catalog, demoReviews, housing, trustReports, vendors]);

  const displayedUsers = useMemo(() => {
    if (!users.length && !roleApplications.length) return demoUsers;
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
  }, [demoUsers, roleApplications, users]);

  const displayedTickets = useMemo<DemoTicket[]>(() => {
    if (!supportTickets.length && !trustReports.length) return demoTickets;
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
  }, [demoTickets, supportTickets, trustReports]);

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
      if (!user?.id) return;
      setWorkingKey(key);
      try {
        await action(user.id, accessToken);
        await load();
      } catch (error) {
        Alert.alert("Admin action failed", error instanceof Error ? error.message : "The request could not be completed.");
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
        setDemoOrders((current) =>
          current.map((order) => {
            if (order.id !== row.id) return order;
            if (order.status === "issue") return { ...order, status: "preparing" };
            if (order.status === "awaiting_agent") return { ...order, status: "on_the_way" };
            return { ...order, status: nextStatus(order.status as AdminOrderStatus) };
          }),
        );
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
        setDemoOrders((current) => current.map((order) => (order.id === row.id ? { ...order, status: "on_the_way" } : order)));
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

      setDemoUsers((current) => current.map((entry) => (entry.id === row.id ? { ...entry, status: "verified" } : entry)));
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
    Alert.alert(
      row.name,
      [
        `Role: ${roleLabel(row.role)}`,
        `Status: ${titleCase(row.status)}`,
        `Contact: ${row.phone}`,
        liveUser ? `Orders: ${liveUser.order_count}` : null,
        liveUser ? `Listings: ${liveUser.listing_count}` : null,
        liveUser ? `Vendors: ${liveUser.vendor_count}` : null,
        application ? `Application: ${titleCase(application.status)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }, [roleApplications, users]);

  const handleTicketStatus = useCallback(
    (row: DemoTicket, status: "open" | "pending" | "resolved") => {
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

      setDemoTickets((current) =>
        current.map((ticket) =>
          ticket.id === row.id ? { ...ticket, status: status === "resolved" ? "resolved" : "open" } : ticket,
        ),
      );
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

      setDemoReviews((current) =>
        current.map((entry) =>
          entry.id === row.id
            ? { ...entry, status: action === "approve" ? "approved" : action === "reject" ? "needs_details" : "flagged" }
            : entry,
        ),
      );
    },
    [catalog, housing, runAdminAction, trustReports],
  );

  const handleBroadcast = useCallback(() => {
    setBroadcastOpen(true);
  }, []);

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
          />
        ) : null}

        {activeTab === "more" ? (
          <ReportsScreen
            metrics={metrics}
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
            filter={reviewFilter}
            items={reviewItems.filter((item) => item.filter === reviewFilter)}
            metrics={metrics}
            workingKey={workingKey}
            onAction={handleReviewAction}
            onBell={() => router.push("/admin/notifications")}
            onFilter={setReviewFilter}
          />
        ) : null}
      </ScrollView>
      <BottomNav active={bottomActive} onChange={setActiveTab} />
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

function DashboardScreen({
  avatarUrl,
  firstName,
  metrics,
  profileName,
  unreadCount,
  onBell,
  onBroadcast,
  onGo,
}: {
  avatarUrl: string;
  firstName: string;
  metrics: AdminMetrics;
  profileName: string;
  unreadCount: number;
  onBell: () => void;
  onBroadcast: () => void;
  onGo: (tab: AdminTab) => void;
}) {
  const attentionRows = [
    {
      title: "Landlord Verification",
      subtitle: "3 new landlords awaiting verification",
      time: "10m ago",
      icon: User,
      tone: "orange" as Tone,
      target: "users" as AdminTab,
    },
    {
      title: "Restaurant Approval",
      subtitle: "2 restaurants awaiting approval",
      time: "25m ago",
      icon: Store,
      tone: "green" as Tone,
      target: "moderation" as AdminTab,
    },
    {
      title: "Flagged Listing",
      subtitle: "1 listing reported for review",
      time: "1h ago",
      icon: Flag,
      tone: "red" as Tone,
      target: "moderation" as AdminTab,
    },
    {
      title: "Urgent Support Ticket",
      subtitle: "Payment issue from Chitedze Hostel",
      time: "2h ago",
      icon: Headphones,
      tone: "purple" as Tone,
      target: "tickets" as AdminTab,
    },
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Admin" subtitle="Control Center" unreadCount={unreadCount} onBell={onBell} />

      <View style={styles.profileCard}>
        <Image source={{ uri: avatarUrl }} style={styles.avatarLarge} />
        <View style={styles.profileCopy}>
          <Text style={styles.greetingText}>{greeting()}, {firstName}</Text>
          <Text style={styles.profileSubtitle}>{"Here's what's happening across EYA today."}</Text>
          <View style={styles.superAdminBadge}>
            <ShieldCheck color={COLORS.purple} size={17} strokeWidth={2.4} />
            <Text style={styles.superAdminText}>Super Admin</Text>
          </View>
        </View>
      </View>

      <View style={styles.miniStatsGrid}>
        <MiniMetricCard icon={Briefcase} tone="blue" value="1,248" label="Total Orders" trend="12% vs yesterday" direction="up" onPress={() => onGo("orders")} />
        <MiniMetricCard icon={Truck} tone="green" value={String(metrics.activeDeliveries)} label="Active Deliveries" trend="8% vs yesterday" direction="up" onPress={() => onGo("orders")} />
        <MiniMetricCard icon={Tag} tone="orange" value={String(metrics.openTickets)} label="Open Tickets" trend="15% vs yesterday" direction="down" onPress={() => onGo("tickets")} />
        <MiniMetricCard icon={ClipboardCheck} tone="purple" value={String(metrics.pendingApplications)} label="Pending Approvals" trend="5% vs yesterday" direction="up" onPress={() => onGo("users")} />
      </View>

      <SectionHeading title="Today's Snapshot" subtitle="Key metrics at a glance" trailing={<PeriodPill label="Today" />} />
      <View style={styles.snapshotGrid}>
        <SnapshotCard icon={ShieldCheck} tone="green" label="Revenue Today" value={compactMoney(metrics.paidRevenue)} trend="14% vs yesterday" direction="up" />
        <SnapshotCard icon={Users} tone="blue" label="New Users" value={String(metrics.newUsers)} trend="18% vs yesterday" direction="up" />
        <SnapshotCard icon={CreditCard} tone="orange" label="Failed Payments" value={String(metrics.failedPayments)} trend="29% vs yesterday" direction="down" />
      </View>

      <SectionHeading
        title="Needs Attention"
        subtitle="Actions require your review"
        badge={String(attentionRows.length)}
        trailing={<TextButton label="View all" onPress={() => onGo("moderation")} />}
      />
      <View style={styles.listCard}>
        {attentionRows.map((row, index) => (
          <AttentionRow
            key={row.title}
            divider={index < attentionRows.length - 1}
            icon={row.icon}
            subtitle={row.subtitle}
            time={row.time}
            title={row.title}
            tone={row.tone}
            onPress={() => onGo(row.target)}
          />
        ))}
      </View>

      <SectionHeading title="Quick Actions" subtitle="Common admin tasks" />
      <View style={styles.quickGrid}>
        <QuickAction icon={ShieldCheck} label="Approve Roles" tone="purple" onPress={() => onGo("users")} />
        <QuickAction icon={Briefcase} label="View Orders" tone="blue" onPress={() => onGo("orders")} />
        <QuickAction icon={Users} label="Manage Users" tone="green" onPress={() => onGo("users")} />
        <QuickAction icon={Megaphone} label="Send Notice" tone="orange" onPress={onBroadcast} />
      </View>
    </View>
  );
}

function ReportsScreen({
  metrics,
  payments,
  vendors,
  unreadCount,
  onBell,
  onRefresh,
}: {
  metrics: AdminMetrics;
  payments: AdminPaymentSummary[];
  vendors: AdminVendorSummary[];
  unreadCount: number;
  onBell: () => void;
  onRefresh: () => void;
}) {
  const [showAllPayouts, setShowAllPayouts] = useState(false);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const payoutRows = (vendors.length ? vendors.slice(0, 4) : []).map((vendor, index) => ({
    id: vendor.id,
    name: vendor.name,
    subtitle: vendor.supports_food ? "Restaurant" : "Vendor",
    role: vendor.supports_food ? "Restaurant" : "Seller",
    amount: [1250000, 950000, 320000, 600000][index] ?? 250000,
    status: index === 1 ? "Under Review" : index === 3 ? "On Hold" : "Ready",
    icon: vendor.supports_food ? UtensilsCrossed : Briefcase,
    tone: vendor.supports_food ? ("orange" as Tone) : ("purple" as Tone),
  }));
  const finalPayoutRows =
    payoutRows.length > 0
      ? payoutRows
      : [
          { id: "p1", name: "Chikondi Phiri", subtitle: "City Apartments", role: "Landlord", amount: 1250000, status: "Ready", icon: Home, tone: "green" as Tone },
          { id: "p2", name: "Taste of Malawi", subtitle: "Restaurant", role: "Restaurant", amount: 950000, status: "Under Review", icon: UtensilsCrossed, tone: "orange" as Tone },
          { id: "p3", name: "Green Leaf Produce", subtitle: "Vendor", role: "Seller", amount: 320000, status: "Ready", icon: Briefcase, tone: "purple" as Tone },
          { id: "p4", name: "Bright Homes Agency", subtitle: "Agency", role: "Agent", amount: 600000, status: "On Hold", icon: User, tone: "blue" as Tone },
          { id: "p5", name: "Mwayi Groceries", subtitle: "Campus shop", role: "Seller", amount: 280000, status: "Ready", icon: Store, tone: "green" as Tone },
          { id: "p6", name: "Mponela Rooms", subtitle: "Student housing", role: "Landlord", amount: 720000, status: "Under Review", icon: Home, tone: "orange" as Tone },
        ];

  const transactions =
    payments.length > 0
      ? payments.slice(0, 3).map((payment) => ({
          id: payment.id,
          title: payment.title || payment.reference || "Payment",
          subtitle: paymentSucceeded(payment) ? "Payment received" : paymentFailed(payment) ? "Payment failed" : "Payment processing",
          amount: Number(payment.amount_mwk ?? 0),
          status: paymentSucceeded(payment) ? "Completed" : paymentFailed(payment) ? "Failed" : "Processing",
          time: relativeTime(payment.created_at),
        }))
      : [
          { id: "t1", title: "Order #EYA-94821", subtitle: "Payment received", amount: 150000, status: "Completed", time: "10m ago" },
          { id: "t2", title: "Payout to Chikondi Phiri", subtitle: "Payout initiated", amount: 1250000, status: "Processing", time: "25m ago" },
          { id: "t3", title: "Payment failure - Order #EYA-94710", subtitle: "Card declined", amount: 35000, status: "Failed", time: "1h ago" },
          { id: "t4", title: "Order #EYA-94803", subtitle: "Payment received", amount: 87500, status: "Completed", time: "2h ago" },
          { id: "t5", title: "Payout to Taste of Malawi", subtitle: "Payout queued", amount: 950000, status: "Processing", time: "3h ago" },
        ];
  const visiblePayoutRows = showAllPayouts ? finalPayoutRows : finalPayoutRows.slice(0, 4);
  const visibleTransactions = showAllTransactions ? transactions : transactions.slice(0, 3);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Reports" subtitle="Finance & Insights" unreadCount={unreadCount} onBell={onBell} />
      <PeriodPill label="This Week" icon={CalendarDays} onPress={onRefresh} />

      <View style={styles.reportMetricGrid}>
        <ReportMetric icon={WalletCards} tone="green" label="Revenue" value={compactMoney(metrics.weeklyRevenue)} trend="16% vs last week" direction="up" />
        <ReportMetric icon={Clock3} tone="orange" label="Payouts Pending" value="11" trend="8% vs last week" direction="down" />
        <ReportMetric icon={ShieldAlert} tone="red" label="Failed Payments" value={String(metrics.failedPayments)} trend="29% vs last week" direction="upBad" />
      </View>

      <View style={styles.chartCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitleLarge}>Revenue Trend</Text>
          <PeriodPill label="By Day" compact />
        </View>
        <View style={styles.chartArea}>
          {[2.4, 1.6, 0.8, 0].map((label) => (
            <View key={label} style={styles.chartGridLine}>
              <Text style={styles.chartAxis}>{label === 0 ? "0" : `${label.toFixed(1)}M`}</Text>
              <View style={styles.chartDashed} />
            </View>
          ))}
          <View style={styles.barsRow}>
            {REVENUE_BARS.map((value, index) => (
              <View key={DAYS[index]} style={styles.barColumn}>
                <View style={[styles.chartBar, { height: 28 + value * 42 }]} />
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
        trailing={<TextButton label={showAllPayouts ? "Collapse" : "View all"} onPress={() => setShowAllPayouts((value) => !value)} />}
      />
      <View style={styles.listCard}>
        {visiblePayoutRows.map((row, index) => (
          <PayoutRow
            key={row.id}
            row={row}
            divider={index < visiblePayoutRows.length - 1}
            onPress={() => Alert.alert(row.name, `${row.subtitle}\n${row.role}\n${compactMoney(row.amount)} - ${row.status}`)}
          />
        ))}
      </View>

      <SectionHeading
        title="Recent Transactions"
        trailing={<TextButton label={showAllTransactions ? "Collapse" : "View all"} onPress={() => setShowAllTransactions((value) => !value)} />}
      />
      <View style={styles.listCard}>
        {visibleTransactions.map((row, index) => (
          <TransactionRow
            key={row.id}
            row={row}
            divider={index < visibleTransactions.length - 1}
            onPress={() => Alert.alert(row.title, `${row.subtitle}\n${money(row.amount)}\n${row.status} - ${row.time}`)}
          />
        ))}
      </View>
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
        <SnapshotCard icon={Briefcase} tone="green" label="Active Orders" value={String(metrics.activeOrders)} trend="12% vs yesterday" direction="up" />
        <SnapshotCard icon={Clock3} tone="orange" label="Delayed" value="12" trend="9% vs yesterday" direction="down" />
        <SnapshotCard icon={User} tone="purple" label="Unassigned" value="7" trend="13% vs yesterday" direction="up" />
      </View>

      <View style={styles.stackGap}>
        {orders.map((row) => (
          <OrderCard
            key={row.id}
            order={row}
            working={workingKey === `order:${row.id}` || workingKey === `assign:${row.id}`}
            onAdvance={() => onAdvance(row)}
            onAssign={() => onAssign(row)}
          />
        ))}
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminUserSummary["role"]>("admin");

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
    setInviteOpen(false);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Users"
        subtitle="Roles & Access"
        onBell={onBell}
        rightAction={
          <Pressable style={styles.inviteButton} onPress={() => setInviteOpen((value) => !value)}>
            <Plus color={COLORS.purple} size={20} />
            <Text style={styles.inviteButtonText}>Invite Staff</Text>
          </Pressable>
        }
      />

      {inviteOpen ? (
        <View style={styles.invitePanel}>
          <Text style={styles.invitePanelTitle}>Invite staff member</Text>
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
            <Text style={styles.inviteSubmitText}>{workingKey === "invite" ? "Sending..." : "Send invite"}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.admissionPanel}>
        <View style={styles.admissionPanelHeader}>
          <View>
            <Text style={styles.admissionKicker}>Admission Queue</Text>
            <Text style={styles.admissionTitle}>{applications.length ? `${applications.length} role request${applications.length === 1 ? "" : "s"} waiting` : "No role requests waiting"}</Text>
          </View>
          <View style={styles.admissionCountBadge}>
            <Text style={styles.admissionCountText}>{applications.length}</Text>
          </View>
        </View>
        <Text style={styles.admissionSub}>
          Review submitted details, then approve access or decline with feedback. Approved users are notified and can switch roles immediately.
        </Text>
        {applications.length ? (
          <View style={styles.stackGap}>
            {applications.map((application) => (
              <RoleApplicationReviewCard
                key={application.id}
                application={application}
                working={Boolean(workingKey?.startsWith(`application:${application.id}:`))}
                onApprove={() => onReviewApplication(application, "approved")}
                onDecline={() => onReviewApplication(application, "declined")}
              />
            ))}
          </View>
        ) : (
          <View style={styles.admissionEmpty}>
            <ClipboardCheck color={COLORS.green} size={20} />
            <Text style={styles.admissionEmptyText}>Every admission request has been handled.</Text>
          </View>
        )}
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Search color={COLORS.muted} size={25} />
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder="Search by name, phone or email..."
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

      <View style={styles.twoMetricGrid}>
        <WideMetric icon={UserPlus} tone="green" label="New Signups" value={String(metrics.newUsers)} trend="18% vs yesterday" />
        <WideMetric icon={ShieldCheck} tone="orange" label="Pending Verifications" value={String(metrics.pendingApplications)} trend="12% vs yesterday" />
      </View>

      <SectionHeading title={`All Users (${metrics.totalUsers})`} subtitle="Manage and review user access" trailing={<PeriodPill label="Sort by: Newest" compact />} />
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
  onSetStatus: (row: DemoTicket, status: "open" | "pending" | "resolved") => void;
}) {
  return (
    <View style={styles.screen}>
      <ScreenHeader title="Tickets" subtitle="Support & Safety" onBell={onBell} />
      <Segmented labels={TICKET_FILTERS} active={filter} badgeLabel="Urgent" badge={String(metrics.pendingReviews)} onChange={onFilter} />
      <View style={styles.twoMetricGrid}>
        <WideMetric icon={Ticket} tone="orange" label="Open Tickets" value={String(metrics.openTickets)} trend="15% vs yesterday" direction="down" />
        <WideMetric icon={ShieldAlert} tone="red" label="Urgent Reports" value={String(metrics.pendingReviews)} trend="20% vs yesterday" direction="down" />
      </View>
      <View style={styles.stackGap}>
        {tickets.map((row) => (
          <TicketCard
            key={row.id}
            ticket={row}
            working={workingKey === `ticket:${row.id}` || workingKey === `report:${row.id}`}
            onReply={() => onSetStatus(row, "pending")}
            onResolve={() => onSetStatus(row, "resolved")}
          />
        ))}
      </View>
    </View>
  );
}

function ModerationScreen({
  filter,
  items,
  metrics,
  workingKey,
  onAction,
  onBell,
  onFilter,
}: {
  filter: ReviewFilter;
  items: DemoReviewItem[];
  metrics: AdminMetrics;
  workingKey: string | null;
  onAction: (row: DemoReviewItem, action: "approve" | "reject" | "flag") => void;
  onBell: () => void;
  onFilter: (value: ReviewFilter) => void;
}) {
  return (
    <View style={styles.screen}>
      <ScreenHeader title="Content Review" subtitle="Moderation" onBell={onBell} />
      <Segmented labels={REVIEW_FILTERS} active={filter} icons={{ Rooms: Building2, Market: Briefcase, Food: UtensilsCrossed, Reports: Flag }} onChange={onFilter} />

      <View style={styles.reviewMetricGrid}>
        <ReportMetric icon={Clock3} tone="orange" label="Pending" value={String(metrics.pendingReviews)} />
        <ReportMetric icon={Flag} tone="red" label="Flagged" value="5" />
        <ReportMetric icon={CheckCircle2} tone="green" label="Approved today" value="28" />
      </View>

      <View style={styles.stackGap}>
        {items.map((row) => (
          <ReviewCard
            key={row.id}
            item={row}
            working={workingKey === `listing:${row.id}` || workingKey === `catalog:${row.id}` || workingKey === `report:${row.id}`}
            onApprove={() => onAction(row, "approve")}
            onFlag={() => onAction(row, "flag")}
            onReject={() => onAction(row, "reject")}
          />
        ))}
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
          {unreadCount ? <View style={styles.bellDot} /> : <View style={styles.bellDot} />}
        </Pressable>
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

function MiniMetricCard({
  icon,
  label,
  value,
  trend,
  tone,
  direction,
  onPress,
}: {
  icon: IconComponent;
  label: string;
  value: string;
  trend: string;
  tone: Tone;
  direction: TrendDirection;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.miniMetricCard} onPress={onPress}>
      <IconBubble icon={icon} tone={tone} size={45} />
      <Text style={styles.miniMetricValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.miniMetricLabel} numberOfLines={2}>{label}</Text>
      <Trend label={trend} direction={direction} />
    </Pressable>
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

function AttentionRow({
  divider,
  icon,
  subtitle,
  time,
  title,
  tone,
  onPress,
}: {
  divider: boolean;
  icon: IconComponent;
  subtitle: string;
  time: string;
  title: string;
  tone: Tone;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.attentionRow, divider && styles.rowDivider]} onPress={onPress}>
      <IconBubble icon={icon} tone={tone} size={49} />
      <View style={styles.attentionCopy}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{title}</Text>
          <View style={[styles.tinyDot, { backgroundColor: toneColors(tone).fg }]} />
        </View>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.rowTime}>{time}</Text>
      <ChevronRight color={COLORS.muted} size={25} />
    </Pressable>
  );
}

function QuickAction({ icon, label, tone, onPress }: { icon: IconComponent; label: string; tone: Tone; onPress: () => void }) {
  return (
    <Pressable style={styles.quickActionCard} onPress={onPress}>
      <IconBubble icon={icon} tone={tone} size={52} />
      <Text style={styles.quickLabel}>{label}</Text>
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
              <View style={styles.segmentBadge}>
                <Text style={styles.segmentBadgeText}>{badge}</Text>
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

  return (
    <Pressable style={styles.orderCard} onPress={onAdvance} disabled={working}>
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
  onApprove,
  onDecline,
}: {
  application: RoleApplication;
  working: boolean;
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

  const showDetails = () => {
    const body = [
      `Applicant: ${applicant}`,
      application.applicant_email ? `Email: ${application.applicant_email}` : null,
      application.applicant_phone ? `Phone: ${application.applicant_phone}` : null,
      "",
      ...details.map(([key, value]) => `${key}: ${value}`),
    ]
      .filter((line) => line !== null)
      .join("\n");
    Alert.alert(`${label} admission`, body || "No extra details were attached.");
  };

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
        <Pressable style={styles.applicationGhostButton} onPress={showDetails} disabled={working}>
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
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "orders", label: "Orders", icon: ClipboardList },
    { id: "users", label: "Users", icon: Users },
    { id: "tickets", label: "Tickets", icon: Tag },
    { id: "more", label: "More", icon: MoreHorizontal },
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
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  segmentBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
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
  activeFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
    alignItems: "center",
    justifyContent: "center",
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
