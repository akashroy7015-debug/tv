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
  // Direct PayPal (optional). Fill clientId + plan IDs to show a PayPal button at checkout.
  // Leave clientId "" to hide PayPal and use card (Lemon Squeezy) only.
  paypal: { clientId: "AduK6Lrw75EHf2EntZ3A-3aQ4FRsbkMSHU0clihbX23KggjCAo6Rb-x3xsZ5JGUbQKkN1kHHQLa52Sgp", planPro: "", planTeam: "", env: "sandbox" }
};
