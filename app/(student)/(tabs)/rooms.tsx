import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react-native";
import TopNav from "@/components/TopNav";
import { getCachedJson, setCachedJson } from "@/lib/offlineCache";
import { supabase } from "@/lib/supabase";
import { useNetwork } from "@/providers/NetworkProvider";

type OccupancyMode = "single" | "shared";
type ListingRow = {
  id: string;
  title: string;
  listing_type: "hostel" | "bedsitter";
  campus: string | null;
  area: string | null;
  city: string | null;
  price_from: number | null;
  room_types: string[] | null;
  image_urls: string[] | null;
  occupancy_mode: OccupancyMode | null;
  students_per_room: number | null;
  created_at: string | null;
  visibility_rank?: number | null;
};

type SortKey = "newest" | "cheapest" | "expensive";
type ListingTypeFilter = "" | "hostel" | "bedsitter";
type SelectKey = "type" | "campus" | "city" | "roomType" | "sort";

function formatPrice(amount?: number | null) {
  if (!amount) return "Ask landlord";
  return `K${Number(amount).toLocaleString("en-MW")}`;
}

function uniqSorted(arr: (string | null | undefined)[]) {
  return Array.from(new Set(arr.map((x) => (x ?? "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function RotatingCover({ images }: { images?: string[] | null }) {
  const pics = images && images.length > 0 ? images : ["https://placehold.co/900x600?text=No+Photo"];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (pics.length <= 1) return;
    const timer = setInterval(() => setIndex((v) => (v + 1) % pics.length), 4000);
    return () => clearInterval(timer);
  }, [pics.length]);

  return <Image source={{ uri: pics[index] }} style={styles.cover} resizeMode="cover" />;
}

function SelectField({
  label,
  valueLabel,
  active,
  onPress,
}: {
  label: string;
  valueLabel: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.selectField, active && styles.selectFieldActive]} onPress={onPress}>
      <Text style={styles.selectLabel}>{label}</Text>
      <View style={styles.selectValueRow}>
        <Text numberOfLines={1} style={[styles.selectValue, active && styles.selectValueActive]}>
          {valueLabel}
        </Text>
        <ChevronDown size={16} color={active ? "#ff0f64" : "#60708f"} />
      </View>
    </Pressable>
  );
}

export default function RoomsScreen() {
  const router = useRouter();
  const { isOnline } = useNetwork();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [allListings, setAllListings] = useState<ListingRow[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);

  const [q, setQ] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");

  const [campusOptions, setCampusOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [roomTypeOptions, setRoomTypeOptions] = useState<string[]>([]);

  const [type, setType] = useState<ListingTypeFilter>("");
  const [campus, setCampus] = useState("");
  const [city, setCity] = useState("");
  const [roomType, setRoomType] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  const [showFilters, setShowFilters] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [openSelect, setOpenSelect] = useState<SelectKey | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        if (isOnline) {
          const { data, error } = await supabase
            .from("listings")
            .select(
              "id, title, listing_type, campus, area, city, price_from, room_types, image_urls, occupancy_mode, students_per_room, created_at, visibility_rank",
            )
            .eq("is_active", true);

          if (error) throw error;
          const rows = (data ?? []) as ListingRow[];
          setAllListings(rows);
          await setCachedJson("student_rooms_all", rows);
        } else {
          const cached = await getCachedJson<ListingRow[]>("student_rooms_all");
          if (!cached?.data?.length) {
            setErr("No cached rooms available yet.");
            setAllListings([]);
          } else {
            setAllListings(cached.data);
          }
        }
      } catch (e: any) {
        const cached = await getCachedJson<ListingRow[]>("student_rooms_all");
        if (cached?.data?.length) {
          setAllListings(cached.data);
          setErr(null);
        } else {
          setErr(e?.message ?? "Failed to load rooms.");
          setAllListings([]);
        }
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [isOnline, reloadKey]);

  useEffect(() => {
    setCampusOptions(uniqSorted(allListings.map((r) => r.campus)));
    setCityOptions(uniqSorted(allListings.map((r) => r.city)));

    const types: string[] = [];
    allListings.forEach((r) => (r.room_types ?? []).forEach((x) => x && types.push(x)));
    setRoomTypeOptions(Array.from(new Set(types)).sort((a, b) => a.localeCompare(b)));

    let rows = [...allListings];

    if (submittedSearch) {
      const s = submittedSearch.toLowerCase();
      rows = rows.filter((r) =>
        [r.title, r.area, r.city, r.campus].some((v) => (v ?? "").toLowerCase().includes(s)),
      );
    }
    if (type) rows = rows.filter((r) => r.listing_type === type);
    if (campus) rows = rows.filter((r) => (r.campus ?? "") === campus);
    if (city) rows = rows.filter((r) => (r.city ?? "") === city);
    if (roomType) rows = rows.filter((r) => (r.room_types ?? []).includes(roomType));

    const min = Number(minPrice);
    const max = Number(maxPrice);
    if (minPrice && Number.isFinite(min)) rows = rows.filter((r) => r.price_from != null && r.price_from >= min);
    if (maxPrice && Number.isFinite(max)) rows = rows.filter((r) => r.price_from != null && r.price_from <= max);

    rows.sort((a, b) => {
      const rankA = a.visibility_rank ?? 0;
      const rankB = b.visibility_rank ?? 0;
      if (rankB !== rankA) return rankB - rankA;
      if (sort === "cheapest") return (a.price_from ?? Number.MAX_SAFE_INTEGER) - (b.price_from ?? Number.MAX_SAFE_INTEGER);
      if (sort === "expensive") return (b.price_from ?? -1) - (a.price_from ?? -1);
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });

    setListings(rows);
  }, [allListings, submittedSearch, type, campus, city, roomType, minPrice, maxPrice, sort]);

  const activeFiltersCount =
    (type ? 1 : 0) +
    (campus ? 1 : 0) +
    (city ? 1 : 0) +
    (roomType ? 1 : 0) +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (submittedSearch ? 1 : 0);

  const clearFilters = () => {
    setType("");
    setCampus("");
    setCity("");
    setRoomType("");
    setMinPrice("");
    setMaxPrice("");
    setSort("newest");
    setQ("");
    setSubmittedSearch("");
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setReloadKey((v) => v + 1);
  };

  useEffect(() => {
    if (!loading) setRefreshing(false);
  }, [loading]);

  const activeChips = useMemo(
    () =>
      [
        submittedSearch ? { key: "search", label: `Search: ${submittedSearch}`, clear: () => { setQ(""); setSubmittedSearch(""); } } : null,
        type ? { key: "type", label: type === "hostel" ? "Hostel" : "Bedsitter", clear: () => setType("") } : null,
        campus ? { key: "campus", label: campus, clear: () => setCampus("") } : null,
        city ? { key: "city", label: city, clear: () => setCity("") } : null,
        roomType ? { key: "roomType", label: roomType, clear: () => setRoomType("") } : null,
        minPrice ? { key: "minPrice", label: `Min K${minPrice}`, clear: () => setMinPrice("") } : null,
        maxPrice ? { key: "maxPrice", label: `Max K${maxPrice}`, clear: () => setMaxPrice("") } : null,
      ].filter(Boolean) as { key: string; label: string; clear: () => void }[],
    [submittedSearch, type, campus, city, roomType, minPrice, maxPrice],
  );

  const selectConfig = useMemo(() => {
    const map: Record<SelectKey, { title: string; options: { label: string; value: string }[] }> = {
      type: {
        title: "Listing type",
        options: [
          { label: "All types", value: "" },
          { label: "Hostel", value: "hostel" },
          { label: "Bedsitter", value: "bedsitter" },
        ],
      },
      campus: {
        title: "Campus",
        options: [{ label: "All campuses", value: "" }, ...campusOptions.map((x) => ({ label: x, value: x }))],
      },
      city: {
        title: "City",
        options: [{ label: "All cities", value: "" }, ...cityOptions.map((x) => ({ label: x, value: x }))],
      },
      roomType: {
        title: "Room type",
        options: [{ label: "All room types", value: "" }, ...roomTypeOptions.map((x) => ({ label: x, value: x }))],
      },
      sort: {
        title: "Sort rooms",
        options: [
          { label: "Newest", value: "newest" },
          { label: "Cheapest first", value: "cheapest" },
          { label: "Most expensive", value: "expensive" },
        ],
      },
    };
    return map;
  }, [campusOptions, cityOptions, roomTypeOptions]);

  const currentSelectValue =
    openSelect === "type"
      ? type
      : openSelect === "campus"
        ? campus
        : openSelect === "city"
          ? city
          : openSelect === "roomType"
            ? roomType
            : openSelect === "sort"
              ? sort
              : "";

  const applySelectValue = (key: SelectKey, value: string) => {
    if (key === "type") setType(value as ListingTypeFilter);
    if (key === "campus") setCampus(value);
    if (key === "city") setCity(value);
    if (key === "roomType") setRoomType(value);
    if (key === "sort") setSort(value as SortKey);
    setOpenSelect(null);
  };

  return (
    <View style={styles.page}>
      <TopNav title="Rooms" />

      <ScrollView
        contentContainerStyle={styles.wrap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ff0f64" />}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Rooms</Text>
            <Text style={styles.sub}>Search by place, then refine with clear filters.</Text>
          </View>

          <Pressable style={[styles.filterToggle, showFilters && styles.filterToggleActive]} onPress={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal size={16} color={showFilters ? "#fff" : "#0e2756"} />
            <Text style={[styles.filterToggleText, showFilters && { color: "#fff" }]}>
              Filters {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ""}
            </Text>
          </Pressable>
        </View>

        {err ? (
          <View style={styles.errCard}>
            <Text style={styles.errText}>{err}</Text>
          </View>
        ) : null}

        <View style={styles.searchCard}>
          <View style={styles.searchTopGlow} />
          <View style={styles.searchRow}>
            <Search size={16} color="#60708f" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search area, city, campus..."
              placeholderTextColor="#98a3bd"
              value={q}
              onChangeText={setQ}
              onSubmitEditing={() => setSubmittedSearch(q.trim())}
              returnKeyType="search"
            />
            {q ? (
              <Pressable
                onPress={() => {
                  setQ("");
                  setSubmittedSearch("");
                }}
                style={styles.searchClear}
              >
                <X size={14} color="#60708f" />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            style={[styles.searchBtn, !q.trim() && { opacity: 0.6 }]}
            disabled={!q.trim()}
            onPress={() => setSubmittedSearch(q.trim())}
          >
            <Text style={styles.searchBtnTxt}>Search Rooms</Text>
          </Pressable>

          {activeChips.length > 0 ? (
            <View style={styles.chipsWrap}>
              {activeChips.map((chip) => (
                <Pressable key={chip.key} style={styles.chip} onPress={chip.clear}>
                  <Text numberOfLines={1} style={styles.chipText}>{chip.label}</Text>
                  <X size={12} color="#b0003a" />
                </Pressable>
              ))}
            </View>
          ) : null}

          {showFilters ? (
            <View style={styles.filtersPanel}>
              <View style={styles.selectGrid}>
                <SelectField label="Type" valueLabel={type ? (type === "hostel" ? "Hostel" : "Bedsitter") : "All types"} active={!!type} onPress={() => setOpenSelect("type")} />
                <SelectField label="Campus" valueLabel={campus || "All campuses"} active={!!campus} onPress={() => setOpenSelect("campus")} />
                <SelectField label="City" valueLabel={city || "All cities"} active={!!city} onPress={() => setOpenSelect("city")} />
                <SelectField label="Room type" valueLabel={roomType || "All room types"} active={!!roomType} onPress={() => setOpenSelect("roomType")} />
              </View>

              <View style={styles.priceRow}>
                <View style={styles.priceInputWrap}>
                  <Text style={styles.inputLabel}>Min price</Text>
                  <TextInput
                    style={styles.input}
                    value={minPrice}
                    onChangeText={setMinPrice}
                    placeholder="e.g. 50000"
                    placeholderTextColor="#98a3bd"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.priceInputWrap}>
                  <Text style={styles.inputLabel}>Max price</Text>
                  <TextInput
                    style={styles.input}
                    value={maxPrice}
                    onChangeText={setMaxPrice}
                    placeholder="e.g. 150000"
                    placeholderTextColor="#98a3bd"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.footerRow}>
                <SelectField
                  label="Sort"
                  valueLabel={sort === "newest" ? "Newest" : sort === "cheapest" ? "Cheapest first" : "Most expensive"}
                  active={sort !== "newest"}
                  onPress={() => setOpenSelect("sort")}
                />

                <Pressable style={styles.clearBtn} onPress={clearFilters}>
                  <Text style={styles.clearBtnText}>Clear all</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#ff0f64" />
          </View>
        ) : (
          <>
            <Text style={styles.countText}>{listings.length} rooms found</Text>

            {listings.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No rooms found</Text>
                <Text style={styles.emptySub}>Try a different place, widen your price range, or clear filters.</Text>
                <Pressable style={styles.searchBtn} onPress={clearFilters}>
                  <Text style={styles.searchBtnTxt}>Reset filters</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.grid}>
                {listings.map((room) => (
                  <Pressable
                    key={room.id}
                    style={styles.card}
                    onPress={() => router.push({ pathname: "/(student)/room/[id]", params: { id: room.id } })}
                  >
                    <RotatingCover images={room.image_urls} />
                    <View style={styles.cardBody}>
                      <View style={styles.cardHead}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{room.title}</Text>
                        <Text style={styles.badge}>{room.listing_type === "hostel" ? "Hostel" : "Bedsitter"}</Text>
                      </View>

                      <Text numberOfLines={1} style={styles.location}>
                        {[room.area, room.city, room.campus].filter(Boolean).join(" • ") || "Location not provided"}
                      </Text>

                      <Text style={styles.price}>
                        {formatPrice(room.price_from)} <Text style={styles.priceSub}>/ month</Text>
                      </Text>

                      {room.occupancy_mode ? (
                        <Text style={styles.occupancyText}>
                          {room.occupancy_mode === "single" ? "Single room" : `${room.students_per_room ?? 2} students / room`}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={openSelect != null} transparent animationType="slide" onRequestClose={() => setOpenSelect(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpenSelect(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{openSelect ? selectConfig[openSelect].title : ""}</Text>
            <ScrollView contentContainerStyle={styles.sheetList}>
              {openSelect
                ? selectConfig[openSelect].options.map((opt) => {
                    const selected = currentSelectValue === opt.value;
                    return (
                      <Pressable
                        key={`${openSelect}:${opt.value || "all"}`}
                        style={[styles.sheetItem, selected && styles.sheetItemActive]}
                        onPress={() => applySelectValue(openSelect, opt.value)}
                      >
                        <Text style={[styles.sheetItemText, selected && styles.sheetItemTextActive]}>{opt.label}</Text>
                        {selected ? <Text style={styles.sheetCheck}>Selected</Text> : null}
                      </Pressable>
                    );
                  })
                : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#eef1f7" },
  wrap: { padding: 14, paddingBottom: 32, gap: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 10 },
  h1: { color: "#102c63", fontSize: 28, fontWeight: "900" },
  sub: { color: "#5f6b85", fontSize: 13, marginTop: 4, fontWeight: "600" },
  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e8f4",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  filterToggleActive: { backgroundColor: "#0e2756", borderColor: "#0e2756" },
  filterToggleText: { color: "#0e2756", fontWeight: "800", fontSize: 13 },
  errCard: { borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", borderRadius: 16, padding: 12 },
  errText: { color: "#b0003a", fontWeight: "700" },

  searchCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#edf0f7",
    shadowColor: "#0e2756",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 2,
    overflow: "hidden",
  },
  searchTopGlow: {
    position: "absolute",
    top: -24,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#ffe0ed",
    opacity: 0.65,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e3e7f2",
    backgroundColor: "#f7f8fc",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  searchInput: { flex: 1, color: "#102c63", fontSize: 14, fontWeight: "600" },
  searchClear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#eef1f7",
    alignItems: "center",
    justifyContent: "center",
  },
  searchBtn: {
    backgroundColor: "#ff5b9a",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ff5b9a",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 2,
  },
  searchBtnTxt: { color: "#fff", fontWeight: "900", fontSize: 14 },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fff0f6",
    borderWidth: 1,
    borderColor: "#ffd4e3",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: "100%",
  },
  chipText: { color: "#b0003a", fontWeight: "700", fontSize: 11, maxWidth: 210 },

  filtersPanel: {
    backgroundColor: "#f8f9fd",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e7ebf5",
    padding: 10,
    gap: 10,
  },
  selectGrid: { gap: 8 },
  selectField: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e4e8f4",
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 58,
    justifyContent: "center",
  },
  selectFieldActive: { borderColor: "#ffc2d8", backgroundColor: "#fff8fb" },
  selectLabel: { color: "#60708f", fontSize: 11, fontWeight: "700", marginBottom: 3, textTransform: "uppercase" },
  selectValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  selectValue: { flex: 1, color: "#102c63", fontSize: 14, fontWeight: "800" },
  selectValueActive: { color: "#b0003a" },

  priceRow: { flexDirection: "row", gap: 8 },
  priceInputWrap: { flex: 1, gap: 5 },
  inputLabel: { color: "#60708f", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  input: {
    borderWidth: 1,
    borderColor: "#e4e8f4",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#fff",
    color: "#102c63",
    fontWeight: "700",
  },

  footerRow: { gap: 8 },
  clearBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e8f4",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
  },
  clearBtnText: { color: "#102c63", fontWeight: "800" },

  loadingWrap: { paddingVertical: 28 },
  countText: { color: "#102c63", fontWeight: "800", fontSize: 13, marginTop: 2 },

  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    gap: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#edf0f7",
  },
  emptyTitle: { color: "#102c63", fontWeight: "900", fontSize: 18 },
  emptySub: { color: "#5f6b85", textAlign: "center", fontWeight: "600" },

  grid: { gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "#edf0f7" },
  cover: { width: "100%", height: 170, backgroundColor: "#eef1fb" },
  cardBody: { padding: 12 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  cardTitle: { flex: 1, color: "#102c63", fontWeight: "900", fontSize: 14 },
  badge: { color: "#ff0f64", fontSize: 11, fontWeight: "800" },
  location: { color: "#5f6b85", fontSize: 12, marginTop: 4, fontWeight: "600" },
  price: { color: "#102c63", fontWeight: "900", marginTop: 8 },
  priceSub: { color: "#5f6b85", fontWeight: "600", fontSize: 12 },
  occupancyText: { color: "#5f6b85", fontSize: 11, marginTop: 4, fontWeight: "600" },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(8,15,33,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
    maxHeight: "65%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#dbe1ee",
    marginBottom: 10,
  },
  sheetTitle: { color: "#102c63", fontSize: 16, fontWeight: "900", marginBottom: 10 },
  sheetList: { gap: 8, paddingBottom: 10 },
  sheetItem: {
    borderWidth: 1,
    borderColor: "#e4e8f4",
    borderRadius: 14,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  sheetItemActive: { backgroundColor: "#fff3f8", borderColor: "#ffc2d8" },
  sheetItemText: { color: "#102c63", fontWeight: "700", flex: 1 },
  sheetItemTextActive: { color: "#b0003a", fontWeight: "900" },
  sheetCheck: { color: "#b0003a", fontWeight: "800", fontSize: 11 },
});
