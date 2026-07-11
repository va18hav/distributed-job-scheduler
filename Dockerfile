FROM node:20-alpine

WORKDIR /app

# Copy root configurations and workspace package.json files
COPY package*.json ./
COPY apps/scheduler/package*.json ./apps/scheduler/
COPY apps/worker/package*.json ./apps/worker/
COPY packages/db/package*.json ./packages/db/

# Install dependencies for all workspaces
RUN npm ci

# Copy the entire codebase
COPY . .

# Generate Prisma Client
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

EXPOSE 3000 3001

CMD ["npm", "run", "dev"]
