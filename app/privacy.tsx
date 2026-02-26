import React from "react";
import { Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

export default function PrivacyPage() {
  return (
    <PublicPageShell title="Privacy Policy">
      <View style={{ gap: 14 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14 }}>Last updated: {new Date().getFullYear()}</Text>

        <Section title="1. Introduction">
          Pa-Level is a student accommodation marketplace built by VAC Team. We value your privacy and are committed to protecting your personal information.
        </Section>

        <Section title="2. Information We Collect">
          • Account information (name, email, role){"\n"}• Contact details provided in listings{"\n"}• Reviews and reports submitted by users{"\n"}• Basic usage and interaction data
        </Section>

        <Section title="3. How We Use Your Information">
          • To operate and improve the platform{"\n"}• To connect students and landlords{"\n"}• To investigate reports and improve safety{"\n"}• To communicate important updates
        </Section>

        <Section title="4. Payments Disclaimer">Pa-Level does not process payments between students and landlords.</Section>
        <Section title="5. Data Security">We use secure systems and modern backend infrastructure to protect your data.</Section>
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
