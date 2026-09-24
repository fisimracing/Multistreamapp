FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

# Puerto HTTP del panel (Railway inyecta PORT automáticamente)
EXPOSE 3000
# Puerto RTMP de ingesta (necesita TCP Proxy en Railway)
EXPOSE 1935

CMD ["node", "src/server.js"]
