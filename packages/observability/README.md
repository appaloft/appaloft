# @yundu/observability

Observability bootstrap and adapters.

Responsibilities:

- OTLP tracing bootstrap at the process edge
- execution-context factory for request/command scoped tracing state
- structured logging and secret masking helpers
- diagnostics utilities used by adapters and composition root

Conventions:

- create one `ExecutionContext` per CLI invocation or HTTP/RPC request
- pass `context` as the first parameter across buses, use cases, ports, and adapters
- narrow write-side persistence to `RepositoryContext`, carrying only request-scoped concerns such as `requestId`, `actor`, `tracer`, and optional `transaction`
- use `yundu.*` span names and `yundu.*` attributes for application-level tracing metadata; keep the attribute keys centralized in `packages/application/src/execution-context.ts`

Must not:

- push tracing APIs into core aggregates
