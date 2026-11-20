FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev && apk add --no-cache poppler-utils font-dejavu font-liberation
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/migrations ./migrations
RUN mkdir -p /app/data && chown node:node /app /app/data
USER node
EXPOSE 4000
CMD ["node", "--import", "tsx", "server/index.ts"]
