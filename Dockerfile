ARG BUN_VERSION=1.3.14

FROM node:24-bookworm AS node-runtime

FROM oven/bun:${BUN_VERSION}-debian AS builder
WORKDIR /app
ARG BUN_VERSION=1.3.14
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN bun --version | grep -x "${BUN_VERSION}"
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node

COPY . .

RUN bun install --frozen-lockfile
RUN bun run --cwd apps/shell build
RUN bun run --cwd apps/web build
RUN bun run --cwd apps/docs build
RUN mkdir -p /app/dist/pglite-runtime-assets \
  && bun -e 'const { dirname, join } = await import("node:path"); const entry = Bun.resolveSync("@electric-sql/pglite", "/app/packages/persistence/pg/src/index.ts"); const dir = dirname(entry); for (const file of ["pglite.data", "pglite.wasm", "initdb.wasm"]) await Bun.write(`/app/dist/pglite-runtime-assets/${file}`, Bun.file(join(dir, file)));'

FROM oven/bun:${BUN_VERSION}-debian AS runtime
WORKDIR /app
ARG APPALOFT_APP_VERSION=0.1.0
ARG APPALOFT_RUNTIME_INSTALL_OPENSSH=1
RUN if [ "${APPALOFT_RUNTIME_INSTALL_OPENSSH}" = "1" ]; then \
    apt-get update \
    && apt-get install -y --no-install-recommends openssh-client \
    && rm -rf /var/lib/apt/lists/*; \
  fi

COPY --from=builder /app/apps/shell/dist/appaloft /app/appaloft
COPY --from=builder /app/apps/web/build /app/web
COPY --from=builder /app/apps/docs/dist /app/docs
COPY --from=builder /app/dist/pglite-runtime-assets/pglite.data /app/pglite.data
COPY --from=builder /app/dist/pglite-runtime-assets/pglite.wasm /app/pglite.wasm
COPY --from=builder /app/dist/pglite-runtime-assets/initdb.wasm /app/initdb.wasm

ENV APPALOFT_APP_VERSION=${APPALOFT_APP_VERSION}
ENV APPALOFT_HTTP_HOST=0.0.0.0
ENV APPALOFT_HTTP_PORT=3001
ENV APPALOFT_WEB_STATIC_DIR=/app/web
ENV APPALOFT_DOCS_STATIC_DIR=/app/docs

EXPOSE 3001

HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=12 CMD ["bun", "-e", "const port = process.env.APPALOFT_HTTP_PORT || '3001'; fetch(`http://127.0.0.1:${port}/api/health`).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1));"]

CMD ["bun", "/app/appaloft", "serve"]
