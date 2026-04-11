import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Href, useRouter } from "expo-router";
import PublicPageShell from "@/components/PublicPageShell";
import {
  DEFAULT_PRICING_CONTENT,
  loadPricingPageContent,
  PricingAudience,
  PricingGoal,
  PricingPlan,
} from "@/lib/pricingApi";
import { useAuth } from "@/providers/AuthProvider";

const AUDIENCE_OPTIONS: { id: PricingAudience; label: string }[] = [
  { id: "student", label: "Student" },
  { id: "landlord", label: "Landlord" },
  { id: "vendor", label: "Vendor" },
  { id: "restaurant", label: "Restaurant" },
];

const GOAL_OPTIONS: { id: PricingGoal; label: string }[] = [
  { id: "budget", label: "Lower cost" },
  { id: "growth", label: "Get more customers" },
  { id: "delivery", label: "Enable delivery" },
  { id: "trust", label: "Build trust faster" },
];

export default function PricingPage() {
  const router = useRouter();
  const { role } = useAuth();
  const [audience, setAudience] = useState<PricingAudience>("student");
  const [goals, setGoals] = useState<PricingGoal[]>(["budget"]);
  const [plans, setPlans] = useState<PricingPlan[]>(DEFAULT_PRICING_CONTENT.plans);
  const [testimonials, setTestimonials] = useState(DEFAULT_PRICING_CONTENT.testimonials);
  const [caseStudies, setCaseStudies] = useState(DEFAULT_PRICING_CONTENT.caseStudies);
  const [faqs, setFaqs] = useState(DEFAULT_PRICING_CONTENT.faqs);
  const [loadingRemote, setLoadingRemote] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const remote = await loadPricingPageContent();
        if (!active) return;
        setPlans(remote.plans);
        setTestimonials(remote.testimonials);
        setCaseStudies(remote.caseStudies);
        setFaqs(remote.faqs);
      } finally {
        if (active) setLoadingRemote(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const recommendedPlans = useMemo(() => {
    const score = (plan: PricingPlan) => {
      let points = 0;
      if (plan.audience.includes(audience)) points += 3;
      goals.forEach((goal) => {
        points += plan.goalWeights[goal] ?? 0;
      });
      return points;
    };

    return [...plans].sort((a, b) => score(b) - score(a));
  }, [audience, goals, plans]);

  const toggleGoal = (goal: PricingGoal) => {
    setGoals((prev) => {
      if (prev.includes(goal)) return prev.filter((g) => g !== goal);
      return [...prev, goal];
    });
  };

  return (
    <PublicPageShell title="Pricing">
      <View style={{ gap: 14 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14, lineHeight: 21 }}>
          EYA is currently free for students to browse accommodation, marketplace products, and nearby restaurants.
        </Text>
        <Text style={{ color: "#5f6b85", fontSize: 14, lineHeight: 21 }}>
          Vendors, landlords, and restaurants can create and manage listings with generous access while we roll out full
          commerce features.
        </Text>
        <Text style={{ color: "#5f6b85", fontSize: 14, lineHeight: 21 }}>
          Doorstep delivery is optional and charged as an extra fee per order based on pickup and drop-off location.
        </Text>

        <View style={{ marginTop: 8, borderRadius: 20, borderWidth: 1, borderColor: "#dbe4f5", padding: 14, gap: 12 }}>
          <Text style={{ color: "#0e2756", fontSize: 17, fontWeight: "900" }}>AI-powered plan recommendation</Text>
          <Text style={{ color: "#5f6b85", fontSize: 13, lineHeight: 20 }}>
            Tell us who you are and your goals, then we rank the best plan fit for you.
          </Text>
          {loadingRemote ? <Text style={{ color: "#5f6b85", fontSize: 12 }}>Syncing latest pricing data...</Text> : null}
          {role === "admin" ? (
            <Pressable onPress={() => router.push("/admin/pricing")} style={{ alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#0e2756", paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "900" }}>Open admin pricing editor</Text>
            </Pressable>
          ) : null}

          <View style={{ gap: 8 }}>
            <Text style={{ color: "#0e2756", fontSize: 13, fontWeight: "800" }}>I am a...</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {AUDIENCE_OPTIONS.map((option) => {
                const active = option.id === audience;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => setAudience(option.id)}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 13,
                      paddingVertical: 8,
                      borderWidth: 1,
                      borderColor: active ? "#0e2756" : "#cfd8ee",
                      backgroundColor: active ? "#e9f0ff" : "#fff",
                    }}
                  >
                    <Text style={{ color: active ? "#0e2756" : "#5f6b85", fontWeight: "800", fontSize: 12 }}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: "#0e2756", fontSize: 13, fontWeight: "800" }}>My goals are...</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {GOAL_OPTIONS.map((option) => {
                const active = goals.includes(option.id);
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => toggleGoal(option.id)}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 13,
                      paddingVertical: 8,
                      borderWidth: 1,
                      borderColor: active ? "#ff0f64" : "#cfd8ee",
                      backgroundColor: active ? "#ffe7f1" : "#fff",
                    }}
                  >
                    <Text style={{ color: active ? "#99163f" : "#5f6b85", fontWeight: "800", fontSize: 12 }}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            {recommendedPlans.slice(0, 2).map((plan, index) => (
              <View
                key={plan.tier}
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: index === 0 ? "#0e2756" : "#e1e8f6",
                  backgroundColor: index === 0 ? "#f0f5ff" : "#fff",
                  padding: 12,
                  gap: 7,
                }}
              >
                <Text style={{ color: "#0e2756", fontSize: 15, fontWeight: "900" }}>
                  {index === 0 ? "Top Recommendation: " : "Alternative: "}
                  {plan.tier}
                </Text>
                <Text style={{ color: "#5f6b85", fontSize: 12 }}>{plan.monthlyLabel}</Text>
                <Text style={{ color: "#5f6b85", fontSize: 13, lineHeight: 20 }}>{plan.description}</Text>
                <View style={{ gap: 3 }}>
                  {plan.features.map((feature) => (
                    <Text key={feature} style={{ color: "#0e2756", fontSize: 12 }}>
                      - {feature}
                    </Text>
                  ))}
                </View>
                <Pressable
                  onPress={() => router.push(plan.route as Href)}
                  style={{
                    marginTop: 4,
                    alignSelf: "flex-start",
                    borderRadius: 999,
                    paddingHorizontal: 13,
                    paddingVertical: 8,
                    backgroundColor: index === 0 ? "#0e2756" : "#ff0f64",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>{plan.cta}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 8, borderRadius: 20, borderWidth: 1, borderColor: "#dbe4f5", padding: 14, gap: 12 }}>
          <Text style={{ color: "#0e2756", fontSize: 17, fontWeight: "900" }}>Trust and growth</Text>
          <Text style={{ color: "#5f6b85", fontSize: 13, lineHeight: 20 }}>
            Real outcomes from active users, transparent plan comparison, and direct support when you need help.
          </Text>

          <View style={{ gap: 8 }}>
            {testimonials.map((item) => (
              <View key={item.by} style={{ borderRadius: 14, backgroundColor: "#f7f9ff", padding: 11 }}>
                <Text style={{ color: "#0e2756", fontSize: 13, lineHeight: 19 }}>"{item.quote}"</Text>
                <Text style={{ marginTop: 5, color: "#5f6b85", fontSize: 12, fontWeight: "800" }}>{item.by}</Text>
              </View>
            ))}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: "#0e2756", fontSize: 14, fontWeight: "900" }}>Case study snapshots</Text>
            {caseStudies.map((item) => (
              <View
                key={item.title}
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#e2e8f8",
                  backgroundColor: "#fff",
                  padding: 11,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#0e2756", fontSize: 13, fontWeight: "800" }}>{item.title}</Text>
                  <Text style={{ marginTop: 3, color: "#5f6b85", fontSize: 12 }}>{item.detail}</Text>
                </View>
                <Text style={{ color: "#ff0f64", fontSize: 19, fontWeight: "900" }}>{item.metric}</Text>
              </View>
            ))}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: "#0e2756", fontSize: 14, fontWeight: "900" }}>Plan comparison</Text>
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f8", overflow: "hidden" }}>
              {[
                "Priority listing placement | No | Yes | Yes",
                "Delivery optimization tools | No | Limited | Full",
                "Performance analytics | Basic | Standard | Advanced",
                "Dedicated support | Community | Fast lane | Dedicated",
              ].map((row, index) => {
                const [feature, starter, growth, pro] = row.split(" | ");
                return (
                  <View
                    key={feature}
                    style={{
                      flexDirection: "row",
                      backgroundColor: index % 2 ? "#f9fbff" : "#fff",
                      paddingVertical: 9,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text style={{ flex: 2, color: "#0e2756", fontSize: 12, fontWeight: "700" }}>{feature}</Text>
                    <Text style={{ flex: 1, color: "#5f6b85", fontSize: 12 }}>{starter}</Text>
                    <Text style={{ flex: 1, color: "#5f6b85", fontSize: 12 }}>{growth}</Text>
                    <Text style={{ flex: 1, color: "#5f6b85", fontSize: 12 }}>{pro}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: "#0e2756", fontSize: 14, fontWeight: "900" }}>Quick pricing FAQs</Text>
            {faqs.map((f) => (
              <View key={f.q} style={{ borderRadius: 14, borderWidth: 1, borderColor: "#e6ebf8", padding: 10 }}>
                <Text style={{ color: "#0e2756", fontSize: 13, fontWeight: "800" }}>{f.q}</Text>
                <Text style={{ marginTop: 4, color: "#5f6b85", fontSize: 12, lineHeight: 19 }}>{f.a}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
            <Pressable
              onPress={() => router.push("/support")}
              style={{ backgroundColor: "#0e2756", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "900" }}>Live chat / support</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/faqs")}
              style={{ backgroundColor: "#ff0f64", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "900" }}>View full FAQs</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/contact")}
              style={{ backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: "#d4dcef" }}
            >
              <Text style={{ color: "#0e2756", fontSize: 12, fontWeight: "900" }}>Contact sales</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </PublicPageShell>
  );
}



