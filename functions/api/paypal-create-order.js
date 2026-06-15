// Cloudflare Pages Function — create a PayPal one-time order for a credit pack.
// Route: POST /api/paypal-create-order   { userId }
// Amount is set SERVER-SIDE (CREDITS_PRICE) so it can't be tampered with.
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV, CREDITS_PRICE
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
    const { userId, credits } = await request.json();
    if (!userId) return json({ error: "missing user" }, 400);
    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return json({ error: "PayPal not configured" }, 500);
    const rate = parseFloat(env.CREDIT_RATE || "0.10");
    const qty = Math.max(6, Math.min(10000, parseInt(credits || "6", 10) || 6));
    const price = (qty * rate).toFixed(2);
    const access = await token(env);
    const r = await fetch(base(env) + "/v2/checkout/orders", {
      method: "POST",
      headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "USD", value: price }, custom_id: String(userId), description: "FileMorph credits" }]
      })
    });
    const d = await r.json();
    if (!r.ok) return json({ error: d.message || "order create failed" }, 500);
    return json({ id: d.id });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
