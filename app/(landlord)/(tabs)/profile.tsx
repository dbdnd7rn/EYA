/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import TopNav from "@/components/TopNav";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type ProfileRow = {
  id?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  surname?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: "student" | "landlord" | "admin" | string | null;
  created_at?: string | null;
};

type VerificationRow = {
  id: string;
  status: "none" | "pending" | "verified" | "rejected" | "expired";
  requested_at: string | null;
  verified_at: string | null;
  expires_at: string | null;
  rejection_reason: string | null;
};

function fmtDate(d?: string | null) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString();
}

function verificationBadge(status: VerificationRow["status"]) {
  if (status === "verified") return { label: "VERIFIED", bg: "#0e2756" };
  if (status === "pending") return { label: "PENDING", bg: "#ff0f64" };
  if (status === "rejected") return { label: "REJECTED", bg: "#b0003a" };
  if (status === "expired") return { label: "EXPIRED", bg: "#5f6b85" };
  return { label: "NOT REQUESTED", bg: "#5f6b85" };
}

export default function LandlordProfileScreen() {
  const { user, role, signOut } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requestingVer, setRequestingVer] = useState(false);

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [verification, setVerification] = useState<VerificationRow | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const currentRole = String(profile?.role ?? role ?? "landlord");
  const verStatus = (verification?.status ?? "none") as VerificationRow["status"];
  const verBadge = verificationBadge(verStatus);

  const displayEmail = profile?.email ?? user?.email ?? "-";
  const memberSince = profile?.created_at ?? null;

  const derivedName = useMemo(() => {
    const joined =
      profile?.full_name ??
      `${profile?.first_name ?? ""} ${profile?.last_name ?? profile?.surname ?? ""}`.trim();
    return (joined ?? "").trim() || "Landlord";
  }, [profile]);

  const loadVerification = async (userId: string) => {
    const { data, error } = await supabase
      .from("landlord_verifications")
      .select("id, status, requested_at, verified_at, expires_at, rejection_reason")
      .eq("landlord_id", userId)
      .order("requested_at", { ascending: false })
      .limit(1);

    if (error) throw new Error(error.message);
    setVerification((data?.[0] as VerificationRow) ?? null);
  };

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        setLoading(true);
        setErr(null);
        setMsg(null);

        const attempts = [
          "id,full_name,email,phone,role,created_at",
          "id,first_name,last_name,email,phone,role,created_at",
          "id,first_name,surname,email,phone,role,created_at",
          "id,full_name,phone,role,created_at",
        ];

        let profileData: ProfileRow | null = null;
        for (const clause of attempts) {
          const { data, error } = await supabase.from("profiles").select(clause).eq("id", user.id).maybeSingle();
          if (!error) {
            profileData = (data as ProfileRow | null) ?? null;
            break;
          }
        }

        if (!profileData) {
          setErr("Could not load profile.");
          setLoading(false);
          return;
        }

        if (profileData.role !== "landlord" && profileData.role !== "admin") {
          router.replace("/onboarding");
          return;
        }

        setProfile(profileData);
        const initialName =
          profileData.full_name ??
          `${profileData.first_name ?? ""} ${profileData.last_name ?? profileData.surname ?? ""}`.trim();
        setFullName((initialName ?? "").trim());
        setPhone((profileData.phone ?? "").trim());

        try {
          await loadVerification(user.id);
        } catch (e: any) {
          setErr((prev) => prev ?? e?.message ?? "Could not load verification.");
          setVerification(null);
        }

        setLoading(false);
      } catch (e: any) {
        setErr(e?.message ?? "Something went wrong");
        setLoading(false);
      }
    };

    load();
  }, [user?.id]);

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setErr(null);
    setMsg(null);

    const cleanName = fullName.trim();
    const cleanPhone = phone.trim().replace(/\s+/g, "");

    if (cleanName.length < 2) {
      setErr("Please enter your full name.");
      setSaving(false);
      return;
    }

    if (cleanPhone && !cleanPhone.startsWith("+265")) {
      setErr("Phone should start with +265 (e.g. +265991234567).");
      setSaving(false);
      return;
    }

    let updateError: string | null = null;

    const fullNameUpdate = await supabase
      .from("profiles")
      .update({ full_name: cleanName, phone: cleanPhone || null })
      .eq("id", user.id);

    if (fullNameUpdate.error) {
      // Schema fallback for installs that don't have full_name.
      const parts = cleanName.split(/\s+/).filter(Boolean);
      const first = parts.shift() ?? cleanName;
      const rest = parts.join(" ") || null;
      const fallback = await supabase
        .from("profiles")
        .update({ first_name: first, last_name: rest, surname: rest, phone: cleanPhone || null } as any)
        .eq("id", user.id);

      if (fallback.error) updateError = fallback.error.message;
    }

    if (updateError) {
      setErr(updateError);
      setSaving(false);
      return;
    }

    setProfile((prev) => ({ ...(prev ?? {}), full_name: cleanName, phone: cleanPhone || null }));
    setMsg("Profile updated successfully.");
    setSaving(false);
  };

  const requestVerification = async () => {
    if (!user) return;
    setRequestingVer(true);
    setErr(null);
    setMsg(null);

    if (verStatus === "pending") {
      setMsg("Your verification is already pending.");
      setRequestingVer(false);
      return;
    }
    if (verStatus === "verified") {
      setMsg("You are already verified.");
      setRequestingVer(false);
      return;
    }

    const { error } = await supabase.from("landlord_verifications").insert({
      landlord_id: user.id,
      status: "pending",
      requested_at: new Date().toISOString(),
    });

    if (error) {
      setErr(error.message);
      setRequestingVer(false);
      return;
    }

    await loadVerification(user.id);
    setMsg("Verification request sent.");
    setRequestingVer(false);
  };

  const logout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
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
  };

  return (
    <SafeAreaView style={styles.root}>
      <TopNav title="Landlord profile" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.h1}>Landlord profile</Text>
              <Text style={styles.sub}>Manage your landlord identity and verification.</Text>
            </View>
            <Pressable style={styles.logoutBtn} onPress={logout}>
              <Text style={styles.logoutText}>Log out</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={{ gap: 10, marginTop: 12 }}>
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
              <View style={[styles.skeleton, { height: 80 }]} />
            </View>
          ) : (
            <>
              {err ? <Notice tone="error" text={err} /> : null}
              {msg ? <Notice tone="ok" text={msg} /> : null}

              <View style={styles.statusRow}>
                <Text style={[styles.badge, { backgroundColor: verBadge.bg }]}>{verBadge.label}</Text>
                <Text style={[styles.badge, { backgroundColor: "#0e2756" }]}>FREE ACCESS</Text>
                <Text style={styles.badgeSoft}>Role: {currentRole}</Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Account email</Text>
                <View style={styles.readBox}><Text style={styles.readText}>{displayEmail}</Text></View>
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Full name</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="e.g. Your name"
                  placeholderTextColor="#9aa3bd"
                  style={styles.input}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Phone (WhatsApp)</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="e.g. +265991234567"
                  placeholderTextColor="#9aa3bd"
                  keyboardType="phone-pad"
                  style={styles.input}
                />
                <Text style={styles.helper}>Use +265 format so students can contact you easily.</Text>
              </View>

              <View style={styles.grid2}>
                <InfoTile title="Member since" value={fmtDate(memberSince)} />
                <InfoTile
                  title="Access"
                  value="Free for all landlords"
                  sub="Unlimited create, edit, and photos"
                />
              </View>

              <View style={styles.verCard}>
                <Text style={styles.verTitle}>Verification</Text>
                <Text style={styles.verSub}>Verified landlords can rank higher and build student trust.</Text>

                <View style={styles.grid3}>
                  <InfoTile title="Status" value={verStatus} compact />
                  <InfoTile title="Requested" value={fmtDate(verification?.requested_at ?? null)} compact />
                  <InfoTile title="Expires" value={fmtDate(verification?.expires_at ?? null)} compact />
                </View>

                {verification?.rejection_reason ? (
                  <View style={styles.rejectBox}>
                    <Text style={styles.rejectText}>Rejection reason: {verification.rejection_reason}</Text>
                  </View>
                ) : null}

                <View style={styles.verActions}>
                  <Pressable style={styles.softBtn} onPress={requestVerification} disabled={requestingVer}>
                    <Text style={styles.softBtnText}>{requestingVer ? "Requesting..." : "Request verification"}</Text>
                  </Pressable>
                  <Text style={styles.helper}>After requesting, we will review your documents.</Text>
                </View>
              </View>

              <View style={styles.actionsWrap}>
                <Pressable style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                  <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Save changes"}</Text>
                </Pressable>

                <View style={styles.quickActions}>
                  <QuickAction label="My listings" onPress={() => router.push("/(landlord)/(tabs)/listings")} />
                  <QuickAction label="Enquiries" onPress={() => router.push("/(landlord)/(tabs)/enquiries")} />
                  <QuickAction label="Create listing" onPress={() => router.push("/(landlord)/(tabs)/create")} />
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickBtn} onPress={onPress}>
      <Text style={styles.quickBtnText}>{label}</Text>
    </Pressable>
  );
}

function InfoTile({
  title,
  value,
  sub,
  compact,
}: {
  title: string;
  value: string;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.infoTile, compact && styles.infoTileCompact]}>
      <Text style={styles.infoLabel}>{title}</Text>
      <Text style={styles.infoValue}>{value}</Text>
      {sub ? <Text style={styles.infoSub}>{sub}</Text> : null}
    </View>
  );
}

function Notice({ tone, text }: { tone: "error" | "ok"; text: string }) {
  const box = tone === "error" ? styles.errBox : styles.okBox;
  const txt = tone === "error" ? styles.errText : styles.okText;
  return (
    <View style={box}>
      <Text style={txt}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7fb" },
  content: { padding: 16, paddingBottom: 30 },
  heroCard: { backgroundColor: "#fff", borderRadius: 20, padding: 14, gap: 12 },
  heroTop: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  h1: { color: "#0e2756", fontWeight: "900", fontSize: 22 },
  sub: { color: "#5f6b85", fontWeight: "700", fontSize: 12, marginTop: 4 },
  logoutBtn: { backgroundColor: "#0e2756", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  logoutText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  skeleton: { height: 48, borderRadius: 14, backgroundColor: "#dde6ff" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  badge: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  badgeSoft: {
    color: "#5f6b85",
    fontWeight: "800",
    fontSize: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#f6f7fb",
    borderWidth: 1,
    borderColor: "#e1e4ef",
  },
  section: { gap: 6 },
  label: { color: "#5f6b85", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  readBox: { backgroundColor: "#f6f7fb", borderRadius: 14, borderWidth: 1, borderColor: "#e1e4ef", paddingHorizontal: 12, paddingVertical: 12 },
  readText: { color: "#0e2756", fontWeight: "700" },
  input: {
    backgroundColor: "#f6f7fb",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e1e4ef",
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#0e2756",
    fontWeight: "700",
  },
  helper: { color: "#5f6b85", fontSize: 11, fontWeight: "600" },
  grid2: { gap: 10 },
  grid3: { gap: 10, marginTop: 10 },
  infoTile: { backgroundColor: "#f6f7fb", borderRadius: 14, borderWidth: 1, borderColor: "#e1e4ef", paddingHorizontal: 12, paddingVertical: 12 },
  infoTileCompact: { backgroundColor: "#fff", borderColor: "#eef1fb" },
  infoLabel: { color: "#5f6b85", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  infoValue: { color: "#0e2756", fontWeight: "800", marginTop: 3 },
  infoSub: { color: "#5f6b85", fontSize: 11, marginTop: 3, fontWeight: "600" },
  verCard: { backgroundColor: "#f6f7fb", borderRadius: 16, borderWidth: 1, borderColor: "#e1e4ef", padding: 12, gap: 8 },
  verTitle: { color: "#0e2756", fontWeight: "900", fontSize: 15 },
  verSub: { color: "#5f6b85", fontWeight: "600", fontSize: 12 },
  rejectBox: { borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", borderRadius: 14, padding: 10, marginTop: 2 },
  rejectText: { color: "#b0003a", fontWeight: "700" },
  verActions: { gap: 8, marginTop: 2 },
  softBtn: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 11, alignItems: "center", borderWidth: 1, borderColor: "#e1e4ef" },
  softBtnText: { color: "#0e2756", fontWeight: "900", fontSize: 12 },
  actionsWrap: { gap: 10 },
  primaryBtn: { backgroundColor: "#ff0f64", borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  quickActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickBtn: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 11, paddingHorizontal: 12, borderWidth: 1, borderColor: "#e1e4ef" },
  quickBtnText: { color: "#0e2756", fontWeight: "800", fontSize: 12 },
  errBox: { borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", borderRadius: 14, padding: 10, marginTop: 4 },
  errText: { color: "#b0003a", fontWeight: "800" },
  okBox: { borderWidth: 1, borderColor: "#c7f5d8", backgroundColor: "#f0fff6", borderRadius: 14, padding: 10, marginTop: 4 },
  okText: { color: "#0b6b2f", fontWeight: "800" },
});
