/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  House,
  MapPin,
  MessageCircle,
  PencilLine,
  Plus,
  Power,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type ListingRow = {
  id: string;
  title: string;
  listing_type: "hostel" | "bedsitter";
  area: string | null;
  city: string | null;
  campus: string | null;
  price_from: number | null;
  is_active: boolean | null;
  image_urls: string[] | null;
  created_at: string | null;
};

type SortKey = "newest" | "oldest" | "price_low" | "price_high";
type StatusFilter = "all" | "active" | "inactive";
type TypeFilter = "all" | "hostel" | "bedsitter";
type ActionTone = "neutral" | "success" | "danger";

const STATUS_ORDER: StatusFilter[] = ["all", "active", "inactive"];
const TYPE_ORDER: TypeFilter[] = ["all", "hostel", "bedsitter"];

function formatPrice(amount?: number | null) {
  if (!amount) return "Ask landlord";
  return `MWK ${Number(amount).toLocaleString("en-MW")}`;
}

function fmtDate(d?: string | null) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function cycleValue<T>(current: T, values: readonly T[]) {
  const currentIndex = values.indexOf(current);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % values.length;
  return values[nextIndex];
}

function formatStatusLabel(value: StatusFilter) {
  if (value === "all") return "Status";
  return value === "active" ? "Active" : "Inactive";
}

function formatTypeLabel(value: TypeFilter) {
  if (value === "all") return "Type";
  return value === "hostel" ? "Hostel" : "Bedsitter";
}

function formatLocation(row: ListingRow) {
  return [row.area, row.city, row.campus].filter(Boolean).join(" • ") || "Location not set";
}

function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tint: "blue" | "pink" | "slate";
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, tint === "pink" ? styles.statIconPink : tint === "slate" ? styles.statIconSlate : styles.statIconBlue]}>
        {icon}
      </View>
      <View style={styles.statTextWrap}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );
}

function ListingAction({
  disabled,
  icon,
  label,
  onPress,
  tone = "neutral",
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  tone?: ActionTone;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        tone === "success" && styles.actionBtnSuccess,
        tone === "danger" && styles.actionBtnDanger,
        disabled && styles.actionBtnDisabled,
        pressed && !disabled && styles.actionBtnPressed,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.actionBtnText,
          tone === "success" && styles.actionBtnTextSuccess,
          tone === "danger" && styles.actionBtnTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function LandlordListingsScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("listings")
      .select("id,title,listing_type,area,city,campus,price_from,is_active,image_urls,created_at")
      .eq("landlord_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as ListingRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && !user) router.replace("/(auth)/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    load();
  }, [user?.id]);

  const onToggleActive = async (id: string, current: boolean) => {
    setBusyId(id);
    setError(null);

    const { error } = await supabase.from("listings").update({ is_active: !current }).eq("id", id);

    if (error) {
      setError(error.message);
      setBusyId(null);
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: !current } : r)));
    setBusyId(null);
  };

  const onDelete = async (id: string) => {
    Alert.alert("Delete listing", "Delete this listing? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusyId(id);
          setError(null);

          const { error } = await supabase.from("listings").delete().eq("id", id);

          if (error) {
            setError(error.message);
            setBusyId(null);
            return;
          }

          setRows((prev) => prev.filter((r) => r.id !== id));
          setBusyId(null);
        },
      },
    ]);
  };

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => !!r.is_active).length;
    return { total, active, inactive: total - active };
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let next = rows.filter((r) => {
      const hay = [r.title, r.area, r.city, r.campus, r.listing_type].filter(Boolean).join(" ").toLowerCase();
      if (query && !hay.includes(query)) return false;
      if (statusFilter === "active" && !r.is_active) return false;
      if (statusFilter === "inactive" && !!r.is_active) return false;
      if (typeFilter !== "all" && r.listing_type !== typeFilter) return false;
      return true;
    });

    next = next.slice().sort((a, b) => {
      if (sort === "newest") return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      if (sort === "oldest") return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
      if (sort === "price_low") return Number(a.price_from ?? Number.MAX_SAFE_INTEGER) - Number(b.price_from ?? Number.MAX_SAFE_INTEGER);
      return Number(b.price_from ?? -1) - Number(a.price_from ?? -1);
    });

    return next;
  }, [q, rows, sort, statusFilter, typeFilter]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (q.trim()) count += 1;
    if (sort !== "newest") count += 1;
    if (statusFilter !== "all") count += 1;
    if (typeFilter !== "all") count += 1;
    return count;
  }, [q, sort, statusFilter, typeFilter]);

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View pointerEvents="none" style={[styles.backgroundOrb, styles.backgroundOrbLeft]} />
        <View pointerEvents="none" style={[styles.backgroundOrb, styles.backgroundOrbRight]} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#ff0f64" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View pointerEvents="none" style={[styles.backgroundOrb, styles.backgroundOrbLeft]} />
      <View pointerEvents="none" style={[styles.backgroundOrb, styles.backgroundOrbRight]} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.h1}>My Listings</Text>
              <Text style={styles.sub}>Manage your hostels & bedsitters.</Text>
            </View>

            <Pressable style={styles.createBtn} onPress={() => router.push("/(landlord)/(tabs)/create")}>
              <Plus size={20} color="#fff" strokeWidth={3} />
              <Text style={styles.createText}>Create</Text>
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <StatCard icon={<House size={18} color="#3b4fb2" />} label="Total" value={stats.total} tint="blue" />
            <StatCard icon={<MapPin size={18} color="#ff0f64" />} label="Active" value={stats.active} tint="pink" />
            <StatCard icon={<MessageCircle size={18} color="#576386" />} label="Inactive" value={stats.inactive} tint="slate" />
          </View>

          {error ? (
            <View style={styles.errBox}>
              <Text style={styles.errText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.searchWrap}>
            <Search size={22} color="#6e77a3" />
            <TextInput
              style={styles.searchInput}
              value={q}
              onChangeText={setQ}
              placeholder="Search listings..."
              placeholderTextColor="#8c93bb"
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersRow}
          >
            <View style={styles.sortPill}>
              <SlidersHorizontal size={18} color="#49598f" />
              <Text style={styles.sortPillText}>Sort</Text>
            </View>

            <Pressable
              style={[styles.filterChip, styles.filterChipPrimary]}
              onPress={() => setSort((current) => (current === "oldest" ? "newest" : "oldest"))}
            >
              <Text style={[styles.filterChipText, styles.filterChipTextPrimary]}>
                {sort === "oldest" ? "Oldest" : "Newest"}
              </Text>
            </Pressable>

            <Pressable style={styles.filterChip} onPress={() => setSort(cycleValue(sort === "price_high" ? "newest" : "price_low", ["price_low", "price_high", "newest"] as const))}>
              <Text style={styles.filterChipText}>
                {sort === "price_low" ? "Price Low" : sort === "price_high" ? "Price High" : "Price"}
              </Text>
              <ChevronRight size={16} color="#49598f" />
            </Pressable>

            <Pressable
              style={[styles.filterChip, statusFilter !== "all" && styles.filterChipSoftPink]}
              onPress={() => setStatusFilter(cycleValue(statusFilter, STATUS_ORDER))}
            >
              <Text style={[styles.filterChipText, statusFilter !== "all" && styles.filterChipTextPink]}>{formatStatusLabel(statusFilter)}</Text>
              <ChevronDown size={16} color={statusFilter !== "all" ? "#a51f64" : "#49598f"} />
            </Pressable>

            <Pressable
              style={[styles.filterChip, typeFilter !== "all" && styles.filterChipSoftPink]}
              onPress={() => setTypeFilter(cycleValue(typeFilter, TYPE_ORDER))}
            >
              <Text style={[styles.filterChipText, typeFilter !== "all" && styles.filterChipTextPink]}>{formatTypeLabel(typeFilter)}</Text>
              <ChevronDown size={16} color={typeFilter !== "all" ? "#a51f64" : "#49598f"} />
            </Pressable>
          </ScrollView>
        </View>

        <View style={styles.resultsRow}>
          <Text style={styles.resultsText}>
            Showing {filtered.length} of {rows.length} listing{rows.length === 1 ? "" : "s"}
          </Text>
          {activeFiltersCount > 0 ? (
            <Pressable
              onPress={() => {
                setQ("");
                setSort("newest");
                setStatusFilter("all");
                setTypeFilter("all");
              }}
            >
              <Text style={styles.clearText}>Clear filters</Text>
            </Pressable>
          ) : null}
        </View>

        {rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No listings yet</Text>
            <Text style={styles.emptyText}>Create your first hostel or bedsitter to start receiving enquiries.</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push("/(landlord)/(tabs)/create")}>
              <Plus size={16} color="#fff" strokeWidth={3} />
              <Text style={styles.emptyBtnText}>Create listing</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No listings match these filters</Text>
            <Text style={styles.emptyText}>Try a different search or reset your active chips.</Text>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {filtered.map((r) => {
              const busy = busyId === r.id;
              const isActive = !!r.is_active;

              return (
                <View key={r.id} style={styles.card}>
                  <Pressable onPress={() => router.push({ pathname: "/(landlord)/listing/[id]", params: { id: r.id } })}>
                    {r.image_urls?.[0] ? (
                      <Image source={{ uri: r.image_urls[0] }} style={styles.cover} resizeMode="cover" />
                    ) : (
                      <View style={[styles.cover, styles.coverEmpty]}>
                        <Text style={styles.coverEmptyText}>No photo</Text>
                      </View>
                    )}

                    <View style={styles.badgesOverlay}>
                      <Text style={styles.typeBadge}>{r.listing_type === "hostel" ? "HOSTEL" : "BEDSITTER"}</Text>
                      <Text style={[styles.statusBadge, isActive ? styles.statusBadgeActive : styles.statusBadgeInactive]}>
                        {isActive ? "ACTIVE" : "INACTIVE"}
                      </Text>
                    </View>
                  </Pressable>

                  <View style={styles.cardBody}>
                    <View style={styles.titleRow}>
                      <View style={styles.titleTextWrap}>
                        <Text style={styles.title} numberOfLines={1}>
                          {r.title}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {formatLocation(r)}
                        </Text>
                      </View>
                      <Text style={styles.dateText}>{fmtDate(r.created_at)}</Text>
                    </View>

                    <View style={styles.pricePill}>
                      <Text style={styles.price}>
                        {formatPrice(r.price_from)} <Text style={styles.priceSub}>/ month</Text>
                      </Text>
                    </View>

                    <View style={styles.actionsRow}>
                      <ListingAction
                        icon={<Eye size={18} color="#24356c" />}
                        label="View"
                        onPress={() => router.push({ pathname: "/(landlord)/listing/[id]", params: { id: r.id } })}
                      />
                      <ListingAction
                        icon={<PencilLine size={18} color="#24356c" />}
                        label="Edit"
                        onPress={() => router.push({ pathname: "/(landlord)/listing/[id]", params: { id: r.id } })}
                      />
                      <ListingAction
                        disabled={busy}
                        icon={<Power size={18} color={isActive ? "#0d6c46" : "#24356c"} />}
                        label={busy ? "..." : isActive ? "Active" : "Inactive"}
                        onPress={() => onToggleActive(r.id, isActive)}
                        tone={isActive ? "success" : "neutral"}
                      />
                      <ListingAction
                        disabled={busy}
                        icon={<Trash2 size={18} color="#b01759" />}
                        label="Delete"
                        onPress={() => onDelete(r.id)}
                        tone="danger"
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8f5ff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundOrb: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.55,
  },
  backgroundOrbLeft: {
    width: 220,
    height: 220,
    left: -90,
    top: 40,
    backgroundColor: "#efeaff",
    shadowColor: "#b99bff",
    shadowOpacity: 0.22,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  backgroundOrbRight: {
    width: 260,
    height: 260,
    right: -120,
    bottom: 180,
    backgroundColor: "#ffe3ef",
    shadowColor: "#ff69a6",
    shadowOpacity: 0.18,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 0 },
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 170,
    gap: 16,
  },
  heroCard: {
    backgroundColor: "rgba(255,255,255,0.86)",
    borderRadius: 34,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: "#ebe7fb",
    shadowColor: "#c9c0ea",
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  h1: {
    color: "#1f2f68",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  sub: {
    marginTop: 8,
    color: "#616d9a",
    fontSize: 14,
    fontWeight: "700",
  },
  createBtn: {
    minWidth: 138,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ff0f64",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#ff0f64",
    shadowOpacity: 0.34,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  createText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    minHeight: 106,
    borderRadius: 24,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#e7e4f6",
    gap: 12,
    shadowColor: "#d7d1ec",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  statIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  statIconBlue: {
    backgroundColor: "#eef1ff",
  },
  statIconPink: {
    backgroundColor: "#ffe4ef",
  },
  statIconSlate: {
    backgroundColor: "#f0f2f8",
  },
  statTextWrap: {
    gap: 2,
  },
  statLabel: {
    color: "#3e4e82",
    fontSize: 12,
    fontWeight: "800",
  },
  statValue: {
    color: "#1f2f68",
    fontSize: 24,
    fontWeight: "900",
  },
  errBox: {
    borderWidth: 1,
    borderColor: "#ffd2e5",
    backgroundColor: "#fff1f7",
    borderRadius: 20,
    padding: 12,
  },
  errText: {
    color: "#b0003a",
    fontWeight: "900",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "#e7e4f6",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  searchInput: {
    flex: 1,
    color: "#23356d",
    fontSize: 16,
    fontWeight: "700",
  },
  filtersRow: {
    alignItems: "center",
    gap: 10,
    paddingRight: 6,
  },
  sortPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#e7e4f6",
  },
  sortPillText: {
    color: "#20316b",
    fontWeight: "800",
    fontSize: 14,
  },
  filterChip: {
    minHeight: 50,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "#f8f7ff",
    borderWidth: 1,
    borderColor: "#dfdcef",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterChipPrimary: {
    backgroundColor: "#22356c",
    borderColor: "#22356c",
  },
  filterChipSoftPink: {
    backgroundColor: "#ffe8f2",
    borderColor: "#ffd0e3",
  },
  filterChipText: {
    color: "#23356d",
    fontSize: 14,
    fontWeight: "800",
  },
  filterChipTextPrimary: {
    color: "#fff",
  },
  filterChipTextPink: {
    color: "#a51f64",
  },
  resultsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 6,
  },
  resultsText: {
    flex: 1,
    color: "#61709d",
    fontSize: 13,
    fontWeight: "700",
  },
  clearText: {
    color: "#ff0f64",
    fontSize: 13,
    fontWeight: "900",
  },
  emptyCard: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#ebe7fb",
    padding: 22,
    alignItems: "center",
    gap: 10,
    shadowColor: "#c9c0ea",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  emptyTitle: {
    color: "#1f2f68",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    color: "#61709d",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyBtn: {
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "#ff0f64",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emptyBtnText: {
    color: "#fff",
    fontWeight: "900",
  },
  listWrap: {
    gap: 18,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 34,
    borderWidth: 1,
    borderColor: "#ebe7fb",
    padding: 16,
    gap: 14,
    shadowColor: "#c9c0ea",
    shadowOpacity: 0.22,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  cover: {
    width: "100%",
    height: 252,
    borderRadius: 26,
    backgroundColor: "#e9ecfb",
  },
  coverEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  coverEmptyText: {
    color: "#61709d",
    fontSize: 14,
    fontWeight: "700",
  },
  badgesOverlay: {
    position: "absolute",
    top: 14,
    left: 14,
    flexDirection: "row",
    gap: 8,
  },
  typeBadge: {
    backgroundColor: "#ff0f64",
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  statusBadge: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  statusBadgeActive: {
    backgroundColor: "#23735a",
  },
  statusBadgeInactive: {
    backgroundColor: "#4f5f8a",
  },
  cardBody: {
    gap: 14,
    paddingHorizontal: 2,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  titleTextWrap: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: "#1f2f68",
    fontSize: 18,
    fontWeight: "900",
  },
  meta: {
    color: "#5f6d9a",
    fontSize: 14,
    fontWeight: "700",
  },
  dateText: {
    color: "#8a91b4",
    fontSize: 11,
    fontWeight: "800",
  },
  pricePill: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#fbfbff",
    borderWidth: 1,
    borderColor: "#e5e2f3",
  },
  price: {
    color: "#22356c",
    fontSize: 18,
    fontWeight: "900",
  },
  priceSub: {
    color: "#69749b",
    fontSize: 16,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    minWidth: 0,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dfdcef",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionBtnPressed: {
    opacity: 0.88,
  },
  actionBtnSuccess: {
    backgroundColor: "#eef9f2",
    borderColor: "#cdebd9",
  },
  actionBtnDanger: {
    backgroundColor: "#fff3f8",
    borderColor: "#ffd6e5",
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    color: "#22356c",
    fontSize: 14,
    fontWeight: "800",
  },
  actionBtnTextSuccess: {
    color: "#0d6c46",
  },
  actionBtnTextDanger: {
    color: "#b01759",
  },
});
