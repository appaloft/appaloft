# Deployment Plan Preview Error Spec

## Status

Spec Round error contract for planned active query `deployments.plan`.

## Governing Sources

- [Error Model](./model.md)
- [Deployment Plan Preview Spec](../specs/013-deployment-plan-preview/spec.md)
- [deployments.plan Query Spec](../queries/deployments.plan.md)
- [Deployment Plan Preview Test Matrix](../testing/deployment-plan-preview-test-matrix.md)

## Stable Error Codes

| Code | Category | Phase | Retriable | Owner | Required safe details |
| --- | --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `command-validation` | No | `deployments.plan` | invalid field path, operation key |
| `not_found` | `not-found` | `context-resolution` | No | `deployments.plan` | missing entity type and safe id |
| `server_inactive` | `conflict` | `server-lifecycle-guard` | No | `deployments.plan` | server id, lifecycle status, deactivation time when available |
| `server_workload_role_mismatch` | `application` | `server-workload-role-guard` | No | `deployments.plan` | command name, server id, `requiredRole = "deployment-runtime"`, normalized workload-role set |
| `runtime_target_unsupported` | `application` or `integration` | `runtime-target-resolution` | No | `deployments.plan` | target kind, provider key, missing capability, server/destination ids |
| `infra_error` | `infra` | `source-inspection` or `runtime-plan-resolution` | Conditional | `deployments.plan` | adapter boundary, safe operation name, resource id |

`server_workload_role_mismatch` is a stable structured plan blocker rather than a transport or
whole-query infrastructure failure. The blocked preview uses
`reasonCode = "server_workload_role_mismatch"`, `phase = "server-workload-role-guard"`, and safe
evidence containing `commandName`, `serverId`, `requiredRole = "deployment-runtime"`, and the
normalized `workloadRoles`. An empty role set is unrestricted and does not produce this blocker.

The lifecycle gate remains independent. An inactive server is represented by `server_inactive` at
`server-lifecycle-guard`, not relabeled as a role mismatch. Passing lifecycle and role admission
only permits planning to continue; it does not bypass target-kind, readiness, capability, provider,
or private-policy gates.

## Readiness Reason Codes

Readiness reason codes are not all top-level `PlatformError.code` values. They appear inside
`DeploymentPlanPreview.unsupportedReasons`, warnings, and next-action details.

Initial vocabulary:

- `resource-source-missing`
- `resource-source-unnormalized`
- `runtime-profile-missing`
- `network-profile-missing`
- `internal-port-missing`
- `static-publish-directory-missing`
- `compose-target-service-missing`
- `unsupported-framework`
- `ambiguous-framework`
- `missing-production-start-command`
- `missing-static-output`
- `incompatible-source-strategy`
- `runtime-target-unsupported`
- `access-plan-unavailable`
- `server_workload_role_mismatch`

## Consumer Mapping

- Web maps reason codes to i18n keys and links users to explicit resource profile commands.
- CLI human output groups evidence, artifact, commands, warnings, and fixes; JSON output preserves
  codes and fields.
- HTTP/oRPC maps whole-query errors through the global error model and returns blocked plans as
  successful query payloads.
- Future MCP/tool output must preserve readiness booleans, reason codes, and next actions without
  relying on localized prose.
- Consumers recover from `server_workload_role_mismatch` by choosing a server whose role set is
  empty or includes `deployment-runtime`, or by replacing the selected server's complete role set
  through `servers.configure-workload-roles`, then requesting a new preview.
- Consumers must not retry a non-retriable mismatch automatically, parse localized message text,
  or present `artifact-builder` as remote build readiness.

## Secret Handling

Errors, warnings, and reason details must not include raw environment values, secrets, source
credentials, registry credentials, private keys, raw provider responses, or unbounded command output.
