import React from "react";
import { Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

export default function AboutPage() {
  return (
    <PublicPageShell title="About Pa-Level">
      <View style={{ gap: 16 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14 }}>Built for students. Built in Malawi. Built by VAC Team.</Text>

        <Card title="What is Pa-Level?">
          Pa-Level is a student accommodation marketplace designed to help university students in Malawi find safe,
          verified, and affordable housing near their campuses.
        </Card>

        <Card title="Our Mission">
          Our mission is to modernize student housing in Malawi by creating a transparent, secure, and easy-to-use
          digital platform where students can confidently search, compare, and contact landlords.
        </Card>

        <Card title="Who Built Pa-Level?">
          Pa-Level was built by VAC Team, a Malawi-based digital technology team focused on building local solutions
          for real problems.
        </Card>

        <Card title="Why Pa-Level Matters">
          • Reduces housing scams. {"\n"}• Improves landlord accountability. {"\n"}• Gives students verified information.
          {"\n"}• Encourages transparency through reviews and reports.
        </Card>

        <View style={{ borderRadius: 20, backgroundColor: "#0e2756", padding: 16 }}>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>Ownership & Development</Text>
          <Text style={{ marginTop: 8, color: "#d8e1f5", fontSize: 14, lineHeight: 21 }}>
            Pa-Level is owned and developed by VAC Team. All intellectual property, branding, and platform systems are
            managed under VAC Team.
          </Text>
        </View>
      </View>
    </PublicPageShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ borderRadius: 20, backgroundColor: "#fff", padding: 16, borderWidth: 1, borderColor: "#e8ebf5" }}>
      <Text style={{ color: "#0e2756", fontSize: 18, fontWeight: "900" }}>{title}</Text>
      <Text style={{ marginTop: 8, color: "#5f6b85", fontSize: 14, lineHeight: 21 }}>{children}</Text>
    </View>
  );
}
