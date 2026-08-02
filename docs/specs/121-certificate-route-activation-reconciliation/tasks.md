# Tasks: Certificate Route Activation Reconciliation

## Spec And Ticket

- [x] Record owner-confirmed discovery and accepted lifecycle decisions.
- [x] Add ADR-104 and synchronize the operation map, workflow, roadmap, and test matrices.
- [x] Create public GitHub issue(s), link these governing artifacts/test ids, and add
  `ready-for-agent` before Code Round.

## Test First

- [ ] `ROUTE-TLS-CMD-032..034`: add failing aggregate/application and entrypoint tests for explicit
  certificate-policy transitions.
- [ ] `ROUTE-TLS-EVT-017..020`: replace direct certificate-event readiness tests with failing
  reconciliation ordering, idempotency, and failure-retention tests.
- [ ] `EDGE-PROXY-RELOAD-004A..004D`: add failing provider-neutral activation/reload/proof tests.
- [x] `EDGE-PROXY-RELOAD-004E`: add certificate-pending durable route fail-closed provider tests.
- [x] Add Traefik/Caddy contract tests proving durable managed/manual routes do not select
  provider-local certificate automation.
- [ ] Add opt-in real Docker Traefik/Caddy hostname/SNI served-fingerprint smoke.

## Implementation

- [ ] Add `domain-bindings.configure-certificate-policy` command, operation catalog entry,
  HTTP/oRPC, CLI, SDK/MCP generation, Web affordance, and readback.
- [ ] Add aggregate policy-transition behavior and safe reconciliation status/state.
- [ ] Add provider-neutral secret materialization, certificate activation, and TLS observation ports.
- [ ] Reconcile `certificate-issued` and `certificate-imported` through activation/reload/proof before
  `domain-ready`.
- [ ] Implement fail-safe previous-certificate retention and idempotent retry.
- [ ] Implement Traefik/Caddy dynamic certificate activation and update diagnostics.
- [ ] Add PostgreSQL/PGlite persistence migration and adapters if required by the accepted state
  shape.

## Entrypoints And Docs

- [ ] Update both certificate-readiness locale pages, docs registry, public traceability, CLI help,
  API descriptions, generated SDK/MCP metadata, and Web help/status vocabulary.
- [ ] Record server-applied provider-local TLS as intentionally unchanged.

## Verification

- [ ] Run focused core/application/provider/persistence/entrypoint tests.
- [ ] Run `bun run lint:ci`, `bun run typecheck`, `bun run test`, and `bun run build`.
- [ ] Run opt-in real Docker TLS smoke and record image pins, ports, cleanup, hostname/SNI command,
  and observed fingerprint evidence.
- [ ] Run the public/private boundary review before Cloud pin work.

## Delivery And Sync

- [ ] Push public branch and open a public PR with docs outcome and issue linkage.
- [ ] Merge public PR, update Cloud gitlink to the final public `main` SHA, and verify Cloud.
- [ ] Synchronize Spec/ADR/workflow/events/matrices/docs/tasks with final implementation evidence.
