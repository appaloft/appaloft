# @appaloft/orpc

oRPC transport package for Appaloft.

Responsibilities:

- define typed business procedures and route metadata
- map command/query buses into transport handlers
- mount oRPC RPC handlers at `/api/rpc` and OpenAPI/REST handlers at `/api` without hand-writing business routes in the HTTP adapter
- expose a typed client plus TanStack Query helpers for `apps/web` and other first-party consumers

Depends on:

- `@appaloft/application` for buses and message types
- `@appaloft/application` command/query input schemas for transport inputs
- `@appaloft/contracts` for transport response schemas
- `elysia` and `@orpc/*` transport libraries on the server side

Frontend note:

- `apps/web` should consume `@appaloft/orpc/client` and bind business queries/mutations through `@tanstack/svelte-query`
- ad-hoc `fetch('/api/...')` is acceptable only for infrastructure endpoints such as health/readiness/version when they intentionally stay outside the business oRPC surface

Must not:

- contain domain invariants
- reach into persistence adapters directly
- replace command/query handlers with transport-specific business logic
- fork route knowledge into separate hard-coded adapters outside this package
- define transport-only input shapes that drift from the command/query input schema
