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
| `runtime_target_unsupported` | `application` or `integration` | `runtime-target-resolution` | No | `deployments.plan` | target kind, provider key, missing capability, server/destination ids |
| `infra_error` | `infra` | `source-inspection` or `runtime-plan-resolution` | Conditional | `deployments.plan` | adapter boundary, safe operation name, resource id |

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

## Consumer Mapping

- Web maps reason codes to i18n keys and links users to explicit resource profile commands.
- CLI human output groups evidence, artifact, commands, warnings, and fixes; JSON output preserves
  codes and fields.
- HTTP/oRPC maps whole-query errors through the global error model and returns blocked plans as
  successful query payloads.
- Future MCP/tool output must preserve readiness booleans, reason codes, and next actions without
  relying on localized prose.

## Secret Handling

Errors, warnings, and reason details must not include raw environment values, secrets, source
credentials, registry credentials, private keys, raw provider responses, or unbounded command output.
