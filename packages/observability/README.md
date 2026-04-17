# @appaloft/observability

Observability bootstrap and adapters.

Responsibilities:

- OTLP tracing bootstrap at the process edge
- Node auto instrumentation for HTTP client/server modules and supported data clients
- HTTP response trace headers for browser Network and curl diagnostics
- execution-context factory for request/command scoped tracing state
- structured logging and secret masking helpers
- diagnostics utilities used by adapters and composition root

Conventions:

- create one `ExecutionContext` per CLI invocation or HTTP/RPC request
- pass `context` as the first parameter across buses, use cases, ports, and adapters
- narrow write-side persistence to `RepositoryContext`, carrying only request-scoped concerns such as `requestId`, `actor`, `tracer`, and optional `transaction`
- use `appaloft.*` span names and `appaloft.*` attributes for application-level tracing metadata; keep the attribute keys centralized in `packages/application/src/execution-context.ts`
- configure exporters with standard OpenTelemetry environment variables such as `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_TRACES_SAMPLER`, and `OTEL_TRACES_SAMPLER_ARG`
- configure trace UI links with `TRACE_LINK_URL_TEMPLATE` or `TRACE_LINK_BASE_URL`; base URLs use `{base}/trace/{traceId}`

Must not:

- push tracing APIs into core aggregates
