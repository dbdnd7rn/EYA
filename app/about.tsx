import React from "react";
import { Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

export default function AboutPage() {
  return (
    <PublicPageShell title="About EYA">
      <View style={{ gap: 16 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14 }}>Built for students. Built in Malawi. Built by VAC Team.</Text>

        <Card title="What is EYA?">
          EYA is a campus living marketplace that combines student accommodation, product vendors, and restaurant
          delivery services in one app.
        </Card>

        <Card title="Our Mission">
          Our mission is to simplify university life in Malawi by giving students one trusted place to find housing,
          buy essentials, order meals, and request doorstep delivery.
        </Card>

        <Card title="Who Built EYA?">
          EYA was built by VAC Team, a Malawi-based digital technology team focused on building local solutions
          for real problems.
        </Card>

        <Card title="Why EYA Matters">
          - Reduces housing and marketplace scams.{"\n"}
          - Improves accountability for property owners, vendors, and restaurants.{"\n"}
          - Gives students clear location data before placing orders.{"\n"}
          - Supports local campus businesses through digital discovery.
        </Card>

        <View style={{ borderRadius: 20, backgroundColor: "#0e2756", padding: 16 }}>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>Ownership and Development</Text>
          <Text style={{ marginTop: 8, color: "#d8e1f5", fontSize: 14, lineHeight: 21 }}>
            EYA is owned and developed by VAC Team. All intellectual property, branding, and platform systems are
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


