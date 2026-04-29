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

The first active slice aggregates:

- deployment attempts from deployment read models;
- latest proxy bootstrap state from server edge proxy read models;
- latest certificate attempts from certificate read models.

## Safety

The query must not return raw deployment log messages, secret values, private keys, certificate
material, credential-bearing command lines, raw provider output, or environment values.

Next actions are guidance only. A `diagnostic` or `manual-review` next action does not imply a
mutating recovery command is public.
