# One image runs both halves of Designo: the editor's production server (the default command)
# and the MCP server, which an agent reaches with `docker exec -i designo node packages/mcp/src/main.ts` over SSH.
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @designo/editor build

FROM node:24-alpine
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DESIGNO_DATA_DIR=/data
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
    --filter @designo/editor... --filter @designo/mcp... \
  && pnpm store prune
COPY --from=build /app/packages/editor/dist ./packages/editor/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/files > /dev/null || exit 1
CMD ["node", "packages/editor/server/productionServer.ts"]
