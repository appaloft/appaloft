# scheduled-runtime-prune-policies.list Query Spec

## Metadata

- Operation key: `scheduled-runtime-prune-policies.list`
- Query class: `ListScheduledRuntimePrunePoliciesQuery`
- Input schema: `ListScheduledRuntimePrunePoliciesQueryInput`
- Handler: `ListScheduledRuntimePrunePoliciesQueryHandler`
- Query service: `ListScheduledRuntimePrunePoliciesQueryService`
- Domain / bounded context: DeploymentTarget runtime observation / retention policy read model
- Current status: active application query; CLI and HTTP/oRPC adapters deferred

## Normative Contract

`scheduled-runtime-prune-policies.list` reads safe scheduled runtime prune policy records. It must
not run prune, enqueue work, claim process attempts, or mutate policy state.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `serverId` | Optional | When present, returns policies for that server and wildcard `*` policies. |
| `scope` | Optional | Filters by one policy scope. |
| `enabledOnly` | Optional | Defaults to `false`; when true, omits disabled policies. |

## Output

The query returns `scheduled-runtime-prune-policies.list/v1` with policy rows containing id,
version, scope, server selector, retention duration, destructive flag, category list and count,
retry behavior, enabled state, and update timestamp.

## Safety

The query returns policy metadata only. It must not expose raw shell output, credentials,
environment values, private keys, provider SDK payloads, runtime candidate paths, or secret-bearing
config values.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | Deferred until adapter boundary tests are added. |
| API/oRPC | Deferred until adapter boundary tests are added. |
| Web | Future maintenance UI may call the same query for policy administration. |

## Tests

The governing matrix is [Runtime Target Capacity Test Matrix](../testing/runtime-target-capacity-test-matrix.md).
At minimum, Code Round coverage must prove filtered safe readback, enabled-only filtering, and no
secret-bearing fields in serialized output.
