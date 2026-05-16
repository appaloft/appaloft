# Operator Work Ledger Spec

## Metadata

- Behavior id: `010-operator-work-ledger`
- Round type: Code Round over a narrow Spec/Docs/Test sync
- Roadmap target: Phase 8, Operator/Internal State Closure And Interface Parity
- Operation keys: `operator-work.list`, `operator-work.show`, `operator-work.mark-recovered`,
  `operator-work.dead-letter`, `operator-work.cancel`, `operator-work.retry`,
  `operator-work.prune`
- Canonical public term: operator work ledger
- Status: active slice

## Purpose

Operators need one read-only place to see what Appaloft is doing, what recently failed, whether the
state is retry-scheduled or terminal, and which diagnostic should be run next.

This slice establishes the reusable visibility contract and narrow lifecycle mutations for durable
process attempt rows. It does not implement retry execution or runtime/provider cancellation.

## Decision Fit

No new ADR is required for this slice because the operator work lifecycle commands mutate only
durable process attempt ledger rows selected by the operator or by an explicit retention cutoff.
They do not change deployment command admission, retry policy, lifecycle ownership, runtime
execution, rollback behavior, or remote-state recovery semantics. This Code Round adds a reusable
internal durable process attempt journal so the ledger can read persisted attempt state before
falling back to existing deployment/proxy/certificate read models. Future retry execution,
runtime/provider cancellation, runtime artifact/workspace prune, and remote-state recovery
mutations remain behind ADR-016, ADR-028, ADR-029, and the async lifecycle contract.

## Scope

The implementation must expose:

- deployment attempts from `deployments.list` / deployment read-model state;
- latest proxy bootstrap visibility from server edge proxy read-model fields;
- latest certificate attempt visibility from `certificates.list`;
- durable process attempts from the internal process attempt journal when present;
- safe remote SSH state visibility for locks, migrations, backups, and recovery markers when a
  persisted or mirrored read model exists;
- safe source-link visibility from persisted source-link state;
- route-realization visibility from persisted route/access read models;
- worker, scheduler, runtime-maintenance, and job status from durable process attempts;
- safe next actions limited to diagnostics, manual review, retry hints, or no action.

The implementation may not:

- create a durable outbox/inbox table;
- retry, cancel, recover remote state, or prune runtime artifacts;
- expose raw logs, private keys, environment values, certificate material, provider-native command
  lines, or credential-bearing source locators;
- claim remote-state recovery mutations, runtime artifact prune, audit, or recovery mutations are
  covered when no persisted read model or governed command exists yet.

## Acceptance

- `operator-work.list` returns `operator-work.list/v1` with filterable work items.
- `operator-work.show` returns `operator-work.show/v1` for one visible work item id.
- `operator-work.mark-recovered` marks only a durable process attempt with status `failed`,
  `retry-scheduled`, or `dead-lettered` as terminal `succeeded`, records safe manual recovery
  metadata, clears retry eligibility, and returns the recovered work id and timestamp.
- `operator-work.dead-letter` marks only a durable process attempt with status `failed` or
  `retry-scheduled` as terminal `dead-lettered`, records safe operator rationale, clears retry
  eligibility, and returns the dead-lettered work id and timestamp.
- `operator-work.cancel` marks only a durable process attempt with status `pending` or
  `retry-scheduled` as terminal `canceled`, records safe operator rationale, clears retry
  eligibility, and returns the canceled work id and timestamp.
- `operator-work.retry` creates a new durable process attempt with a fresh id and status `pending`
  from a failed or retry-scheduled attempt with `retriable = true`, records safe retry lineage,
  preserves safe context, and returns the new work id and retry timestamp.
- `operator-work.prune` previews or deletes only terminal durable process attempt journal rows older
  than the required `before` cutoff, returns counts by status, and never touches compatibility
  ledger rows, audit events, event streams, logs, runtime artifacts, workspaces, build cache,
  remote-state backups, deployment snapshots, resource state, or provider/runtime resources.
- Supported filters are `kind`, `status`, `resourceId`, `serverId`, `deploymentId`, and `limit`.
- Supported kinds are `deployment`, `proxy-bootstrap`, `certificate`, `remote-state`,
  `route-realization`, `runtime-maintenance`, and `system`.
- The ledger reads durable process attempts first, then aggregates existing deployment,
  proxy-bootstrap, certificate, remote-state, source-link, and route-realization read-model state for
  compatibility while those slices migrate.
- If a durable process attempt and an existing read-model item share the same work id, the durable
  process attempt wins so status, phase, retry fields, next actions, and safe details come from the
  reusable journal.
- Durable process attempts store internal fields including `id`, `kind`, `status`, `operationKey`,
  `dedupeKey`, `correlationId`, `requestId`, `phase`, `step`, related entity ids, timestamps,
  error code/category, retriable state, `nextEligibleAt`, `nextActions`, and `safeDetails`.
- Durable process attempt retry candidate reads expose due `retry-scheduled` rows by optional kind
  and limit. They use `nextEligibleAt <= now`, skip future retries, and use the latest persisted row
  for a `dedupeKey` as the retry authority so terminal superseding rows block stale retries.
- Remote-state ledger rows expose only safe SSH/PGlite state-root metadata: state backend,
  server/scope ids when known, lock owner/correlation, heartbeat/stale fields, schema version,
  migration journal/backup markers, recovery marker ids, timestamps, and stable error fields. They
  must not expose SSH private key paths, raw PGlite contents, raw archive contents, or command
  output.
- When the shell has an active SSH PGlite state context, the remote-state diagnostics producer reads
  lock metadata, migration journals, backup markers, and recovery markers with a read-only SSH
  command and adapts those lines into the remote-state read model. It must not acquire locks, move
  lock directories, restore backups, run migrations, or inspect raw PGlite pages.
- Source-link ledger rows expose only safe source fingerprint identity, project/environment/
  resource/server/destination ids, update time, and reason; they must not expose raw
  credential-bearing locators.
- Route-realization ledger rows expose route status, route scope, provider/proxy metadata, related
  ids, timestamps, and stable error code/category/retriable fields when known; they must not expose
  raw provider payloads.
- Worker and job status rows come from durable process attempts using existing
  `runtime-maintenance` or `system` kinds and safe `safeDetails`; the ledger must not infer worker
  status from logs.
- Failed or retry-scheduled work exposes stable error code/category/retriable fields when already
  present, and otherwise omits them instead of fabricating details.
- Next actions are read-only guidance. They do not expose recovery commands before those commands
  are governed and public.
- Mark-recovered is the only governed recovery command in this slice. It is a manual ledger repair
  annotation and must not retry work, cancel work, dead-letter work, prune artifacts, recover remote
  state, or mutate deployment/resource/server/runtime aggregate state.
- Dead-letter is a manual ledger terminal annotation and must not retry work, cancel running work,
  mark work recovered, prune artifacts, recover remote state, or mutate deployment/resource/server/
  runtime aggregate state.
- Cancel is a manual ledger terminal annotation for pending or retry-scheduled work and must not
  stop already-running runtime/provider work, retry work, dead-letter work, mark work recovered,
  prune artifacts, recover remote state, or mutate deployment/resource/server/runtime aggregate
  state.
- Retry is a manual ledger retry annotation that creates the next process attempt row. It must not
  execute runtime/provider work, replay old fact events, delete or rewrite the original attempt,
  prune artifacts, recover remote state, or mutate deployment/resource/server/runtime aggregate
  state.
- Prune is a manual ledger retention mutation. It is limited to durable process attempt rows whose
  status is `succeeded`, `failed`, `canceled`, or `dead-lettered` and whose `updatedAt` is older
  than the requested `before` cutoff. It must support dry-run previews, default to dry-run when the
  caller omits the flag, and must not delete retry-scheduled, pending, running, or unknown rows.

## Migration Gaps

- Proxy bootstrap read models still expose latest attempt timestamps and error codes. New proxy
  bootstrap command and event-driven attempts are recorded in the durable journal with their attempt
  ids; older rows without journal records continue to use `proxy-bootstrap:<serverId>`.
- Certificate read models expose only the latest attempt. New certificate issue/import attempts are
  recorded in the durable journal; older rows without journal records continue to expose latest
  certificate attempt visibility from `certificates.list`.
- Remote-state read visibility is limited to safe lock, migration, backup, and recovery-marker
  summaries. Remote-state stale-lock recovery, migration execution, backup restore, and state-root
  prune remain CLI/runtime workflows until governed as business commands.
- Runtime artifact/workspace prune, including explicit old remote-state marker cleanup, is governed
  by `servers.capacity.prune` rather than `operator-work.*`. Automated retry execution,
  runtime/provider cancellation, remote-state recovery mutations, and broader audit/event retention
  policy remain positioned for future slices.
