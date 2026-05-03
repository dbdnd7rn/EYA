import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ClipboardList,
  CookingPot,
  Bike,
  MapPinned,
  MessageCircle,
  PackageSearch,
  Search,
  Store,
  UserPlus,
} from "lucide-react-native";

type Step = {
  title: string;
  desc: string;
  Icon: React.ComponentType<{ size?: number; color?: string }>;
};

const studentSteps: Step[] = [
  { Icon: UserPlus, title: "Create an account", desc: "Sign up and verify your email to access features." },
  { Icon: Search, title: "Explore sections", desc: "Switch between rooms, products, and restaurants near campus." },
  { Icon: MapPinned, title: "Check exact location", desc: "View where each room, vendor, or restaurant is based." },
  { Icon: Bike, title: "Request delivery", desc: "Tap deliver to your door and pay an extra delivery fee." },
];

const landlordSteps: Step[] = [
  { Icon: UserPlus, title: "Create an account", desc: "Sign up and verify your email." },
  {
    Icon: Store,
    title: "Create your storefront",
    desc: "Publish room listings, campus products, or daily restaurant offers.",
  },
  { Icon: BadgeCheck, title: "Get verified", desc: "Verification helps buyers trust your listings and menus." },
  {
    Icon: ClipboardList,
    title: "Manage incoming orders",
    desc: "Respond quickly, confirm stock, and prepare items for delivery.",
  },
];

const deliverySteps: Step[] = [
  { Icon: PackageSearch, title: "Order received", desc: "Rider sees pickup and drop-off details immediately." },
  { Icon: CookingPot, title: "Pick up order", desc: "Collect from vendor or restaurant and confirm in-app." },
  { Icon: MessageCircle, title: "Update customer", desc: "Share arrival updates while heading to doorstep." },
  { Icon: Building2, title: "Complete delivery", desc: "Deliver safely and close the order with proof." },
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
          EYA now combines student accommodation, local campus shopping, and restaurant ordering with optional paid
          delivery.
        </Text>
      </View>

      <FlowCard
        title="For Students"
        subtitle="Create an account -> find rooms/products/food -> request delivery if needed."
        ctaText="Create account"
        ctaColor="#ff0f64"
        onPress={() => router.push("/(auth)/signup")}
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
              <Text style={{ fontWeight: "700" }}>Payment notice:</Text> Confirm product quality, menu details, and
              delivery charges before paying. Always verify the listing location shown in-app.
            </Text>
          </View>
      </FlowCard>

      <FlowCard
        title="For Vendors and Property Owners"
        subtitle="Create account -> publish listings -> receive enquiries and orders."
        ctaText="Create account"
        ctaColor="#0e2756"
        onPress={() => router.push("/(auth)/signup")}
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

      <FlowCard
        title="For Delivery Riders"
        subtitle="Accept order -> pick up -> deliver to customer doorstep."
        ctaText="Create agent account"
        ctaColor="#305f0e"
        onPress={() => router.push("/(auth)/signup")}
        steps={deliverySteps}
      />

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
          Login to browse rooms, shop products, order food, and request paid doorstep delivery.
        </Text>

        <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Pressable
            onPress={() => router.push("/(auth)/login")}
            style={{ borderRadius: 16, backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 13 }}
          >
            <Text style={{ color: "#0e2756", fontSize: 14, fontWeight: "900" }}>Login</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/(auth)/signup")}
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
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "900" }}>Sign up</Text>
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



