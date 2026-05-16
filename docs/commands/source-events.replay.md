# source-events.replay Command Spec

## Status

Active command for source-event recovery. Application command handling, CLI, HTTP/oRPC, operation
catalog, public help, and focused tests are governed by `SRC-AUTO-REPLAY-001` to
`SRC-AUTO-REPLAY-004`.

## Governing Sources

- [ADR-037: Source Event Auto Deploy Ownership](../decisions/ADR-037-source-event-auto-deploy-ownership.md)
- [Source Binding And Auto Deploy](../specs/042-source-binding-auto-deploy/spec.md)
- [Source Binding Auto Deploy Test Matrix](../testing/source-binding-auto-deploy-test-matrix.md)
- [Source Event Auto Deploy Error Spec](../errors/source-events.md)
- [source-events.ingest Command Spec](./source-events.ingest.md)
- [source-events.show Query Spec](../queries/source-events.show.md)

## Intent

`source-events.replay` replays one retained safe source event delivery through current
Resource-owned auto-deploy policy matching and the existing `deployments.create` admission path.

It does not re-read raw webhook payloads, signatures, provider secrets, or webhook secret values.
It does not bypass source-binding policy checks, deployment admission, dedupe diagnostics, Resource
lifecycle guards, or ordinary deployment recovery readiness.

## Input

```ts
type ReplaySourceEventInput = {
  sourceEventId: string;
  projectId?: string;
  resourceId?: string;
  idempotencyKey?: string;
};
```

External callers must provide `projectId` or `resourceId` unless authorization has already bounded
the lookup. When `resourceId` is provided, replay is limited to that Resource's current matching
policy.

## Flow

1. Validate the command input.
2. Load the retained source event through the source-event read model using the supplied scope.
3. Re-evaluate current source-event policy candidates from the retained safe source identity, event
   kind, ref, and revision.
4. Dispatch matching deployments through the same source-event deployment dispatcher used by
   `source-events.ingest`.
5. Update the retained source-event outcome with the new matched resources, ignored reasons, policy
   results, and created deployment ids.
6. Return a bounded replay result.

## Result

```ts
type ReplaySourceEventResult = {
  schemaVersion: "source-events.replay/v1";
  sourceEventId: string;
  status: "accepted" | "deduped" | "ignored" | "blocked" | "dispatched" | "failed";
  matchedResourceIds: readonly string[];
  createdDeploymentIds: readonly string[];
  ignoredReasons: readonly SourceEventIgnoredReason[];
  replayedAt: string;
};
```

## Error Contract

Use [Source Event Auto Deploy Error Spec](../errors/source-events.md). Minimum codes:

- `source_event_not_found`
- `source_event_scope_required`
- `source_event_read_unavailable`
- `source_event_dispatch_failed`
- `validation_error`

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail source-event diagnostics may link to CLI/API recovery. | Current docs/help only |
| CLI | `appaloft source-event replay <sourceEventId> --resource <resourceId>`. | Active |
| oRPC / HTTP | `POST /api/source-events/{sourceEventId}/replay`. | Active |
| Automation / MCP | Future generated command/tool over the same operation key. | Future |
