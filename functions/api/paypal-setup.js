// Cloudflare Pages Function — ONE-TIME helper to create PayPal subscription plans.
// Open in a browser: https://filemorph.shop/api/paypal-setup?key=YOUR_SETUP_KEY
// It creates a product + Pro ($9/mo) and Team ($29/mo) plans and returns their IDs.
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV, PAYPAL_SETUP_KEY
function json(o, s = 200) { return new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json" } }); }
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

export async function onRequestGet(context) {
  const { request, env } = context;
  const key = new URL(request.url).searchParams.get("key");
  if (!env.PAYPAL_SETUP_KEY || key !== env.PAYPAL_SETUP_KEY) return json({ error: "unauthorized — pass ?key=PAYPAL_SETUP_KEY" }, 401);
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return json({ error: "Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET first" }, 500);

  try {
    const access = await token(env);
    const h = { Authorization: "Bearer " + access, "Content-Type": "application/json" };

    const pr = await fetch(base(env) + "/v1/catalogs/products", {
      method: "POST", headers: h,
      body: JSON.stringify({ name: "FileMorph", description: "Online file converter", type: "SERVICE", category: "SOFTWARE" })
    });
    const product = await pr.json();
    if (!pr.ok) return json({ step: "create product", error: product }, 500);

    async function makePlan(name, price) {
      const r2 = await fetch(base(env) + "/v1/billing/plans", {
        method: "POST", headers: h,
        body: JSON.stringify({
          product_id: product.id, name: name, status: "ACTIVE",
          billing_cycles: [{
            frequency: { interval_unit: "MONTH", interval_count: 1 },
            tenure_type: "REGULAR", sequence: 1, total_cycles: 0,
            pricing_scheme: { fixed_price: { value: price, currency_code: "USD" } }
          }],
          payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 }
        })
      });
      const p = await r2.json();
      if (!r2.ok) throw new Error(JSON.stringify(p));
      return p.id;
    }

    const planPro = await makePlan("FileMorph Pro", "9");
    const planTeam = await makePlan("FileMorph Team", "29");

    return json({
      ok: true, productId: product.id, planPro, planTeam,
      next: "Put planPro and planTeam into public/config.js -> paypal { planPro, planTeam }, then remove PAYPAL_SETUP_KEY."
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
