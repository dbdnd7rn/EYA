import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { AMENITY_GROUPS, type AmenityKey } from "./amenities";

export default function AmenitiesSection({ amenities }: { amenities: AmenityKey[] }) {
  const [showAll, setShowAll] = useState(false);

  const set = useMemo(() => new Set((amenities ?? []).filter(Boolean)), [amenities]);

  const isLongLabel = (label: string) => label.trim().length >= 16;

  const totalCount = (amenities ?? []).length;

  return (
    <View style={styles.pinkWrap}>
      <View style={styles.innerCard}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Amenities</Text>
            <Text style={styles.sectionSub}>What this place includes.</Text>
          </View>
          <View style={styles.countPill}>
            <Text style={styles.countTxt}>{totalCount} items</Text>
          </View>
        </View>

        <View style={{ marginTop: 12, gap: 16 }}>
          {AMENITY_GROUPS.map((group) => {
            const present = group.items.filter((it) => set.has(it.key));
            if (!present.length) return null;

            const shown = showAll ? present : present.slice(0, 6);

            return (
              <View key={group.title}>
                <Text style={styles.groupTitle}>{group.title}</Text>

                <View style={{ marginTop: 8, gap: 10 }}>
                  {shown.map(({ key, label }) => {
                    const long = isLongLabel(label);
                    return (
                      <View key={key} style={[styles.item, long ? styles.itemLong : null]}>
                        <View style={styles.iconBubble}>
                          <Text style={styles.iconTxt}>v</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemLabel}>{label}</Text>
                          <Text style={styles.itemSub}>Included</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {!showAll && present.length > 6 ? (
                  <Text style={styles.moreHint}>+ {present.length - 6} more in {group.title}</Text>
                ) : null}
              </View>
            );
          })}
        </View>

        {totalCount > 10 ? (
          <Pressable onPress={() => setShowAll((v) => !v)} style={styles.moreBtn}>
            <Text style={styles.moreBtnTxt}>{showAll ? "Show less" : "View more"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pinkWrap: {
    marginTop: 12,
    backgroundColor: "#ffe3ef",
    borderRadius: 22,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ffd1e3",
  },
  innerCard: {
    backgroundColor: "white",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e7eaf6",
  },
  sectionTitle: { fontSize: 14, fontWeight: "900", color: "#0e2756" },
  sectionSub: { marginTop: 4, fontSize: 12, fontWeight: "700", color: "#5f6b85" },

  countPill: {
    backgroundColor: "#fff0f6",
    borderWidth: 1,
    borderColor: "#ffd1e3",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  countTxt: { color: "#ff0f64", fontWeight: "900", fontSize: 11 },

  groupTitle: { fontSize: 12, fontWeight: "900", color: "#0e2756" },

  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#fff7fb",
    borderWidth: 1,
    borderColor: "#ffd1e3",
  },
  itemLong: {},
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#ffd1e3",
    alignItems: "center",
    justifyContent: "center",
  },
  iconTxt: { color: "#ff0f64", fontWeight: "900" },
  itemLabel: { color: "#0e2756", fontWeight: "800" },
  itemSub: { marginTop: 2, color: "#5f6b85", fontWeight: "700", fontSize: 11 },
  moreHint: { marginTop: 6, color: "#5f6b85", fontWeight: "700", fontSize: 11 },

  moreBtn: {
    marginTop: 12,
    backgroundColor: "#ff0f64",
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: "center",
  },
  moreBtnTxt: { color: "white", fontWeight: "900" },
});

