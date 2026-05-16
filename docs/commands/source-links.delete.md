# source-links.delete Command Spec

## Metadata

- Operation key: `source-links.delete`
- Command class: `DeleteSourceLinkCommand`
- Input schema: `DeleteSourceLinkCommandInput`
- Handler: `DeleteSourceLinkCommandHandler`
- Use case: `DeleteSourceLinkUseCase`
- Domain / bounded context: Source link application state
- Current status: active command
- Source classification: normative contract

## Normative Contract

`source-links.delete` explicitly removes one source fingerprint link so later config deploys must
resolve or create identity again. It must not delete projects, environments, resources, deployments,
server-applied routes, runtime state, audit rows, or deployment history.

Input:

```ts
type DeleteSourceLinkCommandInput = {
  sourceFingerprint: string;
  reason?: string;
};
```

Output:

```ts
type DeleteSourceLinkResult = {
  sourceFingerprint: string;
  deleted: boolean;
};
```

The command coordinates on the same source-link mutation scope as `source-links.relink`. Missing
links return `not_found`; successful deletion returns `deleted = true`.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| CLI | `appaloft source-links delete <sourceFingerprint>`. | Active |
| oRPC / HTTP | `DELETE /api/source-links/{sourceFingerprint}`. | Active |
| Web | Future admin affordance; current Web can still see source-link work items through operator work. | Future |
| Automation / MCP | Future command/tool over the same operation key. | Future |
