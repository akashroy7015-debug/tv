// Cloudflare Pages Function — return a "manage/cancel subscription" link for the logged-in user.
// Route: POST /api/manage-subscription   { token }   (Supabase access token — identity is verified)
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LEMONSQUEEZY_API_KEY, PAYPAL_ENV
import { createClient } from "@supabase/supabase-js";

function json(o, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { token } = await request.json();
    if (!token) return json({ error: "not signed in" }, 401);
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "not configured" }, 500);

    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const u = await sb.auth.getUser(token);
    const user = u.data && u.data.user;
    if (!user) return json({ error: "invalid session" }, 401);

    const r = await sb.from("subscriptions").select("provider,subscription_id,status").eq("user_id", user.id).maybeSingle();
    const row = r.data;
    if (!row || row.status !== "active") return json({ error: "no active subscription" }, 404);

    if (row.provider === "lemonsqueezy") {
      const lr = await fetch("https://api.lemonsqueezy.com/v1/subscriptions/" + encodeURIComponent(row.subscription_id), {
        headers: { Authorization: "Bearer " + env.LEMONSQUEEZY_API_KEY, Accept: "application/vnd.api+json" }
      });
      const ld = await lr.json();
      const urls = ld.data && ld.data.attributes && ld.data.attributes.urls;
      const portal = urls && (urls.customer_portal || urls.update_payment_method);
      if (portal) return json({ url: portal });
      return json({ error: "portal unavailable" }, 500);
    }
    if (row.provider === "paypal") {
      const url = env.PAYPAL_ENV === "live"
        ? "https://www.paypal.com/myaccount/autopay/"
        : "https://www.sandbox.paypal.com/myaccount/autopay/";
      return json({ url: url });
    }
    return json({ error: "unknown provider" }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
