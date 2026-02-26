import React from "react";
import { Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

const FAQS = [
  {
    q: "Is Pa-Level free to use?",
    a: "Yes. Students can browse listings and contact landlords. Some landlord features may require verification or subscription depending on the platform rules.",
  },
  {
    q: "Does Pa-Level handle payments?",
    a: "No. Pa-Level does not process payments to landlords. Always view the place first before sending any money.",
  },
  {
    q: "How do I report a listing?",
    a: "Open the room page and tap Report listing. Your report goes to the admin team for review.",
  },
  {
    q: "Why do some listings show VERIFIED?",
    a: "Verified means the landlord has been verified through our checks where applicable.",
  },
];

export default function FAQsPage() {
  return (
    <PublicPageShell title="FAQs">
      <View style={{ gap: 12 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14 }}>
          Quick answers about using Pa-Level. If you still need help, contact support.
        </Text>

        {FAQS.map((f) => (
          <View key={f.q} style={{ borderRadius: 20, backgroundColor: "#fff", padding: 14, borderWidth: 1, borderColor: "#e8ebf5" }}>
            <Text style={{ color: "#0e2756", fontSize: 14, fontWeight: "900" }}>{f.q}</Text>
            <Text style={{ marginTop: 6, color: "#5f6b85", fontSize: 13, lineHeight: 20 }}>{f.a}</Text>
          </View>
        ))}
      </View>
    </PublicPageShell>
  );
}
