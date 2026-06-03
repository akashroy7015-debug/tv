// Vercel serverless function — creates a Stripe Checkout Session (subscription).
// Requires env vars: STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  Pro: process.env.STRIPE_PRICE_PRO,
  Team: process.env.STRIPE_PRICE_TEAM
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const body = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    const { plan, userId, email } = body;
    const price = PRICES[plan];
    if (!price) {
      res.status(400).json({ error: "Unknown or unconfigured plan: " + plan });
      return;
    }
    const origin = req.headers.origin || "https://" + req.headers.host;
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
    res.status(200).json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
