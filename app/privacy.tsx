import React from "react";
import { Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

export default function PrivacyPage() {
  return (
    <PublicPageShell title="Privacy Policy">
      <View style={{ gap: 14 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14 }}>Last updated: March 3, 2026</Text>

        <Section title="1. Introduction">
          EYA is a campus living marketplace built by VAC Team. We are committed to protecting personal
          information across accommodation, vendor, and restaurant experiences.
        </Section>

        <Section title="2. Information We Collect">
          - Account details (name, email, role).{"\n"}
          - Contact information shared in listings and support tickets.{"\n"}
          - Listing, order, and delivery interaction data.{"\n"}
          - Basic app usage and device diagnostics.
        </Section>

        <Section title="3. How We Use Your Information">
          - To operate and improve marketplace features.{"\n"}
          - To connect students with property owners, vendors, restaurants, and delivery services.{"\n"}
          - To investigate abuse, reports, and safety incidents.{"\n"}
          - To communicate product and policy updates.
        </Section>

        <Section title="4. Payments Disclaimer">
          EYA currently does not directly process checkout payments between buyers and sellers.
        </Section>

        <Section title="5. Delivery Data">
          Delivery requests may include pickup and drop-off details needed to complete orders safely.
        </Section>

        <Section title="6. Data Security">
          We use secure infrastructure and access controls to reduce unauthorized access to user data.
        </Section>
      </View>
    </PublicPageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={{ color: "#0e2756", fontSize: 16, fontWeight: "800" }}>{title}</Text>
      <Text style={{ marginTop: 4, color: "#5f6b85", fontSize: 14, lineHeight: 21 }}>{children}</Text>
    </View>
  );
}



