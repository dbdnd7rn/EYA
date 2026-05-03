import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { PhoneOff } from "lucide-react-native";
import { useAuth } from "@/providers/AuthProvider";
import { goBackOrFallback } from "@/lib/navigation";

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export default function InAppCallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ enquiryId?: string }>();
  const { user } = useAuth();

  const enquiryId = typeof params.enquiryId === "string" ? params.enquiryId : "";
  const room = `eya-enquiry-${enquiryId || "unknown"}`;
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.email ? String(user.email).split("@")[0] : "EYA user");

  const html = useMemo(
    () => `
<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
    <style>
      html, body, #meet { margin: 0; padding: 0; width: 100%; height: 100%; background: #0e2756; overflow: hidden; }
    </style>
    <script src="https://meet.jit.si/external_api.js"></script>
  </head>
  <body>
    <div id="meet"></div>
    <script>
      const api = new JitsiMeetExternalAPI('meet.jit.si', {
        roomName: '${esc(room)}',
        parentNode: document.querySelector('#meet'),
        userInfo: { displayName: '${esc(displayName)}' },
        configOverwrite: {
          prejoinPageEnabled: false,
          startAudioOnly: true,
          startWithVideoMuted: true,
          disableModeratorIndicator: true,
          enableClosePage: false
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: ['microphone', 'hangup', 'chat', 'settings'],
          SHOW_JITSI_WATERMARK: false
        }
      });
    </script>
  </body>
</html>`,
    [displayName, room],
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Text style={styles.title}>In-app audio call</Text>
        <Text style={styles.sub} numberOfLines={1}>Room: {room}</Text>
      </View>

      <View style={styles.webWrap}>
        <WebView
          source={{ html }}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
        />
      </View>

      <View style={styles.bottom}>
        <Pressable style={styles.endBtn} onPress={() => goBackOrFallback(router, "/redirect")}>
          <PhoneOff size={16} color="#fff" />
          <Text style={styles.endBtnText}>End call</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0e2756" },
  top: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, gap: 2 },
  title: { color: "#fff", fontWeight: "900", fontSize: 16 },
  sub: { color: "rgba(255,255,255,0.78)", fontWeight: "700", fontSize: 12 },
  webWrap: { flex: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: "hidden" },
  bottom: { padding: 12, backgroundColor: "#0e2756" },
  endBtn: {
    backgroundColor: "#ff0f64",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  endBtnText: { color: "#fff", fontWeight: "900" },
});


