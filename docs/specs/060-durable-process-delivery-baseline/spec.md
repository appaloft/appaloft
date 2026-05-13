# Durable Process Delivery Baseline

## Status

- Round: Code Round plus Post-Implementation Sync
- Artifact state: implemented for scheduled-task, scheduled runtime prune, scheduled history
  retention durable worker bindings, plus preview cleanup, certificate issuance, certificate
  import, managed certificate revocation, proxy bootstrap, resource runtime control, source-event
  auto-deploy, dependency resource backup/restore, provider-native dependency resource
  realization/delete, deployment create execution, domain binding verification retry, and domain
  binding create operator-visible process-attempt projection, plus deployment retry execution
  operator-visible process-attempt projection and deployment rollback execution operator-visible
  process-attempt projection; broader workflow opt-in remains incremental.

## Business Outcome

Operators need accepted long-running work to survive process restarts, expose retry/dead-letter
state, and show why work is pending, failed, or blocked. Appaloft needs a small durable delivery
baseline before retry execution and production automation can depend on background work.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Durable process delivery | Outbox/inbox-equivalent delivery for accepted Appaloft work using durable process state and operation-specific workers. | Operator/Internal State | process delivery |
| Process attempt | One durable record of accepted or executing long-running work. | Operator Work | job attempt |
| Delivery claim | Atomic worker ownership of one due process attempt or delivery record. | Worker execution | claim |
| Dedupe authority | The latest durable row or delivery generation that decides whether a pending/retry-scheduled work item is still eligible. | Retry and worker admission | dedupe key |
| Retry generation | The next durable attempt or delivery generation created for retriable failed work. | Retry execution | retry attempt |
| Dead letter | Terminal manual-review state that stops automatic retry selection. | Operator repair | dead-lettered work |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| PROC-DELIVERY-001 | Accepted work creates durable delivery state | a command accepts long-running work | the use case returns `ok` | a durable process attempt exists with attempt id, operation key, kind, status, related ids, correlation/request ids, and safe details. |
| PROC-DELIVERY-002 | Atomic worker claim | one due attempt is visible to two workers | both try to claim it | exactly one claim succeeds and the other observes already-claimed or not-due state. |
| PROC-DELIVERY-003 | Dedupe authority blocks stale retries | an older retry-scheduled attempt shares a dedupe key with a newer terminal attempt | retry selection runs | the older attempt is skipped and no worker executes it. |
| PROC-DELIVERY-004 | Retriable failure is operator-visible | a selected durable worker or projection binding records a retriable async failure | retry policy or workflow ownership allows another attempt | durable workers record `retry-scheduled` with `nextEligibleAt`; projection-only bindings record retriable failed visibility with stable error fields and operator repair actions until a governed worker owns retry execution. |
| PROC-DELIVERY-005 | Terminal failure is visible | a worker records non-retriable failure | the operator lists work | work appears failed with safe error code/category/phase and no secret-bearing details. |
| PROC-DELIVERY-006 | Manual retry starts executable work only through governed worker | an operator invokes `operator-work.retry` | the target workflow lacks a durable worker | Appaloft creates only a pending retry annotation and does not execute provider/runtime work. |
| PROC-DELIVERY-007 | Dead-letter stops automatic retry | an operator dead-letters retry-scheduled work | retry selection runs | the work is not selected and remains visible for manual review. |
| PROC-DELIVERY-008 | Recovery annotations do not mutate business state | an operator marks work recovered | related deployment/resource/server/runtime state exists | only process attempt state changes unless a workflow-specific recovery command governs further mutation. |
| PROC-DELIVERY-009 | Entrypoints stay CQRS-thin | CLI or HTTP exposes delivery control | a user acts | adapters dispatch command/query messages and never call process repositories or workers directly. |
| PROC-DELIVERY-010 | Retry generation creates next pending delivery | a selected workflow has a due `retry-scheduled` attempt | retry generation runs | persistence atomically creates the next pending attempt with a fresh attempt id, safe lineage, preserved operation/resource context, retry-specific dedupe authority, and clears retry eligibility on the source attempt. |
| PROC-DELIVERY-011 | Generated retry is drained by the selected worker | a scheduled-task retry generation is pending | the scheduled-task runner ticks | the runner passes the generated pending attempt to the scheduled-task worker with `processAttemptId`/`workerId`, and runtime work still starts only after the worker claim succeeds. |

## Domain Ownership

- Bounded context: Operator/Internal State.
- Aggregate/resource owner: process attempt journal and operation-specific process managers own
  delivery state; business aggregates own their own invariants.
- Upstream/downstream contexts: deployment, runtime target, certificate, source event, scheduled
  task, preview cleanup, provider resource, and remote-state workflows may opt in through local
  specs.

## Public Surfaces

- API: existing `operator-work.*` operations expose visibility and manual annotations. Future
  workflow-specific retry workers may expose no new public endpoint if they consume existing pending
  attempts.
- CLI: existing `appaloft work ...` commands remain the operator control surface.
- Web/UI: operator work surfaces may show status; workflow-specific execution controls remain
  future unless governed by local specs.
- Config: no repository config fields in this slice.
- Events: no global event-sourcing or event-retention change in this slice.
- Public docs/help: existing `operator.work-ledger` help anchor covers operator-visible delivery
  state; workflow pages must link to it when they opt in.

## Non-Goals

- Generic event sourcing.
- A global message broker abstraction.
- Automatic durable conversion of every current in-memory event handler.
- Provider/runtime cancellation beyond process state annotation.
- Legal holds, immutable archives, global audit/event export, or organization retention defaults.

## Current Binding And Open Questions

- Scheduled task run delivery is the first durable worker binding. It records accepted work,
  claims due attempts, completes success/retry-scheduled state, generates pending retry delivery
  attempts, and drains generated attempts through the scheduled-task worker.
- Scheduled runtime prune is the second durable worker binding. It records accepted maintenance
  work, claims the durable attempt, dispatches `servers.capacity.prune` through the command bus,
  completes success/retry-scheduled state, and exposes safe operator-work visibility. It creates a
  fresh scheduled maintenance attempt per policy tick rather than using generic retry generation.
- Scheduled history retention is the third durable worker binding. It records scheduled retention
  category work, claims the durable attempt, dispatches existing manual history prune commands
  through the command bus, completes success/retry-scheduled state, and preserves each
  category-specific retention guard. It creates fresh scheduled attempts from retention-default
  policy ticks rather than using generic retry generation.
- Preview cleanup is the fourth operator-visible process-attempt binding. Product-grade preview
  cleanup records every cleanup attempt outcome into the process attempt journal with stable
  preview cleanup dedupe authority, safe preview scope details, retry-scheduled failure visibility,
  and `operator-work.*` read/repair visibility. Its retry scheduler still reads the existing
  `preview_cleanup_attempts` store and runs under the `preview-lifecycle` mutation-coordinator
  lease rather than process-attempt atomic claim/completion; converting that scheduler to a full
  process-attempt worker remains a future opt-in slice.
- Certificate issuance is the fifth operator-visible process-attempt binding. Certificate request,
  provider issuance, success, and retry-scheduled provider failure states are recorded into the
  process attempt journal with certificate/domain-binding ids, safe certificate context, and
  `operator-work.*` read/repair visibility. The existing certificate retry scheduler still reads
  certificate aggregate attempt state and dispatches a fresh `certificates.issue-or-renew` request
  rather than consuming process-attempt atomic claim/completion. Public `certificates.retry` also
  delegates to the same issue/renew path, so the resulting retry attempt is operator-visible under
  `certificates.issue-or-renew`; it does not create a separate `certificates.retry` process-attempt
  row or worker binding.
- Certificate import is the sixth operator-visible process-attempt binding. `certificates.import`
  records successful manual import attempts into the process attempt journal with
  certificate/domain-binding ids, safe manual-import metadata, imported certificate expiry, and
  `operator-work.*` read/repair visibility without exposing PEM, private-key, or passphrase
  material. Manual import succeeds or fails inline through the command use case and does not
  consume process-attempt atomic claim/completion.
- Managed certificate revocation is the seventh operator-visible process-attempt binding.
  `certificates.revoke` records running, succeeded, and failed managed provider revocation attempts
  into the process attempt journal with certificate/domain-binding ids, safe provider/domain/
  fingerprint context, async-processing failure category, retriable provider-failure visibility,
  and `operator-work.*` read/repair visibility. Imported certificate revocation remains
  Appaloft-local lifecycle state without provider work. Managed revocation still executes inline
  through the command use case rather than process-attempt atomic claim/completion.
- Proxy bootstrap is the eighth operator-visible process-attempt binding. `servers.bootstrap-proxy`
  records running, succeeded, and failed proxy bootstrap attempts into the process attempt journal
  with server id, stable proxy-bootstrap dedupe authority, safe proxy/provider/reason details,
  async-processing failure category, retriable classification, and `operator-work.*` read/repair
  visibility. Proxy repair still executes inline through the existing command path and event-driven
  post-register bootstrap remains best-effort; neither path consumes process-attempt atomic
  claim/completion as a durable worker yet.
- Resource runtime control is the ninth operator-visible process-attempt binding.
  `resources.runtime.stop`, `resources.runtime.start`, and `resources.runtime.restart` record
  running, succeeded, and failed runtime-control attempts into the process attempt journal with
  Resource, Deployment, and server ids, stable runtime-control dedupe authority, safe
  operation/runtime/target details, async-processing failure category, retriable classification,
  and `operator-work.*` read/repair visibility. Runtime-control execution still runs inline through
  the command use case after the runtime-control attempt is persisted; it does not consume
  process-attempt atomic claim/completion as a durable worker yet.
- Source-event auto-deploy is the tenth operator-visible process-attempt binding.
  `source-events.ingest` records accepted source-event ingestion and final dispatch success/failure
  into the process attempt journal with the source event id, stable source-event dedupe authority,
  single Resource/Deployment ids when the event matches exactly one target, safe source metadata,
  async-processing failure category, retriable dispatch-failure visibility, and `operator-work.*`
  read/repair visibility. Source-event dedupe and deployment dispatch still use the existing
  source-event record plus inline dispatcher path; source-event auto-deploy does not consume
  process-attempt atomic claim/completion as a durable worker yet.
- Dependency resource backup/restore is the eleventh operator-visible process-attempt binding.
  `dependency-resources.create-backup` and `dependency-resources.restore-backup` record running,
  succeeded, and failed provider backup/restore attempts into the process attempt journal with
  backup/restore attempt ids, stable dependency-resource backup/restore dedupe authority, safe
  dependency kind/provider/backup metadata, async-processing failure category, retriable provider
  failure visibility, and `operator-work.*` read/repair visibility. Provider backup and restore
  still execute inline through the existing command use cases after `DependencyResourceBackup`
  state is persisted; they do not consume process-attempt atomic claim/completion as durable
  workers yet.
- Provider-native dependency resource realization/delete is the twelfth operator-visible
  process-attempt binding. `dependency-resources.provision-postgres`,
  `dependency-resources.provision-redis`, and provider-managed
  `dependency-resources.delete` record running, succeeded, and failed provider realization/delete
  attempts into the process attempt journal with ResourceInstance realization/delete attempt ids,
  stable dependency-resource realization/delete dedupe authority, safe dependency kind/provider
  metadata, async-processing failure category, retriable provider failure visibility, and
  `operator-work.*` read/repair visibility. Provider realization and cleanup still execute inline
  through the existing command use cases after `ResourceInstance` realization state is persisted;
  they do not consume process-attempt atomic claim/completion as durable workers yet.
- Deployment create execution is the thirteenth operator-visible process-attempt binding.
  `deployments.create` records running, succeeded, and failed deployment execution projections into
  the process attempt journal with Deployment, Resource, server, runtime plan, target backend, and
  safe failure phase/step details. Deployment execution still runs inline through the existing
  create use case after deployment admission and start state are persisted; it does not consume
  process-attempt atomic claim/completion as a durable deployment worker yet.
- Domain binding verification retry is the fourteenth operator-visible process-attempt binding.
  `domain-bindings.retry-verification` records each new ownership verification attempt into the
  process attempt journal with DomainBinding, Resource, and server ids, stable verification dedupe
  authority, safe domain/DNS expectation details, and `operator-work.*` read/repair visibility.
  DNS recheck, certificate retry, route repair, deployment retry, redeploy, and rollback remain
  separate governed workflows; verification retry does not consume process-attempt atomic
  claim/completion as a durable worker yet.
- Domain binding create is the fifteenth operator-visible process-attempt binding.
  `domain-bindings.create` records the initial ownership verification attempt into the process
  attempt journal with DomainBinding, Resource, and server ids, stable verification dedupe
  authority, safe domain/DNS expectation details, and `operator-work.*` read/repair visibility.
  Idempotency replays return the existing binding without creating duplicate process rows. DNS
  recheck, ownership confirmation, certificate issuance/import, route repair, deployment retry,
  redeploy, and rollback remain separate governed workflows; domain binding create does not consume
  process-attempt atomic claim/completion as a durable worker yet.
- Deployment retry execution is the sixteenth operator-visible process-attempt binding.
  `deployments.retry` records running, succeeded, and failed retry deployment execution projections
  into the process attempt journal with Deployment, Resource, server, runtime plan, target backend,
  source deployment lineage, and safe failure phase/step details. Retry execution still runs inline
  through the retry use case after retry admission/start state is persisted; it does not consume
  process-attempt atomic claim/completion as a durable deployment worker yet. `deployments.redeploy`
  already delegates through `deployments.create` and uses the create-deployment projection path
  with operation key `deployments.redeploy`.
- Deployment rollback execution is the seventeenth operator-visible process-attempt binding.
  `deployments.rollback` records running, succeeded, and failed rollback deployment execution
  projections into the process attempt journal with Deployment, Resource, server, runtime plan,
  target backend, source deployment lineage, rollback candidate lineage, and safe failure phase/step
  details. Rollback execution still runs inline through the rollback use case after rollback
  admission/start state is persisted; it does not consume process-attempt atomic claim/completion
  as a durable deployment worker yet.
- Other long-running workflows remain future opt-in slices.
- Retry policy defaults remain workflow-local before 1.0; the scheduled-task first binding uses the
  existing retry-scheduled process attempt timing and does not introduce organization-level retry
  defaults.
