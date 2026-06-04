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
    image: { accept: "image/*", engine: "image", hint: "PNG · JPG · WebP · PDF — converted locally, no upload",
      formats: [["image/png", "PNG"], ["image/jpeg", "JPG"], ["image/webp", "WebP"], ["application/pdf", "PDF"]], note: "" },
    audio: { accept: "audio/*", engine: "ffmpeg", hint: "MP3 · WAV · AAC · M4A · OGG — converted in your browser",
      formats: [["mp3", "MP3"], ["wav", "WAV"], ["aac", "AAC"], ["m4a", "M4A"], ["ogg", "OGG"]],
      note: "Converted privately in your browser — nothing is uploaded." },
    video: { accept: "video/*", engine: "ffmpeg", hint: "MP4 · WebM · MOV · GIF — converted in your browser",
      formats: [["mp4", "MP4"], ["webm", "WebM"], ["gif", "GIF"], ["mov", "MOV"]],
      note: "Converted privately in your browser. Large videos may take a while." },
    document: { accept: ".pdf,.docx,.doc,.txt,.odt,.epub,.rtf", engine: "soon", hint: "Document conversion is coming soon",
      formats: [["pdf", "PDF"], ["docx", "DOCX"], ["txt", "TXT"]],
      note: "Document conversion is coming soon. Image, PDF, audio & video work today." },
    email: { accept: ".eml,.msg,.mbox,.pst", engine: "soon", hint: "Email conversion is coming soon",
      formats: [["pdf", "PDF"], ["html", "HTML"]],
      note: "Email conversion is coming soon. Image, PDF, audio & video work today." }
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
      var chip = document.createElement("span");
      chip.className = "account-chip";
      chip.innerHTML = "<strong>" + (u.plan && u.plan !== "free" ? u.plan : "Free") + "</strong> · " + u.email;
      var out = document.createElement("button");
      out.className = "btn btn-ghost btn-sm"; out.textContent = "Log out";
      out.addEventListener("click", function () { B.logout().then(function () { renderAccount(); renderUsage(); showToast("Logged out"); }); });
      navAccount.appendChild(chip); navAccount.appendChild(out);
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

  /* ---------- usage meter ---------- */
  function renderUsage() {
    var plan = currentPlan();
    var bar = $("usageBar");
    if (bar) bar.classList.toggle("paid", plan !== "free");
    if (unlimited()) {
      usageText.innerHTML = "✨ <strong>Unlimited</strong> conversions · <span class='plan-badge'>" + plan + "</span>";
      upgradeLink.hidden = true;
      renderPlans();
      return;
    }
    var left = quotaLeft();
    var limit = planLimit();
    if (plan === "free") {
      usageText.innerHTML = "Free · <strong>" + left + " / " + limit + "</strong> conversions left this month";
      upgradeLink.textContent = "Upgrade for more →";
      upgradeLink.hidden = left > 2;
    } else {
      usageText.innerHTML = "⭐ <span class='plan-badge'>" + plan + "</span> · <strong>" + left + "</strong> of " + limit + " conversions left this month";
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
      if (p === plan) {
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

  /* ---------- payment-method modal (card via Lemon Squeezy + direct PayPal) ---------- */
  var currentPayPlan = null;
  function openPay(plan, price) {
    currentPayPlan = { plan: plan, price: price };
    $("payTitle").textContent = "Subscribe to " + plan;
    $("paySub").textContent = "$" + price + "/month · cancel anytime";
    openModal(payModal);
    renderPayPal(plan);
  }
  var payCardBtn = $("payCardBtn");
  if (payCardBtn) payCardBtn.addEventListener("click", function () {
    if (payModal) closeModal(payModal);
    if (currentPayPlan) startCardCheckout(currentPayPlan.plan);
  });

  var _ppLoading = null;
  function loadPayPalSDK() {
    var pp = window.FM_CONFIG.paypal;
    if (window.paypal) return Promise.resolve();
    if (_ppLoading) return _ppLoading;
    _ppLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(pp.clientId) + "&vault=true&intent=subscription&components=buttons";
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
      window.paypal.Buttons({
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
    if (file.type.indexOf("image/") === 0) {
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
  convertBtn.addEventListener("click", function () {
    if (!currentFile) return;
    var engine = CATS[currentCat].engine;
    if (engine === "soon") { comingSoon(); return; } // don't spend a credit on unsupported types
    if (!unlimited() && quotaLeft() <= 0) {
      var plan = currentPlan();
      if (plan === "free") {
        showToast("You've used your 5 free conversions — pick a plan to keep going.");
        choosePlan("Pro", planPrice("Pro"));
      } else {
        showToast("You've reached your monthly " + plan + " limit. Upgrade to Team for unlimited.");
        choosePlan("Team", planPrice("Team"));
      }
      return;
    }
    doConvert();
    if (!unlimited()) { bumpUsed(); renderUsage(); }
  });
  function doConvert() {
    var engine = CATS[currentCat].engine;
    if (engine === "image" && currentImage) convertImage();
    else if (engine === "ffmpeg") ffmpegConvert();
    else comingSoon();
  }
  function comingSoon() {
    resultBox.innerHTML = "";
    var icon = document.createElement("div"); icon.style.fontSize = "2.2rem"; icon.textContent = "🛠️";
    var msg = document.createElement("p"); msg.style.color = "var(--text)"; msg.style.margin = "6px 0";
    msg.textContent = "This format is coming soon.";
    var sub = document.createElement("small"); sub.textContent = "Image, PDF, audio and video convert right here in your browser today.";
    resultBox.appendChild(icon); resultBox.appendChild(msg); resultBox.appendChild(sub);
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
  function ffmpegConvert() {
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
        });
    }).catch(function (e) {
      resultBox.textContent = "Conversion failed: " + (e && e.message ? e.message : e) + ". Try a smaller file or a different format.";
    });
  }

  /* ---------- real image converter ---------- */
  function extFor(mime) { return { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" }[mime] || "img"; }
  function convertImage() {
    var mime = formatSelect.value, quality = parseInt(qualityRange.value, 10) / 100;
    var canvas = document.createElement("canvas");
    canvas.width = currentImage.width; canvas.height = currentImage.height;
    var ctx = canvas.getContext("2d");
    if (mime === "image/jpeg" || mime === "application/pdf") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(currentImage, 0, 0);
    if (mime === "application/pdf") {
      canvas.toBlob(function (jpg) {
        if (!jpg) { resultBox.textContent = "Couldn't render the PDF in this browser."; return; }
        jpg.arrayBuffer().then(function (buf) { renderResult(buildImagePdf(new Uint8Array(buf), currentImage.width, currentImage.height), "pdf"); });
      }, "image/jpeg", quality);
      return;
    }
    canvas.toBlob(function (blob) {
      if (!blob) { resultBox.textContent = "Your browser couldn't encode that format. Try PNG or JPG."; return; }
      renderResult(blob, extFor(mime));
    }, mime, quality);
  }
  function renderResult(blob, ext) {
    var url = URL.createObjectURL(blob);
    resultBox.innerHTML = "";
    if (ext === "pdf") { var icon = document.createElement("div"); icon.style.fontSize = "2.6rem"; icon.textContent = "📄"; resultBox.appendChild(icon); }
    else { var out = new Image(); out.src = url; resultBox.appendChild(out); }
    var meta = document.createElement("small"); meta.textContent = ext.toUpperCase() + " · " + humanSize(blob.size);
    var dl = document.createElement("a"); dl.href = url; dl.download = currentName + "." + ext; dl.className = "btn btn-primary btn-sm"; dl.textContent = "Download ." + ext;
    resultBox.appendChild(meta); resultBox.appendChild(dl);
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
      showToast("Finalizing your subscription…");
      $("convert").scrollIntoView({ behavior: "smooth" });
      var tries = 0;
      (function poll() {
        B.verify().then(function () {
          renderAccount(); renderUsage();
          if (isPaid()) {
            var plan = currentPlan();
            showToast(unlimited()
              ? "🎉 You're on " + plan + " — unlimited conversions unlocked!"
              : "🎉 You're on " + plan + " — " + planLimit() + " conversions/month unlocked!");
          } else if (tries < 8) { tries++; setTimeout(poll, 2500); }
          else { showToast("Payment received — if your plan doesn't show in a minute, refresh the page."); }
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
