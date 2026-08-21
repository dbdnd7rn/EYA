import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import QRCode from "npm:qrcode@1.5.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "referrer-policy": "no-referrer",
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

function htmlPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1" />
<meta name="referrer" content="no-referrer" />
<title>EYA Guest Pass</title>
<style>
:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#eef2fb;color:#102a54}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(180deg,#eef2fb 0%,#f9fbff 55%,#eef2fb 100%);padding:24px 14px 40px}.wrap{width:min(100%,520px);margin:0 auto}.brand{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.logo{font-weight:1000;font-size:28px;font-style:italic;letter-spacing:-1px;color:#5e73dd}.secure{font-size:11px;font-weight:900;color:#087443;background:#daf7e8;border-radius:999px;padding:8px 11px}.card{background:#fff;border:1px solid #dfe5f4;border-radius:28px;box-shadow:0 16px 45px rgba(28,54,110,.12);overflow:hidden}.hero{padding:22px 22px 18px;background:#102a54;color:#fff}.eyebrow{font-size:10px;font-weight:900;letter-spacing:1.3px;color:#bfc9ff}.title{font-size:26px;line-height:1.15;font-weight:1000;margin:7px 0 5px}.meta{font-size:12px;font-weight:700;color:rgba(255,255,255,.78);line-height:1.5}.body{padding:20px}.guest{display:flex;justify-content:space-between;gap:12px;padding:13px 14px;border-radius:16px;background:#f4f6ff;margin-bottom:16px}.guest .label,.smallLabel{font-size:9px;font-weight:900;letter-spacing:.9px;color:#6f7b97;text-transform:uppercase}.guest .value{font-size:14px;font-weight:900;margin-top:3px}.live{font-size:10px;font-weight:1000;color:#087443;background:#daf7e8;border-radius:999px;padding:7px 10px;align-self:center}.qrPanel{text-align:center;border:1px solid #e1e6f2;border-radius:24px;padding:18px;background:#fbfcff}.qr{width:270px;max-width:100%;margin:0 auto;background:#fff;border-radius:18px;padding:10px;min-height:270px;display:flex;align-items:center;justify-content:center}.qr svg{width:100%;height:auto;display:block}.instruction{font-size:13px;font-weight:900;margin-top:12px}.count{font-size:11px;color:#6f7b97;font-weight:800;margin-top:5px}.manual{margin-top:14px;border-radius:16px;background:#eef1ff;padding:13px}.manualCode{font-size:21px;letter-spacing:1.1px;font-weight:1000;margin-top:5px;color:#33467f}.note{margin-top:15px;font-size:11px;line-height:1.55;color:#6f7b97;font-weight:700}.error{display:none;border-radius:18px;padding:18px;background:#fff0f0;color:#9d1d1d;font-weight:800;line-height:1.5}.loading{min-height:520px;display:flex;align-items:center;justify-content:center;color:#5e73dd;font-weight:900}.spinner{width:26px;height:26px;border:3px solid #dfe5ff;border-top-color:#5e73dd;border-radius:50%;animation:spin .8s linear infinite;margin-right:10px}@keyframes spin{to{transform:rotate(360deg)}}.foot{text-align:center;font-size:10px;color:#8390aa;font-weight:700;margin-top:14px}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><div class="logo">EYA</div><div class="secure">LIVE GUEST PASS</div></div>
  <div id="loading" class="card loading"><div class="spinner"></div>Securing guest ticket…</div>
  <div id="error" class="error"></div>
  <div id="pass" class="card" style="display:none">
    <div class="hero"><div class="eyebrow">OFFICIAL EVENT PASS</div><div id="eventTitle" class="title">EYA Event</div><div id="eventMeta" class="meta"></div></div>
    <div class="body">
      <div class="guest"><div><div class="label">Guest</div><div id="guestName" class="value">Guest holder</div></div><div class="live">LIVE</div></div>
      <div class="qrPanel"><div id="qr" class="qr"></div><div class="instruction">Present this live QR for entry</div><div id="count" class="count"></div><div class="manual"><div class="smallLabel">Rotating backup code</div><div id="manualCode" class="manualCode"></div></div></div>
      <div class="note">This pass is live and changes automatically. Old screenshots expire. Entry is still one-time: after the first successful check-in, this ticket becomes used everywhere.</div>
    </div>
  </div>
  <div class="foot">EYA verifies this guest pass with the event server. Permanent ticket references are not entry credentials.</div>
</div>
<script>
(() => {
  const storageKey = 'eya_guest_pass_token_v1';
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const fromLink = hash.get('t');
  if (fromLink) {
    sessionStorage.setItem(storageKey, fromLink);
    history.replaceState(null, '', location.pathname);
  }
  const token = fromLink || sessionStorage.getItem(storageKey) || '';
  const loading = document.getElementById('loading');
  const pass = document.getElementById('pass');
  const errorBox = document.getElementById('error');
  let currentExpiry = 0;
  let refreshTimer = null;

  function text(id, value) { document.getElementById(id).textContent = value || ''; }
  function fail(msg) {
    loading.style.display = 'none'; pass.style.display = 'none'; errorBox.style.display = 'block';
    errorBox.textContent = msg || 'This guest pass is unavailable.';
    if (refreshTimer) clearTimeout(refreshTimer);
  }
  function meta(event) {
    const parts = [];
    if (event?.date_label) parts.push(event.date_label);
    if (event?.venue) parts.push(event.venue);
    if (event?.city) parts.push(event.city);
    return parts.join(' • ');
  }
  async function refresh() {
    if (!token) return fail('This guest link is incomplete. Ask the ticket holder to send a new guest link.');
    try {
      const res = await fetch(location.pathname, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ token }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || 'Guest pass is unavailable.');
      loading.style.display = 'none'; errorBox.style.display = 'none'; pass.style.display = 'block';
      text('eventTitle', data.pass?.event?.title || 'EYA Event');
      text('eventMeta', meta(data.pass?.event));
      text('guestName', data.pass?.guest_name || 'Guest holder');
      text('manualCode', data.credential?.manual_code || '');
      document.getElementById('qr').innerHTML = data.qr_svg || '';
      currentExpiry = Date.parse(data.credential?.expires_at || '') || 0;
      const delay = Math.max(10, Number(data.credential?.refresh_after_seconds || 25));
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, delay * 1000);
    } catch (e) { fail(e?.message || 'Could not refresh this guest pass.'); }
  }
  setInterval(() => {
    if (!currentExpiry) return;
    const left = Math.max(0, Math.ceil((currentExpiry - Date.now()) / 1000));
    text('count', 'Auto-refreshing • expires in ' + left + 's');
  }, 1000);
  refresh();
})();
</script>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
        "cache-control": "no-store",
      },
    });
  }

  if (req.method === "GET") {
    return new Response(htmlPage(), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, max-age=0",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      },
    });
  }

  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

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
