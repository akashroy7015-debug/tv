// Cloudflare Pages Function — creates a Lemon Squeezy checkout.
// Route: POST /api/create-checkout-session
// Env: LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_VARIANT_PRO, LEMONSQUEEZY_VARIANT_TEAM
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { plan, userId, email, credits } = await request.json();
    const VARIANTS = {
      Pro: env.LEMONSQUEEZY_VARIANT_PRO,
      Team: env.LEMONSQUEEZY_VARIANT_TEAM,
      credits: env.LEMONSQUEEZY_VARIANT_CREDITS
    };
    const variantId = VARIANTS[plan];
    if (!variantId) return json({ error: "Unknown or unconfigured plan: " + plan }, 400);

    const isCredits = plan === "credits";
    const checkoutData = {
      email: email || undefined,
      custom: isCredits ? { user_id: String(userId || ""), type: "credits" } : { user_id: String(userId || ""), plan: String(plan) }
    };
    if (isCredits) {
      // User chooses the amount; price is computed server-side (credits granted from amount paid).
      const rate = parseFloat(env.CREDIT_RATE || "0.10");
      const qty = Math.max(10, Math.min(5000, parseInt(credits || "50", 10) || 50));
      checkoutData.custom_price = Math.round(qty * rate * 100); // cents
    }

    const origin = new URL(request.url).origin;
    const payload = {
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: checkoutData,
          product_options: { redirect_url: origin + "/?checkout=success" }
        },
        relationships: {
          store: { data: { type: "stores", id: String(env.LEMONSQUEEZY_STORE_ID) } },
          variant: { data: { type: "variants", id: String(variantId) } }
        }
      }
    };

    const res = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: "Bearer " + env.LEMONSQUEEZY_API_KEY
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = (data.errors && data.errors[0] && data.errors[0].detail) || "Lemon Squeezy error";
      return json({ error: msg }, 500);
    }
    const url = data.data && data.data.attributes && data.data.attributes.url;
    if (!url) return json({ error: "No checkout URL returned" }, 500);
    return json({ url });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
