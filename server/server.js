// FileMorph conversion server.
// POST /convert  (multipart: file, format)  -> returns the converted file.
// Documents via LibreOffice; email (eml/msg/mbox) via convert.py.
// Optional: set CONVERT_TOKEN to require header "x-convert-token".
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const app = express();
app.use(cors({ origin: process.env.ALLOW_ORIGIN || "*" }));
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });
const TOKEN = process.env.CONVERT_TOKEN || "";

app.get("/", (_req, res) => res.send("FileMorph convert server: OK"));

app.post("/convert", upload.single("file"), (req, res) => {
  if (TOKEN && req.headers["x-convert-token"] !== TOKEN) return res.status(401).json({ error: "unauthorized" });
  const fmt = (req.body.format || "").toLowerCase();
  const f = req.file;
  if (!f || !fmt) return res.status(400).json({ error: "missing file or format" });

  const inExt = (f.originalname.split(".").pop() || "").toLowerCase();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "fm-"));
  const safe = (f.originalname || ("in." + inExt)).replace(/[^\w.\-]/g, "_");
  const inPath = path.join(work, safe);
  fs.renameSync(f.path, inPath);

  const cleanup = () => { try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) {} };
  const fail = (m) => { cleanup(); if (!res.headersSent) res.status(500).json({ error: m }); };
  const send = (outPath, name) => {
    if (!fs.existsSync(outPath)) return fail("output not produced");
    res.download(outPath, name, () => cleanup());
  };

  const emailIn = ["eml", "msg", "mbox"].indexOf(inExt) !== -1;
  if (emailIn) {
    const outExt = fmt === "pdf" ? "pdf" : "html";
    const outPath = path.join(work, "out." + outExt);
    execFile("python3", ["/app/convert.py", inPath, fmt, outPath], { timeout: 120000 }, (err, _so, se) => {
      if (err) return fail("email conversion failed: " + (se || err.message));
      send(outPath, "converted." + outExt);
    });
    return;
  }

  // Office documents / PDF via LibreOffice.
  const args = ["--headless", "--convert-to", fmt, "--outdir", work, inPath];
  if (inExt === "pdf" && fmt === "docx") args.splice(1, 0, "--infilter=writer_pdf_import");
  execFile("soffice", args, { timeout: 180000 }, (err, _so, se) => {
    if (err) return fail("conversion failed: " + (se || err.message));
    const base = path.basename(inPath).replace(/\.[^.]+$/, "");
    send(path.join(work, base + "." + fmt), "converted." + fmt);
  });
});

app.listen(process.env.PORT || 8080, () => console.log("convert server up"));
