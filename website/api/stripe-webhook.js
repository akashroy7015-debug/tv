// Vercel serverless function — Stripe webhook. Marks users as subscribed in Supabase.
// Requires env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Stripe signature verification needs the raw request body.
export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).end(); return; }

  let event;
  try {
    const buf = await rawBody(req);
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    res.status(400).send("Webhook Error: " + e.message);
    return;
  }

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
    res.status(200).json({ received: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
