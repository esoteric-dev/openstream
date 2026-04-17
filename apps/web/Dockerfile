FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/web/package*.json ./apps/
COPY packages/db/package*.json ./packages/db/

RUN npm install

COPY . .

WORKDIR /app/apps/web
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
