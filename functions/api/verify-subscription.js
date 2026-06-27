// Cloudflare Pages Function — verify a user's Lemon Squeezy subscription by email.
// Route: POST /api/verify-subscription   { token }   (Supabase access token — identity verified)
// Reliable fallback that doesn't depend on the webhook firing.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, LEMONSQUEEZY_API_KEY
import { createClient } from "@supabase/supabase-js";

function json(o, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json();
    const token = body.token;
    if (!token) return json({ active: false, error: "not signed in" }, 401);
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ active: false, error: "not configured (SUPABASE_ANON_KEY)" }, 500);
    if (!env.LEMONSQUEEZY_API_KEY) return json({ active: false, error: "LEMONSQUEEZY_API_KEY not set" }, 500);

    // Identity is taken ONLY from the verified token — never from client-supplied fields.
    const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const ures = await authClient.auth.getUser(token);
    const user = ures.data && ures.data.user;
    if (!user) return json({ active: false, error: "invalid session" }, 401);
    const userId = user.id, email = user.email;
    if (!email) return json({ active: false, error: "no email on account" }, 400);

    var url = "https://api.lemonsqueezy.com/v1/subscriptions?filter[store_id]=" +
      encodeURIComponent(env.LEMONSQUEEZY_STORE_ID || "") +
      "&filter[user_email]=" + encodeURIComponent(email);

    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + env.LEMONSQUEEZY_API_KEY, Accept: "application/vnd.api+json" }
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = (data && data.errors && data.errors[0] && data.errors[0].detail) || "Lemon Squeezy error";
      return json({ active: false, error: msg }, 500);
    }

    const subs = data.data || [];
    let chosen = null;
    for (let i = 0; i < subs.length; i++) {
      const st = subs[i].attributes.status;
      if (st === "active" || st === "on_trial") { chosen = subs[i]; break; }
    }
    if (!chosen) return json({ active: false });

    const variantId = String(chosen.attributes.variant_id);
    let plan = "Pro";
    if (variantId === String(env.LEMONSQUEEZY_VARIANT_TEAM)) plan = "Team";

    // Best-effort persist to Supabase (not required for the response).
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && userId) {
      try {
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        await supabase.from("subscriptions").upsert(
          { user_id: userId, plan, status: "active", provider: "lemonsqueezy", subscription_id: String(chosen.id), updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      } catch (e) { /* ignore — response still tells the client they're active */ }
    }
    return json({ active: true, plan });
  } catch (e) {
    return json({ active: false, error: e.message }, 500);
  }
}
