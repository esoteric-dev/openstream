FROM oven/bun:1

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock* ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
RUN bun install

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

ENV FFMPEG_USE_DOCKER=false
EXPOSE 4001
CMD ["bun", "run", "apps/api/src/index.ts"]
