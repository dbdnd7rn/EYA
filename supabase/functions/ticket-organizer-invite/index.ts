import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=UTF-8",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function cleanMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ ok: false, error: "Organizer invitation service is unavailable." }, 503);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  const action = String(body.action ?? "inspect").trim().toLowerCase();
  const token = String(body.token ?? "").trim();
  if (!/^EYA-ORG-INV-1-[0-9a-fA-F]{64}$/.test(token)) {
    return json({ ok: false, error: "This organizer invitation is invalid." }, 400);
  }

  const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: info, error: infoError } = await service.rpc("get_ticket_organizer_invite_claim_info", { p_token: token });
  if (infoError || !info?.ok) {
    return json({ ok: false, error: cleanMessage(infoError, "This organizer invitation is unavailable.") }, 400);
  }

  if (action === "inspect") {
    return json({
      ok: true,
      invite: {
        email: info.email,
        organization_name: info.organization_name,
        invite_expires_at: info.invite_expires_at,
        access_expires_at: info.access_expires_at,
      },
    });
  }

  if (action !== "claim") return json({ ok: false, error: "Unsupported organizer invitation action." }, 400);

  const password = String(body.password ?? "");
  const fullName = String(body.full_name ?? "").trim();
  if (fullName.length < 2 || fullName.length > 120) {
    return json({ ok: false, error: "Enter the organizer's full name." }, 400);
  }
  if (password.length < 10 || password.length > 128) {
    return json({ ok: false, error: "Use a password with at least 10 characters." }, 400);
  }

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: String(info.email),
    password,
    email_confirm: true,
    app_metadata: {
      eya_account_type: "temporary_organizer",
      ticket_organizer_invite_id: String(info.invite_id),
    },
    user_metadata: {
      full_name: fullName,
      organization_name: String(info.organization_name ?? ""),
    },
  });

  if (createError || !created.user?.id) {
    const message = cleanMessage(createError, "Could not create the temporary Organizer login.");
    const duplicate = /already|registered|exists/i.test(message);
    return json({ ok: false, error: duplicate ? "This organizer email is already registered. Ask EYA Admin for a new invitation." : message }, 400);
  }

  const userId = created.user.id;
  const { data: claimed, error: claimError } = await service.rpc("claim_ticket_organizer_invite", {
    p_token: token,
    p_user_id: userId,
    p_full_name: fullName,
  });

  if (claimError || !claimed?.ok) {
    await service.auth.admin.deleteUser(userId).catch(() => undefined);
    return json({ ok: false, error: cleanMessage(claimError, "Could not activate the temporary Organizer Workspace.") }, 400);
  }

  return json({
    ok: true,
    account: {
      email: claimed.email,
      organization_name: claimed.organization_name,
      access_expires_at: claimed.access_expires_at,
    },
  });
});
