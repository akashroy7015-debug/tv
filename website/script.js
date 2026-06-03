// ===== FileMorph — web converter with free quota, login & plans =====
(function () {
  "use strict";

  var FREE_LIMIT = 5;
  var LS_USER = "fm_user";
  var LS_USED = "fm_free_used";

  /* ---------- tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function getUser() { try { return JSON.parse(lsGet(LS_USER)); } catch (e) { return null; } }
  function setUser(u) { lsSet(LS_USER, JSON.stringify(u)); }
  function isPaid() { var u = getUser(); return !!(u && u.plan && u.plan !== "free"); }
  function used() { return parseInt(lsGet(LS_USED) || "0", 10); }
  function bumpUsed() { lsSet(LS_USED, String(used() + 1)); }
  function freeLeft() { return Math.max(0, FREE_LIMIT - used()); }
  function humanSize(b) {
    if (b < 1024) return b + " B";
    if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
    return (b / 1048576).toFixed(2) + " MB";
  }

  /* ---------- category config ---------- */
  var CATS = {
    image: {
      accept: "image/*", real: true,
      hint: "PNG · JPG · WebP · PDF — converted locally, no upload",
      formats: [["image/png", "PNG"], ["image/jpeg", "JPG"], ["image/webp", "WebP"], ["application/pdf", "PDF"]],
      note: ""
    },
    document: {
      accept: ".pdf,.docx,.doc,.txt,.odt,.epub,.rtf", real: false,
      hint: "PDF · DOCX · TXT · EPUB — processed on FileMorph's servers",
      formats: [["pdf", "PDF"], ["docx", "DOCX"], ["txt", "TXT"], ["epub", "EPUB"]],
      note: "Document conversions run on FileMorph's secure servers. Included with any plan."
    },
    video: {
      accept: "video/*", real: false,
      hint: "MP4 · WebM · MOV · MKV — processed on FileMorph's servers",
      formats: [["mp4", "MP4"], ["webm", "WebM"], ["gif", "GIF"], ["mov", "MOV"]],
      note: "Video conversions run on FileMorph's secure servers. Included with any plan."
    },
    audio: {
      accept: "audio/*", real: false,
      hint: "MP3 · WAV · AAC · FLAC — processed on FileMorph's servers",
      formats: [["mp3", "MP3"], ["wav", "WAV"], ["aac", "AAC"], ["flac", "FLAC"]],
      note: "Audio conversions run on FileMorph's secure servers. Included with any plan."
    },
    email: {
      accept: ".eml,.msg,.mbox,.pst", real: false,
      hint: "EML · MSG · MBOX → PDF / HTML — processed on FileMorph's servers",
      formats: [["pdf", "PDF"], ["html", "HTML"]],
      note: "Email conversions run on FileMorph's secure servers. Included with any plan."
    }
  };
  var currentCat = "image";

  /* ---------- element refs ---------- */
  var navToggle = $("navToggle"), navLinks = document.querySelector(".nav-links");
  var navAccount = $("navAccount"), loginBtn = $("loginBtn");
  var catTabs = $("catTabs"), usageText = $("usageText"), upgradeLink = $("upgradeLink"), catNote = $("catNote");
  var dropZone = $("dropZone"), fileInput = $("fileInput"), browseBtn = $("browseBtn"), dropHint = $("dropHint");
  var formatSelect = $("formatSelect"), qualityRange = $("qualityRange"), qualityVal = $("qualityVal"), qualityWrap = $("qualityWrap");
  var convertBtn = $("convertBtn"), previewWrap = $("previewWrap"), previewImg = $("previewImg"), origMeta = $("origMeta"), resultBox = $("resultBox");
  var authModal = $("authModal"), authForm = $("authForm"), authEmail = $("authEmail");
  var planModal = $("planModal"), planForm = $("planForm"), planSub = $("planSub");
  var toast = $("toast");

  /* ---------- mobile nav ---------- */
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () { navLinks.classList.toggle("open"); });
    navLinks.addEventListener("click", function (e) { if (e.target.tagName === "A") navLinks.classList.remove("open"); });
  }

  /* ---------- toast ---------- */
  var toastTimer;
  function showToast(msg) {
    toast.textContent = msg; toast.hidden = false; toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("show"); setTimeout(function () { toast.hidden = true; }, 300); }, 2800);
  }

  /* ---------- account UI ---------- */
  function renderAccount() {
    var u = getUser();
    if (u) {
      navAccount.innerHTML = "";
      var chip = document.createElement("span");
      chip.className = "account-chip";
      chip.innerHTML = '<strong>' + (u.plan && u.plan !== "free" ? u.plan : "Free") + '</strong> · ' + u.email;
      var out = document.createElement("button");
      out.className = "btn btn-ghost btn-sm"; out.textContent = "Log out";
      out.addEventListener("click", function () { try { localStorage.removeItem(LS_USER); } catch (e) {} renderAccount(); renderUsage(); showToast("Logged out"); });
      navAccount.appendChild(chip); navAccount.appendChild(out);
    } else {
      navAccount.innerHTML = '<button class="btn btn-ghost btn-sm" id="loginBtn">Log in</button><a href="#convert" class="btn btn-primary btn-sm">Start free</a>';
      $("loginBtn").addEventListener("click", function () { openAuth(); });
    }
  }

  /* ---------- usage meter ---------- */
  function renderUsage() {
    if (isPaid()) {
      usageText.innerHTML = "✨ <strong>Unlimited</strong> conversions on your " + getUser().plan + " plan";
      upgradeLink.hidden = true;
      return;
    }
    var left = freeLeft();
    usageText.innerHTML = "Free conversions left: <strong>" + left + " / " + FREE_LIMIT + "</strong>";
    upgradeLink.hidden = left > 2;
  }

  /* ---------- modals ---------- */
  function openModal(m) { m.hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal(m) { m.hidden = true; document.body.style.overflow = ""; }
  document.addEventListener("click", function (e) {
    if (e.target.hasAttribute && e.target.hasAttribute("data-close")) { closeModal(authModal); closeModal(planModal); }
    if (e.target.classList && e.target.classList.contains("modal-overlay")) { closeModal(e.target); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeModal(authModal); closeModal(planModal); } });

  function openAuth() { openModal(authModal); setTimeout(function () { authEmail.focus(); }, 50); }
  var pendingPlan = null;
  function openPlan(plan, price) {
    pendingPlan = plan;
    planSub.textContent = plan + " — $" + price + "/mo, unlimited conversions. Cancel anytime.";
    $("payBtn").textContent = "Subscribe to " + plan + " — $" + price + "/mo";
    openModal(planModal);
  }

  authForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var u = getUser() || {};
    u.email = authEmail.value.trim(); u.plan = u.plan || "free";
    setUser(u); closeModal(authModal); renderAccount(); renderUsage();
    showToast("Welcome, " + u.email);
    // If they were sent here by the paywall, continue to plan selection
    if (freeLeft() <= 0 && !isPaid()) { openPlan("Pro", 9); }
  });

  planForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var u = getUser();
    if (!u) { closeModal(planModal); openAuth(); return; }
    u.plan = pendingPlan || "Pro"; setUser(u);
    closeModal(planModal); renderAccount(); renderUsage();
    showToast("🎉 You're on " + u.plan + " — convert without limits!");
  });

  // Plan buttons in the pricing section
  document.querySelectorAll("[data-plan]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var plan = btn.getAttribute("data-plan");
      if (plan === "free") { document.getElementById("convert").scrollIntoView({ behavior: "smooth" }); return; }
      var price = btn.getAttribute("data-price") || "9";
      if (!getUser()) { openAuth(); pendingPlan = plan; return; }
      openPlan(plan, price);
    });
  });
  upgradeLink.addEventListener("click", function () { if (!getUser()) { openAuth(); } else { openPlan("Pro", 9); } });

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
    qualityWrap.style.display = c.real ? "" : "none";
    // reset selection
    currentFile = null; currentImage = null; convertBtn.disabled = true;
    previewWrap.hidden = true; resultBox.textContent = "Convert to see the output here.";
  }
  catTabs.addEventListener("click", function (e) {
    var t = e.target.closest(".cat-tab"); if (!t) return;
    applyCategory(t.getAttribute("data-cat"));
  });

  /* ---------- file handling ---------- */
  var currentFile = null, currentImage = null, currentName = "file";
  function loadFile(file) {
    if (!file) return;
    currentFile = file;
    currentName = (file.name || "file").replace(/\.[^.]+$/, "");
    convertBtn.disabled = false;
    previewWrap.hidden = false;
    resultBox.textContent = "Ready — hit Convert.";
    if (file.type.indexOf("image/") === 0) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          currentImage = img; previewImg.style.display = ""; previewImg.src = e.target.result;
          origMeta.textContent = img.width + " × " + img.height + " · " + humanSize(file.size);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      currentImage = null; previewImg.style.display = "none";
      origMeta.innerHTML = "📎 <strong>" + (file.name || "file") + "</strong> · " + humanSize(file.size);
    }
  }

  browseBtn.addEventListener("click", function () { fileInput.click(); });
  dropZone.addEventListener("click", function (e) { if (e.target === browseBtn) return; fileInput.click(); });
  fileInput.addEventListener("change", function () { if (fileInput.files[0]) loadFile(fileInput.files[0]); });
  ["dragenter", "dragover"].forEach(function (ev) { dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.add("dragover"); }); });
  ["dragleave", "drop"].forEach(function (ev) { dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.remove("dragover"); }); });
  dropZone.addEventListener("drop", function (e) { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
  qualityRange.addEventListener("input", function () { qualityVal.textContent = qualityRange.value + "%"; });

  /* ---------- gating + convert ---------- */
  convertBtn.addEventListener("click", function () {
    if (!currentFile) return;
    if (!isPaid()) {
      if (freeLeft() <= 0) {
        showToast("You've used your free conversions — pick a plan to continue.");
        if (!getUser()) { openAuth(); } else { openPlan("Pro", 9); }
        return;
      }
    }
    doConvert();
    if (!isPaid()) { bumpUsed(); renderUsage(); }
  });

  function doConvert() {
    if (CATS[currentCat].real && currentImage) { convertImage(); }
    else { showServerResult(); }
  }

  function showServerResult() {
    var ext = formatSelect.value;
    resultBox.innerHTML = "";
    var icon = document.createElement("div"); icon.style.fontSize = "2.4rem"; icon.textContent = "🗂️";
    var msg = document.createElement("p");
    msg.style.margin = "6px 0"; msg.style.color = "var(--text)";
    msg.innerHTML = "Queued: <strong>" + (currentFile.name || "file") + " → ." + ext + "</strong>";
    var sub = document.createElement("small");
    sub.textContent = "This format is processed on FileMorph's servers. Connect the conversion backend to enable live download.";
    resultBox.appendChild(icon); resultBox.appendChild(msg); resultBox.appendChild(sub);
  }

  /* ---------- real image converter (Canvas) ---------- */
  function extFor(mime) { return { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" }[mime] || "img"; }

  function convertImage() {
    var mime = formatSelect.value;
    var quality = parseInt(qualityRange.value, 10) / 100;
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

  // Build a valid single-page PDF embedding a JPEG — pure JS, fully offline.
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
    for (var i = 1; i <= 5; i++) { xref += ("0000000000" + offsets[i]).slice(-10) + " 00000 n \n"; }
    pushStr(xref); pushStr("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF");
    var total = 0; parts.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total); var o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return new Blob([out], { type: "application/pdf" });
  }

  /* ---------- init ---------- */
  renderAccount();
  renderUsage();
  applyCategory("image");
})();
