FROM oven/bun:1.3.12 AS builder
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY . .

RUN bun install --frozen-lockfile
RUN bun run --cwd apps/shell build
RUN bun run --cwd apps/web build

FROM oven/bun:1.3.12 AS runtime
WORKDIR /app
ARG APPALOFT_APP_VERSION=0.1.0

COPY --from=builder /app/apps/shell/dist/appaloft /app/appaloft
COPY --from=builder /app/apps/web/build /app/web

ENV APPALOFT_APP_VERSION=${APPALOFT_APP_VERSION}
ENV APPALOFT_HTTP_HOST=0.0.0.0
ENV APPALOFT_HTTP_PORT=3001
ENV APPALOFT_WEB_STATIC_DIR=/app/web

EXPOSE 3001

CMD ["bun", "/app/appaloft", "serve"]
