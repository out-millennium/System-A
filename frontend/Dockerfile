FROM node:24-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
# The Node 24 slim image may ship an npm version whose `npm ci` has a lock-validation bug with
# nested picomatch (next 16 + tinyglobby) and rejects an otherwise-valid lock
# file ("picomatch@2.3.2 does not satisfy picomatch@4.0.5"). npm 11 validates
# the same lock correctly, so pin it before installing.
RUN npm install -g npm@11
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh \
  && addgroup --system nodejs \
  && adduser --system --ingroup nodejs nextjs \
  && chown -R nextjs:nodejs /app
USER nextjs
CMD ["sh", "/app/docker-entrypoint.sh"]
