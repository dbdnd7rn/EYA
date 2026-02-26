import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ClipboardList,
  MessageCircle,
  Search,
  ShieldAlert,
  UserPlus,
} from "lucide-react-native";

type Step = {
  title: string;
  desc: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
};

const studentSteps: Step[] = [
  { Icon: UserPlus, title: "Create an account", desc: "Sign up and verify your email to access features." },
  { Icon: Search, title: "Search rooms", desc: "Browse hostels & bedsitters near your campus." },
  { Icon: MessageCircle, title: "Send enquiries", desc: "Message landlords to confirm availability & rules." },
  { Icon: ShieldAlert, title: "Payment safety", desc: "We don't handle payments. View first before paying." },
];

const landlordSteps: Step[] = [
  { Icon: UserPlus, title: "Create an account", desc: "Sign up and verify your email." },
  {
    Icon: Building2,
    title: "Add listing details",
    desc: "Upload photos, price, rules, location & amenities.",
  },
  { Icon: BadgeCheck, title: "Get verified", desc: "Verification helps students trust your listing." },
  {
    Icon: ClipboardList,
    title: "Manage enquiries",
    desc: "Reply to students fast and fill rooms quicker.",
  },
];

export default function HomeHowItWorksSection() {
  const router = useRouter();

  return (
    <View style={{ width: "100%", maxWidth: 1120, alignSelf: "center", paddingHorizontal: 24, paddingTop: 56 }}>
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 34, fontWeight: "900", color: "#0e2756", textAlign: "center" }}>
          How it works
        </Text>
        <Text
          style={{
            marginTop: 8,
            maxWidth: 680,
            textAlign: "center",
            color: "#5f6b85",
            fontSize: 14,
            lineHeight: 22,
          }}
        >
          Pa-Level helps students find accommodation near campus and helps landlords list rooms faster - all in one
          place.
        </Text>
      </View>

      <FlowCard
        title="For Students"
        subtitle="Create an account -> find a room -> message the landlord."
        ctaText="Create student account"
        ctaColor="#ff0f64"
        onPress={() => router.push({ pathname: "/(auth)/signup", params: { role: "student" } })}
        steps={studentSteps}
      >
        <View
          style={{
            marginTop: 24,
            borderRadius: 16,
            backgroundColor: "#fff0f6",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: "#ffd4e3",
          }}
        >
          <Text style={{ color: "#b0003a", fontSize: 13, lineHeight: 20 }}>
            <Text style={{ fontWeight: "700" }}>Payment notice:</Text> Pa-Level does not collect or process rent
            payments. Any payment made to a landlord is at your own risk. We recommend viewing a place first and never
            sending money for a room you haven't confirmed.
          </Text>
        </View>
      </FlowCard>

      <FlowCard
        title="For Landlords"
        subtitle="Create an account -> list your rooms -> get enquiries."
        ctaText="Create landlord account"
        ctaColor="#0e2756"
        onPress={() => router.push({ pathname: "/(auth)/signup", params: { role: "landlord" } })}
        steps={landlordSteps}
      >
        <Pressable
          onPress={() => router.push("/(auth)/login")}
          style={{
            marginTop: 24,
            alignSelf: "flex-start",
            borderRadius: 16,
            backgroundColor: "#f6f7fb",
            borderWidth: 1,
            borderColor: "#e1e4ef",
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: "#0e2756", fontSize: 14, fontWeight: "700" }}>Login</Text>
        </Pressable>
      </FlowCard>

      <View
        style={{
          marginTop: 40,
          borderRadius: 28,
          backgroundColor: "#0e2756",
          padding: 28,
          shadowColor: "#0e2756",
          shadowOpacity: 0.25,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 4,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 26, fontWeight: "900" }}>Start searching now</Text>
        <Text style={{ marginTop: 6, color: "rgba(255,255,255,0.84)", fontSize: 14, lineHeight: 22 }}>
          Login to browse rooms, save favourites, and message landlords.
        </Text>

        <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Pressable
            onPress={() => router.push("/(auth)/login")}
            style={{ borderRadius: 16, backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 13 }}
          >
            <Text style={{ color: "#0e2756", fontSize: 14, fontWeight: "900" }}>Login</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push({ pathname: "/(auth)/signup", params: { role: "student" } })}
            style={{
              borderRadius: 16,
              backgroundColor: "#ff0f64",
              paddingHorizontal: 20,
              paddingVertical: 13,
              shadowColor: "#ff0f64",
              shadowOpacity: 0.28,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 8 },
              elevation: 3,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "900" }}>Sign up (Student)</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function FlowCard({
  title,
  subtitle,
  ctaText,
  ctaColor,
  onPress,
  steps,
  children,
}: {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaColor: string;
  onPress: () => void;
  steps: Step[];
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        marginTop: 40,
        borderRadius: 28,
        backgroundColor: "#fff",
        padding: 24,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 4,
      }}
    >
      <View style={{ gap: 12 }}>
        <View>
          <Text style={{ fontSize: 16, fontWeight: "900", color: "#0e2756" }}>{title}</Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: "#5f6b85" }}>{subtitle}</Text>
        </View>

        <Pressable
          onPress={onPress}
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderRadius: 16,
            backgroundColor: ctaColor,
            paddingHorizontal: 16,
            paddingVertical: 12,
            shadowColor: ctaColor,
            shadowOpacity: 0.2,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
            elevation: 3,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{ctaText}</Text>
          <ArrowRight size={16} color="#fff" />
        </Pressable>
      </View>

      <View style={{ marginTop: 16, gap: 12 }}>
        {steps.map((step, index) => (
          <StepCard key={step.title} step={index + 1} stepData={step} />
        ))}
      </View>

      {children}
    </View>
  );
}

function StepCard({ stepData, step }: { stepData: Step; step: number }) {
  const Icon = stepData.Icon;

  return (
    <View
      style={{
        borderRadius: 24,
        backgroundColor: "#f6f7fb",
        padding: 18,
        borderWidth: 1,
        borderColor: "#e1e4ef",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View
          style={{
            height: 44,
            width: 44,
            borderRadius: 16,
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "#ffd1e3",
          }}
        >
          <Icon size={20} color="#ff0f64" />
        </View>

        <View
          style={{
            borderRadius: 999,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: "#e1e4ef",
            paddingHorizontal: 12,
            paddingVertical: 5,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "900", color: "#0e2756" }}>Step {step}</Text>
        </View>
      </View>

      <Text style={{ marginTop: 12, fontSize: 16, fontWeight: "900", color: "#0e2756" }}>{stepData.title}</Text>
      <Text style={{ marginTop: 4, color: "#5f6b85", fontSize: 14, lineHeight: 20 }}>{stepData.desc}</Text>
    </View>
  );
}
