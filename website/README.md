# FileMorph — Landing Site

An original, privacy-first landing page for a fictional **local file-converter** desktop app.
Inspired by the *category* of offline converter apps, but written from scratch — original
name, copy, layout, color system, and code (no assets or text copied from any other site).

## What it includes
- Responsive single-page site: hero, stats, 5 toolkits, features, formats, pricing, FAQ, CTA, footer
- A **real working in-browser image converter** (PNG / JPG / WebP) powered by the Canvas API —
  files never leave the browser, mirroring the app's "stays on your device" promise
- Pure HTML/CSS/vanilla JS — no build step, no dependencies

## Run it
Just open `index.html` in a browser, or serve the folder:

```bash
cd website
python3 -m http.server 8080
# visit http://localhost:8080
```

## Files
| File | Purpose |
|------|---------|
| `index.html` | Page structure & content |
| `styles.css` | Dark theme, layout, responsive rules |
| `script.js`  | Mobile nav + live image-converter demo |
