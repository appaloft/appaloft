# Operator Work Ledger Spec

## Metadata

- Behavior id: `010-operator-work-ledger`
- Round type: Code Round over a narrow Spec/Docs/Test sync
- Roadmap target: Phase 8, Operator/Internal State Closure And Interface Parity
- Operation keys: `operator-work.list`, `operator-work.show`
- Canonical public term: operator work ledger
- Status: active slice

## Purpose

Operators need one read-only place to see what Appaloft is doing, what recently failed, whether the
state is retry-scheduled or terminal, and which diagnostic should be run next.

This slice establishes the reusable visibility contract. It does not implement retry, cancel,
mark-recovered, dead-letter, or prune commands.

## Decision Fit

No new ADR is required for this slice because it keeps the public operation surface read-only and
does not change command admission, retry policy, lifecycle ownership, or recovery semantics. This
Code Round adds a reusable internal durable process attempt journal so the ledger can read persisted
attempt state before falling back to existing deployment/proxy/certificate read models. Future
recovery mutations remain behind ADR-016, ADR-028, ADR-029, and the async lifecycle contract.

## Scope

The implementation must expose:

- deployment attempts from `deployments.list` / deployment read-model state;
- latest proxy bootstrap visibility from server edge proxy read-model fields;
- latest certificate attempt visibility from `certificates.list`;
- durable process attempts from the internal process attempt journal when present;
- safe next actions limited to diagnostics, manual review, retry hints, or no action.

The implementation may not:

- create a durable outbox/inbox table;
- retry, cancel, prune, recover, or dead-letter work;
- expose raw logs, private keys, environment values, certificate material, provider-native command
  lines, or credential-bearing source locators;
- claim remote-state locks, source links, route realization attempts, runtime maintenance jobs, or
  worker status are fully covered when no persisted read model exists yet.

## Acceptance

- `operator-work.list` returns `operator-work.list/v1` with filterable work items.
- `operator-work.show` returns `operator-work.show/v1` for one visible work item id.
- Supported filters are `kind`, `status`, `resourceId`, `serverId`, `deploymentId`, and `limit`.
- Supported kinds are `deployment`, `proxy-bootstrap`, `certificate`, `remote-state`,
  `route-realization`, `runtime-maintenance`, and `system`.
- The ledger reads durable process attempts first, then aggregates existing deployment,
  proxy-bootstrap, and certificate read-model state for compatibility while those slices migrate.
- If a durable process attempt and an existing read-model item share the same work id, the durable
  process attempt wins so status, phase, retry fields, next actions, and safe details come from the
  reusable journal.
- Durable process attempts store internal fields including `id`, `kind`, `status`, `operationKey`,
  `dedupeKey`, `correlationId`, `requestId`, `phase`, `step`, related entity ids, timestamps,
  error code/category, retriable state, `nextEligibleAt`, `nextActions`, and `safeDetails`.
- Failed or retry-scheduled work exposes stable error code/category/retriable fields when already
  present, and otherwise omits them instead of fabricating details.
- Next actions are read-only guidance. They do not expose recovery commands before those commands
  are governed and public.

## Migration Gaps

- Proxy bootstrap read models still expose latest attempt timestamps and error codes. New proxy
  bootstrap command and event-driven attempts are recorded in the durable journal with their attempt
  ids; older rows without journal records continue to use `proxy-bootstrap:<serverId>`.
- Certificate read models expose only the latest attempt. New certificate issue/import attempts are
  recorded in the durable journal; older rows without journal records continue to expose latest
  certificate attempt visibility from `certificates.list`.
- Remote-state locks, source links, route realization attempts, runtime maintenance jobs, and
  worker status remain positioned for future slices.
