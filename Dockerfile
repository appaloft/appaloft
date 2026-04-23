FROM debian:bookworm-slim AS bun
WORKDIR /tmp
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*
COPY .bun-version ./
RUN BUN_VERSION="$(cat .bun-version)" \
  && curl -fsSL https://bun.com/install | bash -s "bun-v${BUN_VERSION}" \
  && /root/.bun/bin/bun --version | grep -x "${BUN_VERSION}"

FROM debian:bookworm-slim AS builder
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV BUN_INSTALL=/root/.bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=bun /root/.bun /root/.bun

COPY . .

RUN bun install --frozen-lockfile
RUN bun run --cwd apps/shell build
RUN bun run --cwd apps/web build
RUN bun run --cwd apps/docs build

FROM debian:bookworm-slim AS runtime
WORKDIR /app
ARG APPALOFT_APP_VERSION=0.1.0
ENV BUN_INSTALL=/root/.bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=bun /root/.bun /root/.bun

COPY --from=builder /app/apps/shell/dist/appaloft /app/appaloft
COPY --from=builder /app/apps/web/build /app/web
COPY --from=builder /app/apps/docs/dist /app/docs

ENV APPALOFT_APP_VERSION=${APPALOFT_APP_VERSION}
ENV APPALOFT_HTTP_HOST=0.0.0.0
ENV APPALOFT_HTTP_PORT=3001
ENV APPALOFT_WEB_STATIC_DIR=/app/web
ENV APPALOFT_DOCS_STATIC_DIR=/app/docs

EXPOSE 3001

CMD ["bun", "/app/appaloft", "serve"]
