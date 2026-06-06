# FileMorph Conversion Server

Handles the formats that can't run in a browser: **DOCX↔PDF, EPUB→PDF, XLSX→PDF,
PPTX→PDF** (LibreOffice) and **EML/MSG/MBOX → HTML/PDF** (email tools).

Image, spreadsheet (XLSX↔CSV), audio and video already convert in the browser — this
server is only for the heavy office/email formats.

## Deploy (Render — easiest)
1. Push this repo to GitHub (already done).
2. Render → **New → Web Service** → connect the repo → **Root Directory:** `server`.
3. Environment: **Docker** (it auto-detects the `Dockerfile`).
4. Instance type: the smallest paid tier is fine (LibreOffice needs ~512MB+ RAM; the free tier may be too small).
5. Environment variables:
   - `ALLOW_ORIGIN` = `https://filemorph.shop`
   - `CONVERT_TOKEN` = a random string (optional but recommended)
6. Deploy → you get a URL like `https://filemorph-convert.onrender.com`.

(Railway/Fly.io work too — any host that builds a Dockerfile.)

## Wire it to the site
In `public/config.js` set:
```js
convertServer: "https://YOUR-SERVER-URL",
convertToken:  "the same CONVERT_TOKEN (or leave empty)"
```
Commit & push. The Document and Email tabs will then send their files to this server.

## Test
```
curl -F "file=@test.docx" -F "format=pdf" https://YOUR-SERVER-URL/convert -o out.pdf
```

## Notes
- LibreOffice handles all Office formats; PDF→DOCX is best-effort (layout may shift).
- EPUB→PDF quality depends on the file; complex EPUBs may need Calibre (add `calibre` to the Dockerfile and shell to `ebook-convert`).
- MSG parsing uses `msgconvert`; unusual Outlook messages may need tweaks.
- Files are processed in a temp dir and deleted right after the response.
