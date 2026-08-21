import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { ClipboardCheck } from "lucide-react-native";
import AdminGuard from "@/components/AdminGuard";

export default function LegacyAdminLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const onReviews = pathname === "/admin/event-reviews";

  return (
    <AdminGuard>
      <View style={styles.root}>
        <Stack screenOptions={{ headerShown: false, animation: "none", freezeOnBlur: false }} />
        {!onReviews ? (
          <Pressable style={styles.reviewBtn} onPress={() => router.push("/admin/event-reviews" as any)}>
            <ClipboardCheck size={17} color="#ffffff" />
            <Text style={styles.reviewText}>Event reviews</Text>
          </Pressable>
        ) : null}
      </View>
    </AdminGuard>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  reviewBtn: {
    position: "absolute",
    right: 20,
    bottom: 24,
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: "#102a54",
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    shadowColor: "#102a54",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  reviewText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
});
