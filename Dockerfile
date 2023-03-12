FROM ghcr.io/puppeteer/puppeteer:19.7.4

# RUN sudo adduser -D myuser
# USER myuser

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    PUPPETEER_STORAGE_PATH=/tmp/uploads

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node", "index.js"]