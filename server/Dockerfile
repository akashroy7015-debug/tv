# FileMorph conversion server — LibreOffice + wkhtmltopdf + email tools.
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc libreoffice-impress \
    wkhtmltopdf python3 ca-certificates fonts-liberation \
    libemail-outlook-message-perl \
    curl gnupg \
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
