type PaymentPageTone = "success" | "pending" | "warning" | "danger" | "neutral";

type PaymentPageOptions = {
  appLabel?: string;
  returnUrl?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function inferTone(title: string): PaymentPageTone {
  const normalized = title.toLowerCase();
  if (normalized.includes("confirmed")) return "success";
  if (normalized.includes("pending") || normalized.includes("temporarily unavailable")) return "pending";
  if (normalized.includes("not completed")) return "warning";
  if (
    normalized.includes("invalid") ||
    normalized.includes("not found") ||
    normalized.includes("requires review")
  ) {
    return "danger";
  }
  return "neutral";
}

function toneContent(tone: PaymentPageTone): {
  icon: string;
  label: string;
  accent: string;
  soft: string;
} {
  switch (tone) {
    case "success":
      return { icon: "✓", label: "Verified", accent: "#138a5b", soft: "#e9f8f1" };
    case "pending":
      return { icon: "…", label: "Processing", accent: "#7157d9", soft: "#f0edff" };
    case "warning":
      return { icon: "!", label: "Not completed", accent: "#b86500", soft: "#fff3df" };
    case "danger":
      return { icon: "!", label: "Needs attention", accent: "#c53b45", soft: "#ffedef" };
    default:
      return { icon: "i", label: "Payment update", accent: "#3454d1", soft: "#edf1ff" };
  }
}

export function paymentResultPage(
  title: string,
  message: string,
  status = 200,
  options: PaymentPageOptions = {},
): Response {
  const tone = inferTone(title);
  const content = toneContent(tone);
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const appLabel = escapeHtml(options.appLabel?.trim() || "the application");
  const safeReturnUrl = options.returnUrl ? escapeHtml(options.returnUrl) : null;
  const returnAction = safeReturnUrl
    ? `<a class="return-button" href="${safeReturnUrl}">Return to ${appLabel}</a>`
    : "";

  const document = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#10172a">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>${safeTitle} · VAC Secure Payments</title>
  <style>
    :root { color-scheme: light; --accent: ${content.accent}; --soft: ${content.soft}; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 15% 15%, rgba(94, 75, 255, .26), transparent 34%),
        radial-gradient(circle at 88% 82%, rgba(45, 196, 159, .18), transparent 32%),
        linear-gradient(145deg, #0b1020 0%, #141d36 52%, #0e1629 100%);
      color: #162033;
    }
    .shell { width: min(100%, 520px); }
    .brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 11px;
      margin-bottom: 18px;
      color: #fff;
      letter-spacing: .04em;
      font-size: 13px;
      font-weight: 750;
    }
    .brand-mark {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 11px;
      background: linear-gradient(145deg, #755cff, #4a35d6);
      box-shadow: 0 9px 24px rgba(90, 67, 231, .38);
      font-size: 15px;
      letter-spacing: 0;
    }
    main {
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.56);
      border-radius: 26px;
      background: rgba(255,255,255,.97);
      box-shadow: 0 28px 80px rgba(0,0,0,.34);
    }
    .top-line { height: 5px; background: var(--accent); }
    .content { padding: 38px 34px 30px; text-align: center; }
    .status-icon {
      width: 72px;
      height: 72px;
      display: grid;
      place-items: center;
      margin: 0 auto 20px;
      border-radius: 24px;
      background: var(--soft);
      color: var(--accent);
      font-size: 34px;
      font-weight: 800;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 14%, transparent);
    }
    .status-label {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 5px 11px;
      border-radius: 999px;
      background: var(--soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .035em;
      text-transform: uppercase;
    }
    h1 {
      margin: 16px 0 11px;
      color: #111a2c;
      font-size: clamp(25px, 6vw, 32px);
      line-height: 1.12;
      letter-spacing: -.035em;
    }
    p {
      max-width: 410px;
      margin: 0 auto;
      color: #5c6678;
      font-size: 15.5px;
      line-height: 1.65;
    }
    .return-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      margin-top: 24px;
      padding: 0 20px;
      border-radius: 13px;
      background: #111a2c;
      color: #fff;
      text-decoration: none;
      font-size: 14px;
      font-weight: 800;
    }
    .notice {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-top: 27px;
      padding: 14px 15px;
      border: 1px solid #e7eaf0;
      border-radius: 15px;
      background: #f8f9fb;
      color: #626c7d;
      text-align: left;
      font-size: 12.5px;
      line-height: 1.5;
    }
    .lock { flex: 0 0 auto; color: #48546a; font-size: 15px; }
    footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 17px 24px;
      border-top: 1px solid #eceef3;
      background: #fafbfc;
      color: #7a8392;
      font-size: 11.5px;
    }
    footer strong { color: #4d586a; font-weight: 750; }
    @media (max-width: 440px) {
      body { padding: 16px; }
      .content { padding: 32px 23px 25px; }
      footer { align-items: flex-start; flex-direction: column; gap: 5px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="brand"><span class="brand-mark">V</span><span>VAC SECURE PAYMENTS</span></div>
    <main>
      <div class="top-line"></div>
      <section class="content">
        <div class="status-icon" aria-hidden="true">${content.icon}</div>
        <div class="status-label">${content.label}</div>
        <h1>${safeTitle}</h1>
        <p>${safeMessage}</p>
        ${returnAction}
        <div class="notice"><span class="lock">▣</span><span>This payment result is verified by VAC Payments with PayChangu before ${appLabel} grants access.</span></div>
      </section>
      <footer><span>Protected payment processing</span><span>Powered by <strong>VAC Payments</strong></span></footer>
    </main>
  </div>
</body>
</html>`;

  return new Response(document, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
