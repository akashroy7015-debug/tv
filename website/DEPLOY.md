# FileMorph — Going Live with Real Accounts & Payments

This turns the demo into a real product: **Vercel** (hosting + API), **Stripe** (payments),
**Supabase** (accounts). Everything in code is done — you do the account setup below.
Budget ~30–45 min. Use Stripe **Test mode** first.

> The site already works in **demo mode** with no backend. These steps switch it to **live**.

---

## 1. Stripe (payments)
1. Create an account at https://dashboard.stripe.com (start in **Test mode** — toggle top-right).
2. **Products → Add product**: create "FileMorph Pro", price **$9 / month (recurring)**. Copy the **Price ID** (`price_...`).
3. Repeat for "FileMorph Team", **$29 / month**. Copy that **Price ID**.
4. **Developers → API keys**: copy the **Secret key** (`sk_test_...`).

## 2. Supabase (accounts database)
1. Create a project at https://supabase.com (free tier).
2. **SQL Editor → New query** → paste the contents of `supabase-schema.sql` → **Run**.
3. **Authentication → Providers → Email**: for a smooth demo, turn **OFF** "Confirm email"
   (otherwise users must click an email link before logging in).
4. **Project Settings → API**, copy:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** key
   - **service_role** key (secret — server only)

## 3. Deploy to Vercel
1. Go to https://vercel.com, sign in with GitHub, **Add New → Project**, import `akashroy7015-debug/tv`.
2. **Root Directory**: set to **`website`**.
3. **Environment Variables** — add all of these:
   | Name | Value |
   |------|-------|
   | `STRIPE_SECRET_KEY` | `sk_test_...` |
   | `STRIPE_PRICE_PRO` | `price_...` (Pro) |
   | `STRIPE_PRICE_TEAM` | `price_...` (Team) |
   | `STRIPE_WEBHOOK_SECRET` | *(fill after step 4)* |
   | `SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
4. **Deploy.** You'll get a URL like `filemorph.vercel.app`.

## 4. Stripe webhook
1. Stripe **Developers → Webhooks → Add endpoint**.
2. URL: `https://YOUR-VERCEL-URL/api/stripe-webhook`
3. Events to send: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
4. Copy the **Signing secret** (`whsec_...`) → add it as `STRIPE_WEBHOOK_SECRET` in Vercel → **Redeploy**.

## 5. Flip the frontend to live
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
Commit & push — Vercel auto-redeploys.

## 6. Point your domain
In Vercel **Project → Settings → Domains**, add `filemorph.shop` and `www.filemorph.shop`.
Vercel shows the exact DNS records — set them at GoDaddy (Vercel usually wants an A record
`76.76.21.21` for the apex and a CNAME `cname.vercel-dns.com` for `www`). Remove the old
GitHub Pages A records.

## 7. Test (Stripe test mode)
- Open the site, sign up, use your 5 free conversions, then "Choose Pro".
- Pay with Stripe test card **4242 4242 4242 4242**, any future expiry, any CVC.
- After redirect you should see **"Subscription active"** and unlimited conversions.
- When it all works, switch Stripe to **Live mode**, redo steps 1 & 4 with live keys, update Vercel env vars.

---

## What's still demo / TODO
- **Server-side video / audio / document / email conversion** isn't built yet. The UI queues them
  but there's no worker. Easiest path: call a conversion API (e.g. CloudConvert) from a new
  serverless function, or run a container worker (Render/Railway) with `ffmpeg` + `libreoffice`.
  Tell me when you're ready and I'll add it.
- Free-quota count is per-browser (localStorage). Move it server-side if you want it enforced per account.
