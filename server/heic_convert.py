#!/usr/bin/env python3
# Decode HEIC/HEIF (incl. tricky iPhone files) to a normal image format.
# Uses pillow-heif, which bundles a recent libheif that tolerates files the
# system heif-convert rejects ("Metadata not correctly assigned to image").
# Usage: heic_convert.py <input> <output>   (target format inferred from output extension)
import sys
from PIL import Image
import pillow_heif

pillow_heif.register_heif_opener()

inp, outp = sys.argv[1], sys.argv[2]
img = Image.open(inp)
ext = outp.rsplit(".", 1)[-1].lower()
if ext in ("jpg", "jpeg", "bmp", "pdf"):
    img = img.convert("RGB")
img.save(outp)
