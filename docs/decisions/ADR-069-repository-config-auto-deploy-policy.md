# ADR-069: Repository Config Auto-Deploy Policy

Status: Accepted

Date: 2026-05-24

## Context

Source auto-deploy is already a Resource-owned policy governed by ADR-037. Users can configure it
through explicit CLI/API/Web operations, but repository config still cannot declare the common
"deploy this Resource when this ref receives a source event" intent. That creates a drift surface:
source/runtime/network/env/dependencies/storage/scheduled tasks can be committed, while the
source-event trigger remains an out-of-band Resource setting.

The YAML shape must stay user-facing and must not expose source-event ids, webhook delivery ids,
provider account ids, raw webhook secrets, tokens, tenant/org identity, or deployment target
identity. It also must not add trigger fields to `deployments.create`; source events still dispatch
ordinary deployments only after the Resource profile and source-link context have been resolved.

## Decision

Repository config introduces a top-level `autoDeploy` policy for Resource source-event triggers:

```yaml
autoDeploy:
  enabled: true
  trigger: git-push
  refs:
    - main
  events:
    - push
  dedupeWindowSeconds: 300
```

MVP support is intentionally limited to `trigger: git-push`. Generic signed webhook auto-deploy
continues to be configured through explicit operations because it needs secret-reference custody and
webhook endpoint setup that should not be inferred from a repository file.

The CLI/Action repository-config workflow must dispatch existing command/query operations through
the buses:

1. resolve project/environment/resource/server identity outside the committed file;
2. read the current Resource profile when needed;
3. configure a missing or drifted policy through `resources.configure-auto-deploy`;
4. disable an existing policy when `enabled: false`;
5. call `deployments.create` with ids only.

If the policy is already enabled with the same trigger, refs, event kinds, and dedupe window, config
deploy must not dispatch a duplicate configure command. If a policy is blocked because the source
binding changed, config deploy may reconfigure it from YAML to bind it to the current Resource
source fingerprint.

## Consequences

- This is a workflow/profile extension over existing Resource auto-deploy operations. No new
  operation-catalog key is introduced.
- `deployments.create` remains ids-only and does not grow source-event trigger fields.
- `appaloft.yaml` becomes the source of truth for the common git-push auto-deploy policy.
- Raw webhook secrets and generic signed webhook endpoint material stay outside repository config
  for this MVP.
- The Appaloft deploy skill and YAML sync guidance must treat source-event/auto-deploy policy
  changes as `appaloft.yaml` sync candidates.

## Governed Specs

- [Repository Config Auto-Deploy Policy](../specs/078-repository-config-auto-deploy-policy/spec.md)
- [Source Binding And Auto Deploy](../specs/042-source-binding-auto-deploy/spec.md)
- [Repository Deployment Config File Bootstrap Workflow](../workflows/deployment-config-file-bootstrap.md)
- [GitHub Action PR Preview Deploy Workflow](../workflows/github-action-pr-preview-deploy.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Public Documentation Test Matrix](../testing/public-documentation-test-matrix.md)
- [ADR-037: Source Event Auto Deploy Ownership](./ADR-037-source-event-auto-deploy-ownership.md)
- [ADR-014: Deployment Admission Uses Resource Profile](./ADR-014-deployment-admission-uses-resource-profile.md)
