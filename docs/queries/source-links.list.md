# source-links.list Query Spec

## Metadata

- Operation key: `source-links.list`
- Query class: `ListSourceLinksQuery`
- Input schema: `ListSourceLinksQueryInput`
- Handler: `ListSourceLinksQueryHandler`
- Query service: `SourceLinkQueryService`
- Domain / bounded context: Source link application state
- Current status: active query
- Source classification: normative contract

## Normative Contract

`source-links.list` returns safe source fingerprint link records for deployment identity
diagnostics. It is read-only and must not create, relink, delete, prune, migrate, or recover source
link state.

Input:

```ts
type ListSourceLinksQueryInput = {
  projectId?: string;
  resourceId?: string;
  serverId?: string;
  limit?: number;
};
```

Output:

```ts
type ListSourceLinksResult = {
  schemaVersion: "source-links.list/v1";
  items: SourceLinkRecord[];
};
```

`SourceLinkRecord` includes only safe ids and metadata: `sourceFingerprint`, `projectId`,
`environmentId`, `resourceId`, optional `serverId`, optional `destinationId`, `updatedAt`, and
optional safe `reason`.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| CLI | `appaloft source-links list`. | Active |
| oRPC / HTTP | `GET /api/source-links`. | Active |
| Web | Consumes operator-work source-link rows unless a dedicated source-link admin panel is added. | Future |
| Automation / MCP | Future query/tool over the same operation key. | Future |
