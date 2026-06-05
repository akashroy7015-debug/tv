// ===== FileMorph backend abstraction =====
// Provides window.FMBackend with a uniform API used by script.js.
// Two implementations: DEMO (localStorage, no server) and LIVE (Supabase auth + Stripe checkout).
(function () {
  "use strict";
  var cfg = window.FM_CONFIG || { mode: "demo" };
  var LIVE = cfg.mode === "live" && cfg.supabaseUrl && cfg.supabaseAnonKey;

  /* ---------- DEMO backend (client-only) ---------- */
  function DemoBackend() {
    var LS = "fm_user";
    function get() { try { return JSON.parse(localStorage.getItem(LS)); } catch (e) { return null; } }
    function set(u) { try { localStorage.setItem(LS, JSON.stringify(u)); } catch (e) {} }
    return {
      live: false,
      demo: true,
      ready: Promise.resolve(),
      user: function () { return get(); },
      isPaid: function () { var u = get(); return !!(u && u.plan && u.plan !== "free"); },
      signIn: function (email) { var u = get() || {}; u.email = email; u.plan = u.plan || "free"; set(u); return Promise.resolve(u); },
      signUp: function (email) { var u = get() || {}; u.email = email; u.plan = u.plan || "free"; set(u); return Promise.resolve({ needsVerification: false }); },
      logout: function () { try { localStorage.removeItem(LS); } catch (e) {} return Promise.resolve(); },
      // demo "purchase" just flips the local plan (the fake card modal calls this)
      purchase: function (plan) { var u = get() || {}; u.plan = plan; set(u); return Promise.resolve({ done: true }); },
      applyPlan: function (plan) { var u = get() || {}; u.plan = plan; set(u); },
      refresh: function () { return Promise.resolve(); },
      verify: function () { return Promise.resolve(this.isPaid()); },
      credits: function () { return 0; },
      spendCredit: function () { return Promise.resolve(-1); },
      getToken: function () { return Promise.resolve(null); }
    };
  }

  /* ---------- LIVE backend (Supabase + Stripe) ---------- */
  function LiveBackend() {
    var sb = null, currentUser = null, sub = null, walletCredits = 0;
    function paid() { return !!(sub && (sub.status === "active" || sub.status === "trialing")); }
    var ready = (async function () {
      var mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      sb = mod.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      var s = await sb.auth.getSession();
      currentUser = s.data.session ? s.data.session.user : null;
      if (currentUser) { await loadSub(); await loadWallet(); }
      sb.auth.onAuthStateChange(function (_e, session) { currentUser = session ? session.user : null; });
    })();
    async function loadSub() {
      if (!currentUser) { sub = null; return; }
      try {
        var r = await sb.from("subscriptions").select("plan,status").eq("user_id", currentUser.id).maybeSingle();
        sub = r.data || null;
      } catch (e) { sub = null; }
    }
    async function loadWallet() {
      if (!currentUser) { walletCredits = 0; return; }
      try {
        var r = await sb.from("wallets").select("credits").eq("user_id", currentUser.id).maybeSingle();
        walletCredits = r.data ? (r.data.credits || 0) : 0;
      } catch (e) { walletCredits = 0; }
    }
    return {
      live: true,
      demo: false,
      ready: ready,
      user: function () {
        if (!currentUser) return null;
        return { email: currentUser.email, id: currentUser.id, plan: paid() ? sub.plan : "free" };
      },
      isPaid: paid,
      signIn: async function (email, password) {
        // Login only — does NOT create an account.
        var r = await sb.auth.signInWithPassword({ email: email, password: password });
        if (r.error) throw r.error;
        var u = await sb.auth.getUser();
        currentUser = u.data.user;
        await loadSub();
        return this.user();
      },
      signUp: async function (email, password) {
        var r = await sb.auth.signUp({ email: email, password: password });
        if (r.error) throw r.error;
        if (r.data.session) { currentUser = r.data.user; await loadSub(); return { needsVerification: false }; }
        return { needsVerification: true }; // email confirmation required
      },
      logout: async function () { try { await sb.auth.signOut(); } catch (e) {} currentUser = null; sub = null; },
      purchase: async function (plan, opts) {
        var body = { plan: plan, userId: currentUser ? currentUser.id : null, email: currentUser ? currentUser.email : null };
        if (opts) for (var k in opts) body[k] = opts[k];
        var res = await fetch(cfg.checkoutEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        var data = await res.json();
        if (data && data.url) { window.location.href = data.url; return { redirect: true }; }
        throw new Error((data && data.error) || "Could not start checkout");
      },
      // Mark paid in-memory immediately (e.g. right after a PayPal approval).
      applyPlan: function (plan) { sub = { plan: plan, status: "active" }; },
      // Ask Lemon Squeezy directly (reliable even if the webhook didn't fire).
      verify: async function () {
        if (!currentUser) return false;
        try {
          var res = await fetch("/api/verify-subscription", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: currentUser.id, email: currentUser.email })
          });
          var d = await res.json();
          if (d && d.active) { sub = { plan: d.plan, status: "active" }; return true; }
        } catch (e) {}
        await loadSub();
        return paid();
      },
      credits: function () { return walletCredits; },
      getToken: async function () {
        try { var s = await sb.auth.getSession(); return s.data.session ? s.data.session.access_token : null; }
        catch (e) { return null; }
      },
      // Atomically spend 1 credit server-side. Returns new balance, or -1 if none.
      spendCredit: async function () {
        if (!currentUser) return -1;
        try {
          var r = await sb.rpc("spend_credit");
          if (r.error) return -1;
          var bal = typeof r.data === "number" ? r.data : -1;
          if (bal >= 0) walletCredits = bal;
          return bal;
        } catch (e) { return -1; }
      },
      refresh: async function () { await loadSub(); await loadWallet(); }
    };
  }

  window.FMBackend = LIVE ? LiveBackend() : DemoBackend();
})();
