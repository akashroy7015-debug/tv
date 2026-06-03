// ===== FileMorph runtime config =====
// DEMO by default so the site works with no backend.
// To go LIVE with real accounts + payments: deploy to Vercel + Supabase (see DEPLOY.md),
// then set mode:"live" and fill the two Supabase values below.
window.FM_CONFIG = {
  mode: "demo",                       // "demo" or "live"
  supabaseUrl: "",                    // e.g. https://xxxx.supabase.co
  supabaseAnonKey: "",               // Supabase anon/public key (safe in frontend)
  checkoutEndpoint: "/api/create-checkout-session",
  plans: { Pro: 9, Team: 29 }
};
