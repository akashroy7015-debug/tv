/* FileMorph — "Add to Home Screen" banner.
   Self-contained: injects its own styles + DOM. Uses the native install prompt
   where available (Android/Chrome/Edge), falls back to iOS Safari instructions.
   Hides if already installed, or if dismissed within the last 7 days. */
(function () {
  "use strict";
  var KEY = "fm_a2hs_dismissed";
  var SNOOZE = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Already running as an installed app? Then there's nothing to offer.
  var standalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  if (standalone) return;

  // Recently dismissed? Stay quiet.
  try {
    var last = parseInt(localStorage.getItem(KEY) || "0", 10);
    if (last && Date.now() - last < SNOOZE) return;
  } catch (e) {}

  var ua = navigator.userAgent || "";
  var isIOS = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
  var isSafari = /safari/i.test(ua) && !/crios|fxios|android|chrome/i.test(ua);

  var deferredPrompt = null;
  var bar = null;

  function injectStyles() {
    if (document.getElementById("fm-a2hs-css")) return;
    var s = document.createElement("style");
    s.id = "fm-a2hs-css";
    s.textContent =
      ".fm-a2hs{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;margin:0 auto;max-width:520px;" +
      "display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;" +
      "background:var(--card,#15172a);border:1px solid var(--border,#2a2e44);" +
      "box-shadow:0 10px 30px rgba(0,0,0,.45);color:var(--text,#f1f1f8);" +
      "font-family:inherit;transform:translateY(140%);opacity:0;transition:transform .32s ease,opacity .32s ease}" +
      ".fm-a2hs.show{transform:translateY(0);opacity:1}" +
      ".fm-a2hs img{width:38px;height:38px;border-radius:9px;flex:none}" +
      ".fm-a2hs .fm-a2hs-txt{flex:1;min-width:0;line-height:1.25}" +
      ".fm-a2hs .fm-a2hs-t{font-weight:700;font-size:.95rem}" +
      ".fm-a2hs .fm-a2hs-s{font-size:.8rem;color:var(--muted,#9ba0bd);margin-top:2px}" +
      ".fm-a2hs .fm-a2hs-add{flex:none;border:none;cursor:pointer;font-weight:700;font-size:.9rem;" +
      "padding:9px 16px;border-radius:10px;color:#fff;" +
      "background:linear-gradient(110deg,#7c5cff 0%,#ff5ca8 55%,#ffb23e 100%)}" +
      ".fm-a2hs .fm-a2hs-x{flex:none;background:none;border:none;color:var(--muted,#9ba0bd);" +
      "font-size:1.3rem;line-height:1;cursor:pointer;padding:4px 6px}" +
      "@media(max-width:420px){.fm-a2hs .fm-a2hs-s{display:none}}";
    document.head.appendChild(s);
  }

  function snooze() {
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
  }
  function hide() {
    if (!bar) return;
    bar.classList.remove("show");
    var el = bar; bar = null;
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 320);
  }

  function build(iosMode) {
    if (bar) return;
    injectStyles();
    bar = document.createElement("div");
    bar.className = "fm-a2hs";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Add FileMorph to your home screen");

    var title = "Add FileMorph to your Home Screen";
    var sub = iosMode
      ? "Tap the Share icon, then “Add to Home Screen”."
      : "Install the app for one-tap, full-screen access — no app store.";

    bar.innerHTML =
      '<img src="/logo.svg" alt="" />' +
      '<div class="fm-a2hs-txt"><div class="fm-a2hs-t">' + title + "</div>" +
      '<div class="fm-a2hs-s">' + sub + "</div></div>" +
      (iosMode ? "" : '<button type="button" class="fm-a2hs-add">Add</button>') +
      '<button type="button" class="fm-a2hs-x" aria-label="Dismiss">&times;</button>';

    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add("show"); });

    bar.querySelector(".fm-a2hs-x").addEventListener("click", function () { snooze(); hide(); });
    var add = bar.querySelector(".fm-a2hs-add");
    if (add) {
      add.addEventListener("click", function () {
        if (!deferredPrompt) { hide(); return; }
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () { snooze(); hide(); deferredPrompt = null; });
      });
    }
  }

  // Android / Chrome / Edge: capture the native prompt and show our banner instead.
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    build(false);
  });

  // iOS Safari has no install event — offer manual instructions after the page settles.
  if (isIOS && isSafari) {
    window.addEventListener("load", function () { setTimeout(function () { build(true); }, 1800); });
  }

  // If they install it, stop nagging.
  window.addEventListener("appinstalled", function () { snooze(); hide(); });
})();
