// Cloudflare Pages Function — verify a PayPal subscription and mark the user paid.
// Route: POST /api/paypal-verify   { subscriptionID, userId }
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV ("live"|"sandbox"),
//      PAYPAL_PLAN_PRO, PAYPAL_PLAN_TEAM, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";

function json(o, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }
function base(env) { return env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"; }

async function token(env) {
  const r = await fetch(base(env) + "/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(env.PAYPAL_CLIENT_ID + ":" + env.PAYPAL_CLIENT_SECRET), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || "PayPal auth failed");
  return d.access_token;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { subscriptionID, userId } = await request.json();
    if (!subscriptionID || !userId) return json({ active: false, error: "missing data" }, 400);
    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return json({ active: false, error: "PayPal not configured" }, 500);

    const access = await token(env);
    const r = await fetch(base(env) + "/v1/billing/subscriptions/" + encodeURIComponent(subscriptionID), { headers: { Authorization: "Bearer " + access } });
    const d = await r.json();
    if (!r.ok) return json({ active: false, error: d.message || "subscription lookup failed" }, 500);

    const ok = d.status === "ACTIVE" || d.status === "APPROVED";
    let plan = "Pro";
    if (d.plan_id && d.plan_id === env.PAYPAL_PLAN_TEAM) plan = "Team";
    if (!ok) return json({ active: false, status: d.status });

    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        await supabase.from("subscriptions").upsert(
          { user_id: userId, plan, status: "active", provider: "paypal", subscription_id: String(subscriptionID), updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      } catch (e) { /* response still tells client they're active */ }
    }
    return json({ active: true, plan });
  } catch (e) {
    return json({ active: false, error: e.message }, 500);
  }
}
