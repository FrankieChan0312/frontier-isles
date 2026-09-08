FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY packages/game-core/package.json packages/game-core/package.json
COPY packages/game-ai/package.json packages/game-ai/package.json
COPY packages/realtime-contracts/package.json packages/realtime-contracts/package.json
RUN npm ci
COPY . .
ENV VITE_REALTIME_URL=same-origin
RUN npm run build && npm run build:server
RUN npm prune --omit=dev --ignore-scripts

FROM node:24.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3001 STATIC_ROOT=/app/public PERSISTENCE_FILE=/data/frontier-isles.sqlite
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./public
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist/src ./server/dist/src
COPY --from=build /app/packages/game-core/package.json ./packages/game-core/package.json
COPY --from=build /app/packages/game-core/dist ./packages/game-core/dist
COPY --from=build /app/packages/game-ai/package.json ./packages/game-ai/package.json
COPY --from=build /app/packages/game-ai/dist ./packages/game-ai/dist
COPY --from=build /app/packages/realtime-contracts/package.json ./packages/realtime-contracts/package.json
COPY --from=build /app/packages/realtime-contracts/dist ./packages/realtime-contracts/dist
RUN find packages server -type f \( -name '*.test.*' -o -name '*.test-helper.*' -o -name '*.map' \) -delete \
    && rm -rf packages/game-ai/dist/src/simulation \
    && mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/ready').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
STOPSIGNAL SIGTERM
CMD ["node", "server/dist/src/server.js"]
