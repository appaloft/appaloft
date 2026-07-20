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

FROM debian:bookworm-slim AS tunnel-agents
ARG TARGETARCH
ARG CLOUDFLARED_VERSION=2026.7.2
ARG NGROK_VERSION=3.39.9
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && case "${TARGETARCH}" in \
       amd64) CLOUDFLARED_SHA256=ec905ea7b7e327ff8abdde8cb64697a2152de74dbcdbf6aec9db8364eb3886cd; NGROK_SHA256=6aa94f68709469fb2222d51cc4669374bd9d5d6d50775cea4e61e557037972f2 ;; \
       arm64) CLOUDFLARED_SHA256=405df476437e027fc6d18729a5a77155c0a33a6082aeee60a799a688f3052e66; NGROK_SHA256=7f891a0a471db4f0c27061cb841cbe2fca5da6b801edab187d90a1fa809a49e3 ;; \
       *) exit 1 ;; \
     esac \
  && curl -fsSL "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${TARGETARCH}" -o /usr/local/bin/cloudflared \
  && echo "${CLOUDFLARED_SHA256}  /usr/local/bin/cloudflared" | sha256sum -c - \
  && chmod 0755 /usr/local/bin/cloudflared \
  && curl -fsSL "https://ngrok-agent.s3.amazonaws.com/pool/main/n/ngrok/ngrok_${NGROK_VERSION}-0_${TARGETARCH}.deb" -o /tmp/ngrok.deb \
  && echo "${NGROK_SHA256}  /tmp/ngrok.deb" | sha256sum -c - \
  && dpkg-deb -x /tmp/ngrok.deb /tmp/ngrok \
  && install -m 0755 /tmp/ngrok/usr/local/bin/ngrok /usr/local/bin/ngrok

FROM oven/bun:${BUN_VERSION}-debian AS runtime
WORKDIR /app
ARG APPALOFT_APP_VERSION=0.1.0
ARG APPALOFT_RUNTIME_INSTALL_OPENSSH=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates procps \
  && if [ "${APPALOFT_RUNTIME_INSTALL_OPENSSH}" = "1" ]; then apt-get install -y --no-install-recommends openssh-client; fi \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/apps/shell/dist/appaloft /app/appaloft
COPY --from=builder /app/apps/web/build /app/web
COPY --from=builder /app/apps/docs/dist /app/docs
COPY --from=builder /app/dist/pglite-runtime-assets/pglite.data /app/pglite.data
COPY --from=builder /app/dist/pglite-runtime-assets/pglite.wasm /app/pglite.wasm
COPY --from=builder /app/dist/pglite-runtime-assets/initdb.wasm /app/initdb.wasm
COPY --from=tunnel-agents /usr/local/bin/cloudflared /usr/local/bin/cloudflared
COPY --from=tunnel-agents /usr/local/bin/ngrok /usr/local/bin/ngrok

ENV APPALOFT_APP_VERSION=${APPALOFT_APP_VERSION}
ENV APPALOFT_HTTP_HOST=0.0.0.0
ENV APPALOFT_HTTP_PORT=3001
ENV APPALOFT_WEB_STATIC_DIR=/app/web
ENV APPALOFT_DOCS_STATIC_DIR=/app/docs
ENV APPALOFT_SCHEDULED_STORAGE_VOLUME_BACKUP_RUNNER_ENABLED=true
ENV APPALOFT_TUNNEL_RECONCILER_ENABLED=true

EXPOSE 3001

HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=12 CMD ["bun", "-e", "const port = process.env.APPALOFT_HTTP_PORT || '3001'; fetch(`http://127.0.0.1:${port}/api/health`).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1));"]

CMD ["bun", "/app/appaloft", "serve"]
