// Cloudflare Pages Function — capture a PayPal credit-pack order and add credits.
// Route: POST /api/paypal-capture-order   { orderID, userId }
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV, CREDITS_PRICE,
//      CREDITS_PER_PACK, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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
    const { orderID, userId } = await request.json();
    if (!orderID || !userId) return json({ ok: false, error: "missing data" }, 400);

    const access = await token(env);
    const r = await fetch(base(env) + "/v2/checkout/orders/" + encodeURIComponent(orderID) + "/capture", {
      method: "POST",
      headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" }
    });
    const d = await r.json();
    if (!r.ok) return json({ ok: false, error: d.message || "capture failed" }, 500);

    const pu = (d.purchase_units && d.purchase_units[0]) || {};
    const cap = pu.payments && pu.payments.captures && pu.payments.captures[0];
    const amount = cap && cap.amount && cap.amount.value;
    const expected = env.CREDITS_PRICE || "5.00";
    const target = pu.custom_id || userId; // who gets the credits (server-set at create time)

    if (d.status !== "COMPLETED") return json({ ok: false, error: "payment not completed" }, 400);
    if (parseFloat(amount) !== parseFloat(expected)) return json({ ok: false, error: "amount mismatch" }, 400);

    const n = parseInt(env.CREDITS_PER_PACK || "50", 10);
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && target) {
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      await supabase.rpc("add_credits", { uid: target, n: n });
    }
    return json({ ok: true, added: n });
  } catch (e) {
    return json({ ok: false, error: e.message }, 500);
  }
}
