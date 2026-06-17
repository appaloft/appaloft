# ADR-077: Repository Config Preview Policy

Status: Accepted

Date: 2026-05-25

## Context

Appaloft already has product-grade preview policy operations:
`preview-policies.configure` and `preview-policies.show`. They store project- or Resource-scoped
settings for same-repository previews, fork previews, secret-backed preview eligibility, active
preview quota, and preview TTL.

Repository config can already describe PR preview runtime/profile overlays. It still cannot
declare the product-grade preview policy defaults that a team wants reviewed with the application
source. That creates a gap: the same repository can describe how previews run, but not the
Resource-scoped policy that decides whether previews are allowed and how long they live.

The config surface must stay safe for committed source. It may describe provider-neutral policy
settings, but it must not contain GitHub App installation ids, webhook secrets, feedback tokens,
provider accounts, tenant/org identity, project/global scope selectors, raw secrets, or cleanup
credentials. It also must not allow an untrusted pull request config deploy to mutate preview
policy during the preview run itself.

## Decision

Repository config adds a product-grade pull request preview policy declaration:

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

The accepted policy fields are:

- `sameRepositoryPreviews`: boolean, default `true`;
- `forkPreviews`: `disabled`, `without-secrets`, or `with-secrets`, default `disabled`;
- `secretBackedPreviews`: boolean, default `true`;
- `maxActivePreviews`: optional non-negative integer;
- `previewTtlHours`: optional positive integer;
- `environmentProfileBaseEnvironmentId`: optional safe Environment Profile base id used by
  product-grade preview policy. It is an Appaloft environment id, not a provider account,
  credential, secret reference, or project/resource scope selector.

Ordinary trusted repository-config deploy reconciles the declaration to the selected Resource scope
by dispatching `preview-policies.show` and, when needed, `preview-policies.configure` before
deployment admission. Matching configured Resource-scope policy is idempotent. A default inherited
policy that happens to match the declaration is still configured at Resource scope so the YAML
intent becomes explicit state.

Pull request preview deploys must not mutate preview policy from the PR branch. When the entrypoint
has active PR preview context, config deploy ignores `preview.pullRequest.policy` for mutation and
continues with normal preview profile/env/dependency/storage reconciliation. Teams should apply
policy changes from trusted default-branch config deploy, Web, CLI, HTTP/oRPC, or another trusted
control-plane workflow.

The final deployment command remains ids-only. No preview policy fields are added to
`deployments.create`.

## Consequences

- This is a workflow/profile extension over existing `preview-policies.configure`,
  `preview-policies.show`, and `deployments.create`.
- No new operation-catalog key is introduced.
- CLI/Action adapters must dispatch only through `CommandBus` and `QueryBus`; they must not access
  preview policy repositories or application services directly.
- Product-grade preview policy becomes part of the Appaloft YAML sync gate for deployment and
  preview behavior changes.
- Environment Profile base selection can be declared for product-grade previews, but it remains
  preview policy/read-model context and does not add fields to `deployments.create`.
- Committed config still cannot carry provider account, GitHub installation, webhook secret,
  token, tenant/org identity, raw secret value, project/global scope selector, or cleanup
  credential material.

## Governed Specs

- [Repository Config Preview Policy](../specs/086-repository-config-preview-policy/spec.md)
- [Repository Deployment Config File Bootstrap Workflow](../workflows/deployment-config-file-bootstrap.md)
- [GitHub Action PR Preview Deploy Workflow](../workflows/github-action-pr-preview-deploy.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Public Documentation Test Matrix](../testing/public-documentation-test-matrix.md)
- [Product-Grade Preview Deployments](../specs/046-product-grade-preview-deployments/spec.md)
