// Cloudflare Pages Function — Stripe webhook. Marks users subscribed in Supabase.
// Route: POST /api/stripe-webhook
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: "2024-06-20"
  });

  const sig = request.headers.get("stripe-signature");
  const body = await request.text(); // raw body — easy on Workers

  let event;
  try {
    // Workers require the async verifier + SubtleCrypto provider.
    event = await stripe.webhooks.constructEventAsync(
      body, sig, env.STRIPE_WEBHOOK_SECRET, undefined, Stripe.createSubtleCryptoProvider()
    );
  } catch (e) {
    return new Response("Webhook Error: " + e.message, { status: 400 });
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      const userId = s.client_reference_id || (s.metadata && s.metadata.userId);
      const plan = (s.metadata && s.metadata.plan) || "Pro";
      if (userId) {
        await supabase.from("subscriptions").upsert(
          {
            user_id: userId,
            plan,
            status: "active",
            stripe_customer_id: s.customer,
            stripe_subscription_id: s.subscription,
            updated_at: new Date().toISOString()
          },
          { onConflict: "user_id" }
        );
      }
    } else if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      const active = sub.status === "active" || sub.status === "trialing";
      await supabase
        .from("subscriptions")
        .update({ status: active ? "active" : "canceled", updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", sub.id);
    }
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
