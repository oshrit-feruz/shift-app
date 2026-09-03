# The price worker's image. Build context is app/ (see app/fly.toml), so the
# same package-lock.json that pins the app's dependencies pins this one's.
#
# Two stages: the first installs everything and bundles worker/main.ts into
# one file with esbuild; the second carries only that file and Node. No
# node_modules in the runtime image — the bundle has the code it needs — so
# the image is small and there is nothing in it to drift from the lockfile.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: nothing this image needs runs a lifecycle script (esbuild
# resolves its binary through an optional dependency), and a dependency that
# could run arbitrary code at install time should not get to.
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY . .
RUN npm run build:worker

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist-worker/main.cjs ./main.cjs
EXPOSE 8080
USER node
CMD ["node", "main.cjs"]
