import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, CheckCircle2, Landmark, LockKeyhole, Smartphone } from "lucide-react-native";
import { getMyTicketPayoutDestinations, registerMyTicketPayoutDestination, type TicketPayoutDestination } from "@/lib/ticketEventFinanceApi";
import { useStudentTheme } from "@/providers/StudentThemeProvider";

type Method = "airtel_money" | "mpamba" | "bank";

export default function PayoutDestinationsScreen() {
  const router = useRouter();
  const { theme } = useStudentTheme();
  const params = useLocalSearchParams<{ organizationId?: string; organizationName?: string; accessStatus?: string }>();
  const organizationId = String(params.organizationId || "");
  const suspended = params.accessStatus === "suspended";
  const [rows, setRows] = React.useState<TicketPayoutDestination[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [method, setMethod] = React.useState<Method>("airtel_money");
  const [beneficiary, setBeneficiary] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [bank, setBank] = React.useState("");
  const [account, setAccount] = React.useState("");

  const load = React.useCallback(async () => {
    if (!organizationId) return setLoading(false);
    try { setRows(await getMyTicketPayoutDestinations(organizationId)); }
    catch (e: any) { Alert.alert("Could not load destinations", e?.message || "Try again."); }
    finally { setLoading(false); }
  }, [organizationId]);
  React.useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!beneficiary.trim() || (method === "bank" ? !bank.trim() || !account.trim() : !phone.trim())) {
      Alert.alert("Details required", "Complete the beneficiary and destination details."); return;
    }
    try {
      setBusy(true);
      await registerMyTicketPayoutDestination({ organizationId, method, beneficiaryName: beneficiary.trim(), phoneNumber: method === "bank" ? undefined : phone.trim(), bankName: method === "bank" ? bank.trim() : undefined, accountNumber: method === "bank" ? account.trim() : undefined });
      setBeneficiary(""); setPhone(""); setBank(""); setAccount("");
      await load();
      Alert.alert("Submitted for verification", "EYA Admin can only see masked destination details. Payout requests remain blocked until a destination is verified.");
    } catch (e: any) { Alert.alert("Could not submit", e?.message || "Try again."); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable style={[styles.back, { borderColor: theme.border, backgroundColor: theme.surface }]} onPress={() => router.back()}><ArrowLeft size={20} color={theme.text} /></Pressable><View style={{ flex: 1 }}><Text style={[styles.title, { color: theme.heading }]}>Payout destinations</Text><Text style={[styles.sub, { color: theme.textMuted }]}>{params.organizationName || "Organization"}</Text></View></View>
    <View style={[styles.notice, { backgroundColor: suspended ? "#fff4df" : theme.accentSoft }]}>{suspended ? <LockKeyhole size={19} color="#946000" /> : <Landmark size={19} color={theme.accent} />}<Text style={{ flex: 1, color: suspended ? "#7a5200" : theme.text, fontWeight: "700", lineHeight: 18 }}>{suspended ? "Finance access is suspended. Existing masked details remain visible, but new destinations cannot be registered." : "Sensitive account details are encrypted by the trusted backend. The app and Admin views only receive masked values."}</Text></View>
    <Text style={[styles.section, { color: theme.heading }]}>Current destinations</Text>
    {loading ? <ActivityIndicator color={theme.accent} /> : rows.length ? rows.map((row) => <View key={row.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}><View style={styles.row}>{row.method === "bank" ? <Landmark size={20} color={theme.accent} /> : <Smartphone size={20} color={theme.accent} />}<View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: theme.text }]}>{row.beneficiary_name}</Text><Text style={[styles.meta, { color: theme.textMuted }]}>{row.bank_or_network} · {row.masked_destination}</Text></View>{row.is_primary ? <CheckCircle2 size={19} color="#087443" /> : null}</View><Text style={[styles.status, { color: row.status === "verified" ? "#087443" : row.status === "rejected" || row.status === "disabled" ? "#a32929" : "#946000" }]}>{row.status.replace(/_/g, " ")}{row.is_primary ? " · primary" : ""}</Text>{row.review_note ? <Text style={[styles.meta, { color: theme.textMuted }]}>Review note: {row.review_note}</Text> : null}</View>) : <Text style={[styles.empty, { color: theme.textMuted }]}>No payout destination registered.</Text>}
    {!suspended ? <View style={[styles.form, { backgroundColor: theme.surface, borderColor: theme.borderSoft }]}><Text style={[styles.section, { color: theme.heading }]}>Add destination</Text><View style={styles.methods}>{(["airtel_money", "mpamba", "bank"] as Method[]).map((item) => <Pressable key={item} onPress={() => setMethod(item)} style={[styles.method, { borderColor: method === item ? theme.accent : theme.border, backgroundColor: method === item ? theme.accentSoft : theme.surface }]}><Text style={{ color: method === item ? theme.accent : theme.textMuted, fontWeight: "900", fontSize: 11 }}>{item === "airtel_money" ? "Airtel Money" : item === "mpamba" ? "Mpamba" : "Bank"}</Text></Pressable>)}</View><Field label="Beneficiary name" value={beneficiary} onChangeText={setBeneficiary} color={theme.text} border={theme.border} />{method === "bank" ? <><Field label="Bank name" value={bank} onChangeText={setBank} color={theme.text} border={theme.border} /><Field label="Account number" value={account} onChangeText={setAccount} color={theme.text} border={theme.border} keyboardType="numeric" /></> : <Field label="Malawi phone number" value={phone} onChangeText={setPhone} color={theme.text} border={theme.border} keyboardType="phone-pad" />}<Pressable disabled={busy} onPress={() => void submit()} style={[styles.submit, { backgroundColor: theme.accent }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit for verification</Text>}</Pressable></View> : null}
  </ScrollView></SafeAreaView>;
}

function Field(props: any) { return <View style={{ gap: 6 }}><Text style={styles.label}>{props.label.toUpperCase()}</Text><TextInput {...props} style={[styles.input, { color: props.color, borderColor: props.border }]} placeholderTextColor="#9aa3b8" /></View>; }
const styles = StyleSheet.create({ root:{flex:1}, content:{padding:16,paddingBottom:60,gap:14}, header:{flexDirection:"row",alignItems:"center",gap:12}, back:{width:44,height:44,borderRadius:22,borderWidth:1,alignItems:"center",justifyContent:"center"}, title:{fontSize:25,fontWeight:"900"}, sub:{fontSize:12,fontWeight:"700",marginTop:2}, notice:{borderRadius:18,padding:13,flexDirection:"row",gap:9,alignItems:"flex-start"}, section:{fontSize:18,fontWeight:"900"}, card:{borderRadius:19,borderWidth:1,padding:14,gap:8}, row:{flexDirection:"row",alignItems:"center",gap:10}, cardTitle:{fontSize:15,fontWeight:"900"}, meta:{fontSize:11,fontWeight:"700",lineHeight:16}, status:{fontSize:10,fontWeight:"900",textTransform:"uppercase"}, empty:{textAlign:"center",padding:20,fontWeight:"700"}, form:{borderRadius:22,borderWidth:1,padding:14,gap:12}, methods:{flexDirection:"row",gap:7}, method:{flex:1,minHeight:42,borderRadius:13,borderWidth:1,alignItems:"center",justifyContent:"center"}, label:{color:"#6e7892",fontSize:9,fontWeight:"900",letterSpacing:.7}, input:{minHeight:47,borderRadius:14,borderWidth:1,paddingHorizontal:12,fontWeight:"800"}, submit:{minHeight:48,borderRadius:15,alignItems:"center",justifyContent:"center"}, submitText:{color:"#fff",fontWeight:"900"} });
