// Cloudflare Pages Function — PayPal diagnostics.
// Open: https://filemorph.shop/api/paypal-diag?key=YOUR_SETUP_KEY&pro=P-xxxx&team=P-yyyy
// (pro/team optional — defaults to the IDs you pass; compare against public/config.js)
// Tells you: does the env match (live/sandbox), do your live credentials work, do your
// subscription PLAN IDs exist + are they ACTIVE, and what client-id the BACKEND is using
// (compare it to the clientId in public/config.js — they MUST be the same PayPal app).
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
  return { ok: r.ok, data: d };
}

async function getPlan(env, access, id) {
  if (!id) return { id: null, note: "not provided" };
  const r = await fetch(base(env) + "/v1/billing/plans/" + id, { headers: { Authorization: "Bearer " + access } });
  const d = await r.json();
  if (!r.ok) return { id, found: false, http: r.status, error: d.name || d.message || d };
  return { id, found: true, status: d.status, name: d.name, product_id: d.product_id };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!env.PAYPAL_SETUP_KEY || key !== env.PAYPAL_SETUP_KEY) return json({ error: "unauthorized — pass ?key=PAYPAL_SETUP_KEY" }, 401);

  const out = {
    env_PAYPAL_ENV: env.PAYPAL_ENV || "(unset → defaults to sandbox)",
    api_base: base(env),
    backend_client_id: env.PAYPAL_CLIENT_ID || "(MISSING)",
    backend_client_id_hint: "⬆️ This MUST exactly equal the clientId in public/config.js. If they differ, subscriptions/orders will fail.",
    has_secret: !!env.PAYPAL_CLIENT_SECRET
  };

  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) { out.result = "❌ Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET secret in Cloudflare."; return json(out, 200); }

  const t = await token(env);
  if (!t.ok) {
    out.auth = "❌ FAILED";
    out.auth_error = t.data;
    out.likely_cause = "Wrong client-id/secret, or a live/sandbox mismatch (env=" + (env.PAYPAL_ENV || "sandbox") + " but keys are for the other environment).";
    return json(out, 200);
  }
  out.auth = "✅ credentials valid for " + base(env);

  const access = t.data.access_token;
  out.planPro = await getPlan(env, access, url.searchParams.get("pro"));
  out.planTeam = await getPlan(env, access, url.searchParams.get("team"));

  out.how_to_read = {
    "plan found:false": "That plan ID does not exist under THIS account → wrong account or created in the other environment. Re-create via /api/paypal-setup.",
    "plan status != ACTIVE": "Activate the plan in PayPal, or recreate it.",
    "auth ok + plans ACTIVE + still fails in browser": "Then it's almost certainly REFERENCE TRANSACTIONS not enabled on your Business account — contact PayPal to enable billing agreements / reference transactions."
  };
  return json(out, 200);
}
