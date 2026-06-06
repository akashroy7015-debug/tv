// ===== FileMorph — web converter (free quota, login & plans via FMBackend) =====
(function () {
  "use strict";

  var B = window.FMBackend; // demo or live backend

  // Monthly conversion quota per plan. Team = unlimited.
  var PLAN_LIMITS = { free: 5, Pro: 300, Team: Infinity };

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function getUser() { return B.user(); }
  function currentPlan() { var u = getUser(); return (u && u.plan) ? u.plan : "free"; }
  function planLimit() { var l = PLAN_LIMITS[currentPlan()]; return l == null ? PLAN_LIMITS.free : l; }
  function unlimited() { return planLimit() === Infinity; }
  // Usage is tracked per account (or "anon") per calendar month, so it resets monthly.
  function usedKey() {
    var u = getUser();
    var who = u && u.id ? u.id : (u && u.email ? u.email : "anon");
    return "fm_used_" + who + "_" + new Date().toISOString().slice(0, 7);
  }
  function used() { return parseInt(lsGet(usedKey()) || "0", 10); }
  function bumpUsed() { lsSet(usedKey(), String(used() + 1)); }
  function quotaLeft() { return unlimited() ? Infinity : Math.max(0, planLimit() - used()); }
  function isPaid() { return B.isPaid(); }
  function nextTier() { return currentPlan() === "Pro" ? "Team" : "Pro"; }
  function humanSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(2) + " MB";
  }

  /* ---------- category config ---------- */
  var CATS = {
    image: { accept: "image/*,.heic,.heif,.tif,.tiff,.svg", engine: "image", hint: "HEIC · TIFF · SVG · PNG · JPG · WebP → PNG / JPG / WebP / PDF / ICO",
      formats: [["image/png", "PNG"], ["image/jpeg", "JPG"], ["image/webp", "WebP"], ["application/pdf", "PDF"], ["ico", "ICO"]],
      note: "Converted privately in your browser — supports HEIC, TIFF, SVG and more." },
    sheet: { accept: ".xlsx,.xls,.csv,.ods", engine: "sheet", hint: "XLSX · XLS · ODS · CSV — converted in your browser",
      formats: [["csv", "CSV"], ["xlsx", "XLSX"]],
      note: "Spreadsheets convert privately in your browser — nothing is uploaded." },
    audio: { accept: "audio/*", engine: "ffmpeg", hint: "MP3 · WAV · AAC · M4A · OGG · FLAC — converted in your browser",
      formats: [["mp3", "MP3"], ["wav", "WAV"], ["aac", "AAC"], ["m4a", "M4A"], ["ogg", "OGG"], ["flac", "FLAC"]],
      note: "Converted privately in your browser — nothing is uploaded." },
    video: { accept: "video/*", engine: "ffmpeg", hint: "MP4 · WebM · MOV · MKV · GIF — converted in your browser",
      formats: [["mp4", "MP4"], ["webm", "WebM"], ["gif", "GIF"], ["mov", "MOV"], ["mkv", "MKV"]],
      note: "Converted privately in your browser. Large videos may take a while." },
    document: { accept: ".pdf,.docx,.doc,.odt,.epub,.rtf,.pptx", engine: "document", hint: "DOCX · PDF · EPUB · PPTX → PDF / DOCX / HTML / TXT / PNG / JPG",
      formats: [["pdf", "PDF"], ["docx", "DOCX"], ["html", "HTML"], ["txt", "TXT"], ["png", "PNG"], ["jpg", "JPG"]],
      note: "DOCX→HTML/TXT and PDF→PNG/JPG run in your browser. DOCX↔PDF and EPUB→PDF use our conversion server." },
    email: { accept: ".eml,.msg,.mbox", engine: "email", hint: "EML · MSG · MBOX → PDF / HTML",
      formats: [["pdf", "PDF"], ["html", "HTML"]],
      note: "Email conversion runs on our conversion server (set up by the site owner)." }
  };
  var currentCat = "image";

  /* ---------- refs ---------- */
  var navToggle = $("navToggle"), navLinks = document.querySelector(".nav-links"), navAccount = $("navAccount");
  var catTabs = $("catTabs"), usageText = $("usageText"), upgradeLink = $("upgradeLink"), catNote = $("catNote");
  var dropZone = $("dropZone"), fileInput = $("fileInput"), browseBtn = $("browseBtn"), dropHint = $("dropHint");
  var formatSelect = $("formatSelect"), qualityRange = $("qualityRange"), qualityVal = $("qualityVal"), qualityWrap = $("qualityWrap");
  var convertBtn = $("convertBtn"), previewWrap = $("previewWrap"), previewImg = $("previewImg"), origMeta = $("origMeta"), resultBox = $("resultBox");
  var authModal = $("authModal"), authForm = $("authForm"), authEmail = $("authEmail"), authPass = $("authPass");
  var authSub = $("authSub"), authSubmit = $("authSubmit"), authMsg = $("authMsg");
  var authMode = "login";
  var planModal = $("planModal"), planForm = $("planForm"), planSub = $("planSub");
  var toast = $("toast");

  /* ---------- nav ---------- */
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () { navLinks.classList.toggle("open"); });
    navLinks.addEventListener("click", function (e) { if (e.target.tagName === "A") navLinks.classList.remove("open"); });
  }

  /* ---------- toast ---------- */
  var toastTimer;
  function showToast(msg) {
    toast.textContent = msg; toast.hidden = false; toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); setTimeout(function () { toast.hidden = true; }, 300); }, 3000);
  }

  /* ---------- account UI ---------- */
  function renderAccount() {
    var u = getUser();
    navAccount.innerHTML = "";
    if (u) {
      var c = B.credits ? (B.credits() || 0) : 0;
      var chip = document.createElement("span");
      chip.className = "account-chip";
      chip.innerHTML = "<strong>" + (u.plan && u.plan !== "free" ? u.plan : "Free") + "</strong> · " + u.email;
      navAccount.appendChild(chip);
      var credChip = document.createElement("span");
      credChip.className = "account-chip credits-chip"; credChip.title = "Conversion credits";
      credChip.innerHTML = "🎟️ <strong>" + c + "</strong>";
      navAccount.appendChild(credChip);
      if (isPaid()) {
        var manage = document.createElement("button");
        manage.className = "btn btn-ghost btn-sm"; manage.textContent = "Manage";
        manage.addEventListener("click", manageSubscription);
        navAccount.appendChild(manage);
      }
      var out = document.createElement("button");
      out.className = "btn btn-ghost btn-sm"; out.textContent = "Log out";
      out.addEventListener("click", function () { B.logout().then(function () { renderAccount(); renderUsage(); showToast("Logged out"); }); });
      navAccount.appendChild(out);
    } else {
      var login = document.createElement("button");
      login.className = "btn btn-ghost btn-sm"; login.textContent = "Log in";
      login.addEventListener("click", function () { openAuth("login"); });
      var signup = document.createElement("button");
      signup.className = "btn btn-primary btn-sm"; signup.textContent = "Sign up";
      signup.addEventListener("click", function () { openAuth("signup"); });
      navAccount.appendChild(login); navAccount.appendChild(signup);
    }
  }

  function manageSubscription() {
    if (!B.getToken) { showToast("Manage subscription from your email receipt."); return; }
    showToast("Opening subscription management…");
    B.getToken().then(function (token) {
      return fetch("/api/manage-subscription", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token })
      });
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.url) { window.open(d.url, "_blank", "noopener"); }
      else { showToast((d && d.error) || "Couldn't open management page."); }
    }).catch(function (e) { showToast("Error: " + e.message); });
  }

  /* ---------- usage meter ---------- */
  function creditChip() {
    var c = B.credits ? (B.credits() || 0) : 0;
    return c > 0 ? " · <strong>" + c + "</strong> credits" : "";
  }
  function renderUsage() {
    var plan = currentPlan();
    var bar = $("usageBar");
    if (bar) bar.classList.toggle("paid", plan !== "free" || creditsLeft() > 0);
    if (unlimited()) {
      usageText.innerHTML = "✨ <strong>Unlimited</strong> conversions · <span class='plan-badge'>" + plan + "</span>";
      upgradeLink.hidden = true;
      renderPlans();
      return;
    }
    var left = quotaLeft();
    var limit = planLimit();
    if (plan === "free") {
      usageText.innerHTML = "Free · <strong>" + left + " / " + limit + "</strong> this month" + creditChip();
      upgradeLink.textContent = creditsLeft() > 0 ? "Top up credits →" : "Upgrade for more →";
      upgradeLink.hidden = left > 2 && creditsLeft() > 0;
    } else {
      usageText.innerHTML = "⭐ <span class='plan-badge'>" + plan + "</span> · <strong>" + left + "</strong> of " + limit + " this month" + creditChip();
      upgradeLink.textContent = "Go unlimited with Team →";
      upgradeLink.hidden = left > 25;
    }
    renderPlans();
  }

  /* ---------- pricing cards: mark the user's current plan ---------- */
  function renderPlans() {
    var plan = currentPlan();
    var paid = plan !== "free";
    document.querySelectorAll("[data-plan]").forEach(function (btn) {
      var p = btn.getAttribute("data-plan");
      var card = btn.closest(".price-card");
      if (card) {
        card.classList.toggle("current", p === plan);
        // Paid users shouldn't see the Free tier anymore — they bought a plan.
        if (p === "free") card.style.display = paid ? "none" : "";
      }
      if (p === "credits") {
        // Pay-as-you-go is never a "current plan" — it's a top-up.
        btn.disabled = false;
        btn.classList.remove("is-current");
        if (card) { card.classList.remove("current"); card.style.display = ""; }
        btn.textContent = creditsLeft() > 0 ? "Buy more credits" : "Buy credits";
      } else if (p === plan) {
        btn.textContent = "✓ Your current plan";
        btn.disabled = true;
        btn.classList.add("is-current");
      } else {
        btn.disabled = false;
        btn.classList.remove("is-current");
        btn.textContent = p === "free" ? "Free plan" : "Choose " + p;
      }
    });
  }

  /* ---------- modals ---------- */
  function openModal(m) { m.hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal(m) { m.hidden = true; document.body.style.overflow = ""; }
  var payModal = $("payModal");
  document.addEventListener("click", function (e) {
    if (e.target.hasAttribute && e.target.hasAttribute("data-close")) { closeModal(authModal); closeModal(planModal); if (payModal) closeModal(payModal); }
    if (e.target.classList && e.target.classList.contains("modal-overlay")) closeModal(e.target);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeModal(authModal); closeModal(planModal); if (payModal) closeModal(payModal); } });
  function setAuthMode(mode) {
    authMode = mode;
    document.querySelectorAll(".auth-tab").forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-mode") === mode); });
    if (mode === "signup") {
      $("authTitle").textContent = "Create your account";
      authSub.textContent = "Sign up — we'll email you a verification link.";
      authSubmit.textContent = "Sign up";
    } else {
      $("authTitle").textContent = "Welcome back";
      authSub.textContent = "Log in to your FileMorph account.";
      authSubmit.textContent = "Log in";
    }
    authMsg.style.color = ""; authMsg.textContent = "Secure accounts powered by Supabase.";
  }
  function openAuth(mode) { setAuthMode(mode || "login"); openModal(authModal); setTimeout(function () { authEmail.focus(); }, 50); }
  document.querySelectorAll(".auth-tab").forEach(function (t) {
    t.addEventListener("click", function () { setAuthMode(t.getAttribute("data-mode")); });
  });

  var pendingPlan = null;      // {plan, price} to resume after login
  var planModalPlan = null;    // plan being confirmed in the demo card modal

  // Choose a plan: ensure logged in, then pick a payment method.
  function choosePlan(plan, price) {
    if (plan === "credits") { buyCredits(); return; }
    if (!getUser()) { pendingPlan = { plan: plan, price: price }; openAuth("login"); return; }
    if (B.demo) {
      planModalPlan = plan;
      planSub.textContent = plan + " — $" + price + "/mo. Cancel anytime.";
      $("payBtn").textContent = "Subscribe to " + plan + " — $" + price + "/mo";
      openModal(planModal);
      return;
    }
    var pp = window.FM_CONFIG.paypal;
    if (pp && pp.clientId) { openPay(plan, price); return; } // offer card + PayPal
    startCardCheckout(plan); // Lemon Squeezy only
  }

  function startCardCheckout(plan) {
    showToast("Redirecting to secure checkout…");
    B.purchase(plan).catch(function (err) {
      showToast(err.message || "Checkout failed");
      alert("Checkout error:\n\n" + (err.message || "unknown error") +
        "\n\nThis usually means a Lemon Squeezy setting in Cloudflare is missing/incorrect.");
    });
  }

  // Pay-as-you-go credit pack (one-time purchase, card or PayPal).
  function buyCredits() {
    if (B.demo) { showToast("Credits aren't available in demo mode."); return; }
    if (!getUser()) { pendingPlan = { plan: "credits" }; openAuth("login"); return; }
    var pp = window.FM_CONFIG.paypal;
    var price = (window.FM_CONFIG.credits && window.FM_CONFIG.credits.price) || 5;
    if (pp && pp.clientId) { openPay("credits", price); return; }
    startCardCheckout("credits");
  }

  /* ---------- payment-method modal (card via Lemon Squeezy + direct PayPal) ---------- */
  var currentPayPlan = null;
  function creditRate() { return (window.FM_CONFIG.credits && window.FM_CONFIG.credits.rate) || 0.10; }
  function currentDollar() {
    var cc = window.FM_CONFIG.credits || {};
    var v = parseFloat(($("creditQty") && $("creditQty").value) || "5") || 5;
    return Math.max(cc.min || 1, Math.min(cc.max || 500, v));
  }
  function currentCreditQty() { return Math.max(1, Math.round(currentDollar() / creditRate())); }
  function updateCreditPrice() {
    var dollar = currentDollar();
    var credits = Math.round(dollar / creditRate());
    if ($("creditPrice")) $("creditPrice").innerHTML = "$" + dollar.toFixed(2) + " = <span>" + credits + " credits</span>";
    document.querySelectorAll("#creditQuick button").forEach(function (b) {
      b.classList.toggle("sel", parseFloat(b.getAttribute("data-q")) === currentDollar());
    });
  }
  function buildCreditPicker() {
    var presets = (window.FM_CONFIG.credits && window.FM_CONFIG.credits.presets) || [2, 5, 10, 20, 50];
    var quick = $("creditQuick");
    if (quick) {
      quick.innerHTML = "";
      presets.forEach(function (d) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = "$" + d; b.setAttribute("data-q", d);
        b.addEventListener("click", function () { if ($("creditQty")) $("creditQty").value = d; updateCreditPrice(); });
        quick.appendChild(b);
      });
    }
    updateCreditPrice();
  }
  if ($("creditQty")) $("creditQty").addEventListener("input", updateCreditPrice);

  function openPay(plan, price) {
    currentPayPlan = { plan: plan, price: price };
    var picker = $("creditPicker");
    if (plan === "credits") {
      $("payTitle").textContent = "Buy credits";
      $("paySub").textContent = "Enter an amount — you'll get credits (1 credit = 1 conversion, never expire).";
      if (picker) picker.hidden = false;
      buildCreditPicker();
    } else {
      if (picker) picker.hidden = true;
      $("payTitle").textContent = "Subscribe to " + plan;
      $("paySub").textContent = "$" + price + "/month · cancel anytime";
    }
    openModal(payModal);
    if (plan === "credits") renderPayPalOrder(); else renderPayPal(plan);
  }
  var payCardBtn = $("payCardBtn");
  if (payCardBtn) payCardBtn.addEventListener("click", function () {
    if (!currentPayPlan) return;
    if (currentPayPlan.plan === "credits") {
      if (payModal) closeModal(payModal);
      showToast("Redirecting to secure checkout…");
      B.purchase("credits", { credits: currentCreditQty() }).catch(function (e) { showToast(e.message || "Checkout failed"); });
    } else {
      if (payModal) closeModal(payModal);
      startCardCheckout(currentPayPlan.plan);
    }
  });

  var _ppLoading = null;
  function loadPayPalSDK() {
    var pp = window.FM_CONFIG.paypal;
    if (window.paypalSub) return Promise.resolve();
    if (_ppLoading) return _ppLoading;
    _ppLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(pp.clientId) + "&vault=true&intent=subscription&components=buttons";
      s.setAttribute("data-namespace", "paypalSub");
      s.onload = resolve;
      s.onerror = function () { reject(new Error("PayPal SDK failed to load")); };
      document.head.appendChild(s);
    });
    return _ppLoading;
  }
  function renderPayPal(plan) {
    var pp = window.FM_CONFIG.paypal;
    var box = $("paypalButtons"), divider = $("payDivider");
    if (!box) return;
    box.innerHTML = "";
    var planId = plan === "Team" ? (pp && pp.planTeam) : (pp && pp.planPro);
    if (!pp || !pp.clientId || !planId) { if (divider) divider.style.display = "none"; return; }
    if (divider) divider.style.display = "";
    loadPayPalSDK().then(function () {
      var user = getUser();
      window.paypalSub.Buttons({
        style: { layout: "vertical", color: "gold", shape: "pill", label: "subscribe" },
        createSubscription: function (data, actions) {
          return actions.subscription.create({ plan_id: planId, custom_id: user ? user.id : "" });
        },
        onApprove: function (data) {
          box.innerHTML = "<small style='color:var(--muted)'>Confirming your subscription…</small>";
          fetch("/api/paypal-verify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscriptionID: data.subscriptionID, userId: user ? user.id : null })
          }).then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.active) {
              if (B.applyPlan) B.applyPlan(d.plan);
              if (payModal) closeModal(payModal);
              renderAccount(); renderUsage();
              showToast("🎉 You're on " + d.plan + " — thank you!");
            } else {
              box.innerHTML = "<small style='color:#ff6b6b'>" + ((d && d.error) || "Could not confirm subscription") + "</small>";
            }
          }).catch(function (e) { box.innerHTML = "<small style='color:#ff6b6b'>" + e.message + "</small>"; });
        },
        onError: function () { showToast("PayPal error — try the card option."); }
      }).render("#paypalButtons").catch(function (e) {
        box.innerHTML = "<small style='color:var(--muted)'>PayPal couldn't load here. Please use the card option.</small>";
      });
    }).catch(function () {
      box.innerHTML = "<small style='color:var(--muted)'>PayPal couldn't load. Please use the card option.</small>";
    });
  }

  /* ---------- PayPal one-time order (credit packs) ---------- */
  var _ppOrderLoading = null;
  function loadPayPalOrderSDK() {
    var pp = window.FM_CONFIG.paypal;
    if (window.paypalOrder) return Promise.resolve();
    if (_ppOrderLoading) return _ppOrderLoading;
    _ppOrderLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(pp.clientId) + "&intent=capture&currency=USD&components=buttons";
      s.setAttribute("data-namespace", "paypalOrder");
      s.onload = resolve;
      s.onerror = function () { reject(new Error("PayPal SDK failed to load")); };
      document.head.appendChild(s);
    });
    return _ppOrderLoading;
  }
  function renderPayPalOrder(price) {
    var pp = window.FM_CONFIG.paypal;
    var box = $("paypalButtons"), divider = $("payDivider");
    if (!box) return;
    box.innerHTML = "";
    if (!pp || !pp.clientId) { if (divider) divider.style.display = "none"; return; }
    if (divider) divider.style.display = "";
    var user = getUser();
    loadPayPalOrderSDK().then(function () {
      window.paypalOrder.Buttons({
        style: { layout: "vertical", color: "gold", shape: "pill", label: "pay" },
        createOrder: function () {
          return fetch("/api/paypal-create-order", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user ? user.id : null, credits: currentCreditQty() })
          }).then(function (r) { return r.json(); }).then(function (d) {
            if (d.id) return d.id;
            box.innerHTML = "<small style='color:#ff6b6b'>PayPal: " + (d.error || "couldn't create order") + "</small>";
            throw new Error(d.error || "order failed");
          });
        },
        onApprove: function (data) {
          box.innerHTML = "<small style='color:var(--muted)'>Confirming your payment…</small>";
          return fetch("/api/paypal-capture-order", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderID: data.orderID, userId: user ? user.id : null })
          }).then(function (r) { return r.json(); }).then(function (d) {
            if (d && d.ok) {
              if (payModal) closeModal(payModal);
              (B.refresh ? B.refresh() : Promise.resolve()).then(function () { renderUsage(); });
              showToast("✓ " + (d.added || "") + " credits added — thank you!");
            } else {
              box.innerHTML = "<small style='color:#ff6b6b'>" + ((d && d.error) || "Couldn't add credits") + "</small>";
            }
          });
        },
        onError: function (err) {
          box.innerHTML = "<small style='color:#ff6b6b'>PayPal error: " + (err && err.message ? err.message : "see console") + " — or use the card option.</small>";
        }
      }).render("#paypalButtons").catch(function () {
        box.innerHTML = "<small style='color:var(--muted)'>PayPal couldn't load. Please use the card option.</small>";
      });
    }).catch(function () { if (divider) divider.style.display = "none"; });
  }

  function friendlyAuthError(msg) {
    msg = msg || "";
    if (/email not confirmed/i.test(msg)) return "Please verify your email first — check your inbox for the link, then log in.";
    if (/invalid login credentials/i.test(msg)) return "Wrong email or password. New here? Switch to “Sign up”.";
    if (/already registered|already been registered/i.test(msg)) return "That email is already registered — switch to “Log in”.";
    return msg;
  }

  authForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var email = authEmail.value.trim(), pass = authPass.value;
    authMsg.style.color = ""; authMsg.textContent = "Please wait…";
    if (authMode === "signup") {
      B.signUp(email, pass).then(function (res) {
        if (res && res.needsVerification) {
          setAuthMode("login");
          authEmail.value = email; authPass.value = "";
          authMsg.style.color = "var(--accent-2)";
          authMsg.textContent = "✓ Verification email sent to " + email + ". Click the link, then log in.";
        } else {
          closeModal(authModal); renderAccount(); renderUsage(); showToast("Welcome, " + email);
          if (pendingPlan) { var p = pendingPlan; pendingPlan = null; choosePlan(p.plan, p.price); }
        }
      }).catch(function (err) {
        authMsg.style.color = "#ff6b6b"; authMsg.textContent = friendlyAuthError(err.message);
      });
    } else {
      B.signIn(email, pass).then(function (u) {
        closeModal(authModal); renderAccount(); renderUsage(); showToast("Welcome back, " + u.email);
        if (pendingPlan) { var p = pendingPlan; pendingPlan = null; choosePlan(p.plan, p.price); }
      }).catch(function (err) {
        authMsg.style.color = "#ff6b6b"; authMsg.textContent = friendlyAuthError(err.message);
      });
    }
  });

  // Demo card modal → flip plan locally.
  planForm.addEventListener("submit", function (e) {
    e.preventDefault();
    B.purchase(planModalPlan || "Pro").then(function () {
      closeModal(planModal); renderAccount(); renderUsage();
      showToast("🎉 You're on " + (getUser().plan) + " plan!");
    });
  });

  document.querySelectorAll("[data-plan]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var plan = btn.getAttribute("data-plan");
      if (plan === "free") { $("convert").scrollIntoView({ behavior: "smooth" }); return; }
      choosePlan(plan, parseInt(btn.getAttribute("data-price") || "9", 10));
    });
  });
  function planPrice(plan) { return (window.FM_CONFIG.plans && window.FM_CONFIG.plans[plan]) || (plan === "Team" ? 29 : 9); }
  upgradeLink.addEventListener("click", function () { var t = nextTier(); choosePlan(t, planPrice(t)); });

  /* ---------- category tabs ---------- */
  function applyCategory(cat) {
    currentCat = cat;
    var c = CATS[cat];
    catTabs.querySelectorAll(".cat-tab").forEach(function (t) { t.classList.toggle("active", t.getAttribute("data-cat") === cat); });
    fileInput.setAttribute("accept", c.accept);
    dropHint.textContent = c.hint;
    formatSelect.innerHTML = "";
    c.formats.forEach(function (f) { var o = document.createElement("option"); o.value = f[0]; o.textContent = f[1]; formatSelect.appendChild(o); });
    catNote.hidden = !c.note; catNote.textContent = c.note ? "ℹ️ " + c.note : "";
    qualityWrap.style.display = c.engine === "image" ? "" : "none";
    currentFile = null; currentImage = null; convertBtn.disabled = true;
    previewWrap.hidden = true; resultBox.textContent = "Convert to see the output here.";
  }
  catTabs.addEventListener("click", function (e) { var t = e.target.closest(".cat-tab"); if (t) applyCategory(t.getAttribute("data-cat")); });

  /* ---------- file handling ---------- */
  var currentFile = null, currentImage = null, currentName = "file";
  function loadFile(file) {
    if (!file) return;
    currentFile = file; currentName = (file.name || "file").replace(/\.[^.]+$/, "");
    convertBtn.disabled = false; previewWrap.hidden = false; resultBox.textContent = "Ready — hit Convert.";
    var nm = (file.name || "").toLowerCase();
    var previewable = /^image\/(png|jpeg|jpg|webp|gif|bmp|svg\+xml)$/.test(file.type) || /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(nm);
    if (previewable) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () { currentImage = img; previewImg.style.display = ""; previewImg.src = e.target.result; origMeta.textContent = img.width + " × " + img.height + " · " + humanSize(file.size); };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      currentImage = null; previewImg.style.display = "none";
      origMeta.innerHTML = "📎 <strong>" + (file.name || "file") + "</strong> · " + humanSize(file.size);
    }
  }
  browseBtn.addEventListener("click", function () { fileInput.click(); });
  dropZone.addEventListener("click", function (e) { if (e.target !== browseBtn) fileInput.click(); });
  fileInput.addEventListener("change", function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
  ["dragenter", "dragover"].forEach(function (ev) { dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.add("dragover"); }); });
  ["dragleave", "drop"].forEach(function (ev) { dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.remove("dragover"); }); });
  dropZone.addEventListener("drop", function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
  qualityRange.addEventListener("input", function () { qualityVal.textContent = qualityRange.value + "%"; });

  /* ---------- gating + convert ---------- */
  function creditsLeft() { return B.credits ? (B.credits() || 0) : 0; }

  convertBtn.addEventListener("click", function () {
    if (!currentFile) return;
    var engine = CATS[currentCat].engine;
    if (engine === "soon") { comingSoon(); return; } // don't spend anything on unsupported types

    // 1) Unlimited plan → just convert.
    if (unlimited()) { doConvert(); return; }
    // 2) Monthly quota (free or Pro) left → convert, count it locally.
    if (quotaLeft() > 0) { doConvert(); bumpUsed(); renderUsage(); return; }
    // 3) Pay-as-you-go credits → convert, and only spend a credit if it succeeds.
    if (creditsLeft() > 0) {
      doConvert(function () {
        B.spendCredit().then(function (bal) {
          renderUsage(); renderAccount();
          if (bal === 0) showToast("That was your last credit.");
        });
      });
      return;
    }
    // 4) Nothing left → offer credits or a plan.
    outOfConversions();
  });

  function outOfConversions() {
    var plan = currentPlan();
    if (plan === "Pro") {
      showToast("Monthly Pro limit reached — go unlimited with Team, or buy credits.");
    } else {
      showToast("You're out of conversions — buy credits or pick a plan.");
    }
    document.getElementById("plans").scrollIntoView({ behavior: "smooth" });
  }
  function doConvert(onSuccess) {
    var engine = CATS[currentCat].engine;
    if (engine === "image") convertImage(onSuccess);
    else if (engine === "sheet") convertSheet(onSuccess);
    else if (engine === "ffmpeg") ffmpegConvert(onSuccess);
    else if (engine === "document") convertDocument(onSuccess);
    else if (engine === "email") serverConvertFile(onSuccess);
    else comingSoon();
  }
  /* ---------- lazy script loader (for HEIC/TIFF/spreadsheet libraries) ---------- */
  var _libs = {};
  function loadLib(url, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (_libs[url]) return _libs[url];
    _libs[url] = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = url;
      s.onload = function () { res(window[globalName]); };
      s.onerror = function () { rej(new Error("Couldn't load a required library.")); };
      document.head.appendChild(s);
    });
    return _libs[url];
  }
  function comingSoon() {
    resultBox.innerHTML = "";
    var icon = document.createElement("div"); icon.style.fontSize = "2.2rem"; icon.textContent = "🛠️";
    var msg = document.createElement("p"); msg.style.color = "var(--text)"; msg.style.margin = "6px 0";
    msg.textContent = "This format is coming soon.";
    var sub = document.createElement("small"); sub.textContent = "Image, PDF, audio and video convert right here in your browser today.";
    resultBox.appendChild(icon); resultBox.appendChild(msg); resultBox.appendChild(sub);
  }

  /* ---------- document conversions ---------- */
  function convertDocument(onSuccess) {
    var fmt = formatSelect.value;
    var nm = (currentFile.name || "").toLowerCase();
    var isDocx = /\.docx?$/.test(nm);
    var isPdf = /\.pdf$/.test(nm);
    if (isDocx && (fmt === "html" || fmt === "txt")) return docxToText(fmt, onSuccess);
    if (isPdf && (fmt === "png" || fmt === "jpg")) return pdfToImages(fmt, onSuccess);
    return serverConvertFile(onSuccess); // DOCX↔PDF, EPUB→PDF, etc.
  }

  function docxToText(fmt, onSuccess) {
    resultBox.innerHTML = "<small style='color:var(--muted)'>Converting…</small>";
    loadLib("https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js", "mammoth")
      .then(function () { return currentFile.arrayBuffer(); })
      .then(function (buf) {
        var M = window.mammoth;
        return fmt === "txt" ? M.extractRawText({ arrayBuffer: buf }) : M.convertToHtml({ arrayBuffer: buf });
      })
      .then(function (r) {
        var content = fmt === "txt" ? r.value
          : "<!doctype html><meta charset='utf-8'><body>" + r.value + "</body>";
        var blob = new Blob([content], { type: fmt === "txt" ? "text/plain" : "text/html" });
        renderResult(blob, fmt, onSuccess);
      })
      .catch(function (e) { resultBox.textContent = "Conversion failed: " + (e && e.message ? e.message : e); });
  }

  function pdfToImages(fmt, onSuccess) {
    resultBox.innerHTML = "<small style='color:var(--muted)'>Rendering pages…</small>";
    var mime = fmt === "jpg" ? "image/jpeg" : "image/png";
    loadLib("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js", "pdfjsLib")
      .then(function () {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        return currentFile.arrayBuffer();
      })
      .then(function (buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; })
      .then(function (pdf) {
        var pages = pdf.numPages;
        var renderPage = function (n) {
          return pdf.getPage(n).then(function (page) {
            var vp = page.getViewport({ scale: 2 });
            var c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
            if (mime === "image/jpeg") { var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); }
            return page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise
              .then(function () { return new Promise(function (res) { c.toBlob(res, mime, 0.92); }); });
          });
        };
        if (pages === 1) {
          return renderPage(1).then(function (blob) { renderResult(blob, fmt, onSuccess); });
        }
        // Multiple pages → zip them
        return loadLib("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js", "JSZip").then(function () {
          var zip = new window.JSZip(); var chain = Promise.resolve();
          for (var i = 1; i <= pages; i++) {
            (function (n) { chain = chain.then(function () { return renderPage(n); }).then(function (b) { zip.file("page-" + n + "." + fmt, b); }); })(i);
          }
          return chain.then(function () { return zip.generateAsync({ type: "blob" }); })
            .then(function (zb) { renderResult(zb, "zip", onSuccess); });
        });
      })
      .catch(function (e) { resultBox.textContent = "Conversion failed: " + (e && e.message ? e.message : e); });
  }

  /* ---------- server conversion (heavy office/email formats) ---------- */
  function serverConvertFile(onSuccess) {
    var cfg = window.FM_CONFIG;
    var fmt = formatSelect.value;
    if (!cfg.convertServer) {
      resultBox.innerHTML = "";
      var icon = document.createElement("div"); icon.style.fontSize = "2.2rem"; icon.textContent = "🛠️";
      var msg = document.createElement("p"); msg.style.color = "var(--text)"; msg.style.margin = "6px 0";
      msg.textContent = "This conversion needs FileMorph's server, which isn't switched on yet.";
      var sub = document.createElement("small"); sub.textContent = "Image, spreadsheet, audio, video, DOCX→HTML/TXT and PDF→image all work in your browser today.";
      resultBox.appendChild(icon); resultBox.appendChild(msg); resultBox.appendChild(sub);
      return;
    }
    resultBox.innerHTML = "<small style='color:var(--muted)'>Converting on the server…</small>";
    var fd = new FormData();
    fd.append("file", currentFile, currentFile.name || "file");
    fd.append("format", fmt);
    var headers = {};
    if (cfg.convertToken) headers["x-convert-token"] = cfg.convertToken;
    fetch(cfg.convertServer.replace(/\/$/, "") + "/convert", { method: "POST", headers: headers, body: fd })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || ("server error " + r.status)); });
        return r.blob();
      })
      .then(function (blob) { renderResult(blob, fmt, onSuccess); })
      .catch(function (e) { resultBox.textContent = "Conversion failed: " + (e && e.message ? e.message : e); });
  }

  /* ---------- in-browser audio/video converter (ffmpeg.wasm — our own, no upload) ---------- */
  var _ff = null, _ffLoading = null;
  function loadFFmpeg() {
    if (_ff) return Promise.resolve(_ff);
    if (_ffLoading) return _ffLoading;
    _ffLoading = (async function () {
      var mod = await import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js");
      var util = await import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js");
      var ff = new mod.FFmpeg();
      var base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
      await ff.load({
        coreURL: await util.toBlobURL(base + "/ffmpeg-core.js", "text/javascript"),
        wasmURL: await util.toBlobURL(base + "/ffmpeg-core.wasm", "application/wasm")
      });
      _ff = { ff: ff, util: util };
      return _ff;
    })();
    return _ffLoading;
  }
  function ffmpegConvert(onSuccess) {
    var fmt = formatSelect.value;
    var inName = "in_" + (currentFile.name || "file").replace(/[^\w.\-]/g, "_");
    var outName = "out." + fmt;
    resultBox.innerHTML = "";
    var status = document.createElement("p");
    status.style.color = "var(--text)"; status.style.margin = "0";
    status.innerHTML = "⏳ Loading converter…<br><small style='color:var(--muted)'>First run downloads the engine (~30 MB), then it's instant.</small>";
    resultBox.appendChild(status);

    loadFFmpeg().then(function (x) {
      var ff = x.ff, util = x.util;
      try { ff.on("progress", function (p) { status.innerHTML = "⏳ Converting… " + Math.max(1, Math.min(99, Math.round((p.progress || 0) * 100))) + "%"; }); } catch (e) {}
      return util.fetchFile(currentFile)
        .then(function (buf) { return ff.writeFile(inName, buf); })
        .then(function () { return ff.exec(["-i", inName, outName]); })
        .then(function () { return ff.readFile(outName); })
        .then(function (data) {
          var blob = new Blob([data.buffer]);
          var url = URL.createObjectURL(blob);
          resultBox.innerHTML = "";
          var icon = document.createElement("div"); icon.style.fontSize = "2.4rem"; icon.textContent = "✅";
          var meta = document.createElement("small"); meta.textContent = fmt.toUpperCase() + " · " + humanSize(blob.size);
          var dl = document.createElement("a");
          dl.href = url; dl.download = currentName + "." + fmt; dl.className = "btn btn-primary btn-sm"; dl.textContent = "Download ." + fmt;
          resultBox.appendChild(icon); resultBox.appendChild(meta); resultBox.appendChild(dl);
          if (typeof onSuccess === "function") onSuccess();
        });
    }).catch(function (e) {
      resultBox.textContent = "Conversion failed: " + (e && e.message ? e.message : e) + ". Try a smaller file or a different format.";
    });
  }

  /* ---------- image converter (HEIC/TIFF/SVG/PNG/JPG/WebP → PNG/JPG/WebP/PDF/ICO) ---------- */
  function extFor(mime) { return { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf", "ico": "ico" }[mime] || "img"; }

  // Decode any supported source file into a <canvas>.
  function getSourceCanvas(file) {
    var name = (file.name || "").toLowerCase();
    var type = (file.type || "").toLowerCase();
    if (type.indexOf("heic") !== -1 || type.indexOf("heif") !== -1 || /\.(heic|heif)$/.test(name)) {
      return loadLib("https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js", "heic2any")
        .then(function () {
          if (!window.heic2any) throw new Error("HEIC decoder didn't load — check your connection and retry.");
          var conv = window.heic2any({ blob: file, toType: "image/png" });
          var timeout = new Promise(function (_, rej) { setTimeout(function () { rej(new Error("HEIC took too long — try a smaller photo, or convert it on your phone first.")); }, 90000); });
          return Promise.race([conv, timeout]);
        })
        .then(function (out) {
          var blob = Array.isArray(out) ? out[0] : out; // multi-image HEIC → first frame
          return blobToCanvas(blob);
        })
        .catch(function (e) { throw new Error("Couldn't read this HEIC file (" + (e && e.message ? e.message : "decode error") + ")."); });
    }
    if (type.indexOf("tiff") !== -1 || /\.(tif|tiff)$/.test(name)) {
      return loadLib("https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js", "UTIF")
        .then(function () { return file.arrayBuffer(); })
        .then(function (buf) {
          var U = window.UTIF, ifds = U.decode(buf);
          U.decodeImage(buf, ifds[0]);
          var rgba = U.toRGBA8(ifds[0]);
          var c = document.createElement("canvas"); c.width = ifds[0].width; c.height = ifds[0].height;
          var ctx = c.getContext("2d"); var id = ctx.createImageData(c.width, c.height);
          id.data.set(rgba); ctx.putImageData(id, 0, 0); return c;
        });
    }
    return blobToCanvas(file); // png/jpg/webp/gif/bmp/svg
  }
  function blobToCanvas(blob) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob); var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width || 512, h = img.naturalHeight || img.height || 512;
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); res(c);
      };
      img.onerror = function () { rej(new Error("Couldn't read that image format.")); };
      img.src = url;
    });
  }
  function buildIco(pngBytes, w, h) {
    var head = new Uint8Array(22); var dv = new DataView(head.buffer);
    dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, 1, true);
    head[6] = w >= 256 ? 0 : w; head[7] = h >= 256 ? 0 : h;
    dv.setUint16(10, 1, true); dv.setUint16(12, 32, true);
    dv.setUint32(14, pngBytes.length, true); dv.setUint32(18, 22, true);
    var out = new Uint8Array(22 + pngBytes.length); out.set(head, 0); out.set(pngBytes, 22);
    return new Blob([out], { type: "image/x-icon" });
  }
  function convertImage(onSuccess) {
    var mime = formatSelect.value, quality = parseInt(qualityRange.value, 10) / 100;
    var nm = (currentFile.name || "").toLowerCase();
    var isHeic = /\.(heic|heif)$/.test(nm) || (currentFile.type || "").indexOf("heic") !== -1;
    resultBox.innerHTML = "<small style='color:var(--muted)'>" + (isHeic ? "Decoding HEIC… (large photos can take 10–30s)" : "Converting…") + "</small>";
    getSourceCanvas(currentFile).then(function (src) {
      // ICO: cap to 256, output PNG-in-ICO
      if (mime === "ico") {
        var size = Math.min(256, Math.max(src.width, src.height));
        var ic = document.createElement("canvas"); ic.width = size; ic.height = size;
        ic.getContext("2d").drawImage(src, 0, 0, size, size);
        ic.toBlob(function (png) {
          png.arrayBuffer().then(function (buf) { renderResult(buildIco(new Uint8Array(buf), size, size), "ico", onSuccess); });
        }, "image/png");
        return;
      }
      var c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
      var ctx = c.getContext("2d");
      if (mime === "image/jpeg" || mime === "application/pdf") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(src, 0, 0);
      if (mime === "application/pdf") {
        c.toBlob(function (jpg) {
          if (!jpg) { resultBox.textContent = "Couldn't render the PDF."; return; }
          jpg.arrayBuffer().then(function (buf) { renderResult(buildImagePdf(new Uint8Array(buf), c.width, c.height), "pdf", onSuccess); });
        }, "image/jpeg", quality);
        return;
      }
      c.toBlob(function (blob) {
        if (!blob) { resultBox.textContent = "Your browser couldn't encode that format. Try PNG or JPG."; return; }
        renderResult(blob, extFor(mime), onSuccess);
      }, mime, quality);
    }).catch(function (e) { resultBox.textContent = "Conversion failed: " + (e && e.message ? e.message : e); });
  }

  /* ---------- spreadsheet converter (XLSX/XLS/ODS/CSV ⇄ CSV/XLSX, in-browser) ---------- */
  function convertSheet(onSuccess) {
    var fmt = formatSelect.value;
    resultBox.innerHTML = "<small style='color:var(--muted)'>Converting spreadsheet…</small>";
    loadLib("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", "XLSX").then(function () {
      return currentFile.arrayBuffer();
    }).then(function (buf) {
      var XLSX = window.XLSX;
      var wb = XLSX.read(buf, { type: "array" });
      var blob;
      if (fmt === "csv") {
        var ws = wb.Sheets[wb.SheetNames[0]];
        var csv = XLSX.utils.sheet_to_csv(ws);
        blob = new Blob([csv], { type: "text/csv" });
      } else {
        var out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      }
      renderResult(blob, fmt, onSuccess);
    }).catch(function (e) { resultBox.textContent = "Conversion failed: " + (e && e.message ? e.message : e); });
  }
  function renderResult(blob, ext, onSuccess) {
    var url = URL.createObjectURL(blob);
    resultBox.innerHTML = "";
    var isImg = ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp";
    if (isImg) { var out = new Image(); out.src = url; resultBox.appendChild(out); }
    else {
      var glyph = { pdf: "📄", ico: "🟦", csv: "📑", xlsx: "📊", html: "🌐", txt: "📃", docx: "📝", zip: "🗜️" }[ext] || "📁";
      var icon = document.createElement("div"); icon.style.fontSize = "2.6rem"; icon.textContent = glyph; resultBox.appendChild(icon);
    }
    var meta = document.createElement("small"); meta.textContent = ext.toUpperCase() + " · " + humanSize(blob.size);
    var dl = document.createElement("a"); dl.href = url; dl.download = currentName + "." + ext; dl.className = "btn btn-primary btn-sm"; dl.textContent = "Download ." + ext;
    resultBox.appendChild(meta); resultBox.appendChild(dl);
    if (typeof onSuccess === "function") onSuccess();
  }
  function buildImagePdf(jpeg, w, h) {
    var enc = new TextEncoder(); var parts = [], pos = 0, offsets = [];
    function push(b) { parts.push(b); pos += b.length; }
    function pushStr(s) { push(enc.encode(s)); }
    function mark(n) { offsets[n] = pos; }
    var content = "q " + w + " 0 0 " + h + " 0 0 cm /Im0 Do Q"; var cb = enc.encode(content);
    pushStr("%PDF-1.3\n");
    mark(1); pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    mark(2); pushStr("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    mark(3); pushStr("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + w + " " + h + "] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>\nendobj\n");
    mark(4); pushStr("4 0 obj\n<< /Type /XObject /Subtype /Image /Width " + w + " /Height " + h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n");
    push(jpeg); pushStr("\nendstream\nendobj\n");
    mark(5); pushStr("5 0 obj\n<< /Length " + cb.length + " >>\nstream\n"); push(cb); pushStr("\nendstream\nendobj\n");
    var xrefPos = pos; var xref = "xref\n0 6\n0000000000 65535 f \n";
    for (var i = 1; i <= 5; i++) xref += ("0000000000" + offsets[i]).slice(-10) + " 00000 n \n";
    pushStr(xref); pushStr("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF");
    var total = 0; parts.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total); var o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return new Blob([out], { type: "application/pdf" });
  }

  /* ---------- checkout return ---------- */
  function handleReturn() {
    if (location.search.indexOf("checkout=success") !== -1) {
      history.replaceState({}, "", location.pathname + location.hash);
      showToast("Finalizing your payment…");
      $("convert").scrollIntoView({ behavior: "smooth" });
      var startCredits = creditsLeft();
      var tries = 0;
      (function poll() {
        Promise.all([B.verify(), B.refresh ? B.refresh() : Promise.resolve()]).then(function () {
          renderAccount(); renderUsage();
          if (isPaid()) {
            var plan = currentPlan();
            showToast(unlimited()
              ? "🎉 You're on " + plan + " — unlimited conversions unlocked!"
              : "🎉 You're on " + plan + " — " + planLimit() + " conversions/month unlocked!");
          } else if (creditsLeft() > startCredits) {
            showToast("✓ Credits added — you now have " + creditsLeft() + " credits!");
          } else if (tries < 8) { tries++; setTimeout(poll, 2500); }
          else { showToast("Payment received — if it doesn't show in a minute, refresh the page."); }
        });
      })();
    } else if (location.search.indexOf("checkout=cancel") !== -1) {
      showToast("Checkout canceled — no charge made.");
      history.replaceState({}, "", location.pathname + location.hash);
    }
  }

  /* ---------- init ---------- */
  B.ready.then(function () {
    renderAccount(); renderUsage(); applyCategory("image"); handleReturn();
    // Self-heal: logged in but showing Free? Ask Lemon Squeezy directly.
    if (B.verify && getUser() && !isPaid()) {
      B.verify().then(function (active) { if (active) { renderAccount(); renderUsage(); showToast("Welcome back — your " + currentPlan() + " plan is active."); } });
    }
  });
})();
