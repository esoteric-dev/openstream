FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock* ./
COPY packages/db/package.json ./packages/db/
COPY apps/web/package.json ./apps/web/
RUN bun install

COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# NEXT_PUBLIC_* vars are baked into the JS bundle at build time.
# Pass the public-facing server address here.
ARG NEXT_PUBLIC_API_URL=http://localhost:4001
ARG NEXT_PUBLIC_SRS_HTTP_URL=http://localhost:8080
ARG NEXT_PUBLIC_RTMP_SERVER=rtmp://localhost:1935/live
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SRS_HTTP_URL=$NEXT_PUBLIC_SRS_HTTP_URL
ENV NEXT_PUBLIC_RTMP_SERVER=$NEXT_PUBLIC_RTMP_SERVER

WORKDIR /app/apps/web
RUN bun run build

# ---- runtime ----
FROM oven/bun:1

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

EXPOSE 4000
WORKDIR /app/apps/web
CMD ["bun", "run", "start"]
