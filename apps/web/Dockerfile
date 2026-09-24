FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# next build's route-module collection pass imports lib/auth.ts, which
# reads BETTER_AUTH_SECRET at import time -- any value satisfies the
# build (see apps-ci.yml's identical placeholder convention). The real
# secret is supplied at container run time via docker-compose, not
# baked into the image.
ARG BETTER_AUTH_SECRET=docker-build-placeholder-not-a-real-secret
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Applies Better Auth's own migration plan against the `auth` schema
# (see scripts/migrate-auth-db.mts), then starts the server. Idempotent:
# a schema already up to date is a no-op.
CMD ["sh", "-c", "npm run migrate:auth && npm run start"]
