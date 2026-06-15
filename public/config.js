// ===== FileMorph runtime config =====
// DEMO by default so the site works with no backend.
// To go LIVE with real accounts + payments: deploy to Vercel + Supabase (see DEPLOY.md),
// then set mode:"live" and fill the two Supabase values below.
window.FM_CONFIG = {
  mode: "live",                       // "demo" or "live"
  supabaseUrl: "https://cdqiqvlskzelnhwfmiux.supabase.co",
  supabaseAnonKey: "sb_publishable_l7fIG3GIKW4P3sCkOg5pzQ_kra8f50b", // publishable key (safe in browser)
  checkoutEndpoint: "/api/create-checkout-session",
  plans: { Pro: 9, Team: 29 },
  // Pay-as-you-go: user enters a $ amount. rate = price per credit (must match CREDIT_RATE in Cloudflare).
  credits: { rate: 0.10, presets: [1, 2, 5, 10], min: 1, max: 1000 },
  // Optional conversion server (DOCX↔PDF, EPUB→PDF, email…). Leave "" to keep those "coming soon".
  convertServer: "https://convert.filemorph.shop",
  convertToken: "2f407052bd2354c938425191cac272e0bdce2e4b013fda23"
  // Payments go through Lemon Squeezy's hosted checkout (card + PayPal built in).
};
