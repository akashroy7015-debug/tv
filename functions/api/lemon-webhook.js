// Cloudflare Pages Function — Lemon Squeezy webhook. Marks users subscribed in Supabase.
// Route: POST /api/lemon-webhook
// Env: LEMONSQUEEZY_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from "@supabase/supabase-js";

async function hmacHex(secret, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.text();
  const signature = request.headers.get("X-Signature") || "";

  const expected = await hmacHex(env.LEMONSQUEEZY_WEBHOOK_SECRET, body);
  if (!safeEqual(expected, signature)) return new Response("Invalid signature", { status: 401 });

  let payload;
  try { payload = JSON.parse(body); } catch (e) { return new Response("Bad JSON", { status: 400 }); }

  const meta = payload.meta || {};
  const event = meta.event_name;
  const custom = meta.custom_data || {};
  const userId = custom.user_id;
  const plan = custom.plan || "Pro";
  const attrs = (payload.data && payload.data.attributes) || {};
  const subId = payload.data && payload.data.id;

  if (!userId) return new Response(JSON.stringify({ ignored: true }), { headers: { "Content-Type": "application/json" } });

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const ACTIVE = ["active", "on_trial"];
  try {
    if (event === "order_created") {
      // Pay-as-you-go credit pack purchase.
      if (custom.type === "credits") {
        const n = parseInt(custom.credits || "0", 10);
        if (n > 0) await supabase.rpc("add_credits", { uid: userId, n: n });
      }
      // (subscription initial orders are handled by subscription_created)
    } else if (event === "subscription_created" || event === "subscription_updated" || event === "subscription_resumed" || event === "subscription_unpaused") {
      const status = attrs.status;
      const active = ACTIVE.indexOf(status) !== -1;
      await supabase.from("subscriptions").upsert(
        { user_id: userId, plan, status: active ? "active" : "canceled", provider: "lemonsqueezy", subscription_id: String(subId), updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    } else if (event === "subscription_cancelled" || event === "subscription_expired" || event === "subscription_paused") {
      await supabase.from("subscriptions").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("user_id", userId);
    }
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
