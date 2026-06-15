# Plan: Organization Retention Defaults

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-048, ADR-049, ADR-052, ADR-053, ADR-054, ADR-055, ADR-057, ADR-058, ADR-059, ADR-060
- Global contracts:
  - `docs/architecture/async-lifecycle-and-acceptance.md`
  - `docs/architecture/adapter-command-query-boundary.md`
  - `docs/errors/model.md`
  - `docs/errors/neverthrow-conventions.md`
- Local specs:
  - `docs/commands/audit-events.prune.md`
  - `docs/commands/domain-events.prune.md`
  - `docs/commands/provider-job-logs.prune.md`
  - ``
  - `docs/specs/061-scheduled-runtime-prune-automation/spec.md`
- Test matrix: `docs/testing/organization-retention-defaults-test-matrix.md`

## Architecture Approach

- Domain/application placement: retention defaults are application policy records for
  Operator/Internal State. They are not core aggregate state and do not belong in existing retained
  history tables.
- Repository/specification/visitor impact: Code Round added a retention default repository/read
  model port with PostgreSQL/PGlite persistence in `packages/persistence/pg`.
- Event/CQRS/read-model impact: configure is a command; list/show are queries. The operations must
  not execute retention work or mutate retained history.
- Entrypoint impact: CLI and HTTP/oRPC entrypoints must dispatch through `CommandBus` and
  `QueryBus` with shared schemas.
- Persistence/migration impact: Code Round added a dedicated category-neutral retention default
  policy table that does not couple audit rows, logs, events, or process attempts.

## Store Decision

The first Code Round stores retention defaults separately from retained rows with these minimum
fields:

- stable policy id;
- scope, supporting `organization` and `system`;
- category;
- retention days;
- dry-run scheduling enabled;
- destructive scheduling enabled;
- enabled flag;
- updated timestamp and actor metadata when available.

The store must not contain retained history payloads, audit payloads, log lines, event payloads,
runtime identifiers beyond policy scope, provider handles, or secrets.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator/internal state closure for `0.11.0`.
- Version target: pre-1.0 policy.
- Compatibility impact: additive policy commands/queries. Manual prune semantics remain unchanged.

## Testing Strategy

- Matrix ids: `ORG-RETENTION-DEFAULTS-001` through `ORG-RETENTION-DEFAULTS-005`.
- Test-first rows:
  - configure safe defaults;
  - list/show safe readback;
  - manual prune commands do not infer cutoff or destructive behavior from defaults;
  - category-specific guards remain authoritative for scheduled consumers;
  - CLI and HTTP/oRPC dispatch shared command/query schemas.
- Contract/integration/unit: application tests for command/query behavior, persistence PGlite tests
  for policy records, and operation catalog/docs-registry/OpenAPI/SDK metadata coverage for public
  entrypoints.

## Risks And Migration Gaps

- Organization context is not uniformly required in all local/self-hosted execution modes. The
  first Code Round supports both `system` and `organization` scope.
- Scheduled history retention automation remains separate and must not become destructive just
  because defaults exist.
- Category-specific guards and legal holds must remain enforced by the retention command/store that
  owns each retained row category.
