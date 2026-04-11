import React from "react";
import { Text, View } from "react-native";
import PublicPageShell from "@/components/PublicPageShell";

const FAQS = [
  {
    q: "Is EYA free to use?",
    a: "Yes. Browsing rooms, marketplace products, and nearby restaurants is currently free while we continue rolling out features.",
  },
  {
    q: "Does EYA handle payments?",
    a: "Not yet. Confirm listing details, product quality, and delivery charges before paying any seller or restaurant.",
  },
  {
    q: "Can I request doorstep delivery?",
    a: "Yes. Eligible products and restaurant orders include a 'Deliver to door' option with an extra delivery fee.",
  },
  {
    q: "How do I verify item location?",
    a: "Each listing shows area and campus details so you can confirm where the product or restaurant is located before ordering.",
  },
  {
    q: "How do I report a vendor, room, or restaurant?",
    a: "Go to Support and submit a report. Include as much detail as possible so the team can investigate quickly.",
  },
];

export default function FAQsPage() {
  return (
    <PublicPageShell title="FAQs">
      <View style={{ gap: 12 }}>
        <Text style={{ color: "#5f6b85", fontSize: 14 }}>
          Quick answers about using EYA. If you still need help, contact support.
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



