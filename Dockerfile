FROM node:20-alpine AS build
WORKDIR /app

COPY client/package*.json client/
COPY server/package*.json server/

RUN npm ci --prefix client \
  && npm ci --omit=dev --prefix server

COPY client client
COPY server server

RUN npm run build --prefix client

FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV CLIENT_BUILD_PATH=/app/client/dist

COPY --from=build /app/server /app/server
COPY --from=build /app/client/dist /app/client/dist

WORKDIR /app/server
EXPOSE 4000

CMD ["node", "src/index.js"]
