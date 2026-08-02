# Tasks: Certificate Route Activation Reconciliation

## Spec And Ticket

- [x] Record owner-confirmed discovery and accepted lifecycle decisions.
- [x] Add ADR-104 and synchronize the operation map, workflow, roadmap, and test matrices.
- [x] Create public GitHub issue(s), link these governing artifacts/test ids, and add
  `ready-for-agent` before Code Round.

## Test First

- [x] `ROUTE-TLS-CMD-032..034`: add failing aggregate/application and entrypoint tests for explicit
  certificate-policy transitions.
- [x] `ROUTE-TLS-EVT-017..020`: replace direct certificate-event readiness tests with failing
  reconciliation ordering, idempotency, and failure-retention tests.
- [x] `EDGE-PROXY-RELOAD-004A..004D`: add failing provider-neutral activation/reload/proof tests.
- [x] `EDGE-PROXY-RELOAD-004E`: add certificate-pending durable route fail-closed provider tests.
- [x] Add Traefik/Caddy contract tests proving durable managed/manual routes do not select
  provider-local certificate automation.
- [x] Add opt-in real Docker Traefik/Caddy hostname/SNI served-fingerprint smoke.

## Implementation

- [x] Add `domain-bindings.configure-certificate-policy` command, operation catalog entry,
  HTTP/oRPC, CLI, SDK/MCP generation, Web affordance, and readback.
- [x] Add aggregate policy-transition behavior and safe reconciliation status/state.
- [x] Add provider-neutral secret materialization, certificate activation, and TLS observation ports.
- [x] Reconcile `certificate-issued` and `certificate-imported` through activation/reload/proof before
  `domain-ready`.
- [x] Implement fail-safe previous-certificate retention and idempotent retry.
- [x] Implement Traefik/Caddy dynamic certificate activation and update diagnostics.
- [x] Add PostgreSQL/PGlite persistence migration and adapters if required by the accepted state
  shape.

## Entrypoints And Docs

- [x] Update both certificate-readiness locale pages, docs registry, and public traceability for
  activation/pending/rollback semantics.
- [x] Update CLI help, API descriptions, generated SDK/MCP metadata, and Web help/status vocabulary
  for the policy operation.
- [x] Record server-applied provider-local TLS as intentionally unchanged.

## Verification

- [x] Run focused core/application/provider/persistence/entrypoint tests.
- [x] Run `bun run lint:ci`, `bun run typecheck`, `bun run test`, and `bun run build`.
- [x] Run opt-in real Docker TLS smoke and record image pins, ports, cleanup, hostname/SNI command,
  and observed fingerprint evidence.
- [x] Run the public/private boundary review before Cloud pin work.

## Delivery And Sync

- [ ] Push public branch and open a public PR with docs outcome and issue linkage.
- [ ] Merge public PR, update Cloud gitlink to the final public `main` SHA, and verify Cloud.
- [x] Synchronize Spec/ADR/workflow/events/matrices/docs/tasks with final implementation evidence.

## Reconciliation Evidence

- 2026-08-02: real Docker smoke passed for `traefik:v3.7.9` and
  `lucaslorentz/caddy-docker-proxy:2.9-alpine`, each with `nginx:1.29.5-alpine` as the routed
  workload and `alpine:3.22.2` as the stdin-only material helper.
- Both smokes used loopback ephemeral HTTPS ports, direct hostname/SNI observation, independently
  generated expected fingerprints, candidate activation, and rollback proof that restored the old
  fingerprint.
- All containers, volumes, networks, and temporary PEM files used unique test names and were
  removed after the run; no existing Appaloft Docker resource was changed.
- 2026-08-02: policy transitions are exposed through the named operation, HTTP/oRPC, CLI, generated
  SDK/MCP metadata, and Web. The aggregate returns to `certificate_pending` without changing the
  serving route, and the existing server-applied provider-local TLS contract remains unchanged.
- Durable binding state now stores the proven certificate id and fingerprint. Reconciliation is
  idempotent only for the same identity and fingerprint, so replacing material in the same
  certificate aggregate still activates and proves the replacement before readiness.
- Focused tests, PGlite migration coverage, `bun run lint:ci`, `bun run typecheck`, the full
  `bun run test` suite, and `bun run build` passed. The full suite was rerun outside the sandbox
  because its agent-workspace fixture requires a temporary Git credential-cache socket.
- Public/private review found only provider-neutral Community language and contracts in this
  change; no Cloud commercial topology, pricing, billing, entitlement, or private package import
  was introduced.
