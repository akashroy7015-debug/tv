// ===== FileMorph — interactive demo + nav =====
(function () {
  "use strict";

  /* ---- Mobile nav toggle ---- */
  var navToggle = document.getElementById("navToggle");
  var navLinks = document.querySelector(".nav-links");
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      navLinks.classList.toggle("open");
    });
    navLinks.addEventListener("click", function (e) {
      if (e.target.tagName === "A") navLinks.classList.remove("open");
    });
  }

  /* ---- Live image converter (runs 100% in-browser via Canvas) ---- */
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var browseBtn = document.getElementById("browseBtn");
  var formatSelect = document.getElementById("formatSelect");
  var qualityRange = document.getElementById("qualityRange");
  var qualityVal = document.getElementById("qualityVal");
  var qualityWrap = document.getElementById("qualityWrap");
  var convertBtn = document.getElementById("convertBtn");
  var previewWrap = document.getElementById("previewWrap");
  var previewImg = document.getElementById("previewImg");
  var origMeta = document.getElementById("origMeta");
  var resultBox = document.getElementById("resultBox");

  if (!dropZone) return; // demo not on page

  var currentImage = null;
  var currentName = "image";

  function humanSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function extFor(mime) {
    return {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "application/pdf": "pdf"
    }[mime] || "img";
  }

  // Build a valid single-page PDF embedding a JPEG — pure JS, fully offline.
  function buildImagePdf(jpeg, w, h) {
    var enc = new TextEncoder();
    var parts = [];
    var pos = 0;
    var offsets = [];
    function push(bytes) { parts.push(bytes); pos += bytes.length; }
    function pushStr(s) { push(enc.encode(s)); }
    function mark(n) { offsets[n] = pos; }

    var content = "q " + w + " 0 0 " + h + " 0 0 cm /Im0 Do Q";
    var contentBytes = enc.encode(content);

    pushStr("%PDF-1.3\n");
    mark(1);
    pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    mark(2);
    pushStr("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    mark(3);
    pushStr(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + w + " " + h +
      "] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>\nendobj\n"
    );
    mark(4);
    pushStr(
      "4 0 obj\n<< /Type /XObject /Subtype /Image /Width " + w + " /Height " + h +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n"
    );
    push(jpeg);
    pushStr("\nendstream\nendobj\n");
    mark(5);
    pushStr("5 0 obj\n<< /Length " + contentBytes.length + " >>\nstream\n");
    push(contentBytes);
    pushStr("\nendstream\nendobj\n");

    var xrefPos = pos;
    var xref = "xref\n0 6\n0000000000 65535 f \n";
    for (var i = 1; i <= 5; i++) {
      xref += ("0000000000" + offsets[i]).slice(-10) + " 00000 n \n";
    }
    pushStr(xref);
    pushStr("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF");

    var total = 0;
    parts.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total);
    var o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return new Blob([out], { type: "application/pdf" });
  }

  function renderResult(blob, ext) {
    var url = URL.createObjectURL(blob);
    resultBox.innerHTML = "";
    if (ext === "pdf") {
      var icon = document.createElement("div");
      icon.style.fontSize = "2.6rem";
      icon.textContent = "📄";
      resultBox.appendChild(icon);
    } else {
      var out = new Image();
      out.src = url;
      resultBox.appendChild(out);
    }
    var meta = document.createElement("small");
    meta.textContent = ext.toUpperCase() + " · " + humanSize(blob.size);
    var dl = document.createElement("a");
    dl.href = url;
    dl.download = currentName + "." + ext;
    dl.className = "btn btn-primary btn-sm";
    dl.textContent = "Download ." + ext;
    resultBox.appendChild(meta);
    resultBox.appendChild(dl);
  }

  function loadFile(file) {
    if (!file || !file.type.indexOf || file.type.indexOf("image/") !== 0) {
      resultBox.textContent = "Please choose an image file.";
      return;
    }
    currentName = (file.name || "image").replace(/\.[^.]+$/, "");
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        currentImage = img;
        previewWrap.hidden = false;
        previewImg.src = e.target.result;
        origMeta.textContent = img.width + " × " + img.height + " · " + humanSize(file.size);
        convertBtn.disabled = false;
        resultBox.textContent = "Ready — hit Convert.";
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function convert() {
    if (!currentImage) return;
    var mime = formatSelect.value;
    var quality = parseInt(qualityRange.value, 10) / 100;
    var canvas = document.createElement("canvas");
    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    var ctx = canvas.getContext("2d");
    // White backdrop for formats without alpha (JPG)
    if (mime === "image/jpeg" || mime === "application/pdf") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(currentImage, 0, 0);

    if (mime === "application/pdf") {
      canvas.toBlob(
        function (jpg) {
          if (!jpg) {
            resultBox.textContent = "Couldn't render the PDF in this browser.";
            return;
          }
          jpg.arrayBuffer().then(function (buf) {
            var pdf = buildImagePdf(new Uint8Array(buf), currentImage.width, currentImage.height);
            renderResult(pdf, "pdf");
          });
        },
        "image/jpeg",
        quality
      );
      return;
    }

    canvas.toBlob(
      function (blob) {
        if (!blob) {
          resultBox.textContent = "Your browser couldn't encode that format. Try PNG or JPG.";
          return;
        }
        renderResult(blob, extFor(mime));
      },
      mime,
      quality
    );
  }

  // Quality only matters for lossy formats
  function syncQualityVisibility() {
    var lossy = formatSelect.value !== "image/png";
    qualityWrap.style.opacity = lossy ? "1" : "0.4";
    qualityRange.disabled = !lossy;
  }

  // Events
  browseBtn.addEventListener("click", function () { fileInput.click(); });
  dropZone.addEventListener("click", function (e) {
    if (e.target === browseBtn) return;
    fileInput.click();
  });
  fileInput.addEventListener("change", function () {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
  });
  ["dragenter", "dragover"].forEach(function (ev) {
    dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.add("dragover"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.remove("dragover"); });
  });
  dropZone.addEventListener("drop", function (e) {
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });
  qualityRange.addEventListener("input", function () { qualityVal.textContent = qualityRange.value + "%"; });
  formatSelect.addEventListener("change", syncQualityVisibility);
  convertBtn.addEventListener("click", convert);

  syncQualityVisibility();
})();
