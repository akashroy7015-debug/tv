# FileMorph universal conversion server.
# Images (incl. HEIC/TIFF) via ImageMagick + libheif, audio/video via ffmpeg,
# documents via LibreOffice, email via python helper.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc libreoffice-impress \
    ffmpeg imagemagick libheif-examples \
    wkhtmltopdf python3 ca-certificates fonts-liberation \
    libemail-outlook-message-perl curl gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js convert.py ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
