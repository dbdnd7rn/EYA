import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import QRCode from "npm:qrcode@1.5.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=UTF-8",
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "Access-Control-Allow-Origin": "*",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function message(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Max-Age": "86400",
        "Cache-Control": "no-store",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "Guest pass API only." }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim().toUpperCase();
    if (!token.startsWith("EYA-GUEST-LINK-1-") || token.length > 160) {
      return json({ ok: false, error: "Guest link is invalid." }, 400);
    }

    const [{ data: pass, error: passError }, { data: credential, error: credentialError }] = await Promise.all([
      admin.rpc("get_ticket_guest_pass_public", { p_share_token: token }),
      admin.rpc("issue_ticket_guest_live_credential", { p_share_token: token }),
    ]);

    if (passError) return json({ ok: false, error: message(passError, "Guest pass is unavailable.") }, 403);
    if (credentialError) return json({ ok: false, error: message(credentialError, "Guest credential is unavailable.") }, 403);

    const qrSvg = await QRCode.toString(String(credential?.token || ""), {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      width: 270,
      color: { dark: "#102a54", light: "#ffffff" },
    });

    return json({ ok: true, pass, credential, qr_svg: qrSvg });
  } catch (error) {
    return json({ ok: false, error: message(error, "Guest pass is unavailable.") }, 500);
  }
});
