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
    return { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mime] || "img";
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
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(currentImage, 0, 0);

    canvas.toBlob(
      function (blob) {
        if (!blob) {
          resultBox.textContent = "Your browser couldn't encode that format. Try PNG or JPG.";
          return;
        }
        var url = URL.createObjectURL(blob);
        var ext = extFor(mime);
        resultBox.innerHTML = "";
        var out = new Image();
        out.src = url;
        var meta = document.createElement("small");
        meta.textContent = ext.toUpperCase() + " · " + humanSize(blob.size);
        var dl = document.createElement("a");
        dl.href = url;
        dl.download = currentName + "." + ext;
        dl.className = "btn btn-primary btn-sm";
        dl.textContent = "Download ." + ext;
        resultBox.appendChild(out);
        resultBox.appendChild(meta);
        resultBox.appendChild(dl);
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
