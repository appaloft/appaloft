# Durable Process Delivery Test Matrix

This matrix governs the outbox/inbox-equivalent durable process delivery baseline for accepted
long-running Appaloft work. It does not govern legal holds, immutable archives, global audit/event
export, or automatic conversion of every current in-memory event handler.

| Test ID | Scenario | Layer | Automation |
| --- | --- | --- | --- |
| PROC-DELIVERY-001 | Accepted long-running work records a durable process attempt with stable attempt id, operation key, kind, related ids, correlation/request ids, status, and safe details before returning accepted success. | Application | Passing first workflow binding: `packages/application/test/scheduled-task-run-now.test.ts` proves scheduled-task run admission records a pending durable process attempt with stable operation key, dedupe key, request/correlation ids, related ids, and safe details before returning accepted success. Second workflow binding: `packages/application/test/scheduled-runtime-prune.test.ts`, `packages/persistence/pg/test/scheduled-runtime-prune-policy-read-model.pglite.test.ts`, and `apps/shell/test/scheduled-runtime-prune-runner.test.ts` prove scheduled runtime prune records durable process attempts before dispatching runtime maintenance work. Third workflow binding: `packages/application/test/scheduled-history-retention.test.ts` and `apps/shell/test/scheduled-history-retention-runner.test.ts` prove scheduled history retention records durable process attempts before dispatching retained-history prune commands. Runtime monitoring collector coverage in `packages/application/test/runtime-monitoring-collector.test.ts` proves retained sample collection records a pending runtime-maintenance process attempt with stable operation key, dedupe key, request/correlation ids, safe scope details, and no raw runtime output; `apps/shell/test/runtime-monitoring-collector-runner.test.ts` proves the disabled-by-default shell runner selects active server/resource/deployment/project/environment targets before dispatching collection. Fourth operator-visible binding: `packages/application/test/product-grade-preview-policy.test.ts` proves product-grade preview cleanup records successful cleanup attempts into the process attempt journal with stable preview cleanup dedupe keys, request/correlation ids, related Resource id, safe preview scope details, and no secret or provider error text. Fifth operator-visible binding: `packages/application/test/issue-or-renew-certificate.test.ts` proves `certificates.issue-or-renew` records accepted certificate requests into the process attempt journal with stable operation key, dedupe key, request/correlation ids, project/resource/server/domain-binding/certificate ids, and safe certificate context. Sixth operator-visible binding: `packages/application/test/import-certificate.test.ts` proves `certificates.import` records successful manual imports into the process attempt journal with stable attempt id, request/correlation ids, project/resource/server/domain-binding/certificate ids, safe manual-import context, and no PEM/private-key material. Seventh operator-visible binding: `packages/application/test/issue-or-renew-certificate.test.ts` proves managed `certificates.revoke` records running and succeeded provider revocation attempts with stable attempt id, operation key, dedupe key, request/correlation ids, related certificate/domain-binding ids, safe provider/domain/fingerprint context, and no private-key material. Eighth operator-visible binding: `packages/application/test/bootstrap-server-proxy.test.ts` proves `servers.bootstrap-proxy` records running and succeeded proxy bootstrap attempts with stable operation key, dedupe key, request/correlation ids, related server id, and safe proxy context. Ninth operator-visible binding: `packages/application/test/resource-runtime-control.test.ts` proves `resources.runtime.stop` records running and succeeded runtime-control attempts with stable operation key, dedupe key, request/correlation ids, related Resource/Deployment/server ids, and safe runtime context. Tenth operator-visible binding: `packages/application/test/source-events.test.ts` proves `source-events.ingest` records accepted and dispatched source-event auto-deploy attempts with stable source-event dedupe key, request/correlation ids, related Resource/Deployment ids when singular, and safe source/ref context. Eleventh journal-capable binding: `packages/application/test/dependency-resource-backup-restore.test.ts` proves `dependency-resources.create-backup` and `dependency-resources.restore-backup` record pending provider attempts, claim and complete them when process journal ports are available, and preserve stable dependency-resource backup/restore dedupe keys, request/correlation ids, and safe dependency/provider context. Twelfth operator-visible binding: `packages/application/test/postgres-dependency-resource-lifecycle.test.ts` proves provider-native `dependency-resources.provision` and managed `dependency-resources.delete` record running and succeeded provider realization/delete attempts with stable dependency-resource realization/delete dedupe keys, request/correlation ids, and safe dependency/provider context. Thirteenth operator-visible binding: `packages/application/test/create-deployment.test.ts` proves `deployments.create` records running and succeeded deployment execution projections with stable deployment dedupe key, request/correlation ids, related Deployment/Resource/server ids, runtime plan and target backend details, and no raw runtime output. Fourteenth operator-visible binding: `packages/application/test/domain-binding-lifecycle.test.ts` proves `domain-bindings.retry-verification` records accepted ownership verification retry attempts with stable domain-verification dedupe key, request/correlation ids, related DomainBinding/Resource/server ids, safe domain/DNS expectation details, and no provider raw payload or secret material. Fifteenth operator-visible binding: `packages/application/test/create-domain-binding.test.ts` proves `domain-bindings.create` records initial ownership verification attempts with stable domain-verification dedupe key, request/correlation ids, related DomainBinding/Resource/server ids, safe domain/DNS expectation details, no duplicate process row on idempotency replay, and no provider raw payload or secret material. Sixteenth operator-visible binding: `packages/application/test/deployment-retry-redeploy.test.ts` proves `deployments.retry` records running and succeeded retry execution projections with stable deployment dedupe key, request/correlation ids, related Deployment/Resource/server ids, runtime plan, target backend, source deployment lineage, and no raw runtime output. Seventeenth operator-visible binding: `packages/application/test/deployment-rollback.test.ts` proves `deployments.rollback` records running and succeeded rollback execution projections with stable deployment dedupe key, request/correlation ids, related Deployment/Resource/server ids, runtime plan, target backend, source deployment lineage, rollback candidate lineage, and no raw runtime output. |
| PROC-DELIVERY-002 | Atomic worker claim allows exactly one worker to own a due attempt or delivery generation. | Persistence/pg + application + shell | Passing: `packages/persistence/pg/test/process-attempt-journal.pglite.test.ts` covers due delivery candidate selection plus due, duplicate, future, terminal, and missing claim outcomes. First workflow binding: `apps/shell/test/scheduled-task-runner.test.ts` proves due scheduled-task durable attempts are passed to the worker; `packages/application/test/scheduled-task-run-worker.test.ts` proves scheduled-task runtime execution is skipped when the durable claim is refused. Second workflow binding: `packages/application/test/scheduled-runtime-prune.test.ts`, `packages/persistence/pg/test/scheduled-runtime-prune-policy-read-model.pglite.test.ts`, and `apps/shell/test/scheduled-runtime-prune-runner.test.ts` prove scheduled runtime prune uses durable process claim/completion handoff before dispatching `servers.capacity.prune`. Third workflow binding: `packages/application/test/scheduled-history-retention.test.ts` proves scheduled history retention uses durable process claim/completion handoff before dispatching manual history prune commands or direct retention stores; `apps/shell/test/scheduled-history-retention-runner.test.ts` proves the disabled-by-default shell runner delegates to that service. Runtime monitoring collector coverage in `packages/application/test/runtime-monitoring-collector.test.ts` proves collection uses durable process claim/completion handoff before writing retained samples; `apps/shell/test/runtime-monitoring-collector-runner.test.ts` proves the disabled-by-default shell runner delegates active server/resource/deployment/project/environment targets to that service. Dependency resource backup/restore coverage in `packages/application/test/dependency-resource-backup-restore.test.ts` proves provider backup and restore attempts use pending records, process-attempt claim, and process-attempt completion when journal ports are available. |
| PROC-DELIVERY-003 | Retry candidate selection treats the latest row for a dedupe key as authority and skips stale retry-scheduled attempts. | Persistence/pg + application | Passing persistence boundary: `packages/persistence/pg/test/process-attempt-journal.pglite.test.ts` proves due retry selection skips stale retry-scheduled work when dedupe authority advances. |
| PROC-DELIVERY-004 | Retriable async failure records durable-worker retry scheduling or projection-only retriable failure visibility with stable error code/category/phase and operator repair actions. | Persistence/pg + application | Passing persistence boundary: `packages/persistence/pg/test/process-attempt-journal.pglite.test.ts` covers claimed-attempt completion as retry-scheduled with safe details. First workflow binding: `packages/application/test/scheduled-task-run-worker.test.ts` proves scheduled-task runtime failure completes the durable process attempt as retry-scheduled. Second workflow binding: `packages/application/test/scheduled-runtime-prune.test.ts` proves scheduled runtime prune command failure records retry-scheduled process state. Third workflow binding: `packages/application/test/scheduled-history-retention.test.ts` proves scheduled history retention command failure records retry-scheduled process state, and `apps/shell/test/scheduled-history-retention-runner.test.ts` proves the runner logs safe failed service results. Runtime monitoring collector coverage in `packages/application/test/runtime-monitoring-collector.test.ts` proves runtime usage inspection failure records retry-scheduled process state with safe scope details; `apps/shell/test/runtime-monitoring-collector-runner.test.ts` proves the runner logs safe failed collector results without stopping the tick. Fourth operator-visible binding: `packages/application/test/product-grade-preview-policy.test.ts` proves retryable preview cleanup failures record retry-scheduled process attempts with stable error code/category/phase, next retry time, safe preview scope details, and operator repair actions. Fifth operator-visible binding: `packages/application/test/issue-or-renew-certificate.test.ts` proves retryable certificate provider failures record retry-scheduled process attempts with stable error code/category/phase and safe certificate context without provider error text or PEM material. Sixth operator-visible binding: `packages/application/test/issue-or-renew-certificate.test.ts` proves managed certificate revocation provider failures record failed process attempts with stable error code/category/phase, diagnostic/manual-review actions, safe provider/domain/fingerprint context, and no raw provider failure text. Seventh operator-visible binding: `packages/application/test/bootstrap-server-proxy.test.ts` proves retriable proxy bootstrap failures record stable error code/category/phase, diagnostic/manual-review actions, safe proxy context, and no raw provider failure text. Eighth operator-visible binding: `packages/application/test/resource-runtime-control.test.ts` proves runtime-control adapter failures record stable error code/category/phase, diagnostic/manual-review actions, safe runtime context, and no raw adapter output. Ninth operator-visible binding: `packages/application/test/source-events.test.ts` proves source-event dispatch failures record stable error code/category/phase, diagnostic/manual-review actions, safe source/ref context, and no raw provider failure text. Tenth operator-visible binding: `packages/application/test/dependency-resource-backup-restore.test.ts` proves provider backup and restore failures record stable error code/category/phase, diagnostic/manual-review actions, safe dependency/provider context, and no raw provider failure text. Eleventh operator-visible binding: `packages/application/test/postgres-dependency-resource-lifecycle.test.ts` proves provider-native realization/delete failures record stable error code/category/phase, diagnostic/manual-review actions, safe dependency/provider context, and no raw provider failure text. Twelfth operator-visible binding: `packages/application/test/create-deployment.test.ts` proves post-acceptance deployment execution failure records stable error code/category/phase/step, diagnostic/manual-review actions, safe deployment/runtime context, and no raw provider output. Thirteenth and fourteenth deployment recovery bindings: `packages/application/test/deployment-retry-redeploy.test.ts` and `packages/application/test/deployment-rollback.test.ts` prove post-acceptance retry and rollback execution failures record stable error code/category/phase/step, diagnostic/manual-review actions, safe deployment/runtime/lineage context, and no raw provider output. |
| PROC-DELIVERY-005 | Non-retriable terminal async failure records failed state and safe operator-work visibility without leaking raw provider payloads, shell output, secrets, or environment values. | Persistence/pg + application | Passing persistence boundary: `packages/persistence/pg/test/process-attempt-journal.pglite.test.ts` covers claimed-attempt terminal failure, non-running refusal, missing refusal, and safe detail redaction. Second workflow binding: `packages/persistence/pg/test/scheduled-runtime-prune-policy-read-model.pglite.test.ts` proves scheduled runtime prune durable process handoff persists only safe policy and prune counts. Third workflow binding: `packages/application/test/scheduled-history-retention.test.ts` proves scheduled history retention persists safe category dispatch and skipped-category details. |
| PROC-DELIVERY-006 | `operator-work.retry` creates only a pending retry annotation until the selected workflow has a governed durable worker; it does not execute provider/runtime work by itself. | Application | Passing: `packages/application/test/operator-work-retry.test.ts` proves scheduled-task durable work retry creates only a fresh pending process attempt with safe lineage and no stale runtime failure fields. |
| PROC-DELIVERY-007 | Dead-lettered attempts are excluded from automatic retry selection and remain visible for manual review. | Application + persistence | Passing persistence boundary: `packages/persistence/pg/test/process-attempt-journal.pglite.test.ts` proves dead-lettering clears stale retry fields, preserves manual-review state, and excludes the row from due retry selection. Application dead-letter admission is covered by `packages/application/test/operator-work-dead-letter.test.ts`. |
| PROC-DELIVERY-008 | Mark-recovered and cancel annotations mutate only durable process attempt state unless a workflow-specific recovery/cancel command governs business-state mutation. | Application | Passing: `packages/application/test/operator-work-mark-recovered.test.ts` and `packages/application/test/operator-work-cancel.test.ts` prove scheduled-task durable work annotations update only process-attempt state and do not carry stale runtime failure fields forward. |
| PROC-DELIVERY-009 | CLI and HTTP/oRPC delivery controls dispatch command/query messages through buses and never call process repositories or workers directly. | CLI + HTTP/oRPC | Passing: `packages/adapters/cli/test/operator-work-command.test.ts` and `packages/orpc/test/operator-work.http.test.ts` prove `operator-work.mark-recovered`, `operator-work.dead-letter`, `operator-work.cancel`, `operator-work.retry`, and `operator-work.prune` dispatch through the CLI and HTTP/oRPC command buses with shared command schemas. `packages/application/test/operation-catalog-boundary.test.ts` proves the same delivery-control operations are active catalog entries with CLI and HTTP/oRPC transports. |
| PROC-DELIVERY-010 | Worker retry generation creates a fresh pending delivery attempt from a due retry-scheduled source while preserving safe lineage and clearing source retry eligibility. | Persistence/pg + shell | Passing: `packages/persistence/pg/test/process-attempt-journal.pglite.test.ts` proves generated retry rows are fresh, source rows no longer remain retry-eligible, advanced dedupe authority is not regenerated, unsafe details are redacted, and generated pending rows are due delivery candidates. |
| PROC-DELIVERY-011 | Scheduled-task retry generations are drained through the same durable worker handoff as accepted runs. | Shell | Passing: `apps/shell/test/scheduled-task-runner.test.ts` proves the runner generates due scheduled-task retry attempts, dedupes generated/query handoff rows, and dispatches the generated pending attempt with `processAttemptId`/`workerId`. |

## Implemented Workflow Bindings

- Scheduled-task runs are the first durable worker binding. They cover accepted run recording,
  atomic claim, completion, retry scheduling, retry generation, and generated retry handoff.
- Scheduled runtime prune is the second durable worker binding. It covers accepted maintenance
  recording, atomic claim/completion handoff, command-bus dispatch of `servers.capacity.prune`,
  retry-scheduled failure visibility, safe persisted details, and shell policy discovery/dispatch.
  It does not add generic retry generation because scheduled runtime prune creates a fresh scheduled
  maintenance attempt per policy tick.
- Scheduled history retention is the third durable worker binding. It covers accepted scheduled
  retention category recording, atomic claim/completion handoff, command-bus dispatch of existing
  manual history prune commands or governed direct retention stores, retry-scheduled failure
  visibility, safe persisted details, skipped unsupported-category visibility, and
  disabled-by-default shell runner dispatch. It does
  not add generic retry generation because scheduled history retention creates fresh attempts from
  retention-default policy ticks.
- Preview cleanup is the fourth process-attempt worker binding. It covers successful and
  retry-scheduled preview cleanup outcome projection into the process attempt journal with stable
  dedupe keys, safe preview scope details, and `operator-work.*` visibility. Its retry scheduler
  now generates due retry attempts from the process attempt journal and executes cleanup only after
  atomic process-attempt claim/completion; preview cleanup attempt rows remain compatibility cleanup
  history.
- Certificate issuance is the fifth operator-visible process-attempt binding. It covers accepted,
  running, succeeded, and retry-scheduled certificate issuance projection into the process attempt
  journal with stable dedupe keys, certificate/domain-binding ids, safe certificate context, and
  `operator-work.*` visibility. Its retry scheduler remains governed by certificate aggregate
  attempt state rather than process-attempt atomic claim/completion.
- Certificate import is the sixth operator-visible process-attempt binding. It covers successful
  `certificates.import` manual import projection into the process attempt journal with stable
  attempt ids, certificate/domain-binding ids, safe manual-import metadata, and no PEM,
  private-key, or passphrase material. Manual import execution remains inline through the command
  use case rather than process-attempt atomic claim/completion.
- Managed certificate revocation is the seventh operator-visible process-attempt binding. It covers
  running, succeeded, and failed `certificates.revoke` projection into the process attempt journal
  for managed provider revocation, with stable dedupe keys, certificate/domain-binding ids, safe
  provider/domain/fingerprint context, async-processing failure category, retriable
  provider-failure classification, and `operator-work.*` visibility. Imported certificate
  revocation remains Appaloft-local lifecycle state without provider work.
- Proxy bootstrap is the eighth operator-visible process-attempt binding. It covers running,
  succeeded, and failed `servers.bootstrap-proxy` projection into the process attempt journal with
  stable dedupe keys, server ids, safe proxy/provider/reason details, async-processing failure
  category, retriable classification, and `operator-work.*` visibility. Proxy repair still runs
  inline through the command use case and post-register bootstrap remains event-driven rather than
  process-attempt atomic claim/completion.
- Resource runtime control is the ninth operator-visible process-attempt binding. It covers
  running, succeeded, and failed `resources.runtime.stop`, `resources.runtime.start`, and
  `resources.runtime.restart` projection into the process attempt journal with stable dedupe keys,
  Resource/Deployment/server ids, safe operation/runtime/target details, async-processing failure
  category, retriable classification, and `operator-work.*` visibility. Runtime-control execution
  still runs inline through the command use case rather than process-attempt atomic
  claim/completion.
- Source-event auto-deploy is the tenth operator-visible process-attempt binding. It covers
  accepted, dispatched, and failed `source-events.ingest` projection into the process attempt
  journal with stable source-event dedupe keys, safe source/ref/verification details, singular
  Resource/Deployment ids when applicable, async-processing failure category, retriable dispatch
  failure classification, and `operator-work.*` visibility. Source-event deployment dispatch still
  runs inline from the source-event command path rather than process-attempt atomic
  claim/completion.
- Dependency resource backup/restore is the eleventh operator-visible process-attempt binding. It
  covers running, succeeded, and failed `dependency-resources.create-backup` and
  `dependency-resources.restore-backup` projection into the process attempt journal with stable
  dependency-resource backup/restore dedupe keys, safe dependency kind/provider/backup details,
  async-processing failure category, retriable provider failure classification, and
  `operator-work.*` visibility. Provider backup/restore execution still runs inline through the
  command use cases, but consumes process-attempt atomic claim/completion when a process journal is
  available; `packages/application/test/dependency-resource-backup-restore.test.ts` covers the
  pending, claim, and completion handoff.
- Provider-native dependency resource realization/delete is the twelfth operator-visible
  process-attempt binding. It covers running, succeeded, and failed
  `dependency-resources.provision` and provider-managed `dependency-resources.delete` projection
  into the process attempt journal with
  stable dependency-resource realization/delete dedupe keys, safe dependency kind/provider
  details, async-processing failure category, retriable provider failure classification, and
  `operator-work.*` visibility. Provider realization/delete execution still runs inline through
  the command use cases rather than process-attempt atomic claim/completion.
- Deployment create execution is the thirteenth operator-visible process-attempt binding. It covers
  running, succeeded, and failed `deployments.create` execution projection into the process attempt
  journal with stable deployment dedupe keys, Deployment/Resource/server ids, safe runtime
  plan/target backend details, async-processing failure category, retriable runtime failure
  classification, and `operator-work.*` visibility. Deployment execution still runs inline through
  the create use case rather than process-attempt atomic claim/completion.
- Domain binding verification retry is the fourteenth operator-visible process-attempt binding. It
  covers accepted `domain-bindings.retry-verification` projection into the process attempt journal
  with stable domain-verification dedupe keys, DomainBinding/Resource/server ids, safe domain/DNS
  expectation details, and `operator-work.*` visibility. DNS recheck, certificate retry, route
  repair, deployment retry, redeploy, and rollback remain separate governed workflows; verification
  retry does not consume process-attempt atomic claim/completion.
- Domain binding create is the fifteenth operator-visible process-attempt binding. It covers
  initial `domain-bindings.create` ownership verification attempt projection into the process
  attempt journal with stable domain-verification dedupe keys, DomainBinding/Resource/server ids,
  safe domain/DNS expectation details, idempotency replay dedupe, and `operator-work.*`
  visibility. DNS recheck, ownership confirmation, certificate issuance/import, route repair,
  deployment retry, redeploy, and rollback remain separate governed workflows; domain binding
  create does not consume process-attempt atomic claim/completion.
- Deployment retry execution is the sixteenth operator-visible process-attempt binding. It covers
  running, succeeded, and failed `deployments.retry` execution projection into the process attempt
  journal with stable deployment dedupe keys, Deployment/Resource/server ids, safe runtime
  plan/target backend details, source deployment lineage, async-processing failure category,
  retriable runtime failure classification, and `operator-work.*` visibility. Retry execution still
  runs inline through the retry use case rather than process-attempt atomic claim/completion.
  `deployments.redeploy` already delegates through `deployments.create` and uses the
  create-deployment projection path with operation key `deployments.redeploy`.
- Deployment rollback execution is the seventeenth operator-visible process-attempt binding. It
  covers running, succeeded, and failed `deployments.rollback` execution projection into the
  process attempt journal with stable deployment dedupe keys, Deployment/Resource/server ids, safe
  runtime plan/target backend details, source deployment lineage, rollback candidate lineage,
  async-processing failure category, retriable runtime failure classification, and
  `operator-work.*` visibility. Rollback execution still runs inline through the rollback use case
  rather than process-attempt atomic claim/completion.

## Out Of Scope

- Generic event sourcing.
- Global message broker selection.
- Domain event stream retention.
- Legal hold, immutable archive, organization retention defaults, and global audit export.
- Workflow-specific runtime/provider cancellation unless the workflow spec governs it.
