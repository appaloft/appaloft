# servers.reorder Command Spec

## Metadata

- Operation key: `servers.reorder`
- Command class: `ReorderServersCommand`
- Input schema: `ReorderServersCommandInput`
- Handler: `ReorderServersCommandHandler`
- Use case: `ReorderServersUseCase`
- Domain / bounded context: Runtime topology / DeploymentTarget lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`servers.reorder` is the source-of-truth command for changing server list display order.

It is not a generic server update command. It must not mutate name, host, port, provider key,
target kind, lifecycle, credentials, edge proxy state, runtime preparation, deployment history,
routes, domains, logs, or audit records. It must not move any workload or change placement rules.

```ts
type ReorderServersResult = Result<{ reorderedServerIds: string[] }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- success returns `ok({ reorderedServerIds })`;
- success persists display order for the provided visible servers in the given order;
- success publishes or records `server-reordered` only for servers whose display order changes;
- deleted server tombstones are immutable through the ordinary reorder entrypoint.

## Input Model

```ts
type ReorderServersCommandInput = {
  serverIds: string[];
  startOffset?: number;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverIds` | Required, 1-500 unique ids | Servers in the desired list order. |
| `startOffset` | Optional non-negative integer | Display-order offset for paginated list reorders. Defaults to `0`. |

## Admission Flow

The command must:

1. Validate command input.
2. Reject duplicate server ids.
3. Resolve every server id through the write-side server repository.
4. Reject missing or invisible servers with `not_found`.
5. Reject deleted server tombstones through the deployment-target lifecycle guard.
6. Persist display order according to `startOffset + array position`.
7. Publish or record `server-reordered` for changed servers.
8. Return `ok({ reorderedServerIds })`.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Server list drag-and-drop reorder dispatches this command. | Active |
| CLI | `appaloft server reorder --server-ids <comma-separated-server-ids>`. | Active |
| oRPC / HTTP | `POST /api/servers/reorder` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Read Model Rules

After success:

- `servers.list` orders servers by display order, then creation time for stable legacy rows;
- `servers.list` returns `total`, `limit`, and `offset` so paginated Web and CLI callers can render
  list ranges;
- server detail and deployment target identity remain unchanged.

## Open Questions

- None for server display ordering.
