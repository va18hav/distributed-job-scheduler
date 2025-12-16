FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/scheduler/package*.json ./apps/scheduler/
COPY apps/worker/package*.json ./apps/worker/
COPY packages/db/package*.json ./packages/db/

RUN npm ci

COPY . .

RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

EXPOSE 3000 3001

CMD ["npm", "run", "dev"]
