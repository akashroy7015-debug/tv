# FileMorph — Online File Converter

A web app to convert files in the browser: images & PDF run **locally** (Canvas API),
with accounts and subscriptions for unlimited use. Built to deploy on **Cloudflare Pages**
with **Lemon Squeezy** payments and **Supabase** accounts.

## Structure
```
public/        static site (index.html, styles.css, script.js, config.js, backend.js, logo)
functions/     Cloudflare Pages Functions (Lemon Squeezy checkout + webhook)
package.json   serverless dependencies (Supabase)
supabase-schema.sql   accounts/subscriptions table + RLS
DEPLOY.md      step-by-step go-live runbook
```

## Run locally (demo mode)
```bash
cd public
python3 -m http.server 8080
# visit http://localhost:8080
```
In demo mode the converter works for images/PDF and login/checkout are simulated.

## Go live (real accounts + payments)
Follow **DEPLOY.md**: Cloudflare Pages + Lemon Squeezy + Supabase, then flip
`public/config.js` to `mode: "live"`.

## What works today
- ✅ In-browser **image & PDF** conversion (PNG/JPG/WebP/PDF)
- ✅ Free-quota gating, login, plan checkout (real once configured)
- 🟡 Video/audio/document/email conversion — UI queues them; server worker still TODO
