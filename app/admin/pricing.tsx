import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/providers/AuthProvider";
import { ENV } from "@/lib/env";
import { supabase } from "@/lib/supabase";

type PlanRow = {
  id?: string;
  localId: string;
  tier: string;
  audiencesText: string;
  monthlyLabel: string;
  description: string;
  featuresText: string;
  cta: string;
  route: string;
  goalWeightsText: string;
  sortOrder: string;
  isActive: boolean;
};

type TestimonialRow = {
  id?: string;
  localId: string;
  quote: string;
  byline: string;
  sortOrder: string;
  isActive: boolean;
};

type CaseStudyRow = {
  id?: string;
  localId: string;
  title: string;
  metric: string;
  detail: string;
  sortOrder: string;
  isActive: boolean;
};

type FaqRow = {
  id?: string;
  localId: string;
  question: string;
  answer: string;
  sortOrder: string;
  isActive: boolean;
};

const mkLocalId = () => `local_${Math.random().toString(36).slice(2, 10)}`;

function parseOrder(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 100;
}

function parseGoals(text: string): Record<string, number> {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return {};
    const safe: Record<string, number> = {};
    ["budget", "growth", "delivery", "trust"].forEach((k) => {
      const val = (parsed as any)[k];
      if (typeof val === "number") safe[k] = val;
    });
    return safe;
  } catch {
    return {};
  }
}

export default function AdminPricingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [testimonials, setTestimonials] = useState<TestimonialRow[]>([]);
  const [caseStudies, setCaseStudies] = useState<CaseStudyRow[]>([]);
  const [faqs, setFaqs] = useState<FaqRow[]>([]);

  const loadAll = async () => {
    setFetching(true);
    setMessage(null);
    try {
      if (ENV.DEV_AUTH_MODE) {
        setPlans([]);
        setTestimonials([]);
        setCaseStudies([]);
        setFaqs([]);
        setMessage("Dev admin mode: pricing tables are not loaded from Supabase.");
        return;
      }

      const [plansRes, testimonialsRes, caseStudiesRes, faqsRes] = await Promise.all([
        supabase
          .from("pricing_plans")
          .select("id,tier,audiences,monthly_label,description,features,cta,route,goal_weights,sort_order,is_active")
          .order("sort_order", { ascending: true }),
        supabase.from("pricing_testimonials").select("id,quote,byline,sort_order,is_active").order("sort_order", { ascending: true }),
        supabase.from("pricing_case_studies").select("id,title,metric,detail,sort_order,is_active").order("sort_order", { ascending: true }),
        supabase.from("pricing_faqs").select("id,question,answer,sort_order,is_active").order("sort_order", { ascending: true }),
      ]);

      if (plansRes.error) throw plansRes.error;
      if (testimonialsRes.error) throw testimonialsRes.error;
      if (caseStudiesRes.error) throw caseStudiesRes.error;
      if (faqsRes.error) throw faqsRes.error;

      setPlans(
        (plansRes.data ?? []).map((row: any) => ({
          id: row.id,
          localId: mkLocalId(),
          tier: row.tier ?? "Starter",
          audiencesText: Array.isArray(row.audiences) ? row.audiences.join(", ") : "",
          monthlyLabel: row.monthly_label ?? "",
          description: row.description ?? "",
          featuresText: Array.isArray(row.features) ? row.features.join("\n") : "",
          cta: row.cta ?? "",
          route: row.route ?? "",
          goalWeightsText: JSON.stringify(row.goal_weights ?? {}, null, 2),
          sortOrder: String(row.sort_order ?? 100),
          isActive: Boolean(row.is_active),
        })),
      );

      setTestimonials(
        (testimonialsRes.data ?? []).map((row: any) => ({
          id: row.id,
          localId: mkLocalId(),
          quote: row.quote ?? "",
          byline: row.byline ?? "",
          sortOrder: String(row.sort_order ?? 100),
          isActive: Boolean(row.is_active),
        })),
      );

      setCaseStudies(
        (caseStudiesRes.data ?? []).map((row: any) => ({
          id: row.id,
          localId: mkLocalId(),
          title: row.title ?? "",
          metric: row.metric ?? "",
          detail: row.detail ?? "",
          sortOrder: String(row.sort_order ?? 100),
          isActive: Boolean(row.is_active),
        })),
      );

      setFaqs(
        (faqsRes.data ?? []).map((row: any) => ({
          id: row.id,
          localId: mkLocalId(),
          question: row.question ?? "",
          answer: row.answer ?? "",
          sortOrder: String(row.sort_order ?? 100),
          isActive: Boolean(row.is_active),
        })),
      );
    } catch (e: any) {
      setMessage(e?.message ?? "Failed to load pricing tables.");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!loading && user) {
      void loadAll().catch(() => {
        setFetching(false);
      });
    }
  }, [loading, user]);

  const canRender = useMemo(() => !loading, [loading]);

  const savePlan = async (row: PlanRow) => {
    setSaving(row.localId);
    setMessage(null);
    try {
      if (ENV.DEV_AUTH_MODE) {
        setMessage("Dev admin mode: pricing changes are not saved to Supabase.");
        return;
      }

      const payload = {
        tier: row.tier,
        audiences: row.audiencesText
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        monthly_label: row.monthlyLabel,
        description: row.description,
        features: row.featuresText
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
        cta: row.cta,
        route: row.route,
        goal_weights: parseGoals(row.goalWeightsText),
        sort_order: parseOrder(row.sortOrder),
        is_active: row.isActive,
      };

      const res = row.id
        ? await supabase.from("pricing_plans").update(payload).eq("id", row.id)
        : await supabase.from("pricing_plans").insert(payload);

      if (res.error) throw res.error;
      setMessage("Saved plan.");
      await loadAll();
    } catch (e: any) {
      setMessage(e?.message ?? "Failed to save plan.");
    } finally {
      setSaving(null);
    }
  };

  const saveTestimonial = async (row: TestimonialRow) => {
    setSaving(row.localId);
    setMessage(null);
    try {
      if (ENV.DEV_AUTH_MODE) {
        setMessage("Dev admin mode: pricing changes are not saved to Supabase.");
        return;
      }

      const payload = {
        quote: row.quote,
        byline: row.byline,
        sort_order: parseOrder(row.sortOrder),
        is_active: row.isActive,
      };
      const res = row.id
        ? await supabase.from("pricing_testimonials").update(payload).eq("id", row.id)
        : await supabase.from("pricing_testimonials").insert(payload);
      if (res.error) throw res.error;
      setMessage("Saved testimonial.");
      await loadAll();
    } catch (e: any) {
      setMessage(e?.message ?? "Failed to save testimonial.");
    } finally {
      setSaving(null);
    }
  };

  const saveCaseStudy = async (row: CaseStudyRow) => {
    setSaving(row.localId);
    setMessage(null);
    try {
      if (ENV.DEV_AUTH_MODE) {
        setMessage("Dev admin mode: pricing changes are not saved to Supabase.");
        return;
      }

      const payload = {
        title: row.title,
        metric: row.metric,
        detail: row.detail,
        sort_order: parseOrder(row.sortOrder),
        is_active: row.isActive,
      };
      const res = row.id
        ? await supabase.from("pricing_case_studies").update(payload).eq("id", row.id)
        : await supabase.from("pricing_case_studies").insert(payload);
      if (res.error) throw res.error;
      setMessage("Saved case study.");
      await loadAll();
    } catch (e: any) {
      setMessage(e?.message ?? "Failed to save case study.");
    } finally {
      setSaving(null);
    }
  };

  const saveFaq = async (row: FaqRow) => {
    setSaving(row.localId);
    setMessage(null);
    try {
      if (ENV.DEV_AUTH_MODE) {
        setMessage("Dev admin mode: pricing changes are not saved to Supabase.");
        return;
      }

      const payload = {
        question: row.question,
        answer: row.answer,
        sort_order: parseOrder(row.sortOrder),
        is_active: row.isActive,
      };
      const res = row.id
        ? await supabase.from("pricing_faqs").update(payload).eq("id", row.id)
        : await supabase.from("pricing_faqs").insert(payload);
      if (res.error) throw res.error;
      setMessage("Saved FAQ.");
      await loadAll();
    } catch (e: any) {
      setMessage(e?.message ?? "Failed to save FAQ.");
    } finally {
      setSaving(null);
    }
  };

  if (!canRender) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f7fb", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10, color: "#5f6b85", fontWeight: "700" }}>Checking admin access...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f7fb" }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={{ width: "100%", maxWidth: 1120, alignSelf: "center", paddingHorizontal: 20, paddingTop: 20, gap: 12 }}>
          <Text style={{ color: "#0e2756", fontSize: 28, fontWeight: "900" }}>Pricing CMS (Admin)</Text>
          <Text style={{ color: "#5f6b85", fontSize: 13 }}>Manage pricing content used by the public pricing page.</Text>

          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Pressable onPress={() => void loadAll()} style={pill("#0e2756")}>
              <Text style={pillText("#fff")}>{fetching ? "Refreshing..." : "Refresh"}</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/pricing")} style={pill("#ff0f64")}>
              <Text style={pillText("#fff")}>Back to pricing page</Text>
            </Pressable>
          </View>

          {message ? (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#ffd4e3", backgroundColor: "#fff0f6", padding: 10 }}>
              <Text style={{ color: "#b0003a", fontSize: 12 }}>{message}</Text>
            </View>
          ) : null}

          <View style={cardStyle}>
            <SectionTitle title="Plans" actionLabel="Add plan" onAction={() => setPlans((prev) => [...prev, {
              localId: mkLocalId(),
              tier: "Starter",
              audiencesText: "student",
              monthlyLabel: "",
              description: "",
              featuresText: "",
              cta: "Start",
              route: "/contact",
              goalWeightsText: "{\"budget\": 1}",
              sortOrder: "100",
              isActive: true,
            }])} />
            {plans.map((row) => (
              <View key={row.localId} style={itemWrap}>
                <Field label="Tier"><TextInput value={row.tier} onChangeText={(v) => setPlans((p) => p.map((x) => x.localId === row.localId ? { ...x, tier: v } : x))} style={inputStyle} /></Field>
                <Field label="Audiences (comma separated)">
                  <TextInput value={row.audiencesText} onChangeText={(v) => setPlans((p) => p.map((x) => x.localId === row.localId ? { ...x, audiencesText: v } : x))} style={inputStyle} />
                </Field>
                <Field label="Monthly label"><TextInput value={row.monthlyLabel} onChangeText={(v) => setPlans((p) => p.map((x) => x.localId === row.localId ? { ...x, monthlyLabel: v } : x))} style={inputStyle} /></Field>
                <Field label="Description"><TextInput value={row.description} onChangeText={(v) => setPlans((p) => p.map((x) => x.localId === row.localId ? { ...x, description: v } : x))} style={[inputStyle, { minHeight: 76 }]} multiline /></Field>
                <Field label="Features (one per line)">
                  <TextInput value={row.featuresText} onChangeText={(v) => setPlans((p) => p.map((x) => x.localId === row.localId ? { ...x, featuresText: v } : x))} style={[inputStyle, { minHeight: 76 }]} multiline />
                </Field>
                <Field label="CTA"><TextInput value={row.cta} onChangeText={(v) => setPlans((p) => p.map((x) => x.localId === row.localId ? { ...x, cta: v } : x))} style={inputStyle} /></Field>
                <Field label="Route"><TextInput value={row.route} onChangeText={(v) => setPlans((p) => p.map((x) => x.localId === row.localId ? { ...x, route: v } : x))} style={inputStyle} /></Field>
                <Field label="Goal weights (JSON)">
                  <TextInput value={row.goalWeightsText} onChangeText={(v) => setPlans((p) => p.map((x) => x.localId === row.localId ? { ...x, goalWeightsText: v } : x))} style={[inputStyle, { minHeight: 76 }]} multiline />
                </Field>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Field label="Sort order"><TextInput value={row.sortOrder} onChangeText={(v) => setPlans((p) => p.map((x) => x.localId === row.localId ? { ...x, sortOrder: v } : x))} keyboardType="numeric" style={inputStyle} /></Field>
                  <Pressable onPress={() => setPlans((p) => p.map((x) => x.localId === row.localId ? { ...x, isActive: !x.isActive } : x))} style={[pill(row.isActive ? "#1f9d55" : "#6b7280"), { alignSelf: "flex-end" }]}>
                    <Text style={pillText("#fff")}>{row.isActive ? "Active" : "Inactive"}</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => void savePlan(row)} style={pill("#0e2756")} disabled={saving === row.localId}>
                  <Text style={pillText("#fff")}>{saving === row.localId ? "Saving..." : "Save plan"}</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <View style={cardStyle}>
            <SectionTitle title="Testimonials" actionLabel="Add testimonial" onAction={() => setTestimonials((prev) => [...prev, { localId: mkLocalId(), quote: "", byline: "", sortOrder: "100", isActive: true }])} />
            {testimonials.map((row) => (
              <View key={row.localId} style={itemWrap}>
                <Field label="Quote"><TextInput value={row.quote} onChangeText={(v) => setTestimonials((p) => p.map((x) => x.localId === row.localId ? { ...x, quote: v } : x))} style={[inputStyle, { minHeight: 70 }]} multiline /></Field>
                <Field label="Byline"><TextInput value={row.byline} onChangeText={(v) => setTestimonials((p) => p.map((x) => x.localId === row.localId ? { ...x, byline: v } : x))} style={inputStyle} /></Field>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Field label="Sort order"><TextInput value={row.sortOrder} onChangeText={(v) => setTestimonials((p) => p.map((x) => x.localId === row.localId ? { ...x, sortOrder: v } : x))} keyboardType="numeric" style={inputStyle} /></Field>
                  <Pressable onPress={() => setTestimonials((p) => p.map((x) => x.localId === row.localId ? { ...x, isActive: !x.isActive } : x))} style={[pill(row.isActive ? "#1f9d55" : "#6b7280"), { alignSelf: "flex-end" }]}>
                    <Text style={pillText("#fff")}>{row.isActive ? "Active" : "Inactive"}</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => void saveTestimonial(row)} style={pill("#0e2756")} disabled={saving === row.localId}>
                  <Text style={pillText("#fff")}>{saving === row.localId ? "Saving..." : "Save testimonial"}</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <View style={cardStyle}>
            <SectionTitle title="Case studies" actionLabel="Add case study" onAction={() => setCaseStudies((prev) => [...prev, { localId: mkLocalId(), title: "", metric: "", detail: "", sortOrder: "100", isActive: true }])} />
            {caseStudies.map((row) => (
              <View key={row.localId} style={itemWrap}>
                <Field label="Title"><TextInput value={row.title} onChangeText={(v) => setCaseStudies((p) => p.map((x) => x.localId === row.localId ? { ...x, title: v } : x))} style={inputStyle} /></Field>
                <Field label="Metric"><TextInput value={row.metric} onChangeText={(v) => setCaseStudies((p) => p.map((x) => x.localId === row.localId ? { ...x, metric: v } : x))} style={inputStyle} /></Field>
                <Field label="Detail"><TextInput value={row.detail} onChangeText={(v) => setCaseStudies((p) => p.map((x) => x.localId === row.localId ? { ...x, detail: v } : x))} style={inputStyle} /></Field>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Field label="Sort order"><TextInput value={row.sortOrder} onChangeText={(v) => setCaseStudies((p) => p.map((x) => x.localId === row.localId ? { ...x, sortOrder: v } : x))} keyboardType="numeric" style={inputStyle} /></Field>
                  <Pressable onPress={() => setCaseStudies((p) => p.map((x) => x.localId === row.localId ? { ...x, isActive: !x.isActive } : x))} style={[pill(row.isActive ? "#1f9d55" : "#6b7280"), { alignSelf: "flex-end" }]}>
                    <Text style={pillText("#fff")}>{row.isActive ? "Active" : "Inactive"}</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => void saveCaseStudy(row)} style={pill("#0e2756")} disabled={saving === row.localId}>
                  <Text style={pillText("#fff")}>{saving === row.localId ? "Saving..." : "Save case study"}</Text>
                </Pressable>
              </View>
            ))}
          </View>

          <View style={cardStyle}>
            <SectionTitle title="FAQs" actionLabel="Add FAQ" onAction={() => setFaqs((prev) => [...prev, { localId: mkLocalId(), question: "", answer: "", sortOrder: "100", isActive: true }])} />
            {faqs.map((row) => (
              <View key={row.localId} style={itemWrap}>
                <Field label="Question"><TextInput value={row.question} onChangeText={(v) => setFaqs((p) => p.map((x) => x.localId === row.localId ? { ...x, question: v } : x))} style={inputStyle} /></Field>
                <Field label="Answer"><TextInput value={row.answer} onChangeText={(v) => setFaqs((p) => p.map((x) => x.localId === row.localId ? { ...x, answer: v } : x))} style={[inputStyle, { minHeight: 70 }]} multiline /></Field>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Field label="Sort order"><TextInput value={row.sortOrder} onChangeText={(v) => setFaqs((p) => p.map((x) => x.localId === row.localId ? { ...x, sortOrder: v } : x))} keyboardType="numeric" style={inputStyle} /></Field>
                  <Pressable onPress={() => setFaqs((p) => p.map((x) => x.localId === row.localId ? { ...x, isActive: !x.isActive } : x))} style={[pill(row.isActive ? "#1f9d55" : "#6b7280"), { alignSelf: "flex-end" }]}>
                    <Text style={pillText("#fff")}>{row.isActive ? "Active" : "Inactive"}</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => void saveFaq(row)} style={pill("#0e2756")} disabled={saving === row.localId}>
                  <Text style={pillText("#fff")}>{saving === row.localId ? "Saving..." : "Save FAQ"}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ title, actionLabel, onAction }: { title: string; actionLabel: string; onAction: () => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: "#0e2756", fontSize: 18, fontWeight: "900" }}>{title}</Text>
      <Pressable onPress={onAction} style={pill("#ff0f64")}>
        <Text style={pillText("#fff")}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: "#0e2756", fontSize: 12, fontWeight: "800" }}>{label}</Text>
      {children}
    </View>
  );
}

const cardStyle = {
  borderRadius: 20,
  borderWidth: 1,
  borderColor: "#e2e8f8",
  backgroundColor: "#fff",
  padding: 12,
  gap: 10,
} as const;

const itemWrap = {
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "#e7ebf6",
  padding: 10,
  gap: 8,
  backgroundColor: "#f9fbff",
} as const;

const inputStyle = {
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#dbe2f5",
  backgroundColor: "#fff",
  paddingHorizontal: 10,
  paddingVertical: 9,
  color: "#0e2756",
  fontSize: 13,
  textAlignVertical: "top" as const,
} as const;

function pill(bg: string) {
  return {
    borderRadius: 999,
    backgroundColor: bg,
    paddingHorizontal: 12,
    paddingVertical: 8,
  } as const;
}

function pillText(color: string) {
  return {
    color,
    fontSize: 12,
    fontWeight: "900" as const,
  };
}
