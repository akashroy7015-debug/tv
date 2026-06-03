# FileMorph — Going Live on Cloudflare Pages (free)

Hosting + payment backend both run free on **Cloudflare Pages** (Pages Functions).
Domain stays at GoDaddy; you'll point it at Cloudflare. Accounts you create: **Cloudflare**,
**Stripe**, **Supabase**. Use Stripe **Test mode** first. Budget ~40 min.

> The site already works in **demo mode** with no backend. These steps make it real.

---

## 1. Stripe (payments)
1. https://dashboard.stripe.com — create account, stay in **Test mode** (toggle, top-right).
2. **Products → Add product**: "FileMorph Pro", **$9/month recurring** → copy its **Price ID** (`price_...`).
3. Same for "FileMorph Team", **$29/month** → copy **Price ID**.
4. **Developers → API keys** → copy the **Secret key** (`sk_test_...`).

## 2. Supabase (accounts)
1. https://supabase.com — new free project.
2. **SQL Editor → New query** → paste `supabase-schema.sql` → **Run**.
3. **Authentication → Providers → Email** → turn **OFF** "Confirm email" (so login is instant).
4. **Project Settings → API** → copy **Project URL**, **anon public** key, **service_role** key.

## 3. Point your domain at Cloudflare
1. https://dash.cloudflare.com — **Add a site** → enter `filemorph.shop` → **Free** plan.
2. Cloudflare scans your DNS and shows **two nameservers** (e.g. `xxx.ns.cloudflare.com`).
3. At **GoDaddy → filemorph.shop → Nameservers → Change → "I'll use my own"** → paste the two
   Cloudflare nameservers → Save. (Propagation: minutes to a few hours.)
   - This replaces the old GitHub Pages A records automatically — no need to delete them.

## 4. Deploy to Cloudflare Pages
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick the repo **akashroy7015-debug/tv**. Production branch: `claude/focused-planck-9YXe4`.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `website`
   - **Root directory (Advanced):** `website`
4. **Environment variables** (Settings → after first deploy, or in the wizard) — add:
   | Name | Value |
   |------|-------|
   | `STRIPE_SECRET_KEY` | `sk_test_...` |
   | `STRIPE_PRICE_PRO` | `price_...` (Pro) |
   | `STRIPE_PRICE_TEAM` | `price_...` (Team) |
   | `STRIPE_WEBHOOK_SECRET` | *(fill after step 6)* |
   | `SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
5. **Save and Deploy.** You get a URL like `filemorph.pages.dev`.
   - `wrangler.toml` already sets the `nodejs_compat` flag the Stripe SDK needs.

## 5. Add your custom domain
Pages project → **Custom domains → Set up a domain** → `filemorph.shop` (and `www.filemorph.shop`).
Because Cloudflare now manages your DNS, it adds the records automatically. SSL is automatic.

## 6. Stripe webhook
1. Stripe **Developers → Webhooks → Add endpoint**.
2. URL: `https://filemorph.shop/api/stripe-webhook`
3. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
4. Copy the **Signing secret** (`whsec_...`) → add as `STRIPE_WEBHOOK_SECRET` in Pages env vars → **Retry deployment**.

## 7. Flip the frontend to live
Edit `website/config.js`:
```js
window.FM_CONFIG = {
  mode: "live",
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY",
  checkoutEndpoint: "/api/create-checkout-session",
  plans: { Pro: 9, Team: 29 }
};
```
Commit & push — Cloudflare Pages auto-redeploys from the repo.

## 8. Test (Stripe Test mode)
- Open `https://filemorph.shop`, sign up, use 5 free conversions, then **Choose Pro**.
- Pay with test card **4242 4242 4242 4242**, any future expiry, any CVC.
- You should land back with **"Subscription active"** and unlimited conversions.
- Works? Switch Stripe to **Live mode**, redo steps 1 & 6 with live keys, update env vars.

---

## Still TODO (server-side media conversion)
Video / audio / document / email currently **queue** in the UI but have no worker yet.
Add a Pages Function that calls a conversion API (e.g. CloudConvert) or a separate
container worker (Render/Railway) running `ffmpeg` + `libreoffice`. Ask me and I'll build it.

## Files
- `functions/api/*.js` — Cloudflare Pages Functions (Stripe + Supabase)
- `wrangler.toml` — Pages build/compat config
- `supabase-schema.sql` — DB table + security
- `config.js` — demo ⇄ live switch
