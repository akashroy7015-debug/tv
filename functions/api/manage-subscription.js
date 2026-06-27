// Cloudflare Pages Function — return a "manage/cancel subscription" link for the logged-in user.
// Route: POST /api/manage-subscription   { token }   (Supabase access token — identity verified)
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, PAYPAL_ENV
import { createClient } from "@supabase/supabase-js";

function json(o, s = 200) { return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } }); }

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { token } = await request.json();
    if (!token) return json({ error: "not signed in" }, 401);
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: "not configured (SUPABASE_ANON_KEY)" }, 500);

    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const ures = await sb.auth.getUser(token);
    const user = ures.data && ures.data.user;
    if (!user) return json({ error: "invalid session" }, 401);
    const email = user.email;

    // Lemon Squeezy subscriber → return their hosted customer portal (update card / cancel).
    if (env.LEMONSQUEEZY_API_KEY) {
      const url = "https://api.lemonsqueezy.com/v1/subscriptions?filter[store_id]=" +
        encodeURIComponent(env.LEMONSQUEEZY_STORE_ID || "") + "&filter[user_email]=" + encodeURIComponent(email);
      const lr = await fetch(url, { headers: { Authorization: "Bearer " + env.LEMONSQUEEZY_API_KEY, Accept: "application/vnd.api+json" } });
      const ld = await lr.json();
      const subs = (ld && ld.data) || [];
      for (let i = 0; i < subs.length; i++) {
        const st = subs[i].attributes.status;
        if (st === "active" || st === "on_trial") {
          const urls = subs[i].attributes.urls || {};
          const portal = urls.customer_portal || urls.update_payment_method;
          if (portal) return json({ url: portal });
        }
      }
    }

    // Otherwise assume PayPal → their automatic-payments page (cancel there).
    const ppUrl = env.PAYPAL_ENV === "live"
      ? "https://www.paypal.com/myaccount/autopay/"
      : "https://www.sandbox.paypal.com/myaccount/autopay/";
    return json({ url: ppUrl });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
