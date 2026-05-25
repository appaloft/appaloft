# Repository Config Generated Access Profile

## Status

- Round: Post-Implementation Sync
- Artifact state: MVP implemented for generated access Resource profile declarations in repository
  config and CLI/Action config deploy orchestration
- Roadmap target: `0.12.x` repository config hardening
- Compatibility impact: `pre-1.0-policy`, additive repository config fields
- Decision state: governed by
  [ADR-071](../../decisions/ADR-071-repository-config-generated-access-profile.md)

## Business Outcome

Users can declare generated default access preference and generated route path prefix in
`appaloft.yaml`. Config deploy reconciles the Resource access profile before deployment admission,
while custom domains, certificates, proxy route application, and default access provider policy
remain separate operations.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| RepositoryGeneratedAccessProfile | User-facing `access.generated` declaration for Resource generated access eligibility and path prefix. | Repository config |
| ResourceAccessProfile | Durable Resource-owned generated access preference used by future planned and deployment route resolution. | Resource |
| GeneratedAccessPathPrefix | Path prefix applied to generated default access routes. | Resource access |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CONFIG-GENERATED-ACCESS-001 | Parse generated access profile | `access.generated` declares `enabled` and `pathPrefix` | The config parser runs | The config is accepted, defaults `pathPrefix` to `/`, and JSON schema exposes the field. |
| CONFIG-GENERATED-ACCESS-002 | Reject unsafe generated access material | Config includes route id, provider account, certificate material, token, credential, server id, destination id, or unsafe path under `access.generated` | The config parser runs | Parsing fails before mutation with strict schema, identity, unsupported, domain-resolution, or raw-secret validation. |
| CONFIG-GENERATED-ACCESS-003 | Configure missing profile | Selected Resource has no matching access profile | Config deploy handles Resource profile reconciliation | The workflow dispatches `resources.configure-access` before `deployments.create`. |
| CONFIG-GENERATED-ACCESS-004 | Idempotent no-op | Selected Resource already has matching access profile | Config deploy runs again | No configure command is dispatched for the access profile. |
| CONFIG-GENERATED-ACCESS-005 | Disable generated access | YAML declares `access.generated.enabled = false` | Config deploy handles Resource profile reconciliation | The workflow configures generated access mode `disabled` and keeps deployment admission ids-only. |

## Config Contract

MVP repository config fields:

```yaml
access:
  generated:
    enabled: true
    pathPrefix: /
```

Rules:

- `enabled` defaults to `true` when `generated` is present.
- `pathPrefix` defaults to `/`.
- `enabled: true` means Resource-generated access remains eligible and maps to
  `generatedAccessMode = "inherit"`.
- `enabled: false` suppresses generated default access for the Resource and maps to
  `generatedAccessMode = "disabled"`.
- `pathPrefix` must be a safe absolute route path prefix without query, fragment, control
  characters, scheme, host, or parent traversal.
- Repository config must not declare route ids, certificate ids, provider accounts, tenant/org
  identity, DNS/certificate provider credentials, private keys, tokens, raw certificate material, or
  raw secret values.

## Workflow Contract

Config generated access reconcile runs after Resource identity is resolved and before deployment
admission:

```text
resource selected/created
  -> resources.show
  -> resources.configure-access when needed
  -> deployments.create(ids only)
```

The workflow must use command/query buses only. It must not call repositories or application
services from the CLI/HTTP adapter.

## Non-Goals

- No domain binding creation.
- No certificate issue/import/retry/revoke/delete.
- No default access domain policy mutation.
- No proxy route realization outside normal deployment runtime execution.
- No deployment command fields for generated access.

## Current Implementation Notes And Migration Gaps

This slice is a repository config workflow/profile extension over existing
`resources.configure-access` and `resources.show`. No new operation-catalog key is introduced.
Automated coverage is bound through `CONFIG-FILE-GENERATED-ACCESS-001` through
`CONFIG-FILE-GENERATED-ACCESS-005` in the deployment config test matrix.
