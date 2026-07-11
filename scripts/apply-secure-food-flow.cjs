const fs = require("fs");

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, value) {
  fs.writeFileSync(path, value);
  console.log(`updated ${path}`);
}

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing patch target: ${label}`);
  return source.replace(from, to);
}

function replaceAllChecked(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (!count) throw new Error(`Missing patch target: ${label}`);
  console.log(`${label}: ${count} replacement(s)`);
  return source.split(from).join(to);
}

// 1) Shared order types.
{
  const path = "lib/newApp/types.ts";
  let s = read(path);
  s = replaceOnce(
    s,
    `  dropoff_notes: string | null;\n  pickup_latitude: number | null;`,
    `  dropoff_notes: string | null;\n  room_number: string | null;\n  restaurant_approved_at: string | null;\n  restaurant_approved_by: string | null;\n  rider_released_at: string | null;\n  pickup_latitude: number | null;`,
    "OrderRow security fields",
  );
  s = replaceOnce(
    s,
    `  dropoff_notes?: string | null;\n  pickup_latitude?: number | null;`,
    `  dropoff_notes?: string | null;\n  room_number?: string | null;\n  pickup_latitude?: number | null;`,
    "CreateOrderInput room number",
  );
  write(path, s);
}

// 2) Persist and read the secure order metadata.
{
  const path = "lib/newApp/orders.ts";
  let s = read(path);
  s = replaceOnce(
    s,
    `      dropoff_notes: input.dropoff_notes ?? null,\n      pickup_latitude: input.pickup_latitude ?? null,`,
    `      dropoff_notes: input.dropoff_notes ?? null,\n      room_number: input.room_number ?? null,\n      pickup_latitude: input.pickup_latitude ?? null,`,
    "orders insert room number",
  );

  const oldSelect = "id, customer_id, vendor_id, channel, status, delivery_mode, pickup_notes, dropoff_notes, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, subtotal_mwk, delivery_fee_mwk, service_fee_mwk, total_mwk, payment_status, created_at, updated_at";
  const newSelect = "id, customer_id, vendor_id, channel, status, delivery_mode, pickup_notes, dropoff_notes, room_number, restaurant_approved_at, restaurant_approved_by, rider_released_at, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, subtotal_mwk, delivery_fee_mwk, service_fee_mwk, total_mwk, payment_status, created_at, updated_at";
  s = replaceAllChecked(s, oldSelect, newSelect, "order selects");
  write(path, s);
}

// 3) Require and attach a room number during doorstep food checkout.
{
  const path = "app/checkout.tsx";
  let s = read(path);
  s = replaceOnce(
    s,
    `    food_base_title?: string;\n  }>();`,
    `    food_base_title?: string;\n    room_number?: string;\n  }>();`,
    "checkout params room number",
  );
  s = replaceOnce(
    s,
    `  const [couponCode, setCouponCode] = useState("");\n  const [quantity, setQuantity] = useState(1);`,
    `  const [couponCode, setCouponCode] = useState("");\n  const [roomNumber, setRoomNumber] = useState(typeof params.room_number === "string" ? params.room_number : "");\n  const [quantity, setQuantity] = useState(1);`,
    "checkout room state",
  );
  s = replaceOnce(
    s,
    `          delivery_mode: deliveryMode,\n          delivery_fee_mwk: delivery,`,
    `          delivery_mode: deliveryMode,\n          room_number: deliveryMode === "doorstep" ? roomNumber.trim() || null : null,\n          dropoff_notes: deliveryMode === "doorstep" && roomNumber.trim() ? \`Room \${roomNumber.trim()}\` : null,\n          delivery_fee_mwk: delivery,`,
    "checkout order room payload",
  );
  s = replaceOnce(
    s,
    `    if (requiresCatalogOrder && (!isUuid(itemId) || !isUuid(vendorId))) {\n      Alert.alert("Item unavailable", "This item is using old preview data. Refresh the catalog and choose a live product.");\n      return;\n    }`,
    `    if (requiresCatalogOrder && (!isUuid(itemId) || !isUuid(vendorId))) {\n      Alert.alert("Item unavailable", "This item is using old preview data. Refresh the catalog and choose a live product.");\n      return;\n    }\n\n    if (mode === "food" && deliveryMode === "doorstep" && !roomNumber.trim()) {\n      Alert.alert("Room number required", "Enter the hostel block and room number so the restaurant and rider deliver to the correct student.");\n      return;\n    }`,
    "checkout room validation",
  );
  s = replaceOnce(
    s,
    `        {escrowEnabled ? (`,
    `        {mode === "food" && deliveryMode === "doorstep" ? (\n          <View style={styles.sectionCard}>\n            <View style={styles.sectionHeading}>\n              <View style={styles.sectionIconWrap}>\n                <MapPin size={20} color="#f8fbff" />\n              </View>\n              <View style={styles.sectionTextBlock}>\n                <Text style={styles.sectionTitle}>Secure room delivery</Text>\n                <Text style={styles.sectionSub}>Required for the kitchen, rider and QR handoff.</Text>\n              </View>\n            </View>\n\n            <TextInput\n              value={roomNumber}\n              onChangeText={setRoomNumber}\n              placeholder="e.g. Hostel B, Room 14"\n              placeholderTextColor="#7f89a6"\n              autoCapitalize="words"\n              maxLength={40}\n              style={styles.couponInput}\n            />\n            <View style={styles.note}>\n              <ShieldCheck size={16} color="#13285f" />\n              <Text style={styles.noteText}>The room number is shown to the restaurant and assigned rider. The rider must still scan your private QR code or enter your PIN before completing delivery.</Text>\n            </View>\n          </View>\n        ) : null}\n\n        {escrowEnabled ? (`,
    "checkout room card",
  );
  write(path, s);
}

// 4) Restaurant approval and rider release controls.
{
  const path = "app/(market)/restaurant/[session].tsx";
  let s = read(path);
  s = replaceOnce(
    s,
    `import { getRestaurantSessionConfig, getRestaurantSessionStatus, listRestaurantSessionOrders, type RestaurantSession } from "@/lib/restaurantSessions";`,
    `import { getRestaurantSessionConfig, getRestaurantSessionStatus, listRestaurantSessionOrders, type RestaurantSession } from "@/lib/restaurantSessions";\nimport { approveFoodOrderPayment, normalizeRoomNumber, releaseFoodOrderToRiders, roomLabel } from "@/lib/foodOrderSecurity";`,
    "restaurant security import",
  );
  s = replaceOnce(
    s,
    `  const { workspace, metrics, setOrderStatus } = useSellerWorkspace("food");`,
    `  const { workspace, metrics, refresh, setOrderStatus } = useSellerWorkspace("food");\n  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);`,
    "restaurant refresh and busy state",
  );
  s = replaceOnce(
    s,
    `  const moveOrderToReady = async (orderId: string) => {\n    if (!workspace.hasVendor) {\n      router.push("/(market)/setup");\n      return;\n    }\n    try {\n      await setOrderStatus(orderId, "accepted");\n    } catch (err: any) {\n      Alert.alert("Update failed", err?.message ?? "Could not move order to ready.");\n    }\n  };`,
    `  const approvePaymentAndStart = async (orderId: string, currentRoom?: string | null) => {\n    if (!workspace.hasVendor) {\n      router.push("/(market)/setup");\n      return;\n    }\n    try {\n      setBusyOrderId(orderId);\n      await approveFoodOrderPayment(orderId, normalizeRoomNumber(currentRoom));\n      await refresh();\n      Alert.alert("Order approved", "Payment confirmed. The kitchen can start preparing, and approved riders have received an upcoming-delivery alert.");\n    } catch (err: any) {\n      Alert.alert("Approval failed", err?.message ?? "Could not approve this food order.");\n    } finally {\n      setBusyOrderId(null);\n    }\n  };\n\n  const moveOrderToReady = async (orderId: string) => {\n    if (!workspace.hasVendor) {\n      router.push("/(market)/setup");\n      return;\n    }\n    try {\n      setBusyOrderId(orderId);\n      await releaseFoodOrderToRiders(orderId);\n      await refresh();\n      Alert.alert("Released to riders", "The meal is ready. Online approved riders can now accept this delivery.");\n    } catch (err: any) {\n      Alert.alert("Release failed", err?.message ?? "Could not release this order to riders.");\n    } finally {\n      setBusyOrderId(null);\n    }\n  };`,
    "restaurant approval functions",
  );
  s = replaceOnce(
    s,
    `                    <View style={styles.metaRow}>\n                      <MapPin size={14} color="#6f789d" />\n                      <Text style={styles.metaText}>{place}</Text>\n                    </View>`,
    `                    <View style={styles.metaRow}>\n                      <MapPin size={14} color="#6f789d" />\n                      <Text style={styles.metaText}>{realOrder?.room_number ? roomLabel(realOrder.room_number) : realOrder?.dropoff_notes || place}</Text>\n                    </View>\n                    <View style={styles.metaRow}>\n                      <Text style={styles.metaText}>Payment: {String(realOrder?.payment_status ?? "pending").replaceAll("_", " ")}</Text>\n                    </View>`,
    "restaurant room and payment metadata",
  );
  s = replaceOnce(
    s,
    `                      <Pressable style={styles.primaryBtn} onPress={() => void moveOrderToReady(order.id)}>\n                        <Text style={styles.primaryBtnText}>Ready for delivery</Text>\n                      </Pressable>`,
    `                      <Pressable\n                        style={[styles.primaryBtn, busyOrderId === order.id && styles.primaryBtnMuted]}\n                        disabled={busyOrderId === order.id}\n                        onPress={() =>\n                          order.status === "pending"\n                            ? void approvePaymentAndStart(order.id, realOrder?.room_number ?? realOrder?.dropoff_notes)\n                            : void moveOrderToReady(order.id)\n                        }\n                      >\n                        <Text style={styles.primaryBtnText}>\n                          {busyOrderId === order.id\n                            ? "Updating..."\n                            : order.status === "pending"\n                              ? "Approve payment & start"\n                              : "Ready for delivery"}\n                        </Text>\n                      </Pressable>`,
    "restaurant approval button",
  );
  write(path, s);
}

// 5) Include room information in rider request and active-job cards.
{
  const path = "lib/agentDeliveryApi.ts";
  let s = read(path);
  s = replaceOnce(
    s,
    `    dropoff_notes: string | null;\n    delivery_fee_mwk: number;`,
    `    dropoff_notes: string | null;\n    room_number?: string | null;\n    delivery_fee_mwk: number;`,
    "agent API room number",
  );
  write(path, s);
}

{
  const path = "components/agent/useAgentWorkspace.ts";
  let s = read(path);
  s = replaceOnce(
    s,
    `import { useNetwork } from "@/providers/NetworkProvider";`,
    `import { useNetwork } from "@/providers/NetworkProvider";\nimport { roomLabel } from "@/lib/foodOrderSecurity";`,
    "agent room helper import",
  );
  s = replaceOnce(
    s,
    `  dropoff_notes: string | null;\n  delivery_fee_mwk: number;`,
    `  dropoff_notes: string | null;\n  room_number: string | null;\n  delivery_fee_mwk: number;`,
    "agent workspace room type",
  );
  s = replaceOnce(
    s,
    `    dropoffLabel: input.order?.dropoff_notes ?? input.vendor?.campus ?? input.vendor?.area ?? "Campus delivery",`,
    `    dropoffLabel: input.order?.room_number ? roomLabel(input.order.room_number) : input.order?.dropoff_notes ?? input.vendor?.campus ?? input.vendor?.area ?? "Campus delivery",`,
    "active job room label",
  );
  s = replaceOnce(
    s,
    `.select("id,vendor_id,channel,status,delivery_mode,dropoff_notes,delivery_fee_mwk,total_mwk,payment_status,created_at,updated_at")`,
    `.select("id,vendor_id,channel,status,delivery_mode,dropoff_notes,room_number,delivery_fee_mwk,total_mwk,payment_status,created_at,updated_at")`,
    "agent order room select",
  );
  s = replaceOnce(
    s,
    `          dropoffLabel: row.order?.dropoff_notes ?? row.vendor?.campus ?? row.vendor?.area ?? "Campus delivery",`,
    `          dropoffLabel: row.order?.room_number ? roomLabel(row.order.room_number) : row.order?.dropoff_notes ?? row.vendor?.campus ?? row.vendor?.area ?? "Campus delivery",`,
    "open request room label",
  );
  write(path, s);
}

console.log("Secure food lifecycle patch completed.");
