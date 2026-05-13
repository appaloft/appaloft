# operator-work.list Query Spec

## Metadata

- Operation key: `operator-work.list`
- Query class: `ListOperatorWorkQuery`
- Input schema: `ListOperatorWorkQueryInput`
- Handler: `ListOperatorWorkQueryHandler`
- Query service: `OperatorWorkQueryService`
- Status: active query

## Normative Contract

`operator-work.list` is the read-only operator work ledger list query. It shows existing background
work visibility from safe read models and must not mutate, retry, cancel, prune, recover, or
dead-letter any work.

The query returns:

```ts
type ListOperatorWorkResult = Result<OperatorWorkList, DomainError>;
```

## Input

```ts
type ListOperatorWorkQueryInput = {
  kind?: "deployment" | "proxy-bootstrap" | "certificate" | "remote-state" | "route-realization" | "runtime-maintenance" | "system";
  status?: "pending" | "running" | "retry-scheduled" | "succeeded" | "failed" | "canceled" | "dead-lettered" | "unknown";
  resourceId?: string;
  serverId?: string;
  deploymentId?: string;
  limit?: number;
};
```

## Output

Each item includes a stable work id, kind, status, operation key, phase/step when known, related
entity ids, safe timestamps, stable failure fields when already known, `retriable` when already
known, read-only next actions, and safe detail fields.

The active slice reads durable process attempts first, then aggregates compatibility state from:

- deployment attempts from deployment read models;
- latest proxy bootstrap state from server edge proxy read models;
- latest certificate attempts from certificate read models.
- safe remote SSH state lock, migration, backup, and recovery-marker summaries as
  `kind = remote-state` items;
- safe source-link read-model summaries as `kind = system` items with operation key
  `source-links.relink`;
- safe route-realization read-model summaries as `kind = route-realization` items;
- durable process attempts for worker, job, scheduler, and runtime-maintenance status.

When a durable process attempt and a compatibility read-model item describe the same work id or
proxy bootstrap scope, the durable process attempt wins.

Source-link work ids use `source-link:<safe fingerprint digest or sourceFingerprint>` depending on
the selected read model. They must not expose credential-bearing source locators. Route-realization
work ids use `route-realization:<route id or scope id>` and must not expose raw provider payloads.
Remote-state work ids use `remote-state:<scope id>` and may represent lock, migration, backup, or
recovery-marker state from the selected SSH/PGlite mirror read model. Remote-state rows expose safe
state backend, server, path, owner/correlation, timestamp, stale, schema, backup, journal, and
recovery marker metadata only; they do not acquire locks, recover stale locks, run migrations, or
read raw PGlite pages.
Worker/job status is visible only when recorded in the durable process attempt journal; the ledger
must not synthesize worker health from process logs or in-memory runtime state.

## Safety

The query must not return raw deployment log messages, secret values, private keys, certificate
material, credential-bearing command lines, credential-bearing source locators, raw provider
output, raw PGlite content, SSH private-key paths, or environment values.

Next actions are guidance only. A `diagnostic` or `manual-review` next action does not imply a
mutating recovery command is public.
