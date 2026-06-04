// Cloudflare Pages Function — PayPal subscription webhook (handles cancel/expire/activate).
// Route: POST /api/paypal-webhook
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV, PAYPAL_WEBHOOK_ID,
//      PAYPAL_PLAN_TEAM, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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
  const bodyText = await request.text();

  // Verify the webhook signature with PayPal (skipped only if no webhook id configured).
  if (env.PAYPAL_WEBHOOK_ID) {
    try {
      const access = await token(env);
      const v = await fetch(base(env) + "/v1/notifications/verify-webhook-signature", {
        method: "POST",
        headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_algo: request.headers.get("paypal-auth-algo"),
          cert_url: request.headers.get("paypal-cert-url"),
          transmission_id: request.headers.get("paypal-transmission-id"),
          transmission_sig: request.headers.get("paypal-transmission-sig"),
          transmission_time: request.headers.get("paypal-transmission-time"),
          webhook_id: env.PAYPAL_WEBHOOK_ID,
          webhook_event: JSON.parse(bodyText)
        })
      });
      const vd = await v.json();
      if (vd.verification_status !== "SUCCESS") return new Response("invalid signature", { status: 401 });
    } catch (e) {
      return new Response("verify error: " + e.message, { status: 400 });
    }
  }

  let event;
  try { event = JSON.parse(bodyText); } catch (e) { return new Response("bad json", { status: 400 }); }

  const type = event.event_type;
  const resource = event.resource || {};
  const userId = resource.custom_id;
  const subId = resource.id;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ ignored: true });
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (type === "BILLING.SUBSCRIPTION.ACTIVATED") {
      let plan = "Pro";
      if (resource.plan_id && resource.plan_id === env.PAYPAL_PLAN_TEAM) plan = "Team";
      if (userId) {
        await supabase.from("subscriptions").upsert(
          { user_id: userId, plan, status: "active", provider: "paypal", subscription_id: String(subId), updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      }
    } else if (type === "BILLING.SUBSCRIPTION.CANCELLED" || type === "BILLING.SUBSCRIPTION.EXPIRED" || type === "BILLING.SUBSCRIPTION.SUSPENDED") {
      if (userId) {
        await supabase.from("subscriptions").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("user_id", userId);
      } else if (subId) {
        await supabase.from("subscriptions").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("subscription_id", String(subId));
      }
    }
    return json({ received: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
