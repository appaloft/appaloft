# scheduled-runtime-prune-policies.configure Command Spec

## Metadata

- Operation key: `scheduled-runtime-prune-policies.configure`
- Command class: `ConfigureScheduledRuntimePrunePolicyCommand`
- Input schema: `ConfigureScheduledRuntimePrunePolicyCommandInput`
- Handler: `ConfigureScheduledRuntimePrunePolicyCommandHandler`
- Use case: `ConfigureScheduledRuntimePrunePolicyUseCase`
- Domain / bounded context: DeploymentTarget runtime observation / retention policy
- Current status: active application command with CLI and HTTP/oRPC adapters

## Normative Contract

`scheduled-runtime-prune-policies.configure` creates or replaces one scheduled runtime prune policy
record used by the scheduler to dispatch `servers.capacity.prune`.

Command success means the durable policy record is persisted with safe fields only. It does not run
runtime prune, inspect a server, mutate deployment target state, delete runtime artifacts, emit
audit rows, or accept scheduled work.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `policyId` | Optional | Existing policy id to replace; omitted ids are generated. |
| `version` | Optional | Policy version label. Defaults to `v1`. |
| `scope` | Required | One of `defaults`, `system`, `organization`, `project`, `environment`, or `deployment-snapshot`. |
| `serverId` | Optional | Target selector. Defaults to `*`; specific ids override wildcard at equal or higher scope. |
| `retentionDays` | Required | Positive integer duration used to compute the prune cutoff. |
| `destructive` | Optional | Defaults to `false`; destructive scheduled prune is allowed only when explicitly true. |
| `categories` | Optional | Non-empty runtime prune categories. Defaults to `stopped-containers`. |
| `retryOnFailure` | Optional | Defaults to `true`; controls retry-scheduled process state on worker failure. |
| `enabled` | Optional | Defaults to `true`; disabled policies are retained but omitted from enabled discovery. |

## Rules

- The command stores only safe policy metadata and never stores raw runtime output, credentials,
  private key material, provider responses, or environment values.
- Destructive scheduled prune remains opt-in through `destructive = true`.
- Category values must reuse the `servers.capacity.prune` category schema.
- `remote-state-markers` is allowed only by explicit category selection; it is not implied by the
  default policy category set. Preview-oriented policies may explicitly include stopped containers,
  preview/source workspaces, Docker cache, unused images, and remote-state markers together.
- Policy readback is available through `scheduled-runtime-prune-policies.show` and
  `scheduled-runtime-prune-policies.list`.
- Repository deployment config may carry `retention.runtimePrune`; deployment config bootstrap
  materializes that profile as a `deployment-snapshot` scoped scheduled runtime prune policy for the
  selected target.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft server capacity policy configure --scope <scope> --retention-days <days>` dispatches the command through `CommandBus`. |
| API/oRPC | `POST /api/server-capacity/prune-policies` dispatches the command through `CommandBus`. |
| Web | Future maintenance UI may call the same command after showing destructive-policy warnings. |

## Tests

The governing matrix is [Runtime Target Capacity Test Matrix](../testing/runtime-target-capacity-test-matrix.md).
At minimum, Code Round coverage must prove:

- create persists defaults and safe readback fields;
- existing policy ids are replaced rather than duplicated;
- disabled policies are retained but excluded from enabled scheduler discovery;
- validation rejects malformed scope, retention, and category input.
