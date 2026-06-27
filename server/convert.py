#!/usr/bin/env python3
# Email conversion helper: EML / MSG / MBOX -> HTML or PDF.
import sys, os, subprocess, email, mailbox
from email import policy

inp, fmt, out = sys.argv[1], sys.argv[2], sys.argv[3]
ext = inp.rsplit(".", 1)[-1].lower()

def esc(s): return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def body_html(msg):
    try:
        b = msg.get_body(preferencelist=("html", "plain"))
    except Exception:
        b = None
    if not b:
        return ""
    content = b.get_content()
    if b.get_content_type() == "text/plain":
        return "<pre>" + esc(content) + "</pre>"
    return content

def eml_to_html(path):
    with open(path, "rb") as f:
        msg = email.message_from_binary_file(f, policy=policy.default)
    head = "<h2>%s</h2><p><b>From:</b> %s<br><b>To:</b> %s<br><b>Date:</b> %s</p><hr>" % (
        esc(msg.get("subject", "")), esc(msg.get("from", "")), esc(msg.get("to", "")), esc(msg.get("date", "")))
    return "<html><head><meta charset='utf-8'></head><body>" + head + body_html(msg) + "</body></html>"

def mbox_to_html(path):
    mb = mailbox.mbox(path)
    parts = []
    for m in mb:
        head = "<h3>%s</h3><p><b>From:</b> %s</p>" % (esc(m.get("subject", "")), esc(m.get("from", "")))
        content = ""
        try:
            b = m.get_body(preferencelist=("html", "plain")) if hasattr(m, "get_body") else None
            if b:
                content = b.get_content()
                if b.get_content_type() == "text/plain":
                    content = "<pre>" + esc(content) + "</pre>"
        except Exception:
            pass
        parts.append("<div>" + head + content + "<hr></div>")
    return "<html><head><meta charset='utf-8'></head><body>" + "".join(parts) + "</body></html>"

def write_html(html, dest):
    with open(dest, "w", encoding="utf-8") as f:
        f.write(html)

def html_to_pdf(html, dest):
    tmp = dest + ".html"
    write_html(html, tmp)
    subprocess.run(["wkhtmltopdf", "--quiet", tmp, dest], check=True)

# MSG -> EML first (msgconvert writes <name>.eml in cwd)
if ext == "msg":
    cwd = os.path.dirname(inp) or "."
    subprocess.run(["msgconvert", os.path.basename(inp)], cwd=cwd, check=True)
    cand = inp + ".eml"
    if not os.path.exists(cand):
        cand = os.path.splitext(inp)[0] + ".eml"
    inp, ext = cand, "eml"

if ext == "eml":
    html = eml_to_html(inp)
elif ext == "mbox":
    html = mbox_to_html(inp)
else:
    html = "<html><body>Unsupported email format.</body></html>"

if fmt == "pdf":
    html_to_pdf(html, out)
else:
    write_html(html, out)
