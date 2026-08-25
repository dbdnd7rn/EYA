import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ImagePlus,
  Mail,
  Phone,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react-native";
import SoftPageGlow from "@/components/SoftPageGlow";
import { goBackOrFallback } from "@/lib/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  phone: string | null;
  avatar_url: string | null;
};

type PendingImage = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

function splitName(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return { first: "", last: "" };
  const parts = normalized.split(/\s+/).filter(Boolean);
  return {
    first: parts[0] ?? "",
    last: parts.slice(1).join(" "),
  };
}

function initials(value?: string | null) {
  const parts = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return `${parts[0]?.[0] ?? "U"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function roleLabel(value?: string | null) {
  switch (String(value ?? "").toLowerCase()) {
    case "admin":
      return "Administrator";
    case "landlord":
      return "Landlord";
    case "agent":
      return "Delivery agent";
    case "vendor":
      return "Seller";
    case "student":
      return "Standard account";
    default:
      return "Standard account";
  }
}

function normalizePhone(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function phoneLooksValid(value: string) {
  if (!value.trim()) return true;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function emailLooksValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getUploadFileMeta(asset: PendingImage) {
  const fromName = (asset.fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const fromUri = asset.uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const ext = fromName || fromUri || "jpg";
  const safeExt = ext === "heic" || ext === "heif" ? "jpg" : ext;
  const mime = asset.mimeType || (safeExt === "png" ? "image/png" : safeExt === "webp" ? "image/webp" : "image/jpeg");
  return {
    name: `eya-avatar-${Date.now()}.${safeExt}`,
    type: mime,
  };
}

async function uploadAvatar(asset: PendingImage) {
  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error("Profile photo upload is not configured on this device.");
  }

  const meta = getUploadFileMeta(asset);
  const form = new FormData();

  if (Platform.OS === "web") {
    const imageResponse = await fetch(asset.uri);
    if (!imageResponse.ok) throw new Error("Could not read the selected photo.");
    const blob = await imageResponse.blob();
    form.append("file", blob, meta.name);
  } else {
    form.append("file", { uri: asset.uri, name: meta.name, type: meta.type } as any);
  }

  form.append("upload_preset", uploadPreset);
  form.append("folder", "eya/avatars");

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const json = await response.json();
  if (!response.ok || !json?.secure_url) {
    throw new Error(json?.error?.message || "Could not upload your profile photo.");
  }
  return String(json.secure_url);
}

export default function ProfileStudio() {
  const router = useRouter();
  const { user, role: authRole, loading: authLoading } = useAuth();
  const { theme } = useStudentTheme();

  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [emailSaving, setEmailSaving] = React.useState(false);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [profileRole, setProfileRole] = React.useState<string | null>(null);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);

  const [savedFullName, setSavedFullName] = React.useState("");
  const [savedPhone, setSavedPhone] = React.useState("");
  const [savedAvatarUrl, setSavedAvatarUrl] = React.useState<string | null>(null);

  const [pendingImage, setPendingImage] = React.useState<PendingImage | null>(null);
  const [removeAvatar, setRemoveAvatar] = React.useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = React.useState(false);

  const currentEmail = String(user?.email ?? "").trim();
  const [emailDraft, setEmailDraft] = React.useState("");
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);
  const emailVerified = Boolean(user?.email_confirmed_at);

  const loadProfile = React.useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      setLoadError(null);
      setError(null);

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("id,full_name,role,phone,avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      const profile = (data ?? null) as ProfileRow | null;
      const fallbackName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").trim();
      const fullName = String(profile?.full_name ?? fallbackName).trim();
      const parts = splitName(fullName);
      const nextPhone = String(profile?.phone ?? "").trim();
      const nextAvatar = profile?.avatar_url ?? null;

      setProfileRole(profile?.role ?? authRole ?? null);
      setFirstName(parts.first);
      setLastName(parts.last);
      setPhone(nextPhone);
      setAvatarUrl(nextAvatar);
      setSavedFullName(fullName);
      setSavedPhone(nextPhone);
      setSavedAvatarUrl(nextAvatar);
      setPendingImage(null);
      setRemoveAvatar(false);
      setEmailDraft("");
    } catch (caught: any) {
      setLoadError(caught?.message || "We could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, [authRole, user?.id]);

  React.useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/(auth)/login");
      return;
    }
    if (user?.id) void loadProfile();
  }, [authLoading, loadProfile, router, user?.id]);

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const previewAvatar = removeAvatar ? null : pendingImage?.uri || avatarUrl;
  const normalizedPhone = normalizePhone(phone);
  const profileDirty =
    fullName !== savedFullName ||
    normalizedPhone !== savedPhone ||
    Boolean(pendingImage) ||
    removeAvatar ||
    avatarUrl !== savedAvatarUrl;

  const completionItems = [Boolean(firstName.trim()), Boolean(normalizedPhone), Boolean(previewAvatar)];
  const completionCount = completionItems.filter(Boolean).length;
  const completionLabel = completionCount === 3 ? "Profile complete" : `${completionCount} of 3 profile details complete`;

  function clearMessages() {
    setSuccess(null);
    setError(null);
  }

  function resetProfileChanges() {
    const parts = splitName(savedFullName);
    setFirstName(parts.first);
    setLastName(parts.last);
    setPhone(savedPhone);
    setAvatarUrl(savedAvatarUrl);
    setPendingImage(null);
    setRemoveAvatar(false);
    clearMessages();
  }

  async function choosePhoto() {
    try {
      clearMessages();
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Photo access needed", "Allow EYA to access your photos so you can choose a profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.88,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
        Alert.alert("Photo too large", "Choose a profile photo smaller than 8 MB.");
        return;
      }

      setPendingImage({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
      });
      setRemoveAvatar(false);
      setPhotoSheetOpen(false);
    } catch (caught: any) {
      setError(caught?.message || "We could not open your photos.");
    }
  }

  function markPhotoForRemoval() {
    setPendingImage(null);
    setRemoveAvatar(true);
    setPhotoSheetOpen(false);
    clearMessages();
  }

  async function saveProfile() {
    if (!user?.id || saving || !profileDirty) return;
    clearMessages();

    if (!firstName.trim()) {
      setError("Enter your first name before saving.");
      return;
    }
    if (!phoneLooksValid(normalizedPhone)) {
      setError("Enter a valid phone number, including the country code when possible.");
      return;
    }

    try {
      setSaving(true);
      let nextAvatarUrl = removeAvatar ? null : avatarUrl;
      if (pendingImage) nextAvatarUrl = await uploadAvatar(pendingImage);

      const { data, error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone: normalizedPhone || null,
          avatar_url: nextAvatarUrl,
        })
        .eq("id", user.id)
        .select("id,full_name,role,phone,avatar_url")
        .maybeSingle();

      if (profileError) throw profileError;
      if (!data) throw new Error("Your profile record could not be updated. Please sign in again and retry.");

      const saved = data as ProfileRow;
      const nextFullName = String(saved.full_name ?? fullName).trim();
      const nextPhone = String(saved.phone ?? "").trim();
      const nextAvatar = saved.avatar_url ?? null;
      const parts = splitName(nextFullName);

      setFirstName(parts.first);
      setLastName(parts.last);
      setPhone(nextPhone);
      setAvatarUrl(nextAvatar);
      setProfileRole(saved.role ?? profileRole);
      setSavedFullName(nextFullName);
      setSavedPhone(nextPhone);
      setSavedAvatarUrl(nextAvatar);
      setPendingImage(null);
      setRemoveAvatar(false);
      setSuccess("Your profile has been updated.");
    } catch (caught: any) {
      setError(caught?.message || "We could not save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function requestEmailChange() {
    if (!user || emailSaving) return;
    clearMessages();
    const nextEmail = emailDraft.trim().toLowerCase();

    if (!emailLooksValid(nextEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (nextEmail === currentEmail.toLowerCase()) {
      setError("That is already your current sign-in email.");
      return;
    }

    try {
      setEmailSaving(true);
      const { error: emailError } = await supabase.auth.updateUser({ email: nextEmail });
      if (emailError) throw emailError;
      setPendingEmail(nextEmail);
      setEmailDraft("");
      setSuccess("Email change requested. Complete the confirmation steps sent by Supabase before the new address becomes active.");
    } catch (caught: any) {
      setError(caught?.message || "We could not request the email change.");
    } finally {
      setEmailSaving(false);
    }
  }

  if (authLoading || loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>Loading your profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />
        <View style={styles.stateWrap}>
          <View style={[styles.stateIcon, { backgroundColor: theme.surfaceMuted }]}><CircleAlert size={28} color={theme.danger} /></View>
          <Text style={[styles.stateTitle, { color: theme.heading }]}>Profile unavailable</Text>
          <Text style={[styles.stateText, { color: theme.textMuted }]}>{loadError}</Text>
          <Pressable style={[styles.primaryBtn, { backgroundColor: theme.accent }]} onPress={() => void loadProfile()}>
            <RotateCcw size={17} color={theme.accentContrast} />
            <Text style={[styles.primaryBtnText, { color: theme.accentContrast }]}>Try again</Text>
          </Pressable>
          <Pressable style={[styles.secondaryBtn, { borderColor: theme.border, backgroundColor: theme.surface }]} onPress={() => router.replace("/(student)/(tabs)/account" as any)}>
            <ArrowLeft size={17} color={theme.text} />
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Back to Account</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <SoftPageGlow topColor={theme.glowTop} middleColor={theme.glowMiddle} bottomColor={theme.glowBottom} />

      <View style={styles.headerWrap}>
        <Pressable
          style={[styles.headerBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => goBackOrFallback(router, "/(student)/(tabs)/account" as any)}
          accessibilityRole="button"
          accessibilityLabel="Back to Account"
        >
          <ArrowLeft size={20} color={theme.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerEyebrow, { color: theme.accent }]}>ACCOUNT</Text>
          <Text style={[styles.headerTitle, { color: theme.heading }]}>Your profile</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
          <Pressable style={styles.avatarPressable} onPress={() => setPhotoSheetOpen(true)} accessibilityRole="button" accessibilityLabel="Change profile photo">
            {previewAvatar ? (
              <Image source={{ uri: previewAvatar }} style={[styles.avatar, { backgroundColor: theme.surfaceMuted }]} />
            ) : (
              <View style={[styles.avatarFallback, { backgroundColor: theme.surfaceStrong }]}>
                <Text style={[styles.avatarFallbackText, { color: theme.text }]}>{initials(fullName || currentEmail)}</Text>
              </View>
            )}
            <View style={[styles.cameraBubble, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Camera size={15} color={theme.accent} />
            </View>
          </Pressable>

          <View style={styles.heroCopy}>
            <Text style={[styles.heroName, { color: theme.heading }]} numberOfLines={2}>{fullName || "Add your name"}</Text>
            <Text style={[styles.heroSub, { color: theme.textMuted }]}>Keep the name, photo and contact details used across EYA up to date.</Text>
            <View style={styles.heroPills}>
              <View style={[styles.pill, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                <UserRound size={13} color={theme.accent} />
                <Text style={[styles.pillText, { color: theme.text }]}>{roleLabel(profileRole ?? authRole)}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: emailVerified ? (theme.isDark ? "#173829" : "#ecfbf2") : (theme.isDark ? "#4a3820" : "#fff8e8"), borderColor: theme.border }]}>
                {emailVerified ? <BadgeCheck size={13} color={theme.success} /> : <CircleAlert size={13} color={theme.warning} />}
                <Text style={[styles.pillText, { color: theme.text }]}>{emailVerified ? "Email verified" : "Email not verified"}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.completionCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSoft }]}>
            <View style={styles.completionTop}>
              <Text style={[styles.completionTitle, { color: theme.text }]}>{completionLabel}</Text>
              <Text style={[styles.completionCount, { color: theme.accent }]}>{completionCount}/3</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: theme.surfaceMuted }]}>
              <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${(completionCount / 3) * 100}%` }]} />
            </View>
            {completionCount < 3 ? <Text style={[styles.completionHint, { color: theme.textMuted }]}>Add your name, phone number and profile photo to complete your profile.</Text> : null}
          </View>
        </View>

        {error ? (
          <View style={[styles.notice, { backgroundColor: theme.isDark ? "#422232" : "#fff1f2", borderColor: theme.isDark ? "#704052" : "#fecdd3" }]}>
            <CircleAlert size={17} color={theme.danger} />
            <Text style={[styles.noticeText, { color: theme.danger }]}>{error}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={[styles.notice, { backgroundColor: theme.isDark ? "#173829" : "#f0fdf4", borderColor: theme.isDark ? "#28583c" : "#bbf7d0" }]}>
            <CheckCircle2 size={17} color={theme.success} />
            <Text style={[styles.noticeText, { color: theme.text }]}>{success}</Text>
          </View>
        ) : null}

        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
          <SectionHeader
            icon={<UserRound size={18} color={theme.accent} />}
            title="Profile details"
            body="These details identify you across your EYA account and any workspaces you can access."
            theme={theme}
          />

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>First name</Text>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
              value={firstName}
              onChangeText={(value) => { setFirstName(value); clearMessages(); }}
              placeholder="First name"
              placeholderTextColor={theme.textSoft}
              autoCapitalize="words"
              textContentType="givenName"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>Last name <Text style={[styles.optional, { color: theme.textSoft }]}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
              value={lastName}
              onChangeText={(value) => { setLastName(value); clearMessages(); }}
              placeholder="Last name"
              placeholderTextColor={theme.textSoft}
              autoCapitalize="words"
              textContentType="familyName"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>Phone number <Text style={[styles.optional, { color: theme.textSoft }]}>(optional)</Text></Text>
            <View style={[styles.inputWithIcon, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
              <Phone size={17} color={theme.textMuted} />
              <TextInput
                style={[styles.inputInline, { color: theme.text }]}
                value={phone}
                onChangeText={(value) => { setPhone(value); clearMessages(); }}
                placeholder="e.g. +265 99 123 4567"
                placeholderTextColor={theme.textSoft}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
              />
            </View>
            <Text style={[styles.helpText, { color: theme.textMuted }]}>Use a number you can access. Include the country code when possible.</Text>
          </View>

          <View style={styles.profileActions}>
            {profileDirty ? (
              <Pressable style={[styles.resetBtn, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]} onPress={resetProfileChanges} disabled={saving}>
                <RotateCcw size={16} color={theme.textMuted} />
                <Text style={[styles.resetText, { color: theme.text }]}>Reset</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.saveBtn, { backgroundColor: profileDirty ? theme.accent : theme.surfaceMuted }, (!profileDirty || saving) && styles.disabled]}
              onPress={() => void saveProfile()}
              disabled={!profileDirty || saving}
            >
              {saving ? <ActivityIndicator size="small" color={theme.accentContrast} /> : <Check size={17} color={profileDirty ? theme.accentContrast : theme.textSoft} />}
              <Text style={[styles.saveText, { color: profileDirty ? theme.accentContrast : theme.textSoft }]}>{saving ? "Saving..." : "Save profile"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}>
          <SectionHeader
            icon={<ShieldCheck size={18} color={theme.accent} />}
            title="Sign-in email"
            body="Your sign-in email is managed by Supabase Auth and changes separately from your public profile."
            theme={theme}
          />

          <View style={[styles.currentEmailCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <View style={[styles.emailIcon, { backgroundColor: theme.surfaceMuted }]}><Mail size={18} color={theme.accent} /></View>
            <View style={styles.emailCopy}>
              <Text style={[styles.emailLabel, { color: theme.textMuted }]}>Current email</Text>
              <Text style={[styles.emailValue, { color: theme.text }]} numberOfLines={1}>{currentEmail || "No email available"}</Text>
            </View>
            {emailVerified ? <BadgeCheck size={19} color={theme.success} /> : <CircleAlert size={19} color={theme.warning} />}
          </View>

          {pendingEmail ? (
            <View style={[styles.pendingEmail, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
              <Mail size={16} color={theme.accent} />
              <View style={styles.pendingEmailCopy}>
                <Text style={[styles.pendingEmailTitle, { color: theme.text }]}>Confirmation pending</Text>
                <Text style={[styles.pendingEmailText, { color: theme.textMuted }]} numberOfLines={2}>{pendingEmail}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>New email address</Text>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
              value={emailDraft}
              onChangeText={(value) => { setEmailDraft(value); clearMessages(); }}
              placeholder="Enter a new sign-in email"
              placeholderTextColor={theme.textSoft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <Text style={[styles.helpText, { color: theme.textMuted }]}>The new address does not become active until the required confirmation steps are completed.</Text>
          </View>

          <Pressable
            style={[styles.emailBtn, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }, (!emailDraft.trim() || emailSaving) && styles.disabled]}
            onPress={() => void requestEmailChange()}
            disabled={!emailDraft.trim() || emailSaving}
          >
            {emailSaving ? <ActivityIndicator size="small" color={theme.accent} /> : <Mail size={17} color={theme.accent} />}
            <Text style={[styles.emailBtnText, { color: theme.text }]}>{emailSaving ? "Requesting..." : "Request email change"}</Text>
            {!emailSaving ? <ChevronRight size={17} color={theme.textSoft} /> : null}
          </Pressable>
        </View>

        <Pressable style={[styles.doneBtn, { backgroundColor: theme.surface, borderColor: theme.border }]} onPress={() => router.replace("/(student)/(tabs)/account" as any)}>
          <ArrowLeft size={17} color={theme.text} />
          <Text style={[styles.doneText, { color: theme.text }]}>Back to Account</Text>
        </Pressable>
      </ScrollView>

      <PhotoSheet
        visible={photoSheetOpen}
        previewUri={previewAvatar}
        hasStoredAvatar={Boolean(savedAvatarUrl)}
        theme={theme}
        onClose={() => setPhotoSheetOpen(false)}
        onChoose={() => void choosePhoto()}
        onRemove={markPhotoForRemoval}
      />
    </SafeAreaView>
  );
}

function SectionHeader({ icon, title, body, theme }: { icon: React.ReactNode; title: string; body: string; theme: any }) {
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.sectionIcon, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>{icon}</View>
      <View style={styles.sectionHeadCopy}>
        <Text style={[styles.sectionTitle, { color: theme.heading }]}>{title}</Text>
        <Text style={[styles.sectionBody, { color: theme.textMuted }]}>{body}</Text>
      </View>
    </View>
  );
}

function PhotoSheet({ visible, previewUri, hasStoredAvatar, theme, onClose, onChoose, onRemove }: { visible: boolean; previewUri: string | null; hasStoredAvatar: boolean; theme: any; onClose: () => void; onChoose: () => void; onRemove: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, 12) + 12 }]} onPress={(event) => event.stopPropagation()}>
            <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderCopy}>
                <Text style={[styles.sheetKicker, { color: theme.accent }]}>PROFILE PHOTO</Text>
                <Text style={[styles.sheetTitle, { color: theme.heading }]}>Choose how you appear on EYA</Text>
              </View>
              <Pressable style={[styles.sheetClose, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]} onPress={onClose}>
                <X size={19} color={theme.text} />
              </Pressable>
            </View>

            {previewUri ? (
              <Image source={{ uri: previewUri }} style={[styles.sheetPreview, { backgroundColor: theme.surfaceMuted }]} />
            ) : (
              <View style={[styles.sheetPreviewEmpty, { backgroundColor: theme.surfaceMuted }]}>
                <UserRound size={42} color={theme.accent} />
                <Text style={[styles.sheetPreviewText, { color: theme.textMuted }]}>No profile photo selected</Text>
              </View>
            )}

            <Pressable style={[styles.sheetAction, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]} onPress={onChoose}>
              <View style={[styles.sheetActionIcon, { backgroundColor: theme.accentSoft }]}><ImagePlus size={19} color={theme.accent} /></View>
              <View style={styles.sheetActionCopy}>
                <Text style={[styles.sheetActionTitle, { color: theme.text }]}>{previewUri ? "Choose another photo" : "Choose a photo"}</Text>
                <Text style={[styles.sheetActionText, { color: theme.textMuted }]}>Square crop • up to 8 MB • uploaded only when you save</Text>
              </View>
              <ChevronRight size={17} color={theme.textSoft} />
            </Pressable>

            {(previewUri || hasStoredAvatar) ? (
              <Pressable style={[styles.sheetAction, { backgroundColor: theme.isDark ? "#3f2430" : "#fff7f6", borderColor: theme.isDark ? "#67404d" : "#f6d5d0" }]} onPress={onRemove}>
                <View style={[styles.sheetActionIcon, { backgroundColor: theme.isDark ? "#56303e" : "#feeceb" }]}><Trash2 size={19} color={theme.danger} /></View>
                <View style={styles.sheetActionCopy}>
                  <Text style={[styles.sheetActionTitle, { color: theme.danger }]}>Remove profile photo</Text>
                  <Text style={[styles.sheetActionText, { color: theme.textMuted }]}>The change is applied when you save your profile.</Text>
                </View>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontSize: 13, fontWeight: "800" },
  stateWrap: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center", gap: 12 },
  stateIcon: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  stateTitle: { fontSize: 23, fontWeight: "900", textAlign: "center" },
  stateText: { fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center", maxWidth: 380 },
  headerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 11 },
  headerBtn: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  headerEyebrow: { fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  headerTitle: { fontSize: 23, fontWeight: "900", marginTop: 1 },
  content: { padding: 16, paddingTop: 5, paddingBottom: 46, gap: 13 },
  heroCard: { borderRadius: 28, borderWidth: 1, padding: 16, gap: 15 },
  avatarPressable: { width: 100, height: 100, position: "relative" },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarFallback: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  avatarFallbackText: { fontSize: 27, fontWeight: "900" },
  cameraBubble: { position: "absolute", right: -2, bottom: 2, width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  heroCopy: { gap: 6 },
  heroName: { fontSize: 25, lineHeight: 30, fontWeight: "900" },
  heroSub: { fontSize: 12, lineHeight: 18, fontWeight: "700", maxWidth: 520 },
  heroPills: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 4 },
  pill: { minHeight: 32, borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5 },
  pillText: { fontSize: 10, fontWeight: "900" },
  completionCard: { borderRadius: 18, borderWidth: 1, padding: 12, gap: 8 },
  completionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  completionTitle: { flex: 1, fontSize: 11, fontWeight: "900" },
  completionCount: { fontSize: 11, fontWeight: "900" },
  progressTrack: { height: 6, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 999 },
  completionHint: { fontSize: 10, lineHeight: 15, fontWeight: "700" },
  notice: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 16, fontWeight: "800" },
  sectionCard: { borderRadius: 25, borderWidth: 1, padding: 16, gap: 14 },
  sectionHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  sectionIcon: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sectionHeadCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 17, fontWeight: "900" },
  sectionBody: { fontSize: 10, lineHeight: 15, fontWeight: "700", marginTop: 2 },
  field: { gap: 6 },
  label: { fontSize: 11, fontWeight: "900" },
  optional: { fontSize: 10, fontWeight: "700" },
  input: { minHeight: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontWeight: "700" },
  inputWithIcon: { minHeight: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 8 },
  inputInline: { flex: 1, minHeight: 50, fontSize: 14, fontWeight: "700", paddingVertical: 0 },
  helpText: { fontSize: 10, lineHeight: 15, fontWeight: "700" },
  profileActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  resetBtn: { minHeight: 50, borderRadius: 25, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  resetText: { fontSize: 12, fontWeight: "900" },
  saveBtn: { flex: 1, minHeight: 50, borderRadius: 25, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  saveText: { fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.6 },
  currentEmailCard: { minHeight: 62, borderRadius: 17, borderWidth: 1, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  emailIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  emailCopy: { flex: 1, minWidth: 0 },
  emailLabel: { fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  emailValue: { fontSize: 12, fontWeight: "900", marginTop: 2 },
  pendingEmail: { borderRadius: 16, borderWidth: 1, padding: 11, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  pendingEmailCopy: { flex: 1 },
  pendingEmailTitle: { fontSize: 11, fontWeight: "900" },
  pendingEmailText: { fontSize: 10, fontWeight: "700", lineHeight: 14, marginTop: 2 },
  emailBtn: { minHeight: 52, borderRadius: 26, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  emailBtnText: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "900" },
  doneBtn: { minHeight: 52, borderRadius: 26, borderWidth: 1, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  doneText: { fontSize: 12, fontWeight: "900" },
  primaryBtn: { minHeight: 50, borderRadius: 25, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  primaryBtnText: { fontSize: 12, fontWeight: "900" },
  secondaryBtn: { minHeight: 50, borderRadius: 25, borderWidth: 1, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  secondaryBtnText: { fontSize: 12, fontWeight: "900" },
  modalRoot: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(5,13,28,0.46)", justifyContent: "flex-end" },
  sheet: { maxHeight: "88%", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, paddingHorizontal: 16, paddingTop: 10 },
  sheetHandle: { width: 46, height: 5, borderRadius: 999, alignSelf: "center", marginBottom: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  sheetHeaderCopy: { flex: 1 },
  sheetKicker: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  sheetTitle: { fontSize: 18, lineHeight: 22, fontWeight: "900", marginTop: 2 },
  sheetClose: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sheetPreview: { width: 142, height: 142, borderRadius: 71, alignSelf: "center", marginVertical: 8, marginBottom: 16 },
  sheetPreviewEmpty: { width: "100%", height: 140, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 },
  sheetPreviewText: { fontSize: 11, fontWeight: "800" },
  sheetAction: { minHeight: 68, borderRadius: 18, borderWidth: 1, padding: 10, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 },
  sheetActionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sheetActionCopy: { flex: 1 },
  sheetActionTitle: { fontSize: 12, fontWeight: "900" },
  sheetActionText: { fontSize: 9, lineHeight: 13, fontWeight: "700", marginTop: 2 },
});
