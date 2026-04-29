# Plan: Deployment Recovery Readiness

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-012, ADR-014, ADR-016, ADR-021, ADR-023, ADR-027, ADR-028, ADR-029, ADR-034
- Local specs: `deployments.create`, `deployments.show`, `deployments.stream-events`,
  `deployments.recovery-readiness`, `deployments.retry`, `deployments.redeploy`,
  `deployments.rollback`, `quick-deploy`, `deployment-detail-and-observation`
- Global contracts: `docs/errors/model.md`,
  `docs/architecture/async-lifecycle-and-acceptance.md`
- Error specs: `deployment-recovery-readiness`
- Test matrices: `deployments.create`, `deployments.show`, `deployments.stream-events`,
  `quick-deploy`, `deployment-recovery-readiness`
- Implementation plans: `deployments.show`, `deployments.stream-events`,
  `deployment-recovery-readiness`

## Architecture Approach

### Domain/Application Placement

Code Round should add a recovery policy/application service that reads durable deployment state,
resource profile state, runtime artifact retention state, target/destination state, and lifecycle
guards. The policy returns a typed readiness DTO and is reused by:

- `deployments.recovery-readiness`;
- compact `deployments.show` recovery summary if that extension is included;
- future admission guards for `deployments.retry`, `deployments.redeploy`, and
  `deployments.rollback`.

Command handlers stay thin and dispatch through explicit command/query messages. Recovery commands
must create new deployment attempts; they must not mutate old attempts or replay old fact events.

### Repository/Read-Model Impact

The first Code Round likely needs read-side access to:

- one deployment attempt by id;
- same-resource deployment history;
- successful deployment candidates;
- runtime artifact and instance retention metadata;
- resource current profile and lifecycle;
- environment/project/target/destination lifecycle and visibility.

Write-side admission must not use stale read models as the sole invariant check. Recovery commands
must validate final admission on the write side and use `resource-runtime` operation coordination.

### Event/CQRS Impact

No new lifecycle event names are required by this Spec Round. New attempts use the existing chain:

```text
deployment-requested
  -> build-requested, when required
  -> deployment-started
  -> deployment-succeeded | deployment-failed
```

Code Round should extend deployment attempt metadata and event/read-model projections with
`triggerKind`, source deployment id, rollback candidate id, and recovery reason when needed. If the
existing event payload cannot carry those safely, add event specs before implementation.

### Entrypoint Impact

Planned surfaces:

- Web: deployment detail recovery panel and rollback candidate section.
- CLI: `appaloft deployments recovery-readiness <deploymentId>` first; later `retry`, `redeploy`,
  and `rollback` commands only when active.
- HTTP/oRPC: one readiness query schema; later command routes reuse command schemas.
- Future MCP/tool: typed readiness and eventual write tools that map to operation catalog entries.

### Persistence/Migration Impact

Rollback readiness needs retained artifact/snapshot metadata. Code Round must inspect whether
current deployment persistence/read models contain enough fields. If not, persistence migrations
must add provider-neutral fields such as:

- runtime artifact kind;
- image name/tag/digest/local image id when available;
- Compose project/service identity when available;
- environment snapshot id or serialized snapshot reference;
- target kind/provider/backend summary;
- retention status and pruned/expired markers;
- previous successful runtime identity.

No compatibility alias is needed before `1.0.0`; align persisted field names to canonical domain
language if this is the first public recovery implementation.

## Roadmap And Compatibility

- Roadmap target: Phase 7 Day-Two Production Controls.
- Version target: future `0.9.0` beta target if Phase 5 and Phase 6 gates are complete.
- Compatibility impact: `pre-1.0-policy`; new public operations and output fields affect Web, CLI,
  HTTP/oRPC, docs/help, and future MCP/tool contracts.
- Release notes: required when any recovery operation becomes active.

## Testing Strategy

This Spec Round adds a dedicated matrix:

- `DEP-RECOVERY-READINESS-*` for query/policy scenarios;
- `DEP-RETRY-*` for retry command admission and new attempt linkage;
- `DEP-REDEPLOY-*` for current-profile redeploy semantics and drift/lifecycle guards;
- `DEP-ROLLBACK-*` for candidate readiness, artifact retention, command admission, and failed
  rollback handling;
- `DEP-RECOVERY-WEB-*`, `DEP-RECOVERY-CLI-*`, `DEP-RECOVERY-HTTP-*`, and
  `DEP-RECOVERY-MCP-*` for entrypoint surfaces.

Minimum automated levels:

- application policy/query unit or integration coverage for every readiness reason;
- command admission integration tests for new attempt creation and coordination;
- persistence/read-model tests for artifact retention and candidate queries;
- API/oRPC contract tests for readiness output and command schemas;
- CLI tests for JSON output and safe suggestions;
- Web component or browser tests for read-only panel before writes and enabled actions after writes;
- runtime adapter tests for artifact availability, candidate apply, and rollback failure diagnostics.

## Public Docs/Help Outcome

Docs Round remains required before behavior is complete.

Target public docs outcome:

- Deploy page or troubleshooting page for "Recover a deployment".
- Stable anchors:
  - `deployment-recovery-readiness`
  - `deployment-recovery-retry`
  - `deployment-recovery-redeploy`
  - `deployment-recovery-rollback`
  - `deployment-recovery-rollback-candidates`
- CLI help, Web recovery panel help, API descriptions, and future MCP/tool descriptions should link
  to those anchors.
- Locale state can start as a documented migration gap during Code Round but must be explicit.

## Risks And Migration Gaps

- Artifact retention is not yet a complete contract; rollback Code Round must not overclaim.
- Existing deployment status/event names still include migration seams around canonical terminal
  events.
- `deployments.create` still has acceptance-first migration gaps in current implementation.
- Stateful data rollback is intentionally out of scope and must be prominent in UI/CLI/docs.
- Public write commands must not be enabled before readiness, errors, tests, and docs are aligned.

## Code Round Readiness

The first **readiness query** Code Round is complete for the read-only slice. The active operation
is implemented through application query service/handler, operation catalog, HTTP/oRPC, CLI, Web
deployment detail, public docs/help registry, and targeted tests.

Write command Code Rounds should follow only after the readiness query remains stable and retention
metadata is sufficient.
