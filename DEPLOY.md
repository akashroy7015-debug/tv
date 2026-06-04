# FileMorph — Going Live on Cloudflare Pages + Lemon Squeezy (India-friendly)

Free hosting + payment backend on **Cloudflare Pages**. Payments via **Lemon Squeezy**
(Merchant of Record — handles global tax, pays out to your Indian bank, no registered
business needed). Accounts to create: **Lemon Squeezy**, **Supabase**, **Cloudflare**.
Test in Lemon Squeezy **Test mode** first. Budget ~40 min.

> The site already works in **demo mode** with no backend. These steps make it real.

---

## 1. Lemon Squeezy (payments)
1. Sign up at https://app.lemonsqueezy.com and create your **Store**.
2. Turn on **Test mode** (toggle in the dashboard) while setting up.
3. **Products → New Product**: "FileMorph Pro", a **Subscription**, **$9 / month** → Publish.
   - Open the product → its **Variant** → copy the **Variant ID** (a number).
4. New Product: "FileMorph Team", Subscription, **$29 / month** → copy its **Variant ID**.
5. **Settings → API** → create an **API key** → copy it (`eyJ0...`, shown once).
6. Note your **Store ID** (Settings → Stores, or the number in the dashboard URL).

## 2. Supabase (accounts)
1. https://supabase.com → new free project.
2. **SQL Editor → New query** → paste `supabase-schema.sql` → **Run**.
3. **Authentication → Providers → Email** → turn **OFF** "Confirm email" (instant login).
4. **Project Settings → API** → copy **Project URL**, **anon public** key, **service_role** key.

## 3. Point your domain at Cloudflare
1. https://dash.cloudflare.com → **Add a site** → `filemorph.shop` → **Free** plan.
2. Cloudflare shows **two nameservers**.
3. **GoDaddy → filemorph.shop → Nameservers → Change → "Enter my own"** → paste the two
   Cloudflare nameservers → Save. (Propagates in minutes–hours; replaces old records.)

## 4. Deploy on Cloudflare (Worker with static assets)
The repo includes `wrangler.toml` + `worker.js`, so a Cloudflare **Worker** deploys the whole
thing (static site from `public/` + the `/api/*` functions). Use the project you already created.

1. Open the project in **Workers & Pages**.
2. **Settings → Build** (or Builds & deployments):
   - **Production branch:** `claude/zen-ramanujan-919NL`  ← important: the clean branch
   - **Build command:** *(empty)*  ·  **Deploy command:** `npx wrangler deploy`
   - Root/output: leave default — `wrangler.toml` handles it.
3. **Settings → Variables and Secrets** — add:
   | Name | Value |
   |------|-------|
   | `LEMONSQUEEZY_API_KEY` | your API key |
   | `LEMONSQUEEZY_STORE_ID` | your store ID (number) |
   | `LEMONSQUEEZY_VARIANT_PRO` | Pro variant ID |
   | `LEMONSQUEEZY_VARIANT_TEAM` | Team variant ID |
   | `LEMONSQUEEZY_WEBHOOK_SECRET` | *(set in step 6)* |
   | `SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
4. **Deployments → Retry / Create deployment.** You get a `*.workers.dev` URL.
   (`nodejs_compat` is already set in `wrangler.toml`.)

> Layout: static site in `public/`, API in `functions/`, `worker.js` routes `/api/*`,
> `wrangler.toml` ties them together. Deps in `package.json` (just Supabase).

## 5. Add your custom domain
Worker project → **Settings → Domains & Routes → Add → Custom domain** → `filemorph.shop`
(and `www.filemorph.shop`). Cloudflare manages DNS, so records + SSL are automatic.
Cloudflare manages the DNS now, so records + SSL are automatic.

## 6. Lemon Squeezy webhook
1. Lemon Squeezy **Settings → Webhooks → +** .
2. **Callback URL:** `https://filemorph.shop/api/lemon-webhook`
3. **Signing secret:** make up a strong random string — use the SAME value for
   `LEMONSQUEEZY_WEBHOOK_SECRET` in Cloudflare (step 4) → redeploy.
4. **Events:** check `subscription_created`, `subscription_updated`, `subscription_cancelled`,
   `subscription_expired` (and `order_created` if you like). Save.

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
Commit & push — Cloudflare Pages auto-redeploys.

## 8. Test (Lemon Squeezy Test mode)
- Open `https://filemorph.shop`, sign up, use 5 free conversions, then **Choose Pro**.
- Pay with the LS **test card 4242 4242 4242 4242**, any future expiry, any CVC.
- You return to the site and within a few seconds see **"Subscription active"** + unlimited.
- Works? In Lemon Squeezy turn **Test mode OFF** (go live), recreate the API key/webhook for
  live if needed, update Cloudflare env vars.

---

## Still TODO (server-side media conversion)
Video / audio / document / email currently **queue** in the UI but have no worker yet.
Add a Pages Function calling a conversion API (e.g. CloudConvert) or a container worker
(Render/Railway) with `ffmpeg` + `libreoffice`. Ask me and I'll build it.

## Files
- `functions/api/create-checkout-session.js` — creates Lemon Squeezy checkout
- `functions/api/lemon-webhook.js` — verifies webhook (HMAC), updates Supabase
- `wrangler.toml` — Pages build/compat config
- `supabase-schema.sql` — DB table + security
- `config.js` — demo ⇄ live switch
