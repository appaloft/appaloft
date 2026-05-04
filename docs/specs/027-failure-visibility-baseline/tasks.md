# Tasks: Access/Proxy/Log/Health Failure Visibility Baseline

## Spec Round

- [x] Confirm PR #160 is merged into latest `main`.
- [x] Create `fix/failure-visibility-baseline` from latest `main`.
- [x] Locate the behavior in `docs/BUSINESS_OPERATION_MAP.md` as existing resource access failure
  diagnostics, route intent/status diagnostics, resource health, runtime logs, deployment logs,
  proxy preview, and diagnostic summary observation.
- [x] Record no-ADR-needed because the slice reuses existing read/query contracts and does not
  change operation boundaries, route ownership, durable state, or recovery semantics.

## Test-First

- [x] `RES-DIAG-QRY-019`: add diagnostic summary coverage for safe source error messages and copy
  JSON redaction when provider/log/health-adjacent failures contain raw payload hints.
- [x] `ACCESS-DIAG-005`: add access diagnostic coverage for safe failure visibility across access,
  proxy, runtime logs, deployment logs, health, and route context lookup sources.
- [x] `ROUTE-TLS-READMODEL-016`: add routing/domain read-model coverage note that domain/route
  failure visibility reuses safe route/access descriptors and does not expose provider raw payloads.
- [x] `RES-HEALTH-QRY-021`: add resource health coverage for safe health/probe failure messages and
  latest access failure related context.

## Implementation

- [x] Add shared application-layer diagnostic message sanitization for unsafe headers, cookies,
  sensitive query values, private key material, SSH credential URLs, provider raw payload hints, and
  multiline remote command output.
- [x] Apply sanitizer to diagnostic summary source errors and health source errors without changing
  command/query boundaries.
- [x] Preserve latest safe `resource-access-failure/v1` and `applied-route-context/v1` fields as
  structured context instead of parsing provider raw text.

## Entrypoints And Docs

- [x] Keep API/oRPC, CLI, and Web on existing contracts/read models; no operation catalog change.
- [x] Public docs/help outcome: reuse existing access/proxy/diagnostics anchors because no new
  user workflow or help affordance is added.

## Verification

- [x] Run targeted application tests for resource diagnostic summary and resource health.
- [x] Confirm affected contract/oRPC tests are not required because this slice adds no public shape.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.

## Post-Implementation Sync

- [x] Update test matrix statuses and roadmap Phase 6 verification notes.
- [x] Reconcile this spec, plan, tasks, source-of-truth docs, tests, and code.
