import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function readProjectFile(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing expected file: ${relativePath}`);
  }

  const original = fs.readFileSync(absolutePath, "utf8");
  return {
    absolutePath,
    eol: original.includes("\r\n") ? "\r\n" : "\n",
    text: original.replace(/\r\n/g, "\n"),
  };
}

function writeProjectFile(file, nextText) {
  const output = file.eol === "\r\n" ? nextText.replace(/\n/g, "\r\n") : nextText;
  fs.writeFileSync(file.absolutePath, output, "utf8");
}

function replaceExactlyOnce(text, search, replacement, label) {
  const first = text.indexOf(search);
  if (first < 0) throw new Error(`Could not find expected block: ${label}`);
  if (text.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Expected one match but found several: ${label}`);
  }
  return text.slice(0, first) + replacement + text.slice(first + search.length);
}

function replaceRegexExactlyOnce(text, pattern, replacement, label) {
  const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) {
    throw new Error(`Expected one match for ${label}, found ${matches.length}.`);
  }
  return text.replace(pattern, replacement);
}

function patchTicketsLibrary() {
  const file = readProjectFile("lib/tickets.ts");
  let text = file.text;

  text = replaceExactlyOnce(
    text,
    'import { initializePayChanguCheckout, verifyPayChanguTxRef } from "@/lib/payments";\n',
    "",
    "legacy client PayChangu import",
  );

  text = replaceExactlyOnce(
    text,
    "  paymentId: string;\n  directCharge: {",
    "  paymentId: string;\n  checkoutUrl: string | null;\n  directCharge: {",
    "TicketPaymentSession checkout URL field",
  );

  const secureCheckoutHelper = `async function createTicketOrderPaymentViaEdgeFunction(\n  accessToken: string,\n  input: TicketPaymentInput,\n): Promise<TicketPaymentSession> {\n  const endpoint = \`${ENV.SUPABASE_URL.replace(/\\/+$/, "")}/functions/v1/create-payment-checkout\`;\n  const res = await fetchWithTimeout(\n    endpoint,\n    {\n      method: "POST",\n      headers: {\n        apikey: ENV.SUPABASE_ANON_KEY,\n        Authorization: \`Bearer ${accessToken}\`,\n        "Content-Type": "application/json",\n      },\n      body: JSON.stringify({\n        event_id: input.eventId,\n        tier_id: input.tierId,\n        quantity: input.quantity,\n        payment_method: input.paymentMethod,\n        phone: input.phone ?? null,\n      }),\n    },\n    15_000,\n  );\n\n  const data = await parseJson(res);\n  if (!res.ok) {\n    throw new Error(parseError(data) || \`Could not create ticket checkout (${res.status}).\`);\n  }\n\n  const order = normalizeTicketOrder(data?.order);\n  const txRef = typeof data?.tx_ref === "string" ? data.tx_ref.trim() : "";\n  const checkoutUrl = typeof data?.checkout_url === "string" ? data.checkout_url.trim() : "";\n\n  if (!order.id) throw new Error("Ticket checkout did not return an order.");\n  if (!txRef) throw new Error("Ticket checkout did not return a payment reference.");\n  if (!/^https:\\/\\//i.test(checkoutUrl)) throw new Error("Ticket checkout did not return a secure checkout URL.");\n\n  return {\n    order,\n    event: data?.event && typeof data.event === "object" ? data.event : {},\n    tier: data?.tier && typeof data.tier === "object" ? data.tier : {},\n    txRef,\n    paymentId: typeof data?.payment_id === "string" ? data.payment_id : "",\n    checkoutUrl,\n    directCharge: {\n      status: String(data?.direct_charge?.status || "pending"),\n      providerReference:\n        typeof data?.direct_charge?.provider_reference === "string"\n          ? data.direct_charge.provider_reference\n          : null,\n      paymentAccountDetails: null,\n      authorization: null,\n    },\n  };\n}\n\nasync function getTicketOrderPaymentDetailViaSupabase`;

  text = replaceRegexExactlyOnce(
    text,
    /async function releaseReservedTicketOrder[\s\S]*?async function getTicketOrderPaymentDetailViaSupabase/,
    secureCheckoutHelper,
    "unsafe direct ticket reservation fallback",
  );

  text = replaceRegexExactlyOnce(
    text,
    /\nasync function issueTicketOrderViaSupabase[\s\S]*?\nfunction inFilter/,
    "\nfunction inFilter",
    "unsafe direct ticket issuance fallback",
  );

  text = replaceRegexExactlyOnce(
    text,
    /export async function createTicketOrderPayment\([\s\S]*?\n}\n\nexport async function getTicketOrderDetail/,
    `export async function createTicketOrderPayment(\n  accessToken: string,\n  input: TicketPaymentInput,\n): Promise<TicketPaymentSession> {\n  return createTicketOrderPaymentViaEdgeFunction(accessToken, input);\n}\n\nexport async function getTicketOrderDetail`,
    "ticket checkout export",
  );

  text = replaceRegexExactlyOnce(
    text,
    /export async function verifyTicketOrderPayment\([\s\S]*?\n}\n\nexport async function listMyTickets/,
    `export async function verifyTicketOrderPayment(\n  accessToken: string,\n  orderId: string,\n  _txRef?: string | null,\n) {\n  // Payment truth now comes only from the signed VAC callback. The client may\n  // read its own EYA order state, but it cannot verify PayChangu or issue tickets.\n  return getTicketOrderPaymentDetailViaSupabase(accessToken, orderId);\n}\n\nexport async function listMyTickets`,
    "client payment verification fallback",
  );

  writeProjectFile(file, text);
}

function patchActiveMobilePaymentScreen() {
  const file = readProjectFile("components/market/MobileMoneyPaymentFastScreen.tsx");
  let text = file.text;

  const oldBlock = `      const payment = await createTicketOrderPayment(session.access_token, { eventId: event.id, tierId: tier.id, quantity, paymentMethod, phone: \`+265${phoneDigits}\` });\n      router.push({ pathname: "/(student)/market/payment-processing", params: { orderId: payment.order.id, txRef: payment.txRef, eventId: event.id, tierId: tier.id, quantity: String(quantity) } } as any);`;

  const newBlock = `      const payment = await createTicketOrderPayment(session.access_token, { eventId: event.id, tierId: tier.id, quantity, paymentMethod, phone: \`+265${phoneDigits}\` });\n      if (!payment.checkoutUrl) throw new Error("The secure payment page is unavailable.");\n      router.push({\n        pathname: "/pay/checkout",\n        params: {\n          url: encodeURIComponent(payment.checkoutUrl),\n          tx_ref: payment.txRef,\n          order_id: payment.order.id,\n        },\n      } as any);`;

  text = replaceExactlyOnce(text, oldBlock, newBlock, "active mobile ticket payment navigation");
  writeProjectFile(file, text);
}

function patchPaymentWebView() {
  const file = readProjectFile("app/pay/checkout.tsx");
  let text = file.text;

  text = replaceExactlyOnce(
    text,
    '  const params = useLocalSearchParams<{ url?: string; tx_ref?: string }>();',
    '  const params = useLocalSearchParams<{ url?: string; tx_ref?: string; order_id?: string }>();',
    "checkout route parameters",
  );

  text = replaceExactlyOnce(
    text,
    '  const txRef = typeof params.tx_ref === "string" ? params.tx_ref : undefined;\n',
    '  const txRef = typeof params.tx_ref === "string" ? params.tx_ref : undefined;\n  const orderId = typeof params.order_id === "string" ? params.order_id : undefined;\n',
    "checkout order id parameter",
  );

  text = replaceExactlyOnce(
    text,
    `          if (url.includes("/pay/success") || url.includes("status=success")) {`,
    `          const reachedVacResult =\n            url.includes("/v1/paychangu/callback") || url.includes("/v1/paychangu/return");\n\n          if (reachedVacResult && orderId) {\n            router.replace({\n              pathname: "/(student)/market/payment-processing",\n              params: { orderId, txRef },\n            } as any);\n            return;\n          }\n\n          if (url.includes("/pay/success") || url.includes("status=success")) {`,
    "VAC callback navigation",
  );

  writeProjectFile(file, text);
}

function patchPaymentProcessingLogic() {
  const file = readProjectFile("components/market/PaymentProcessingScreen.tsx");
  let text = file.text;

  text = replaceExactlyOnce(
    text,
    'import { appendCachedMyTickets, getTicketOrderDetail, verifyTicketOrderPayment, type TicketOrderDetail } from "@/lib/tickets";',
    'import { appendCachedMyTickets, getTicketOrderDetail, type TicketOrderDetail } from "@/lib/tickets";',
    "processing screen ticket import",
  );

  text = replaceExactlyOnce(
    text,
    '  const { orderId, txRef } = useLocalSearchParams<{ orderId?: string; txRef?: string }>();',
    '  const { orderId } = useLocalSearchParams<{ orderId?: string }>();',
    "processing route parameters",
  );

  const oldCheck = `      const verified = await verifyTicketOrderPayment(session.access_token, orderId, txRef);\n      const nextDetail = await getTicketOrderDetail(session.access_token, orderId).catch(() => null);\n      if (nextDetail) setDetail(nextDetail);\n      if (verified.fulfilled && verified.tickets?.length) {\n        const issued = nextDetail?.tickets || [];\n        if (issued.length) await appendCachedMyTickets(user?.id, issued).catch(() => undefined);\n        const firstTicketId = issued[0]?.id || verified.tickets[0]?.id || "";\n        router.replace({ pathname: "/(student)/market/payment-success", params: { orderId, ticketId: firstTicketId } } as any);\n      }`;

  const newCheck = `      const nextDetail = await getTicketOrderDetail(session.access_token, orderId);\n      setDetail(nextDetail);\n      if (nextDetail.fulfilled && nextDetail.tickets?.length) {\n        const issued = nextDetail.tickets;\n        await appendCachedMyTickets(user?.id, issued).catch(() => undefined);\n        const firstTicketId = issued[0]?.id || "";\n        router.replace({ pathname: "/(student)/market/payment-success", params: { orderId, ticketId: firstTicketId } } as any);\n      }`;

  text = replaceExactlyOnce(text, oldCheck, newCheck, "processing screen payment polling");
  text = replaceExactlyOnce(
    text,
    '  }, [checking, orderId, router, session?.access_token, txRef, user?.id]);',
    '  }, [checking, orderId, router, session?.access_token, user?.id]);',
    "processing callback dependencies",
  );

  writeProjectFile(file, text);
}

function patchSupabaseFunctionAuth() {
  const file = readProjectFile("supabase/config.toml");
  let text = file.text;

  text = replaceExactlyOnce(
    text,
    "[functions.create-payment-checkout]\nenabled = true\nverify_jwt = false",
    "[functions.create-payment-checkout]\nenabled = true\nverify_jwt = true",
    "create-payment-checkout JWT verification",
  );

  writeProjectFile(file, text);
}

const tasks = [
  ["lib/tickets.ts", patchTicketsLibrary],
  ["components/market/MobileMoneyPaymentFastScreen.tsx", patchActiveMobilePaymentScreen],
  ["app/pay/checkout.tsx", patchPaymentWebView],
  ["components/market/PaymentProcessingScreen.tsx", patchPaymentProcessingLogic],
  ["supabase/config.toml", patchSupabaseFunctionAuth],
];

for (const [label, task] of tasks) {
  task();
  console.log(`updated ${label}`);
}

console.log("Secure ticket client migration applied successfully.");
