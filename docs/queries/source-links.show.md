# source-links.show Query Spec

## Metadata

- Operation key: `source-links.show`
- Query class: `ShowSourceLinkQuery`
- Input schema: `ShowSourceLinkQueryInput`
- Handler: `ShowSourceLinkQueryHandler`
- Query service: `SourceLinkQueryService`
- Domain / bounded context: Source link application state
- Current status: active query
- Source classification: normative contract

## Normative Contract

`source-links.show` reads one safe source fingerprint link record. It is read-only and must not
create deployments, relink source identity, delete link state, or inspect repository/provider secret
material.

Input:

```ts
type ShowSourceLinkQueryInput = {
  sourceFingerprint: string;
};
```

Output:

```ts
type ShowSourceLinkResult = {
  schemaVersion: "source-links.show/v1";
  sourceLink: SourceLinkRecord;
};
```

Missing links return `not_found` with safe source fingerprint details only.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| CLI | `appaloft source-links show <sourceFingerprint>`. | Active |
| oRPC / HTTP | `GET /api/source-links/{sourceFingerprint}`. | Active |
| Web | Consumes operator-work source-link rows unless a dedicated source-link admin panel is added. | Future |
| Automation / MCP | Future query/tool over the same operation key. | Future |
