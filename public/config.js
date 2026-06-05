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
  credits: { pack: 50, price: 5 }, // pay-as-you-go: 50 credits for $5
  // Direct PayPal (optional). Fill clientId + plan IDs to show a PayPal button at checkout.
  // Leave clientId "" to hide PayPal and use card (Lemon Squeezy) only.
  paypal: { clientId: "AbfY1i6NmDs1dRrKSoT7L1zcTwg6qj3LJtbYoTPOH5B82iiPW3zKW5hT49FWhXkwt4yfTvge9ZzRyIxI", planPro: "P-9LS40434WE552315VNIQ3PYI", planTeam: "P-0TH89402KG975712XNIQ3QKY", env: "live" }
};
