# source-events.list Query Spec

## Status

Active read model. Application query handling, durable source-event read-model persistence,
`CORE_OPERATIONS.md`, the operation catalog, CLI, and HTTP/oRPC read surfaces are aligned. Web
diagnostics and future MCP/tool descriptors remain deferred.

## Governing Sources

- [ADR-037: Source Event Auto Deploy Ownership](../decisions/ADR-037-source-event-auto-deploy-ownership.md)
- [Source Binding And Auto Deploy](../specs/042-source-binding-auto-deploy/spec.md)
- [Source Binding Auto Deploy Test Matrix](../testing/source-binding-auto-deploy-test-matrix.md)
- [Source Event Auto Deploy Error Spec](../errors/source-events.md)
- [source-events.ingest Command Spec](../commands/source-events.ingest.md)
- [source-events.show Query Spec](./source-events.show.md)

## Intent

`source-events.list` returns recent safe source event delivery records for a project or Resource so
operators can inspect dedupe, ignored, blocked, failed, and dispatched outcomes.

It is read-only. It must not replay events, retry failed dispatch, mutate policies, or create
deployments.

## Input

```ts
type ListSourceEventsInput = {
  projectId?: string;
  resourceId?: string;
  status?: "accepted" | "deduped" | "ignored" | "blocked" | "dispatched" | "failed";
  sourceKind?: "github" | "gitlab" | "generic-signed";
  limit?: number;
  cursor?: string;
};
```

At least one of `projectId` or `resourceId` is required in the first Code Round. Global operator
rollups remain future.

## Output

```ts
type SourceEventListResult = {
  items: readonly SourceEventListItem[];
  nextCursor?: string;
  generatedAt: string;
};

type SourceEventListItem = {
  sourceEventId: string;
  projectId?: string;
  resourceIds: readonly string[];
  sourceKind: "github" | "gitlab" | "generic-signed";
  eventKind: "push" | "tag";
  ref: string;
  revision: string;
  status: "accepted" | "deduped" | "ignored" | "blocked" | "dispatched" | "failed";
  dedupeStatus: "new" | "duplicate";
  ignoredReasons: readonly string[];
  createdDeploymentIds: readonly string[];
  receivedAt: string;
};
```

Output must never include raw payloads, signatures, webhook secret values, provider tokens, or
credential-bearing source locators.

## Error Contract

Use [Source Event Auto Deploy Error Spec](../errors/source-events.md). Minimum codes:

- `source_event_scope_required`
- `source_event_read_unavailable`
- `validation_error`

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource auto-deploy event list and diagnostics panel. | Future Code Round |
| CLI | `appaloft source-event list --resource <resourceId>` or `--project <projectId>`. | Active |
| oRPC / HTTP | `GET /api/source-events` with project/resource scope filters. | Active |
| Automation / MCP | Future read-only query/tool. | Future |
