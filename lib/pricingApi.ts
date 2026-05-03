import { supabase } from "@/lib/supabase";

export type PricingAudience = "student" | "landlord" | "vendor" | "restaurant";
export type PricingGoal = "budget" | "growth" | "delivery" | "trust";
export type PlanTier = "Starter" | "Growth" | "Pro";

export type PricingPlan = {
  tier: PlanTier;
  audience: PricingAudience[];
  monthlyLabel: string;
  description: string;
  features: string[];
  cta: string;
  route: string;
  goalWeights: Partial<Record<PricingGoal, number>>;
  sortOrder: number;
};

export type PricingTestimonial = {
  quote: string;
  by: string;
  sortOrder: number;
};

export type PricingCaseStudy = {
  title: string;
  metric: string;
  detail: string;
  sortOrder: number;
};

export type PricingFaq = {
  q: string;
  a: string;
  sortOrder: number;
};

export type PricingPageContent = {
  plans: PricingPlan[];
  testimonials: PricingTestimonial[];
  caseStudies: PricingCaseStudy[];
  faqs: PricingFaq[];
};

export const DEFAULT_PRICING_CONTENT: PricingPageContent = {
  plans: [
    {
      tier: "Starter",
      audience: ["student", "vendor"],
      monthlyLabel: "Free while rollout continues",
      description: "Best for exploring listings, testing demand, and getting started with core tools.",
      features: ["Browse and save listings", "Basic enquiry tools", "Simple profile visibility"],
      cta: "Start free",
      route: "/(auth)/signup",
      goalWeights: { budget: 2 },
      sortOrder: 1,
    },
    {
      tier: "Growth",
      audience: ["landlord", "vendor", "restaurant"],
      monthlyLabel: "Best value for active sellers",
      description: "Built for regular landlords and sellers who need stronger visibility and conversion.",
      features: ["Priority listing placement", "Performance insights", "Promotional campaign slots"],
      cta: "Choose Growth",
      route: "/(auth)/signup",
      goalWeights: { growth: 2, trust: 1 },
      sortOrder: 2,
    },
    {
      tier: "Pro",
      audience: ["landlord", "restaurant"],
      monthlyLabel: "For high-volume businesses",
      description: "For teams managing multiple units, inventory flows, and delivery-heavy operations.",
      features: ["Advanced analytics", "Delivery optimization support", "Dedicated success contact"],
      cta: "Talk to sales",
      route: "/contact",
      goalWeights: { growth: 2, delivery: 2, trust: 1 },
      sortOrder: 3,
    },
  ],
  testimonials: [
    {
      quote: "We doubled weekly room enquiries after switching to a stronger profile and promoted listings.",
      by: "Mwai, Landlord - Blantyre",
      sortOrder: 1,
    },
    {
      quote: "Students discovered our restaurant faster once delivery options and trust badges were visible.",
      by: "Tadala, Restaurant Owner",
      sortOrder: 2,
    },
    {
      quote: "The listing tools helped us reach more hostels near campus in less than two weeks.",
      by: "Ruth, Campus Vendor",
      sortOrder: 3,
    },
  ],
  caseStudies: [
    { title: "Landlord portfolio growth", metric: "+47%", detail: "More qualified enquiries in 30 days", sortOrder: 1 },
    { title: "Restaurant checkout lift", metric: "+32%", detail: "Higher order completion after delivery clarity", sortOrder: 2 },
    { title: "Vendor discovery reach", metric: "2.1x", detail: "Increase in listing views near campus zones", sortOrder: 3 },
  ],
  faqs: [
    {
      q: "Do students pay to browse rooms and marketplace products?",
      a: "No, browsing is currently free for students as feature rollout continues.",
      sortOrder: 1,
    },
    {
      q: "Is delivery included in every plan?",
      a: "Delivery is optional and charged per order based on distance and pickup/drop-off points.",
      sortOrder: 2,
    },
    {
      q: "Can I change plans later?",
      a: "Yes. You can upgrade when you need stronger visibility, analytics, or support.",
      sortOrder: 3,
    },
  ],
};

type DbPlan = {
  tier: string;
  audiences: string[] | null;
  monthly_label: string | null;
  description: string | null;
  features: string[] | null;
  cta: string | null;
  route: string | null;
  goal_weights: Record<string, number> | null;
  sort_order: number | null;
};

type DbTestimonial = {
  quote: string | null;
  byline: string | null;
  sort_order: number | null;
};

type DbCaseStudy = {
  title: string | null;
  metric: string | null;
  detail: string | null;
  sort_order: number | null;
};

type DbFaq = {
  question: string | null;
  answer: string | null;
  sort_order: number | null;
};

function toTier(v: string | null | undefined): PlanTier {
  if (v === "Growth" || v === "Pro") return v;
  return "Starter";
}

function toAudience(values: string[] | null | undefined): PricingAudience[] {
  const allowed: PricingAudience[] = ["student", "landlord", "vendor", "restaurant"];
  if (!values?.length) return ["student"];
  const normalized = values.filter((v): v is PricingAudience => allowed.includes(v as PricingAudience));
  return normalized.length ? normalized : ["student"];
}

function toGoalWeights(v: Record<string, number> | null | undefined): Partial<Record<PricingGoal, number>> {
  if (!v) return {};
  return {
    budget: typeof v.budget === "number" ? v.budget : undefined,
    growth: typeof v.growth === "number" ? v.growth : undefined,
    delivery: typeof v.delivery === "number" ? v.delivery : undefined,
    trust: typeof v.trust === "number" ? v.trust : undefined,
  };
}

export async function loadPricingPageContent(): Promise<PricingPageContent> {
  const [plansRes, testimonialsRes, caseStudiesRes, faqsRes] = await Promise.all([
    supabase
      .from("pricing_plans")
      .select("tier,audiences,monthly_label,description,features,cta,route,goal_weights,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase.from("pricing_testimonials").select("quote,byline,sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("pricing_case_studies").select("title,metric,detail,sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
    supabase.from("pricing_faqs").select("question,answer,sort_order").eq("is_active", true).order("sort_order", { ascending: true }),
  ]);

  const plans = plansRes.error
    ? DEFAULT_PRICING_CONTENT.plans
    : ((plansRes.data as DbPlan[] | null) ?? []).map((row, index) => ({
        tier: toTier(row.tier),
        audience: toAudience(row.audiences),
        monthlyLabel: row.monthly_label || DEFAULT_PRICING_CONTENT.plans[index]?.monthlyLabel || "Custom",
        description: row.description || DEFAULT_PRICING_CONTENT.plans[index]?.description || "",
        features: row.features?.length ? row.features : DEFAULT_PRICING_CONTENT.plans[index]?.features || [],
        cta: row.cta || DEFAULT_PRICING_CONTENT.plans[index]?.cta || "Learn more",
        route: row.route || DEFAULT_PRICING_CONTENT.plans[index]?.route || "/contact",
        goalWeights: toGoalWeights(row.goal_weights),
        sortOrder: row.sort_order ?? index + 1,
      }));

  const testimonials = testimonialsRes.error
    ? DEFAULT_PRICING_CONTENT.testimonials
    : ((testimonialsRes.data as DbTestimonial[] | null) ?? []).map((row, index) => ({
        quote: row.quote || DEFAULT_PRICING_CONTENT.testimonials[index]?.quote || "",
        by: row.byline || DEFAULT_PRICING_CONTENT.testimonials[index]?.by || "EYA user",
        sortOrder: row.sort_order ?? index + 1,
      }));

  const caseStudies = caseStudiesRes.error
    ? DEFAULT_PRICING_CONTENT.caseStudies
    : ((caseStudiesRes.data as DbCaseStudy[] | null) ?? []).map((row, index) => ({
        title: row.title || DEFAULT_PRICING_CONTENT.caseStudies[index]?.title || "",
        metric: row.metric || DEFAULT_PRICING_CONTENT.caseStudies[index]?.metric || "",
        detail: row.detail || DEFAULT_PRICING_CONTENT.caseStudies[index]?.detail || "",
        sortOrder: row.sort_order ?? index + 1,
      }));

  const faqs = faqsRes.error
    ? DEFAULT_PRICING_CONTENT.faqs
    : ((faqsRes.data as DbFaq[] | null) ?? []).map((row, index) => ({
        q: row.question || DEFAULT_PRICING_CONTENT.faqs[index]?.q || "",
        a: row.answer || DEFAULT_PRICING_CONTENT.faqs[index]?.a || "",
        sortOrder: row.sort_order ?? index + 1,
      }));

  return {
    plans: plans.length ? plans : DEFAULT_PRICING_CONTENT.plans,
    testimonials: testimonials.length ? testimonials : DEFAULT_PRICING_CONTENT.testimonials,
    caseStudies: caseStudies.length ? caseStudies : DEFAULT_PRICING_CONTENT.caseStudies,
    faqs: faqs.length ? faqs : DEFAULT_PRICING_CONTENT.faqs,
  };
}



