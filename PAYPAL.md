# Direct PayPal Subscriptions — setup

Adds a **PayPal** button next to the card option. PayPal subscription money goes to **your**
PayPal account directly. (Card payments still go through Lemon Squeezy.)

> Test in **Sandbox** first, then switch to **Live**.

## 1. Create a PayPal app
1. Go to **https://developer.paypal.com/dashboard/applications/sandbox** → **Create App**.
2. Copy the **Client ID** and **Secret** (Sandbox first).
3. For going live later, repeat under **Live** and use those credentials.

## 2. Add PayPal secrets in Cloudflare
**Worker `tv` → Settings → Variables and Secrets** (type **Secret** for the secret ones):
| Name | Value |
|------|-------|
| `PAYPAL_CLIENT_ID` | your PayPal Client ID |
| `PAYPAL_CLIENT_SECRET` | your PayPal Secret |
| `PAYPAL_ENV` | `sandbox` (or `live`) — plain text is fine |
| `PAYPAL_SETUP_KEY` | a random string you invent (used once in step 3) |

Save → **Create deployment** (with `--keep-vars` they persist).

## 3. Create the subscription plans (one-time)
Open this URL in your browser (replace the key with your `PAYPAL_SETUP_KEY`):
```
https://filemorph.shop/api/paypal-setup?key=YOUR_SETUP_KEY
```
It returns JSON like:
```json
{ "ok": true, "planPro": "P-XXXXXXXX", "planTeam": "P-YYYYYYYY" }
```
Copy `planPro` and `planTeam`.

## 4. Turn PayPal on in the site
Edit `public/config.js` → fill the `paypal` block:
```js
paypal: {
  clientId: "YOUR_PAYPAL_CLIENT_ID",
  planPro:  "P-XXXXXXXX",
  planTeam: "P-YYYYYYYY",
  env: "sandbox"          // change to "live" when ready
}
```
Commit & push → Cloudflare redeploys. The checkout now shows **Pay with card** *and* a **PayPal** button.

## 5. Test
- Click **Choose Pro** → the payment modal shows card + PayPal.
- Click PayPal → log in with a **Sandbox buyer** account → approve.
- You return and flip to **Pro** automatically.

## 6. Go live
- Set `env: "live"` in `config.js`, and use your **Live** PayPal Client ID + Secret + `PAYPAL_ENV=live`.
- Re-run step 3 against live to get **live** plan IDs, put them in `config.js`.
- Remove `PAYPAL_SETUP_KEY` when done.

## Notes / TODO
- Cancellations: this MVP marks users active on approval. To auto-downgrade when someone
  cancels in PayPal, add a PayPal webhook (`BILLING.SUBSCRIPTION.CANCELLED/EXPIRED`) later.
- Security: the setup endpoint is protected by `PAYPAL_SETUP_KEY`. Remove it after setup.

## 7. Auto-handle cancellations (PayPal webhook)
1. PayPal Developer → your app → **Add Webhook**:
   - **URL:** `https://filemorph.shop/api/paypal-webhook`
   - **Events:** `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`,
     `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.SUSPENDED`
2. Copy the **Webhook ID** → add as `PAYPAL_WEBHOOK_ID` in Cloudflare (plain text) → redeploy.
Now when a user cancels in PayPal, their account is automatically downgraded.
