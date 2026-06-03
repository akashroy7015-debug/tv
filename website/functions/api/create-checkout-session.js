// Cloudflare Pages Function — creates a Stripe Checkout Session (subscription).
// Route: POST /api/create-checkout-session
// Env (Pages → Settings → Environment variables): STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM
import Stripe from "stripe";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient(),
      apiVersion: "2024-06-20"
    });
    const PRICES = { Pro: env.STRIPE_PRICE_PRO, Team: env.STRIPE_PRICE_TEAM };

    const { plan, userId, email } = await request.json();
    const price = PRICES[plan];
    if (!price) return json({ error: "Unknown or unconfigured plan: " + plan }, 400);

    const origin = new URL(request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer_email: email || undefined,
      client_reference_id: userId || undefined,
      metadata: { plan, userId: userId || "" },
      allow_promotion_codes: true,
      success_url: origin + "/?checkout=success",
      cancel_url: origin + "/?checkout=cancel"
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
