FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci
COPY --from=build /app/dist ./dist
COPY src/server ./src/server
EXPOSE 8005
CMD ["node", "src/server/server.js"]