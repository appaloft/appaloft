# Plan: Durable Process Delivery Baseline

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-028, ADR-029, ADR-037, ADR-038, ADR-039, ADR-054
- Global contracts:
  - `docs/architecture/async-lifecycle-and-acceptance.md`
  - `docs/architecture/adapter-command-query-boundary.md`
  - `docs/errors/model.md`
  - `docs/errors/neverthrow-conventions.md`
- Local specs:
  - `docs/specs/010-operator-work-ledger/spec.md`
  - workflow-specific specs when a workflow opts in
- Test matrix: `docs/testing/durable-process-delivery-test-matrix.md`

## Architecture Approach

- Domain/application placement: process delivery commands, queries, use cases, and worker-facing
  ports live in `packages/application`; workflow-specific process managers coordinate durable
  state and runtime/provider ports after admission.
- Repository/specification/visitor impact: persistence owns atomic claim, dedupe, retry selection,
  retry generation across delivery generations, and safe row serialization. Core aggregates do not
  import outbox, worker, or database types.
- Event/CQRS/read-model impact: commands accept work and create durable attempts; queries read
  operator work state; workers mutate only delivery/process state plus workflow-owned state under
  local specs. In-memory events remain best-effort until a workflow has durable delivery.
- Entrypoint impact: public operator controls remain `operator-work.*`; adapters dispatch buses and
  never claim work directly.
- Persistence/migration impact: extend or complement `process_attempts` only when Test-First Round
  proves existing columns cannot support atomic claim/delivery generation safely.

## Roadmap And Compatibility

- Roadmap target: Phase 9 operator/internal state closure for `0.11.0`.
- Version target: pre-1.0 policy.
- Compatibility impact: additive internal process state and possibly additive operator read-model
  fields; no breaking public removal in this Spec Round.

## Testing Strategy

- Matrix ids: `PROC-DELIVERY-001` through `PROC-DELIVERY-011`.
- Test-first rows: application process manager tests, persistence atomic claim/dedupe tests,
  operator-work visibility tests, CLI/oRPC boundary tests if new public control appears.
- Acceptance/e2e: first workflow Code Round must prove accepted command success plus durable
  pending/running/failed/retry-scheduled visibility.
- Contract/integration/unit: persistence tests for claim races and dedupe authority; application
  tests for retry/dead-letter/cancel/recovered semantics.

## Current Implementation Notes And Migration Gaps

- `operator-work.retry` is manual annotation only until a workflow-specific worker consumes the
  pending retry attempt. The scheduled-task worker is the first selected binding for generated
  retry attempts.
- Scheduled runtime prune is the second selected durable worker binding. It records accepted
  maintenance work, claims and completes process attempts, dispatches `servers.capacity.prune`
  through the command bus, and records retry-scheduled failure visibility. It relies on policy
  ticks for fresh attempts rather than generic retry generation.
- Scheduled history retention is the third selected durable worker binding. It records scheduled
  retention category work, claims and completes process attempts, dispatches existing manual
  history prune commands through the command bus, and records retry-scheduled failure visibility.
  It relies on retention-default policy ticks for fresh attempts rather than generic retry
  generation.
- Preview cleanup is the fourth selected process-attempt worker binding. It mirrors product-grade
  preview cleanup outcomes into the process attempt journal with stable preview cleanup dedupe keys,
  safe preview scope details, retry-scheduled failure visibility, and operator-work read/repair
  visibility. Its retry scheduler generates due process-attempt retries, dispatches cleanup only
  after atomic process-attempt claim, and records completion through process-attempt completion;
  `preview_cleanup_attempts` remains compatibility cleanup history.
- Certificate issuance is the fifth selected operator-visible process-attempt binding. It mirrors
  certificate request, provider issuance, success, and retry-scheduled provider failure state into
  the process attempt journal with certificate/domain-binding ids and safe certificate context. Its
  retry scheduler still uses certificate aggregate attempt state and dispatches a fresh
  `certificates.issue-or-renew` request rather than process-attempt atomic claim/completion. Public
  `certificates.retry` delegates to the same issue/renew use case, so retry-created attempts use
  the `certificates.issue-or-renew` process-attempt projection path rather than a separate
  `certificates.retry` worker binding.
- Certificate import is the sixth selected operator-visible process-attempt binding. It mirrors
  successful `certificates.import` manual certificate imports into the process attempt journal with
  certificate/domain-binding ids, safe manual-import metadata, imported certificate expiry, and
  operator-work read/repair visibility. Manual import succeeds or fails inline through the command
  use case rather than process-attempt atomic claim/completion, and secret-bearing certificate
  material remains only behind the certificate secret-store boundary.
- Managed certificate revocation is the seventh selected operator-visible process-attempt binding.
  It mirrors `certificates.revoke` running, succeeded, and failed managed provider revocation
  attempts into the process attempt journal with certificate/domain-binding ids, safe
  provider/domain/fingerprint context, async-processing failure category, retriable provider
  failure classification, and operator-work read/repair visibility. Imported certificate
  revocation remains Appaloft-local lifecycle state without provider work. Managed revocation still
  runs inline through the command use case rather than process-attempt atomic claim/completion.
- Proxy bootstrap is the eighth selected operator-visible process-attempt binding. It mirrors
  `servers.bootstrap-proxy` running, succeeded, and failed attempts into the process attempt journal
  with server id, stable proxy-bootstrap dedupe keys, safe proxy/provider/reason details,
  async-processing failure category, retriable classification, and operator-work read/repair
  visibility. Proxy repair still runs inline through the command use case and post-register proxy
  bootstrap still runs from the existing event-driven handler rather than process-attempt atomic
  claim/completion.
- Resource runtime control is the ninth selected operator-visible process-attempt binding. It
  mirrors `resources.runtime.stop`, `resources.runtime.start`, and `resources.runtime.restart`
  running, succeeded, and failed attempts into the process attempt journal with Resource,
  Deployment, and server ids, stable runtime-control dedupe keys, safe operation/runtime/target
  details, async-processing failure category, retriable classification, and operator-work
  read/repair visibility. Runtime-control execution still runs inline through the command use case
  rather than process-attempt atomic claim/completion.
- Source-event auto-deploy is the tenth selected operator-visible process-attempt binding. It
  mirrors `source-events.ingest` accepted ingestion plus final dispatch success/failure into the
  process attempt journal with the source event id, stable source-event dedupe keys, safe
  source/ref/verification metadata, single Resource/Deployment ids when applicable,
  async-processing failure category, retriable dispatch-failure classification, and operator-work
  read/repair visibility. Source-event deployment dispatch still runs inline from the existing
  source-event record update path rather than process-attempt atomic claim/completion.
- Dependency resource backup/restore is the eleventh selected operator-visible process-attempt
  binding. It mirrors `dependency-resources.create-backup` and
  `dependency-resources.restore-backup` running, succeeded, and failed provider attempts into the
  process attempt journal with backup/restore attempt ids, stable dependency-resource
  backup/restore dedupe keys, safe dependency kind/provider/backup metadata, async-processing
  failure category, retriable provider failure classification, and operator-work read/repair
  visibility. Provider backup/restore execution still runs inline through the command use cases
  after `DependencyResourceBackup` state is persisted, but uses process-attempt atomic
  claim/completion when a process journal is available.
- Provider-native dependency resource realization/delete is the twelfth selected operator-visible
  process-attempt binding. It mirrors `dependency-resources.provision`,
  `dependency-resources.provision`, and provider-managed `dependency-resources.delete`
  running, succeeded, and failed provider attempts into the process attempt journal with
  ResourceInstance realization/delete attempt ids, stable dependency-resource realization/delete
  dedupe keys, safe dependency kind/provider metadata, async-processing failure category,
  retriable provider failure classification, and operator-work read/repair visibility. Provider
  realization/delete execution still runs inline through the command use cases after
  ResourceInstance realization state is persisted rather than process-attempt atomic
  claim/completion.
- Deployment create execution is the thirteenth selected operator-visible process-attempt binding. It
  mirrors `deployments.create` running, succeeded, and failed execution outcomes into the process
  attempt journal with Deployment, Resource, server, runtime plan, target backend, safe failure
  phase/step details, async-processing failure category, retriable classification, and
  operator-work read/repair visibility. Deployment execution still runs inline through the create
  use case after admission/start state is persisted rather than process-attempt atomic
  claim/completion.
- Domain binding verification retry is the fourteenth selected operator-visible process-attempt
  binding. It mirrors `domain-bindings.retry-verification` accepted verification retry attempts
  into the process attempt journal with DomainBinding, Resource, and server ids, stable
  domain-verification dedupe keys, safe domain/DNS expectation details, and operator-work
  read/repair visibility. DNS recheck, certificate retry, route repair, deployment retry,
  redeploy, and rollback remain separate governed workflows; verification retry does not consume
  process-attempt atomic claim/completion.
- Domain binding create is the fifteenth selected operator-visible process-attempt binding. It
  mirrors `domain-bindings.create` initial ownership verification attempts into the process attempt
  journal with DomainBinding, Resource, and server ids, stable domain-verification dedupe keys,
  safe domain/DNS expectation details, idempotency replay dedupe, and operator-work read/repair
  visibility. DNS recheck, ownership confirmation, certificate issuance/import, route repair,
  deployment retry, redeploy, and rollback remain separate governed workflows; domain binding
  create does not consume process-attempt atomic claim/completion.
- Deployment retry execution is the sixteenth selected operator-visible process-attempt binding. It
  mirrors `deployments.retry` running, succeeded, and failed execution outcomes into the process
  attempt journal with Deployment, Resource, server, runtime plan, target backend, source
  deployment lineage, safe failure phase/step details, async-processing failure category, retriable
  classification, and operator-work read/repair visibility. Retry execution still runs inline
  through the retry use case after admission/start state is persisted rather than process-attempt
  atomic claim/completion. `deployments.redeploy` already delegates through `deployments.create`
  and uses the create-deployment projection path with operation key `deployments.redeploy`.
- Deployment rollback execution is the seventeenth selected operator-visible process-attempt binding.
  It mirrors `deployments.rollback` running, succeeded, and failed execution outcomes into the
  process attempt journal with Deployment, Resource, server, runtime plan, target backend, source
  deployment lineage, rollback candidate lineage, safe failure phase/step details,
  async-processing failure category, retriable classification, and operator-work read/repair
  visibility. Rollback execution still runs inline through the rollback use case after
  admission/start state is persisted rather than process-attempt atomic claim/completion.
- Existing in-memory event consumers may remain best-effort until their owning workflows opt in.
- Other long-running workflows still need their own local workflow/test updates before relying on
  durable retry execution.
