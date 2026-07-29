# Build stage: install all deps and produce the Next.js standalone bundle
FROM node:20-alpine AS builder
WORKDIR /app
# Next inlines NEXT_PUBLIC_* at build time, so the publishable key has to be
# present here — the runtime env var in client-depl.yaml only works for the
# dev image (next dev compiles on demand). Publishable keys are not secrets.
ARG NEXT_PUBLIC_STRIPE_KEY
ENV NEXT_PUBLIC_STRIPE_KEY=$NEXT_PUBLIC_STRIPE_KEY
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: run the standalone server as node (PID 1)
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
