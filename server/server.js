// FileMorph universal conversion server.
// POST /convert (multipart: file, format) -> converted file.
// Routes by type: images (ImageMagick/heif), audio+video (ffmpeg),
// documents (LibreOffice), email (convert.py). Optional CONVERT_TOKEN.
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const app = express();
app.use(cors({ origin: process.env.ALLOW_ORIGIN || "*" }));
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });
const TOKEN = process.env.CONVERT_TOKEN || "";              // optional internal/server-to-server token
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

// Verify a Supabase access token and return the user, or null. Identity comes
// only from Supabase — clients can't forge it (unlike the old shared token).
async function verifyUser(req) {
  const auth = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + m[1], apikey: SUPABASE_ANON_KEY }
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (e) { return null; }
}

// Lightweight per-user rate limit (in-memory): max N conversions per window.
const RATE_MAX = parseInt(process.env.RATE_MAX || "40", 10);
const RATE_WINDOW_MS = parseInt(process.env.RATE_WINDOW_MS || "600000", 10); // 10 min
const _hits = new Map();
function allowRate(key) {
  const now = Date.now();
  const arr = (_hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) { _hits.set(key, arr); return false; }
  arr.push(now); _hits.set(key, arr);
  return true;
}

const IMG = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif", "ico", "heic", "heif", "svg"];
const AV = ["mp3", "wav", "aac", "m4a", "ogg", "flac", "opus", "aiff", "mp4", "webm", "mov", "mkv", "avi", "m4v", "gif"];

app.get("/", (_req, res) => res.send("FileMorph universal convert server: OK"));

app.post("/convert", upload.single("file"), async (req, res) => {
  // Auth: accept an internal server-to-server token, OR a signed-in Supabase user.
  // This stops anyone from using the server anonymously via a token copied from the page source.
  const tokenOk = TOKEN && req.headers["x-convert-token"] === TOKEN;
  if (!tokenOk) {
    const user = await verifyUser(req);
    if (!user) return res.status(401).json({ error: "Please sign in to use server conversion." });
    if (!allowRate(user.id)) return res.status(429).json({ error: "Too many conversions in a short time — please wait a few minutes." });
  }
  const fmt = (req.body.format || "").toLowerCase();
  const f = req.file;
  if (!f || !fmt) return res.status(400).json({ error: "missing file or format" });

  const inExt = (f.originalname.split(".").pop() || "").toLowerCase();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "fm-"));
  const inPath = path.join(work, (f.originalname || ("in." + inExt)).replace(/[^\w.\-]/g, "_"));
  fs.renameSync(f.path, inPath);

  const cleanup = () => { try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) {} };
  const fail = (m) => { cleanup(); if (!res.headersSent) res.status(500).json({ error: m }); };
  const send = (outPath, name) => {
    if (!fs.existsSync(outPath)) return fail("output not produced");
    res.download(outPath, name, () => cleanup());
  };
  const run = (cmd, args, next) => execFile(cmd, args, { timeout: 240000 }, (err, _o, se) => next(err, se));

  const outPath = path.join(work, "out." + fmt);

  // 1) Email
  if (["eml", "msg", "mbox"].indexOf(inExt) !== -1) {
    const oe = fmt === "pdf" ? "pdf" : "html";
    return run("python3", ["/app/convert.py", inPath, fmt, path.join(work, "out." + oe)], (err, se) =>
      err ? fail("email conversion failed: " + (se || err.message)) : send(path.join(work, "out." + oe), "converted." + oe));
  }

  // 2) Audio / video (ffmpeg) — when the target is an A/V format
  if (AV.indexOf(fmt) !== -1) {
    return run("ffmpeg", ["-y", "-i", inPath, outPath], (err, se) =>
      err ? fail("media conversion failed: " + (se || err.message)) : send(outPath, "converted." + fmt));
  }

  // 3) Images (incl. HEIC) when both sides are image formats
  if (IMG.indexOf(fmt) !== -1 && IMG.indexOf(inExt) !== -1) {
    if (inExt === "heic" || inExt === "heif") {
      // pillow-heif (bundled recent libheif) decodes straight to the target format,
      // handling iPhone files the system heif-convert rejects.
      return run("python3", ["/app/heic_convert.py", inPath, outPath], (err, se) => {
        if (!err) return send(outPath, "converted." + fmt);
        const mid = path.join(work, "mid.png");
        run("heif-convert", [inPath, mid], (e2, s2) => {
          if (e2) return fail("HEIC decode failed: " + (se || s2 || err.message));
          if (fmt === "png") return send(mid, "converted.png");
          run("convert", [mid, outPath], (e3, s3) => e3 ? fail("conversion failed: " + (s3 || e3.message)) : send(outPath, "converted." + fmt));
        });
      });
    }
    return run("convert", [inPath, outPath], (err, se) =>
      err ? fail("image conversion failed: " + (se || err.message)) : send(outPath, "converted." + fmt));
  }

  // 4) Documents / everything else (LibreOffice)
  const args = ["--headless", "--convert-to", fmt, "--outdir", work, inPath];
  if (inExt === "pdf" && fmt === "docx") args.splice(1, 0, "--infilter=writer_pdf_import");
  execFile("soffice", args, { timeout: 240000 }, (err, _o, se) => {
    if (err) return fail("conversion failed: " + (se || err.message));
    const base = path.basename(inPath).replace(/\.[^.]+$/, "");
    send(path.join(work, base + "." + fmt), "converted." + fmt);
  });
});

app.listen(process.env.PORT || 8080, () => console.log("universal convert server up"));
