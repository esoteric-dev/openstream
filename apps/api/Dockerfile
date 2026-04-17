FROM node:20-alpine

WORKDIR /app

# Install FFmpeg for stream processing
RUN apk add --no-cache ffmpeg

COPY package*.json ./
COPY apps/api/package*.json ./apps/
COPY packages/db/package*.json ./packages/db/

RUN npm install

COPY . .

WORKDIR /app/apps/api
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
