import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Facebook, Globe, Instagram, Linkedin, Mail, Phone, Twitter } from "lucide-react-native";

const open = async (url: string) => {
  try {
    await Linking.openURL(url);
  } catch {
    // no-op
  }
};

export default function PublicFooter() {
  const router = useRouter();
  const year = new Date().getFullYear();

  return (
    <View style={{ marginTop: 40, backgroundColor: "#0e2756", paddingHorizontal: 24, paddingTop: 28, paddingBottom: 20 }}>
      <View style={{ width: "100%", maxWidth: 1120, alignSelf: "center", gap: 20 }}>
        <View>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900" }}>Pa-Level</Text>
          <Text style={{ marginTop: 8, color: "#b7c4e6", fontSize: 13, lineHeight: 20 }}>
            Student accommodation marketplace in Malawi. Helping students find safe and verified housing near campus.
          </Text>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ color: "#fff", fontSize: 12, letterSpacing: 0.7, fontWeight: "900" }}>QUICK LINKS</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[
              { label: "Support", href: "/support" },
              { label: "About", href: "/about" },
              { label: "FAQs", href: "/faqs" },
              { label: "Privacy", href: "/privacy" },
              { label: "Terms", href: "/terms" },
            ].map((item) => (
              <Pressable
                key={item.label}
                onPress={() => router.push(item.href as never)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "#29497f",
                  backgroundColor: "#17386c",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: "#d6e1ff", fontSize: 12, fontWeight: "700" }}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ color: "#fff", fontSize: 12, letterSpacing: 0.7, fontWeight: "900" }}>CONTACT</Text>

          <Pressable onPress={() => open("mailto:hello.palevel@gmail.com")} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Mail size={16} color="#d6e1ff" />
            <Text style={{ color: "#d6e1ff", fontSize: 13, fontWeight: "600" }}>hello.palevel@gmail.com</Text>
          </Pressable>

          <Pressable onPress={() => open("tel:+265996595135")} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Phone size={16} color="#d6e1ff" />
            <Text style={{ color: "#d6e1ff", fontSize: 13, fontWeight: "600" }}>+265 996 59 51 35</Text>
          </Pressable>
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ color: "#fff", fontSize: 12, letterSpacing: 0.7, fontWeight: "900" }}>FOLLOW US</Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[
              { Icon: Facebook, href: "https://facebook.com/" },
              { Icon: Instagram, href: "https://instagram.com/" },
              { Icon: Linkedin, href: "https://linkedin.com/" },
              { Icon: Twitter, href: "https://twitter.com/" },
              { Icon: Globe, href: "https://vacsystem.vercel.app" },
            ].map(({ Icon, href }) => (
              <Pressable
                key={href}
                onPress={() => open(href)}
                style={{
                  height: 36,
                  width: 36,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#17386c",
                  borderWidth: 1,
                  borderColor: "#29497f",
                }}
              >
                <Icon size={16} color="#d6e1ff" />
              </Pressable>
            ))}
          </View>

          <Text style={{ color: "#a4b4da", fontSize: 12 }}>A product of VAC Team - Let's go online together.</Text>
        </View>
      </View>

      <View style={{ marginTop: 22, borderTopWidth: 1, borderTopColor: "#1f3b73", paddingTop: 14 }}>
        <Text style={{ color: "#9db0da", fontSize: 11, textAlign: "center" }}>© {year} Pa-Level. All rights reserved.</Text>
      </View>
    </View>
  );
}
