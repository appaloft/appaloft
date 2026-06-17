# Repository Config Preview Policy

## Status

- Round: Post-Implementation Sync
- Artifact state: MVP implemented for `preview.pullRequest.policy` declarations in repository
  config and CLI/Action config deploy orchestration
- Roadmap target: `0.12.x` repository config hardening
- Compatibility impact: `pre-1.0-policy`, additive repository config preview policy shape
- Decision state: governed by
  [ADR-077](../../decisions/ADR-077-repository-config-preview-policy.md)

## Business Outcome

Teams can commit an `appaloft.yaml` that states product-grade pull request preview policy for the
selected Resource: whether same-repository previews are allowed, whether fork previews are allowed
and with what secret posture, whether secret-backed previews are allowed, how many active previews
may exist, and how long previews should live.

Trusted config deploy applies that policy through the existing preview policy operation before the
next deployment. Pull request preview deploys do not let the PR branch mutate the policy that
controls PR preview admission.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| RepositoryPreviewPolicy | User-facing `appaloft.yaml` declaration under `preview.pullRequest.policy`. | Repository config |
| Resource Preview Policy | Configured preview policy scoped to the selected Resource through `preview-policies.configure`. | Preview lifecycle |
| Trusted Config Deploy | Ordinary config deploy from CLI, Action, Web, or control plane context that is not itself executing untrusted PR preview config. | Entry workflow |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CONFIG-PREVIEW-POLICY-001 | Parse preview policy | `appaloft.yaml` declares `preview.pullRequest.policy` with allowed fields | The config parser runs | The config is accepted, defaults are applied, and JSON schema exposes the field. |
| CONFIG-PREVIEW-POLICY-002 | Reject unsafe preview policy fields | Config includes provider account, tenant/org identity, GitHub installation id, webhook secret, token, raw secret, project/global scope selector, cleanup credential, or unknown policy field | The config parser runs | Parsing fails before mutation with strict schema, identity, unsupported, or raw-secret validation. |
| CONFIG-PREVIEW-POLICY-003 | Configure before deployment | No matching configured Resource preview policy exists | CLI/Action config deploy resolves identity without PR preview context | The workflow reads effective preview policy, configures Resource-scoped policy when needed, and then dispatches `deployments.create` with ids only. |
| CONFIG-PREVIEW-POLICY-004 | Idempotent configured policy | Selected Resource already has a configured policy matching YAML | Config deploy runs | No duplicate configure command is dispatched. |
| CONFIG-PREVIEW-POLICY-005 | PR preview deploy skips policy mutation | A PR preview deploy reads a config file containing `preview.pullRequest.policy` | The preview deployment workflow runs with trusted PR preview context | The workflow does not dispatch preview policy show/configure from the PR branch and still keeps deployment admission ids-only. |

## Config Contract

MVP repository config fields:

```yaml
preview:
  pullRequest:
    policy:
      sameRepositoryPreviews: true
      forkPreviews: disabled
      secretBackedPreviews: true
      maxActivePreviews: 5
      previewTtlHours: 72
      environmentProfileBaseEnvironmentId: env_staging
```

Rules:

- `sameRepositoryPreviews` defaults to `true`.
- `forkPreviews` defaults to `disabled` and may be `disabled`, `without-secrets`, or
  `with-secrets`.
- `secretBackedPreviews` defaults to `true`.
- `maxActivePreviews` is optional and must be a non-negative integer.
- `previewTtlHours` is optional and must be a positive integer.
- `environmentProfileBaseEnvironmentId` is optional and selects the safe Environment Profile base
  id used by product-grade preview policy. It does not select project/global scope, Resource,
  provider account, credential, secret reference, or deployment target.
- The declaration always targets the selected Resource scope after trusted identity resolution.
- The committed file must not select project/global scope, project id, resource id, server id,
  tenant/org identity, provider account, GitHub installation id, webhook secret, feedback token,
  cleanup credential, or raw secret value.

## Workflow Contract

Trusted config deploy:

```text
resolve project/environment/resource/server identity
  -> preview-policies.show(scope = selected Resource)
  -> preview-policies.configure(scope = selected Resource) when configured policy differs or is inherited/default
  -> deployments.create(ids only)
```

PR preview deploy:

```text
resolve trusted PR preview context
  -> parse root/selected preview config
  -> apply preview profile/env/dependency/storage/scheduled-task reconciliation
  -> skip preview.pullRequest.policy mutation
  -> deployments.create(ids only)
```

The workflow must use command/query buses only. It must not call preview policy repositories or
application services from the CLI/HTTP adapter.

## Non-Goals

- No preview policy fields on `deployments.create`.
- No GitHub App installation ids, webhook secrets, feedback tokens, provider accounts, tenant/org
  identity, raw secret values, or credentials in repository config.
- No project/global preview policy scope selection in YAML.
- No comments/checks/status feedback configuration in YAML.
- No preview environment cleanup command parameters in YAML.
- No runtime sizing, autoscaling, route/domain provider ownership, or managed DNS policy in this
  slice.

## Current Implementation Notes And Migration Gaps

This slice is a repository config workflow/profile extension over existing product-grade preview
policy operations. No new operation-catalog key is introduced. GitHub App installation-token
onboarding, managed domain mapping, comments/checks customization, and broader provider smoke
coverage remain governed by the product-grade preview roadmap.
