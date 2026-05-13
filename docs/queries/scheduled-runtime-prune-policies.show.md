# scheduled-runtime-prune-policies.show Query Spec

## Metadata

- Operation key: `scheduled-runtime-prune-policies.show`
- Query class: `ShowScheduledRuntimePrunePolicyQuery`
- Input schema: `ShowScheduledRuntimePrunePolicyQueryInput`
- Handler: `ShowScheduledRuntimePrunePolicyQueryHandler`
- Query service: `ShowScheduledRuntimePrunePolicyQueryService`
- Domain / bounded context: DeploymentTarget runtime observation / retention policy read model
- Current status: active application query; CLI and HTTP/oRPC adapters deferred

## Normative Contract

`scheduled-runtime-prune-policies.show` reads one safe scheduled runtime prune policy by id. It
must not run prune, enqueue work, claim process attempts, mutate policy state, or synthesize static
fallback policies.

Missing durable policy records return `policy: null`.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `policyId` | Required | Durable policy id to read. |

## Output

The query returns `scheduled-runtime-prune-policies.show/v1` with a nullable
`scheduled-runtime-prune-policies.policy/v1` policy read model.

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
At minimum, Code Round coverage must prove existing policy safe readback, missing-policy null
readback, validation rejection for blank ids, and no secret-bearing fields in serialized output.
